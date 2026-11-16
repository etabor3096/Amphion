"""Shared fixtures for the pipeline tests.

The 10-second test clip is generated here (plucked-string tones plus a click track), so no audio file is committed
and no copyrighted audio is involved (POLICY.md, OD-04).
"""
import numpy as np
import pytest
import soundfile as sf

SR = 44100
BPM = 120.0
SECONDS = 10.0


def _pluck(freq: float, seconds: float, sr: int = SR) -> np.ndarray:
    """Karplus-Strong plucked string: a short noise burst through a damped delay line."""
    n = int(seconds * sr)
    period = int(round(sr / freq))
    rng = np.random.default_rng(0)
    buf = rng.uniform(-1, 1, period)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = 0.4985 * (buf[i % period] + buf[(i + 1) % period])
    return out


def make_clip() -> np.ndarray:
    """A 120 BPM, 4/4 clip: a bass line on beat 1 and 3, chord strums on every beat, a click on every beat."""
    total = int(SECONDS * SR)
    clip = np.zeros(total)
    beat = 60.0 / BPM
    notes_bass = [82.41, 110.0]  # E2, A2
    chord = [164.81, 207.65, 246.94]  # E3, G#3, B3 (E major)
    for k in range(int(SECONDS / beat)):
        start = int(k * beat * SR)
        if k % 2 == 0:
            tone = 0.6 * _pluck(notes_bass[(k // 2) % 2], beat * 1.8)
        else:
            tone = sum(_pluck(f, beat * 0.9) for f in chord) * 0.25
        end = min(total, start + len(tone))
        clip[start:end] += tone[: end - start]
        click_len = int(0.01 * SR)
        clip[start : start + click_len] += 0.3 * np.hanning(click_len) * np.sin(2 * np.pi * 1000 * np.arange(click_len) / SR)
    return clip / max(1.0, np.abs(clip).max())


@pytest.fixture(scope="session")
def clip_path(tmp_path_factory) -> str:
    """Path to a 10-second stereo 44.1 kHz WAV (the format Demucs expects)."""
    mono = make_clip()
    path = tmp_path_factory.mktemp("clip") / "clip10.wav"
    sf.write(path, np.stack([mono, mono], axis=1), SR)
    return str(path)
