"""Stage 1: separate the guitar and bass parts from the mix (Demucs, 6-part model, DD-16)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model

MODEL_NAME = "htdemucs_6s"
INSTRUMENTS = ("guitar", "bass")


@lru_cache(maxsize=1)
def _model():
    model = get_model(MODEL_NAME)
    model.eval()
    return model


def separate(stereo: np.ndarray, sample_rate: int, work_dir: Path) -> dict[str, Path]:
    """Write only the guitar and bass parts into `work_dir` and return their paths.

    The other four parts are dropped in memory and never written. The caller owns `work_dir` and must delete it
    (RC-03): the parts are never stored anywhere else.
    """
    model = _model()
    if sample_rate != model.samplerate:
        raise ValueError(f"expected {model.samplerate} Hz audio, got {sample_rate} Hz")
    wav = torch.from_numpy(stereo)
    reference = wav.mean(0)
    wav = (wav - reference.mean()) / (reference.std() + 1e-8)  # same normalization the Demucs command line uses
    with torch.no_grad():
        # shifts=0: Demucs's default (shifts=1) runs the model once at a RANDOM time offset, so the parts, and the notes found
        # in them, differ from run to run. shifts=0 runs it once with no offset: the same cost, and a repeatable result,
        # which the benchmark needs (RC-10).
        parts = apply_model(model, wav[None], shifts=0, device="cpu", split=True, overlap=0.25, progress=False)[0]
    parts = parts * (reference.std() + 1e-8) + reference.mean()
    paths = {}
    for name in INSTRUMENTS:
        path = work_dir / f"{name}.wav"
        sf.write(path, parts[model.sources.index(name)].numpy().T, sample_rate)
        paths[name] = path
    return paths
