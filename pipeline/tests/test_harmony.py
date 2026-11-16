import re

from amphion_pipeline.harmony import _display_name, detect_chords, detect_key


def test_display_names_from_madmom_labels():
    assert _display_name("E:maj") == "E"
    assert _display_name("C#:min") == "C#m"
    assert _display_name("N") is None


def test_chords_are_in_time_order_inside_the_file(audio):
    chords = detect_chords(audio.mono, audio.sample_rate)
    assert chords
    for c in chords:
        assert set(c) == {"id", "startTime", "endTime", "name", "confidence", "edited"}
        assert re.fullmatch(r"[A-G][#b]?m?", c["name"]) and c["edited"] is False
        assert 0 <= c["startTime"] < c["endTime"] <= 10.05
        assert c["confidence"] is None  # madmom gives no chord score
    assert [c["startTime"] for c in chords] == sorted(c["startTime"] for c in chords)


def test_key_is_a_name_or_none(audio):
    key = detect_key(audio.mono, audio.sample_rate)
    assert key is None or re.fullmatch(r"[A-G][#b]? (major|minor)", key)
