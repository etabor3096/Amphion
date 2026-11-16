"""Time every pipeline stage on one audio file with the CPU thread count capped (P1-07, RC-08, RISK-02).

usage: python tools/time_stages.py song.wav --threads 4 [--label "M5, 4 threads"]

Prints one JSON line: seconds per stage, total, and peak memory. Run each thread count in a FRESH process: the first run
in a process also pays for loading the models, which is what a cold Cloud Run instance pays too.

Capping threads is a stand-in for a container's vCPU limit: this machine cannot pin cores, so it limits the thread pools
of PyTorch, NumPy/BLAS, numba and ONNX Runtime instead. It is not the same as a container on a cloud CPU.
"""
import argparse
import json
import os
import resource
import sys
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("audio", type=Path)
parser.add_argument("--threads", type=int, required=True)
parser.add_argument("--label", default="")
args = parser.parse_args()

# Thread limits must be set before numpy, torch, numba or onnxruntime are imported.
for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ[name] = str(args.threads)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import onnxruntime as ort  # noqa: E402
import torch  # noqa: E402

torch.set_num_threads(args.threads)
_session = ort.InferenceSession


def _capped_session(path, sess_options=None, *a, **kw):
    options = sess_options or ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    options.inter_op_num_threads = 1
    return _session(path, options, *a, **kw)


ort.InferenceSession = _capped_session

from amphion_pipeline import analyze  # noqa: E402

timings: dict[str, float] = {}
started = time.perf_counter()
document = analyze(args.audio, timings=timings)
total = round(time.perf_counter() - started, 2)
print(json.dumps({
    "label": args.label,
    "threads": args.threads,
    "audioSeconds": document["duration"],
    "stages": timings,
    "total": total,
    # ru_maxrss is in bytes on macOS and in kilobytes on Linux
    "peakMemoryGB": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1e9 if sys.platform == "darwin" else 1e6), 2),
    "notes": {k: len(document[k]["notes"]) if document[k] else 0 for k in ("guitar", "bass")},
    "torchThreads": torch.get_num_threads(),
}))
