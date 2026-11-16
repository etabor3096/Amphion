# pipeline/

The Python analysis code: the processing function that turns an uploaded song into tab data (SDD 5.1, DD-02, DD-16).
Demucs separates the guitar and bass parts, Basic Pitch finds the notes, the tab-assignment module picks strings and
frets (DD-15), madmom finds beats, chords and key, and librosa finds tempo and tuning.

Belongs here: the `amphion_pipeline` package, its tests, the RC-20 JSON Schema, pinned requirements, and later the
Cloud Run function that wraps the package.

Does not belong here: audio files, separated parts, or secrets (RC-03, RC-06, ARCHITECTURE.md rule A3). Audio is
never committed or stored. The test clip is generated in memory by `tests/conftest.py`.

## Set up (Python 3.10 only)

For the proposal's proof of concept the stack runs in a pinned virtualenv, not a container (Elijah's amendment on #46,
2026-11-09). Containerizing moves to P4-01.

```bash
cd pipeline
python3.10 -m venv .venv          # or: uv venv --python 3.10 .venv
source .venv/bin/activate
pip install -r requirements-build.txt                     # build tools first (madmom compiles from source)
pip install --no-build-isolation -r requirements.txt      # then the pinned stack
python -m pytest                                          # the smoke test: about 40 s the first time, 10 s after
```

The first Demucs run downloads its model (about 55 MB for `htdemucs_6s`) into the torch cache. The install needs about
8 minutes and 1.5 GB of disk, mostly PyTorch.

`tests/test_stack_smoke.py` imports each library and runs it on a generated 10-second clip: librosa (tempo, tuning),
madmom (downbeats, chords, key), Basic Pitch (notes) and Demucs (six-part separation, checking `guitar` and `bass` are
present). It checks that the stack works together, not that it is accurate. Accuracy is `benchmark/` (P1-03).

## Run it (P1-04)

```bash
cd pipeline && source .venv/bin/activate
python -m amphion_pipeline song.wav -o result.json     # add -v to print the time each stage takes
```

MP3, M4A and WAV are read. M4A (and any other compressed format librosa cannot decode itself) needs `ffmpeg` on the
machine; the P4 container will have to install it. Without `-o` the JSON is printed to stdout and anything the libraries
print goes to stderr, so `python -m amphion_pipeline song.wav 2>/dev/null | jq .` works. The exit code is 0 on success, 2 for a
missing file and 1 for any other failure; on failure no output file is written (RC-09). A 10-second clip takes about
10 s on an Apple-silicon CPU.

| Stage (one module each) | Library | Output |
| --- | --- | --- |
| `audio.py` load | librosa, hashlib | 44.1 kHz stereo and mono mix; SHA-256 of the input file's exact bytes |
| `separate.py` | Demucs `htdemucs_6s` | guitar and bass parts, written only to a temp folder |
| `notes.py` | Basic Pitch (ONNX) | notes per part: start, length, pitch, confidence |
| `beats.py` | madmom | beat and downbeat times, beats per bar |
| `harmony.py` | madmom | chord segments, key |
| `tempo_tuning.py` | librosa | tempo (BPM), tuning offset (cents from A = 440 Hz) |
| `run.py` | | runs the stages, builds and validates the document |

## The RC-20 format (fixed here, schema version 1)

`rc20.schema.json` is the format (ARCHITECTURE.md rule A8: changing it needs a `schemaVersion` bump and Elijah's
approval). Its field names mirror `demo/src/mock/types.ts`, but four values can be null where the demo type is a plain
number: a note's `string` and `fret`, a chord's `confidence`, and `beatsPerBar`. The viewer (POC-03) and the demo's
types have to accept null before a result loads unchanged. Decisions worth knowing:

- **Song time.** Every time is seconds from the start of the input file, rounded to the millisecond (RC-18).
- **`schemaVersion` and `audioSha256`** are top-level fields (approved by Elijah on 2026-11-09, see #49). The hash equals
  `shasum -a 256 song.wav`. A player compares it with its own copy of the audio (RC-19).
- **`string` and `fret` are null** on every note until the tab-assignment step (P1-05). String 1 is the highest-pitched
  string. Both are null or both are set.
- **Unknown is null (RC-11).** `key`, `bpm`, `tuningOffsetCents` and `beatsPerBar` are null when they could not be found,
  and a failure in one of the key, tempo or tuning stages gives null with a warning, never a guess.
- **A missing part is null.** `bass` (or `guitar`) is null when no notes were found in that part. The app then says
  "No bass part found" (US-08). The threshold is "no notes at all" for now; the benchmark may tune it.
- **Other failures stop the run.** If separation, note detection, beats or chords fail, nothing is written (RC-09).
- **`confidence` on a note** is Basic Pitch's note amplitude (0 to 1). **On a chord it is null**, because madmom's chord
  recognizer gives no score. P6-01 (OQ-01) decides how to flag uncertain chords.
- **Tuning** is librosa's estimate and is only good to about 10 cents.
- **Chord names** are `E`, `C#m` and so on. madmom's chord model knows only major and minor, and "no chord" stretches
  are left out.
- **The temp folder.** Separated parts exist only in a folder created under the system temp folder (or `--tmp-dir`) and
  are deleted when the run ends: on success, on any exception, and on SIGTERM (tests cover each, RC-03, rule A3).

## What had to be pinned or built from source, and why (RISK-04)

All four libraries install and run together on Python 3.10, but not out of the box. Verified 2026-11-16 on macOS 27 /
Apple silicon: a new `python -m venv` (Python 3.10.21) with plain `pip`, running exactly the two install commands above,
installed with no errors in about 8 minutes. Then `pip check` reported no broken requirements and `python -m pytest`
passed 4 tests in 37 s (the first run, including the Demucs model download). The `.venv` used for development was built
with `uv` from the same pins.

| Item | Problem | What we do |
| --- | --- | --- |
| **madmom** | The last PyPI release (0.16.1, 2018) fails twice on Python 3.10: it does not declare Cython as a build dependency, and it imports `collections.MutableSequence`, which Python 3.10 removed. | Install upstream `main` at a pinned commit (`27f032e`, "0.17.dev0") from git. Its pretrained models are included. It builds with `--no-build-isolation`, so Cython, setuptools, wheel and numpy go in `requirements-build.txt` first. |
| **numpy** | madmom's C extensions are compiled against the numpy that is installed when it builds. | Pin `numpy==2.2.6` in both requirements files. Change both together and rebuild madmom. |
| **setuptools** | madmom and resampy (a librosa dependency) import `pkg_resources`, which setuptools 81 and later removed. | Pin `setuptools==80.10.2`. |
| **scipy** | `scipy` 1.15.x ships a native module (`_propack`) that fails to load on this macOS (`section '__DATA/__thread_bss' has a zero-fill section type`), and that breaks `import madmom`. 1.14.1 and 1.13.1 load fine. 1.15 is also the last release that supports Python 3.10. | Pin `scipy==1.14.1`. Retest on the Linux container in P4-01; the pin may be relaxable there. |
| **Basic Pitch backend** | With nothing chosen, Basic Pitch uses CoreML on macOS and TensorFlow or TFLite elsewhere, so notes could differ between a laptop and the container. | Install `onnxruntime` and always pass the ONNX model path (`build_icassp_2022_model_path(FilenameSuffix.onnx)`). TensorFlow is not installed. |
| **torch** | Demucs needs it. coremltools (pulled in on macOS by Basic Pitch) warns that it has only been tested up to torch 2.7. The warning is harmless because the CoreML path is not used. | Pin `torch==2.14.1`. |

No library had to be replaced, so there is nothing for Elijah to approve under A10.

## Not done here

- The container image (P4-01) and the processing timings (P1-07).
- Linux has not been tested yet. The pins were checked on macOS only.
