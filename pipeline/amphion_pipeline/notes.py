"""Stage 2: find the notes in one separated part (Basic Pitch, run on its ONNX model)."""
from __future__ import annotations

from pathlib import Path

from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
from basic_pitch.inference import predict

# Frequency window per instrument, a little wider than the open low string up to about the 24th fret (Hz).
FREQUENCY_RANGE_HZ = {"guitar": (75.0, 1400.0), "bass": (35.0, 450.0)}


def detect_notes(stem_path: Path, instrument: str) -> list[dict]:
    """Return the detected notes in time order. string and fret are null until the tab-assignment step (P1-05).

    `confidence` is Basic Pitch's note amplitude, 0 to 1. Calibrating what counts as low is P6-01 (OQ-01).
    """
    low, high = FREQUENCY_RANGE_HZ[instrument]
    _, _, events = predict(
        str(stem_path),
        build_icassp_2022_model_path(FilenameSuffix.onnx),  # the same backend on macOS and Linux
        minimum_frequency=low,
        maximum_frequency=high,
    )
    notes = sorted(events, key=lambda event: (event[0], event[2]))
    return [
        {
            "id": f"{instrument}-{index}",
            "startTime": round(float(start), 3),
            "duration": round(float(end) - float(start), 3),
            "string": None,
            "fret": None,
            "pitch": int(pitch),
            "confidence": round(min(1.0, max(0.0, float(amplitude))), 3),
            "edited": False,
        }
        for index, (start, end, pitch, amplitude, _bends) in enumerate(notes)
        if float(end) > float(start)
    ]
