import numpy as np

from amphion_pipeline.tempo_tuning import estimate_tempo, estimate_tuning_offset_cents
from conftest import SR


def test_tempo_of_a_120_bpm_clip(audio):
    bpm = estimate_tempo(audio.mono, audio.sample_rate)
    assert bpm is not None and abs(bpm - 120.0) < 4.0


def _tone(cents):
    t = np.arange(int(SR * 3)) / SR
    return sum(np.sin(2 * np.pi * 440.0 * 2 ** ((cents + 1200 * k) / 1200) * t) for k in (-1, 0)).astype(np.float32) * 0.4


def test_tuning_offset_follows_a_detuned_tone():
    # librosa's estimator is only good to about 10 cents on a synthetic tone (an in-tune A reads -8), so that is the bound.
    assert abs(estimate_tuning_offset_cents(_tone(-30.0), SR) - (-30.0)) < 10.0
    assert abs(estimate_tuning_offset_cents(_tone(+20.0), SR) - 20.0) < 10.0
    assert abs(estimate_tuning_offset_cents(_tone(0.0), SR)) < 10.0


def test_silence_is_unknown_not_zero():
    silence = np.zeros(SR * 2, dtype=np.float32)
    assert estimate_tempo(silence, SR) is None
    assert estimate_tuning_offset_cents(silence, SR) is None
