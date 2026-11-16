import numpy as np

from amphion_pipeline.beats import track_beats


def test_a_120_bpm_click_track_gives_half_second_beats_and_four_to_a_bar(audio):
    beats, downbeats, per_bar = track_beats(audio.mono, audio.sample_rate)
    assert len(beats) >= 15
    assert abs(float(np.median(np.diff(beats))) - 0.5) < 0.03
    assert per_bar == 4
    assert set(downbeats) <= set(beats) and downbeats == sorted(downbeats)
    assert all(0 <= t <= 10.0 for t in beats)  # song time within the file


def test_silence_has_no_beat_grid():
    assert track_beats(np.zeros(44100 * 3, dtype=np.float32), 44100) == ([], [], None)
