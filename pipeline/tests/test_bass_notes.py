"""The bass is found by pitch tracking (pYIN), because a phone microphone leaves its fundamental weak (benchmark P1-06)."""
import numpy as np

from amphion_pipeline.bass_notes import BassParams, detect_bass_notes, segment, track_pitch

SR = 22050


def bass_line(notes, harmonics, seconds=4.0):
    """`notes` is [(start seconds, frequency Hz)]; each sounds 0.5 s with a decaying attack. `harmonics` maps k to its level."""
    clip = np.zeros(int(SR * seconds))
    for start, freq in notes:
        t = np.arange(int(0.5 * SR)) / SR
        tone = sum(level * np.sin(2 * np.pi * k * freq * t) for k, level in harmonics.items()) * np.exp(-3.0 * t)
        i = int(start * SR)
        clip[i : i + len(tone)] += tone
    return (clip / np.abs(clip).max() * 0.8).astype(np.float32)


LINE = [(0.3, 41.2), (1.3, 55.0), (2.3, 82.4)]  # E1, A1, E2 = MIDI 28, 33, 40
FULL = {1: 1.0, 2: 0.5, 3: 0.25}


def test_a_plain_bass_line_comes_out_at_the_right_pitches_and_times():
    notes = detect_bass_notes(bass_line(LINE, FULL), SR)
    assert [n["pitch"] for n in notes] == [28, 33, 40]
    assert all(abs(n["startTime"] - s) < 0.08 for n, (s, _) in zip(notes, LINE))
    for n in notes:
        assert set(n) == {"id", "startTime", "duration", "string", "fret", "pitch", "confidence", "edited"}
        assert n["string"] is None and n["fret"] is None and n["edited"] is False and 0.0 <= n["confidence"] <= 1.0


def test_a_missing_fundamental_is_still_heard_at_the_fundamental_not_the_harmonic():
    # What a phone microphone records: the 1st harmonic is far weaker than the 2nd to 4th. Basic Pitch reports the
    # harmonic (an octave or more too high) for this; pitch tracking finds the period of the whole sound.
    weak = {1: 0.05, 2: 1.0, 3: 0.9, 4: 0.5}
    notes = detect_bass_notes(bass_line(LINE, weak), SR)
    assert [n["pitch"] for n in notes] == [28, 33, 40]


def test_silence_has_no_bass_notes():
    assert detect_bass_notes(np.zeros(SR * 2, dtype=np.float32), SR) == []


def test_a_track_can_be_cut_again_with_other_settings_without_tracking_it_twice():
    track = track_pitch(bass_line(LINE, FULL), SR)
    assert len(segment(track)) == 3
    assert segment(track, BassParams(min_note=2.0)) == []  # nothing lasts 2 s


def test_ids_run_in_time_order():
    notes = detect_bass_notes(bass_line(LINE, FULL), SR)
    assert [n["id"] for n in notes] == ["bass-0", "bass-1", "bass-2"]
    assert [n["startTime"] for n in notes] == sorted(n["startTime"] for n in notes)
