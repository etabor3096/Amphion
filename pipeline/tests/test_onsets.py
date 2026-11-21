"""Guitar note starts are lined up with the plucks in the audio (benchmark P1-06)."""
import numpy as np

from amphion_pipeline.onsets import SnapParams, detect_onsets, snap_to_onsets
from conftest import SR, _pluck


def note(start, pitch=57, duration=0.5, index=0):
    return {"id": f"guitar-{index}", "startTime": start, "duration": duration, "string": None, "fret": None,
            "pitch": pitch, "confidence": 0.9, "edited": False}


def plucks(starts, seconds=4.0):
    clip = np.zeros(int(SR * seconds))
    for start in starts:
        tone = _pluck(220.0, 0.6)
        i = int(start * SR)
        clip[i : i + len(tone)] += tone[: len(clip) - i]
    return clip / np.abs(clip).max() * 0.8


def test_onsets_are_found_at_the_plucks():
    onsets = detect_onsets(plucks([0.5, 1.5, 2.5]))
    assert len(onsets) >= 3
    for start in (0.5, 1.5, 2.5):
        assert np.min(np.abs(onsets - start)) < 0.05


def test_a_note_start_moves_onto_a_nearby_onset_and_keeps_its_end():
    moved = snap_to_onsets([note(0.56, duration=0.5)], np.array([0.5, 1.5]))
    assert moved[0]["startTime"] == 0.5
    assert abs((moved[0]["startTime"] + moved[0]["duration"]) - 1.06) < 1e-6  # the end did not move


def test_a_note_with_no_onset_in_the_window_is_left_alone():
    assert snap_to_onsets([note(0.9)], np.array([0.5, 1.5]), SnapParams(window=0.12))[0]["startTime"] == 0.9


def test_notes_that_start_together_land_together_and_nothing_is_dropped_or_added():
    notes = [note(0.47, 57, index=0), note(0.55, 64, index=1), note(0.52, 60, index=2)]
    moved = snap_to_onsets(notes, np.array([0.5]))
    assert [n["startTime"] for n in moved] == [0.5, 0.5, 0.5]
    assert sorted(n["pitch"] for n in moved) == [57, 60, 64]
    assert [n["id"] for n in moved] == ["guitar-0", "guitar-1", "guitar-2"]


def test_the_result_stays_in_time_order_with_fresh_ids():
    moved = snap_to_onsets([note(1.05, 60, index=0), note(0.8, 57, index=1)], np.array([1.0]))
    assert [n["startTime"] for n in moved] == [0.8, 1.0] and [n["id"] for n in moved] == ["guitar-0", "guitar-1"]


def test_no_notes_or_no_onsets_changes_nothing():
    assert snap_to_onsets([], np.array([0.5])) == []
    assert snap_to_onsets([note(0.56)], np.array([]))[0]["startTime"] == 0.56


def test_a_note_is_never_snapped_to_a_zero_or_sliver_duration():
    # An onset in the last half millisecond of a short note used to leave duration 0.0, which is not valid RC-20.
    assert snap_to_onsets([note(0.4, duration=0.1004)], np.array([0.5004]))[0]["duration"] > 0  # the onset is at the note's end
    moved = snap_to_onsets([note(0.5, duration=0.1)], np.array([0.59]))  # would leave 10 ms
    assert moved[0]["startTime"] == 0.5 and moved[0]["duration"] == 0.1
    assert all(n["duration"] > 0 for n in snap_to_onsets([note(t, duration=0.13) for t in np.arange(0, 3, 0.01)], np.arange(0.005, 3, 0.07)))


def test_no_onsets_still_gives_time_order_and_fresh_ids():
    moved = snap_to_onsets([note(2.0, 60, index=0), note(1.0, 57, index=1)], np.array([]))
    assert [n["startTime"] for n in moved] == [1.0, 2.0] and [n["id"] for n in moved] == ["guitar-0", "guitar-1"]


def test_a_part_with_no_notes_does_not_run_the_onset_detector(tmp_path):
    from amphion_pipeline.onsets import snap_part_to_onsets

    assert snap_part_to_onsets([], tmp_path / "does-not-exist.wav") == []


def test_the_input_notes_are_not_modified():
    notes = [note(0.56)]
    snap_to_onsets(notes, np.array([0.5]))
    assert notes[0]["startTime"] == 0.56
