"""Tests for the benchmark scoring harness (P1-03, RC-10)."""
import copy
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from mir_eval.transcription import precision_recall_f1_overlap

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import score  # noqa: E402

BENCHMARK = Path(__file__).resolve().parents[1]
MANIFEST = BENCHMARK / "manifest.json"


def note(start, pitch=64, string=1, fret=0, duration=0.5):
    return {"id": "n", "startTime": start, "duration": duration, "string": string, "fret": fret, "pitch": pitch, "confidence": 1.0, "edited": False}


def chord(start, end, name):
    return {"id": "c", "startTime": start, "endTime": end, "name": name, "confidence": None, "edited": False}


REFERENCE = [note(0.0, 64), note(1.0, 67, string=1, fret=3), note(2.0, 60, string=2, fret=1)]


# --- note detection (the three cases the Issue names) -------------------------------------------------------------------


def test_a_reference_scored_against_itself_is_perfect():
    c = score.score_notes(REFERENCE, copy.deepcopy(REFERENCE))
    assert (c.precision, c.recall, c.f_measure) == (1.0, 1.0, 1.0)
    assert (c.string_accuracy, c.fret_accuracy, c.string_fret_accuracy) == (1.0, 1.0, 1.0)


def test_an_extra_note_costs_precision_not_recall():
    detected = REFERENCE + [note(3.0, 72)]
    c = score.score_notes(REFERENCE, detected)
    assert c.matched == 3
    assert c.precision == pytest.approx(3 / 4)
    assert c.recall == 1.0
    assert c.f_measure == pytest.approx(2 * 3 / 7)


def test_a_missed_note_costs_recall_not_precision():
    c = score.score_notes(REFERENCE, REFERENCE[:2])
    assert c.matched == 2
    assert c.precision == 1.0
    assert c.recall == pytest.approx(2 / 3)
    assert c.f_measure == pytest.approx(2 * 2 / 5)


def test_a_note_60_ms_late_is_both_extra_and_missed():
    late = [dict(n) for n in REFERENCE]
    late[1]["startTime"] += 0.060
    c = score.score_notes(REFERENCE, late)
    assert c.matched == 2
    assert c.precision == pytest.approx(2 / 3)
    assert c.recall == pytest.approx(2 / 3)


@pytest.mark.parametrize("shift", [0.040, -0.040, 0.049])
def test_a_note_inside_the_50_ms_window_counts(shift):
    moved = [dict(n) for n in REFERENCE]
    moved[1]["startTime"] += shift
    assert score.score_notes(REFERENCE, moved).matched == 3


def test_the_right_time_with_the_wrong_pitch_does_not_match():
    wrong = [dict(n) for n in REFERENCE]
    wrong[0]["pitch"] = 65
    assert score.score_notes(REFERENCE, wrong).matched == 2


def test_note_ends_are_not_scored():
    short = [dict(n, duration=0.05) for n in REFERENCE]
    assert score.score_notes(REFERENCE, short).f_measure == 1.0


def test_nothing_detected_scores_zero_and_nothing_expected_is_not_a_number():
    assert score.score_notes(REFERENCE, []).f_measure == 0.0
    assert score.score_notes([], []).f_measure is None
    assert score.score_notes([], REFERENCE).recall is None


def test_it_agrees_with_mir_eval_f_measure():
    rng = np.random.default_rng(1)
    starts = np.sort(rng.uniform(0, 30, 60))
    pitches = rng.integers(40, 76, 60)
    ref = [note(float(s), int(p)) for s, p in zip(starts, pitches)]
    det = [note(float(s + rng.normal(0, 0.04)), int(p)) for s, p in zip(starts[::2], pitches[::2])]
    det += [note(float(s), int(p) + 1) for s, p in zip(starts[:10], pitches[:10])]
    ours = score.score_notes(ref, det)
    ref_i, ref_hz = score._arrays(ref)
    det_i, det_hz = score._arrays(det)
    p, r, f, _ = precision_recall_f1_overlap(ref_i, ref_hz, det_i, det_hz, onset_tolerance=0.05, offset_ratio=None)
    assert (ours.precision, ours.recall, ours.f_measure) == pytest.approx((p, r, f))


# --- string and fret ----------------------------------------------------------------------------------------------------


def test_string_and_fret_are_scored_over_matched_notes_only():
    detected = [
        note(0.0, 64, string=1, fret=0),  # right
        note(1.0, 67, string=2, fret=8),  # same pitch, other string and fret
        note(2.0, 60, string=2, fret=3),  # right string, wrong fret
        note(9.0, 50, string=4, fret=0),  # extra note: not matched, so not counted
    ]
    c = score.score_notes(REFERENCE, detected)
    assert c.matched == 3
    assert c.string_accuracy == pytest.approx(2 / 3)
    assert c.fret_accuracy == pytest.approx(1 / 3)
    assert c.string_fret_accuracy == pytest.approx(1 / 3)


def test_string_and_fret_are_not_a_number_when_nothing_matched():
    assert score.score_notes(REFERENCE, [note(9.0, 50)]).string_fret_accuracy is None


# --- chords -------------------------------------------------------------------------------------------------------------


def chord_doc(chords, beats):
    return {"beats": beats, "chords": chords}


def test_chord_accuracy_is_the_share_of_beats_with_the_same_chord():
    ref = chord_doc([chord(0, 2, "C"), chord(2, 4, "Am")], [0.0, 1.0, 2.0, 3.0])
    det = chord_doc([chord(0, 3, "C"), chord(3, 4, "Am")], [])
    c = score.score_chords(ref, det)
    assert (c.beats, c.correct) == (4, 3)  # beat 2.0 is Am in the reference but C in the detected tab
    assert c.accuracy == 0.75


def test_a_beat_where_the_pipeline_has_no_chord_is_wrong():
    ref = chord_doc([chord(0, 4, "C")], [0.0, 1.0, 2.0, 3.0])
    det = chord_doc([chord(0, 1.5, "C")], [])
    assert score.score_chords(ref, det).accuracy == 0.5


def test_a_beat_where_the_reference_has_no_chord_is_not_counted():
    ref = chord_doc([chord(1, 3, "C")], [0.0, 1.0, 2.0, 3.0])
    c = score.score_chords(ref, chord_doc([chord(0, 4, "C")], []))
    assert (c.beats, c.correct) == (2, 2)  # beats at 0.0 and 3.0 are outside the reference chord


def test_a_chord_holds_its_start_beat_and_not_its_end_beat():
    ref = chord_doc([chord(0, 2, "C"), chord(2, 4, "G")], [0.0, 2.0])
    assert score.score_chords(ref, copy.deepcopy(ref)).accuracy == 1.0
    assert score.score_chords(ref, chord_doc([chord(0, 2.0001, "C"), chord(2.0001, 4, "G")], [])).accuracy == 0.5


def test_enharmonic_spellings_are_the_same_chord_and_major_is_not_minor():
    ref = chord_doc([chord(0, 1, "A#"), chord(1, 2, "Dbm"), chord(2, 3, "C")], [0.0, 1.0, 2.0])
    det = chord_doc([chord(0, 1, "Bb"), chord(1, 2, "C#m"), chord(2, 3, "Cm")], [])
    c = score.score_chords(ref, det)
    assert (c.beats, c.correct) == (3, 2)


def test_a_long_chord_is_not_lost_behind_a_shorter_one_that_overlaps_it():
    ref = chord_doc([chord(0, 4, "C"), chord(1, 2, "G")], [0.0, 1.0, 2.0, 3.0])
    c = score.score_chords(ref, chord_doc([chord(0, 1, "C"), chord(1, 2, "G"), chord(2, 4, "C")], []))
    assert (c.beats, c.correct) == (4, 4)


def test_no_detected_chords_scores_zero():
    ref = chord_doc([chord(0, 2, "C")], [0.0, 1.0])
    assert score.score_chords(ref, chord_doc([], [])).accuracy == 0.0


# --- the real references, totals and the report ------------------------------------------------------------------------


def test_every_reference_scored_against_itself_is_100_percent_on_every_metric():
    scores = score.score_all(MANIFEST, None)
    assert len(scores) >= 3
    note_totals, chord_totals = score.totals(scores)
    for t in note_totals:
        c = t.notes
        assert (c.precision, c.recall, c.f_measure, c.string_accuracy, c.fret_accuracy, c.string_fret_accuracy) == (1.0,) * 6, t.label
    assert all(t.chords.accuracy == 1.0 for t in chord_totals)
    for s in scores:
        assert all(c.f_measure == 1.0 for c in s.notes.values())
        assert s.chords.accuracy == 1.0


def test_totals_pool_counts_and_split_by_instrument_and_input():
    a = score.SongScore("a", "A", "upload", {"guitar": score.NoteCounts(10, 10, 10, 10, 10, 10)}, score.ChordCounts(10, 10))
    b = score.SongScore("b", "B", "mic", {"guitar": score.NoteCounts(30, 30, 0), "bass": score.NoteCounts(5, 5, 5, 5, 5, 5)}, score.ChordCounts(30, 0))
    note_totals, chord_totals = score.totals([a, b])
    by_label = {t.label: t for t in note_totals}
    assert by_label["Total, guitar, all songs"].notes.f_measure == pytest.approx(0.25)  # 10 of 40 and 40, not (100% + 0%) / 2
    assert by_label["Total, guitar, uploads"].notes.f_measure == 1.0
    assert by_label["Total, guitar, mic recordings"].notes.f_measure == 0.0
    assert by_label["Total, bass, all songs"].songs == 1
    assert "Total, bass, uploads" not in by_label
    assert {t.label: t.chords.accuracy for t in chord_totals}["Total, all songs"] == pytest.approx(0.25)


def test_the_report_shows_every_metric_per_song_and_in_total():
    report = score.render_report(score.score_all(MANIFEST, None), "2026-11-21", "test")
    for heading in ("# Benchmark report 2026-11-21", "## Note detection", "## String and fret", "## Chord accuracy"):
        assert heading in report
    for column in ("Precision", "Recall", "F-measure", "String and fret", "Chord accuracy"):
        assert column in report
    for section in report.split("\n## ")[1:]:
        for title in ("Know Your Name", "With Rob as My Witness", "Maple Syrup"):
            assert title in section
    assert "Total, guitar, all songs" in report and "Total, bass, mic recordings" in report and "Total, all songs" in report


# --- running it ---------------------------------------------------------------------------------------------------------


@pytest.fixture
def results(tmp_path):
    """A results folder holding a copy of every reference, as if the pipeline had found the tab perfectly."""
    manifest = json.loads(MANIFEST.read_text())
    for song in manifest["songs"]:
        (tmp_path / f"{song['id']}.json").write_text((BENCHMARK / song["reference"]).read_text())
    return tmp_path


def test_a_perfect_results_folder_scores_100_percent(results):
    assert all(s.chords.accuracy == 1.0 for s in score.score_all(MANIFEST, results))


def test_a_dropped_part_scores_zero_recall_instead_of_being_skipped(results):
    path = results / "know-your-name.json"
    document = json.loads(path.read_text())
    document["bass"] = None
    path.write_text(json.dumps(document))
    scores = {s.id: s for s in score.score_all(MANIFEST, results)}
    assert scores["know-your-name"].notes["bass"].recall == 0.0
    assert scores["know-your-name"].notes["guitar"].recall == 1.0


def test_a_missing_results_file_is_an_error(results):
    (results / "maple-syrup.json").unlink()
    with pytest.raises(score.ScoreError, match="maple-syrup.json is missing"):
        score.score_all(MANIFEST, results)


def test_results_that_are_not_rc20_are_an_error(results):
    (results / "maple-syrup.json").write_text(json.dumps({"guitar": None}))
    with pytest.raises(score.ScoreError, match="not valid RC-20"):
        score.score_all(MANIFEST, results)


def test_results_made_from_another_audio_file_are_an_error(results):
    path = results / "maple-syrup.json"
    document = json.loads(path.read_text())
    document["audioSha256"] = "0" * 64
    path.write_text(json.dumps(document))
    with pytest.raises(score.ScoreError, match="different audio file"):
        score.score_all(MANIFEST, results)


def test_the_command_writes_the_dated_report(results, tmp_path, capsys):
    out = tmp_path / "reports" / "2026-11-21.md"
    assert score.main(["--results-dir", str(results), "--date", "2026-11-21", "--out", str(out)]) == 0
    assert out.read_text().startswith("# Benchmark report 2026-11-21")
    assert score.main(["--results-dir", str(results / "nope"), "--out", str(out)]) == 1
    assert "is missing" in capsys.readouterr().err


def test_self_test_and_results_dir_are_exclusive(results):
    with pytest.raises(SystemExit):
        score.main(["--self-test", "--results-dir", str(results)])
    with pytest.raises(SystemExit):
        score.main([])
