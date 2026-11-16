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
