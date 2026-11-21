"""Tests for the tab text parser used to build references from published tabs."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "make_reference"))
import tabtext  # noqa: E402


def _parse(tmp_path, text, inst="guitar"):
    path = tmp_path / "tab.txt"
    path.write_text(text)
    return tabtext.parse(path, inst)


def test_durations():
    assert tabtext.parse_dur("q") == 1.0
    assert tabtext.parse_dur("q.") == 1.5
    assert tabtext.parse_dur("e3") == pytest.approx(1 / 3)
    assert tabtext.parse_dur("q+e") == 1.5
    assert tabtext.parse_dur("4") == 4.0


def test_notes_strings_and_pitches(tmp_path):
    bars, notes = _parse(tmp_path, "1: e0:q B1:q G2:q E3:q\n")
    assert [(n["string"], n["fret"], n["pitch"]) for n in notes] == [(1, 0, 64), (2, 1, 60), (3, 2, 57), (6, 3, 43)]
    assert [n["start"] for n in notes] == [0, 1, 2, 3]
    assert bars == [(1, 0.0, 4.0, None)]


def test_bass_tuning(tmp_path):
    _, notes = _parse(tmp_path, "1: E0:h G2:h\n", "bass")
    assert [(n["string"], n["pitch"]) for n in notes] == [(4, 28), (1, 45)]


def test_bass_has_no_high_e(tmp_path):
    with pytest.raises(ValueError, match="no e string"):
        _parse(tmp_path, "1: e0:4\n", "bass")


def test_chord_rest_and_tie(tmp_path):
    _, notes = _parse(tmp_path, "1: B0+G3:q r:q D4:q ~:q\n2: ~:h ~D4:h\n")
    assert [(n["pitch"], n["start"], n["dur"]) for n in notes] == [(59, 0, 1), (58, 0, 1), (54, 2, 6.0)]


def test_copies_empty_bars_and_tempo(tmp_path):
    bars, notes = _parse(tmp_path, "# a comment\nbpm 1 = 120\nbpm 3 = 140\n1-2: R4\n3: A0:4\n4: =3\n")
    assert [(b[0], b[1], b[3]) for b in bars] == [(1, 0, 120), (2, 4, 120), (3, 8, 140), (4, 12, 140)]
    assert [n["start"] for n in notes] == [8, 12]


def test_wrong_length_bar_is_reported(tmp_path):
    bars, _ = _parse(tmp_path, "1: A0:q A0:q A0:q\n2: A0:4\n")
    assert tabtext.wrong_length_bars(bars, 4) == [(1, 3.0)]


def test_copy_of_missing_bar_fails(tmp_path):
    with pytest.raises(ValueError, match="missing bar"):
        _parse(tmp_path, "1: =5\n")
