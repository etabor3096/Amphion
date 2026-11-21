# pipeline/

The Python analysis code: the processing function that turns an uploaded song into tab data (SDD 5.1, DD-02, DD-16).
Demucs separates the guitar and bass parts, Basic Pitch finds the guitar notes, librosa's pYIN pitch tracker finds the bass
notes, the tab-assignment module picks strings and frets (DD-15), madmom finds beats, chords and key, and librosa finds
tempo and tuning.

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
10 s and a 3-minute song about 2 minutes (see the timings below).

| Stage (one module each) | Library | Output |
| --- | --- | --- |
| `audio.py` load | librosa, hashlib | 44.1 kHz stereo and mono mix; SHA-256 of the input file's exact bytes |
| `separate.py` | Demucs `htdemucs_6s` | guitar and bass parts, written only to a temp folder |
| `notes.py` | Basic Pitch (ONNX) | guitar notes: start, length, pitch, confidence |
| `bass_notes.py` | librosa pYIN | bass notes, from the pitch track (see below) |
| `beats.py` | madmom | beat and downbeat times, beats per bar |
| `harmony.py` | madmom | chord segments (from the song without drums and vocals), key |
| `tempo_tuning.py` | librosa | tempo (BPM), tuning offset (cents from A = 440 Hz) |
| `tab_assign.py` | project code | a string and fret for every note (P1-05); weights in `tab_weights.py` |
| `run.py` | | runs the stages, builds and validates the document |

## The RC-20 format (fixed here, schema version 1)

`rc20.schema.json` is the format (ARCHITECTURE.md rule A8: changing it needs a `schemaVersion` bump and Elijah's
approval). Its field names mirror `demo/src/mock/types.ts`, but four values can be null where the demo type is a plain
number: a note's `string` and `fret`, a chord's `confidence`, and `beatsPerBar`. The viewer (POC-03) and the demo's
types have to accept null before a result loads unchanged. Decisions worth knowing:

- **Song time.** Every time is seconds from the start of the input file, rounded to the millisecond (RC-18).
- **`schemaVersion` and `audioSha256`** are top-level fields (approved by Elijah on 2026-11-09, see #49). The hash equals
  `shasum -a 256 song.wav`. A player compares it with its own copy of the audio (RC-19).
- **`string` and `fret`** come from the tab-assignment step (P1-05). String 1 is the highest-pitched string. Both are
  null or both are set, and they are null only for a note with no legal position (see below). No note is ever dropped.
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

## Finding the bass notes: pitch tracking, not Basic Pitch (P1-06)

Basic Pitch finds the guitar. For the bass, `bass_notes.py` tracks the pitch with librosa's pYIN and cuts the track into
notes, because Basic Pitch reported the wrong octave: on the benchmark's phone recordings the bass's fundamental is several
times weaker than its 2nd and 3rd harmonics (the 2nd is 6.7 times stronger on Know Your Name), and Basic Pitch returns the
harmonic, 12, 19 or 24 semitones too high. pYIN follows the period of the whole sound, so a weak fundamental does not
fool it. A bass plays one note at a time, which is what a single pitch track assumes. Every setting is a named value in
`BassParams`, chosen from the middle of a flat range on the benchmark (`benchmark/README.md`, "Tuning").

**Chords** are found on the song without its drums and vocals (the sum of the Demucs bass, guitar, piano and "other"
parts, kept in memory and never written), which is a cleaner input than the full mix.

## Choosing strings and frets (P1-05, DD-15)

`tab_assign.py` gives each note a string and fret. Every option for a pitch is scored, and a beam search keeps the best
partial tabs through the whole song (`beam_width` in `tab_weights.py`, 32 by default; the search for 460 notes takes
10 ms). Notes that start within 50 ms of each other form one column and are placed together.

- **Weights by instrument.** The guitar uses `DEFAULT_WEIGHTS` and the bass uses `BASS_WEIGHTS` (`WEIGHTS_BY_INSTRUMENT`).
  Published bass tabs stay in position on the low strings (the open string above is penalised, a thicker string is
  preferred, crossing strings costs a little), which the guitar's weights do not do.
- **Preferences** (all named, adjustable weights in `tab_weights.py`, with a comment each): open strings, then lower
  frets; notes in one column within 4 frets (open strings do not count); a small cost for moving the hand between
  columns, smaller when there is time to move. Tune them against the benchmark and report the scores (rule A9).
- **Hard rules:** no two notes that sound together share a string, whether they start together or one is still ringing
  from earlier (a note rings until its end time, forgiving 80 ms of detector error); frets run 0 to 20 (the demo's limit;
  the schema allows 24); the fret matches the tuning offset.
- **Tuning offset.** The pipeline's own estimate is a fraction of a semitone, so it never moves a position. A whole
  semitone offset cannot be measured (OQ-05), but the code supports one: `tuning_offset_cents=-100` makes the open low
  string one semitone flat, so pitch 39 is fret 0 on string 6 instead of unplayable.
- **A note with no legal position** keeps `string` and `fret` null and a warning is logged with the count. That happens
  for a pitch below the lowest string (for example a detector error one semitone below a bass's low E), above fret 20, or
  a seventh simultaneous note on a six-string guitar. It is never dropped and never given a wrong position.
- **Known limit.** The "still ringing" rule is strict. If the detector reports long overlapping notes, some notes that
  fit only one string will come out null instead of cutting the earlier note, as a player would. The benchmark (P1-03)
  will show whether that is worth relaxing.

## Processing time for a 3-minute song (P1-07, RC-08, RISK-02)

Measured 2026-11-16 with `python tools/time_stages.py song.wav --threads N`, each row in a fresh process (so each pays
for loading the models once, as a cold instance would). Seconds per stage:

| Threads | load | separate (Demucs) | notes (Basic Pitch) | beats (madmom) | chords (madmom) | key, tempo, tuning | tab | **Total** | Peak memory |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 0.3 | 76.4 | 7.5 | 12.3 | 38.6 | 4.3 | 0.0 | **140 s** | 2.2 GB |
| 4 | 0.5 | 68.3 | 5.5 | 12.6 | 38.4 | 4.1 | 0.0 | **129 s** | 2.8 GB |
| 4 (repeat) | 0.4 | 71.1 | 5.8 | 12.3 | 38.7 | 4.3 | 0.0 | **133 s** | 2.7 GB |
| 4 (repeat, after the determinism fix) | 0.3 | 70.1 | 5.7 | 12.6 | 39.2 | 4.5 | 0.0 | **133 s** | 2.4 GB |
| 8 | 0.4 | 61.4 | 8.2 | 13.3 | 39.4 | 4.3 | 0.0 | **127 s** | 2.4 GB |
| 10 (all cores) | 0.4 | 68.6 | 10.1 | 12.5 | 41.8 | 4.5 | 0.0 | **138 s** | 2.8 GB |

**What was measured, and what was not.** The audio is the generated 10-second clip repeated 18 times (a 180.0 s file), not
a real song: the separation, beat and chord stages take time that depends on the length of the file, not on what is in it,
but the note and tab stages scale with how many notes there are. The machine is an Apple M5 (4 performance and 6
efficiency cores, 16 GB), not a container: there is no Docker here, and containerizing moved to P4-01. This Mac cannot pin
cores, so `--threads` limits the thread pools of PyTorch, NumPy, numba and ONNX Runtime instead of giving the process
exactly N CPUs. Upload, Cloud Run cold start, model download and the Firestore writes are not included. Treat the numbers
as a lower bound for a cloud CPU, which is likely slower per core than an M5.

**Findings.**

- **More threads barely help.** 2 threads took 140 s and 8 took 127 s. Demucs is the biggest stage (61 to 76 s) and scales
  weakly. The chord (39 s) and beat (13 s) stages (madmom) and the key, tempo and tuning stage (4 s) stages do not speed up with more threads (chords stayed at 38 to 42 s).
  Together they are about 56 s of every run. So an 8 vCPU instance should not be paid for as things stand; 2 to 4
  vCPU gives nearly the same time.
- **Memory.** Peak use was 2.2 to 2.8 GB, so size the instance comfortably above that.
- **Repeatable.** The 4-thread run took 129, 133 and 133 s, within 3%. While timing I also found that the pipeline was not
  repeatable: Demucs adds a random time offset by default, so the parts and the notes changed from run to run. That is
  fixed (`shifts=0` in `separate.py`) and `tests/test_run.py` now checks that two runs give the same result.

**Does RC-08 look reachable on CPU? Not as the pipeline stands.** RC-08 wants a 3-minute song at Ready in under 2 minutes
from upload. The analysis alone took 127 to 140 s on a fast laptop CPU, which already misses it before upload and cold
start are added, and a cloud vCPU will probably be slower. This is one synthetic file on one machine, so it is an early
signal, not a verdict. Options, none of them taken here (OD-06 says CPU until P1-07 and P4-06 measure it, and a GPU needs
a cost check and Elijah's approval):

1. **Run the stages that do not speed up with threads (beats, chords, key, tempo and tuning, about 56 s) at the same
   time as Demucs**, in separate processes. The longest path would then be Demucs plus the notes, about 70 to 85 s, if
   there are enough vCPU that they do not slow each other. This is an estimate that I have not measured.
2. A GPU for Demucs (cost check and approval first).
3. Relax RC-08 (Elijah's decision).

P4-06 repeats this on the deployed service, which is the measurement that counts.

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
