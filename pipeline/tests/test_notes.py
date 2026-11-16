import numpy as np
import soundfile as sf

from amphion_pipeline.notes import detect_notes
from conftest import SR, _pluck


def _note_file(path, freq, starts, seconds=2.0):
    clip = np.zeros(int(SR * seconds))
    for start in starts:
        tone = _pluck(freq, 0.6)
        i = int(start * SR)
        clip[i : i + len(tone)] += tone[: len(clip) - i]
    sf.write(path, clip / np.abs(clip).max() * 0.8, SR)
    return path


def test_guitar_notes_have_the_rc20_shape_and_the_right_pitch(tmp_path):
    notes = detect_notes(_note_file(tmp_path / "a3.wav", 220.0, [0.2, 1.1]), "guitar")  # A3 = MIDI 57
    assert len(notes) >= 2
    assert {n["pitch"] for n in notes} == {57}
    for n in notes:
        assert set(n) == {"id", "startTime", "duration", "string", "fret", "pitch", "confidence", "edited"}
        assert n["string"] is None and n["fret"] is None  # filled in by P1-05, not here
        assert n["edited"] is False and 0.0 <= n["confidence"] <= 1.0 and n["duration"] > 0
    assert [n["startTime"] for n in notes] == sorted(n["startTime"] for n in notes)
    assert abs(notes[0]["startTime"] - 0.2) < 0.06 and abs(notes[1]["startTime"] - 1.1) < 0.06  # song time, in seconds


def test_bass_range_reaches_below_the_lowest_guitar_string(tmp_path):
    bass = detect_notes(_note_file(tmp_path / "e1.wav", 41.2, [0.2, 1.1]), "bass")  # E1 = MIDI 28
    assert bass and {n["pitch"] for n in bass} == {28}
    assert all(n["id"].startswith("bass-") for n in bass)


def test_silence_has_no_notes(tmp_path):
    path = tmp_path / "silence.wav"
    sf.write(path, np.zeros(SR), SR)
    assert detect_notes(path, "guitar") == []
