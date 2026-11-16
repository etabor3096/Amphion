"""Stage 3: find the beats and downbeats (madmom)."""
from __future__ import annotations

from collections import Counter

import numpy as np
from madmom.audio.signal import Signal
from madmom.features.downbeats import DBNDownBeatTrackingProcessor, RNNDownBeatProcessor


def track_beats(mono: np.ndarray, sample_rate: int) -> tuple[list[float], list[float], int | None]:
    """Return (beat times, downbeat times, beats per bar), in song time. beats per bar is None if no full bar is found."""
    activations = RNNDownBeatProcessor()(Signal(mono, sample_rate=sample_rate))
    tracked = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)(activations)
    if len(tracked) == 0:
        return [], [], None
    times = [round(float(t), 3) for t in tracked[:, 0]]
    positions = tracked[:, 1].astype(int)
    downbeats = [t for t, p in zip(times, positions) if p == 1]
    bar_lengths = Counter(np.diff(np.flatnonzero(positions == 1)).tolist())
    return times, downbeats, (int(bar_lengths.most_common(1)[0][0]) if bar_lengths else None)
