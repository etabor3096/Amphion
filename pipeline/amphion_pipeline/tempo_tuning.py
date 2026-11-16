"""Stage 5: tempo and tuning offset (librosa)."""
from __future__ import annotations

import librosa
import numpy as np

_SILENCE = 1e-4  # peak amplitude below which there is nothing to measure


def estimate_tempo(mono: np.ndarray, sample_rate: int) -> float | None:
    """Tempo in BPM, or None when the audio has no rhythm to measure."""
    if float(np.max(np.abs(mono), initial=0.0)) < _SILENCE:
        return None
    onset_strength = librosa.onset.onset_strength(y=mono, sr=sample_rate)
    if not onset_strength.any():
        return None
    bpm = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=onset_strength, sr=sample_rate))[0])
    return round(bpm, 1) if bpm > 0 else None


def estimate_tuning_offset_cents(mono: np.ndarray, sample_rate: int) -> float | None:
    """How far the recording sits from A = 440 Hz, in cents (negative is flat), or None when no pitch was found."""
    if float(np.max(np.abs(mono), initial=0.0)) < _SILENCE:
        return None
    pitches, magnitudes = librosa.piptrack(y=mono, sr=sample_rate)
    if not (pitches > 0).any():
        return None
    return round(float(librosa.estimate_tuning(y=mono, sr=sample_rate)) * 100.0, 1)
