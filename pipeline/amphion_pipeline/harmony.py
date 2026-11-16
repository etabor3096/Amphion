"""Stage 4: chord names and the key (madmom)."""
from __future__ import annotations

import numpy as np
from madmom.audio.signal import Signal
from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor
from madmom.features.key import CNNKeyRecognitionProcessor, key_prediction_to_label


def _display_name(label: str) -> str | None:
    """madmom writes "E:maj", "C#:min" and "N" (no chord). Return "E", "C#m", or None for no chord."""
    if label == "N" or ":" not in label:
        return None
    root, quality = label.split(":", 1)
    return root + ("m" if quality.startswith("min") else "")


def detect_chords(mono: np.ndarray, sample_rate: int) -> list[dict]:
    """Return chord segments in time order. Confidence is null: madmom's chord recognizer gives no score."""
    segments = CRFChordRecognitionProcessor()(CNNChordFeatureProcessor()(Signal(mono, sample_rate=sample_rate)))
    chords = []
    for start, end, label in segments:
        name = _display_name(str(label))
        if name is not None and end > start:
            chords.append(
                {
                    "id": f"chord-{len(chords)}",
                    "startTime": round(float(start), 3),
                    "endTime": round(float(end), 3),
                    "name": name,
                    "confidence": None,
                    "edited": False,
                }
            )
    return chords


def detect_key(mono: np.ndarray, sample_rate: int) -> str | None:
    """Return the key as "E minor" or "G major", or None if it could not be found."""
    probabilities = CNNKeyRecognitionProcessor()(Signal(mono, sample_rate=sample_rate))
    return str(key_prediction_to_label(probabilities)) if probabilities.size else None
