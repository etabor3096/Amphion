"""Stage 2b: line the guitar notes up with the attacks in the audio (madmom's onset detector).

Basic Pitch places a note start from a frame of its own network, which is often 20 to 100 ms away from the pluck you can see
in the waveform, and the benchmark counts a note as correct only within 50 ms (RC-10). madmom's RNN onset detector finds the
plucks themselves. Each note start that has a detected onset close enough is moved onto it. A note with no onset nearby is left
where Basic Pitch put it, and the note's end does not move. Notes that start together in a chord also land on the same
instant, which the tab-assignment step groups on (US-07).

Benchmark (P1-06, guitar note F-measure): 38.4% to 41.4% with the settings below, better on both songs and flat across
thresholds 0.1 to 0.3 and windows 120 to 150 ms.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from madmom.audio.signal import Signal
from madmom.features.onsets import OnsetPeakPickingProcessor, RNNOnsetProcessor

from .audio import SAMPLE_RATE


@dataclass(frozen=True)
class SnapParams:
    threshold: float = 0.2
    """Peak-picking threshold on madmom's onset activation. Low on purpose: a missed onset leaves a note where it was, a
    spurious one only matters if a note sits within `window` of it."""

    window: float = 0.12
    """A note start moves to the nearest onset only if it is within this many seconds."""


DEFAULT_SNAP = SnapParams()


def detect_onsets(mono: np.ndarray, sample_rate: int = SAMPLE_RATE, params: SnapParams = DEFAULT_SNAP) -> np.ndarray:
    """Onset times in seconds, ascending, from a mono signal."""
    activation = RNNOnsetProcessor()(Signal(np.ascontiguousarray(mono, dtype=np.float32), sample_rate=sample_rate))
    picker = OnsetPeakPickingProcessor(threshold=params.threshold, fps=100, pre_max=0.03, post_max=0.03)
    return np.asarray(picker(activation), dtype=float)


def snap_to_onsets(notes: list[dict], onsets: np.ndarray, params: SnapParams = DEFAULT_SNAP) -> list[dict]:
    """Return copies of `notes` with starts moved onto the nearest onset within `params.window`. Time order and ids are kept
    consistent: the result is sorted by start time and numbered again, nothing is added or dropped."""
    if not notes or not len(onsets):
        return [dict(note) for note in notes]
    moved = []
    for note in notes:
        start, end = note["startTime"], note["startTime"] + note["duration"]
        i = int(np.searchsorted(onsets, start))
        near = [onsets[j] for j in (i - 1, i) if 0 <= j < len(onsets)]
        best = min(near, key=lambda t: abs(t - start))
        if abs(best - start) <= params.window and end - best > 0.0:
            start = float(best)
        moved.append(dict(note, startTime=round(start, 3), duration=round(end - start, 3)))
    moved.sort(key=lambda n: (n["startTime"], n["pitch"]))
    prefix = notes[0]["id"].rsplit("-", 1)[0]
    for index, note in enumerate(moved):
        note["id"] = f"{prefix}-{index}"
    return moved


def snap_part_to_onsets(notes: list[dict], stem_path: Path) -> list[dict]:
    """Detect the onsets in a separated part's WAV file and snap its notes to them."""
    import librosa

    mono, _ = librosa.load(str(stem_path), sr=SAMPLE_RATE, mono=True)
    return snap_to_onsets(notes, detect_onsets(mono))
