"""P1-05 (#50): beginner-friendly string and fret choices (DD-15, US-08)."""
import itertools
import random

import pytest

from amphion_pipeline.tab_assign import assign_strings_and_frets, positions_for, tuning_shift_semitones
from amphion_pipeline.tab_weights import MAX_FRET, OPEN_STRING_PITCHES, TabWeights

OPEN = {name: dict(enumerate(pitches, start=1)) for name, pitches in OPEN_STRING_PITCHES.items()}


def note(start, pitch, duration=0.5, name="n"):
    return {"id": f"{name}-{start}-{pitch}", "startTime": start, "duration": duration, "pitch": pitch,
            "string": None, "fret": None, "confidence": 0.9, "edited": False}


def pos(notes, instrument="guitar", **kwargs):
    return [(n["string"], n["fret"]) for n in assign_strings_and_frets(notes, instrument, **kwargs)]


# --- preferences ---

def test_an_open_string_wins_over_a_fretted_position():
    assert pos([note(0, 45)]) == [(5, 0)]  # A2: the open A string, not fret 5 on the low E


def test_a_lower_fret_wins():
    assert pos([note(0, 52)]) == [(4, 2)]  # E3: D string fret 2, not A string fret 7 or low E fret 12


def test_open_position_wins_when_every_other_preference_ties():
    flat = TabWeights(fret=0.0, hand_jump=0.0, spread=0.0)  # only the open-string bonus is left to break the tie
    assert pos([note(0, 45)], weights=flat) == [(5, 0)]
    # and with no preference at all, the tie breaks toward the lowest fret, then the highest-pitched string
    nothing = TabWeights(fret=0.0, open_string_bonus=0.0, hand_jump=0.0, spread=0.0)
    assert pos([note(0, 45)], weights=nothing) == [(5, 0)]
    assert pos([note(0, 52)], weights=nothing) == [(4, 2)]


def test_an_open_e_chord_comes_out_as_the_open_shape():
    assert pos([note(0, 52), note(0, 56), note(0, 59)]) == [(4, 2), (3, 1), (2, 0)]  # E3 G#3 B3


def test_a_close_position_is_chosen_over_a_big_hand_jump():
    # Only the jump cost can decide here: every fret and span preference is switched off.
    only_jump = TabWeights(fret=0.0, open_string_bonus=0.0, spread=0.0, hand_jump=1.0)
    melody = [note(0.0, 71), note(0.2, 57)]  # B4 then A3
    # B4 costs the same on every string it can be played on, so the tie goes to the lowest fret: e string, fret 7.
    # A3 is fret 2 on G, 7 on D, 12 on A. Fret 7 on D keeps the hand where it is, so the jump cost picks it over fret 2.
    assert pos(melody, weights=only_jump) == [(1, 7), (4, 7)]


def test_a_jump_costs_less_when_there_is_time_to_make_it():
    # Same two notes; fret 2 is cheaper to play, fret 7 keeps the hand still. Only the time between the notes differs.
    w = TabWeights(fret=0.1, open_string_bonus=0.0, spread=0.0, hand_jump=0.2, jump_relief_seconds=1.0)
    assert pos([note(0.0, 71), note(0.1, 57)], weights=w) == [(1, 7), (4, 7)]  # quick: stay at fret 7
    assert pos([note(0.0, 71), note(10.0, 57)], weights=w) == [(1, 7), (3, 2)]  # plenty of time: move to fret 2


# --- hard rules ---

def test_pitch_and_fret_always_agree_with_the_string():
    rng = random.Random(1)
    for instrument, low, high in (("guitar", 40, 84), ("bass", 28, 63)):
        notes = [note(i * 0.3, rng.randint(low, high), duration=0.2) for i in range(60)]  # no overlap between notes
        for n in assign_strings_and_frets(notes, instrument):
            assert n["string"] is not None
            assert 0 <= n["fret"] <= MAX_FRET
            assert OPEN[instrument][n["string"]] + n["fret"] == n["pitch"]


def test_no_two_notes_that_sound_together_share_a_string():
    rng = random.Random(2)
    for _ in range(200):
        pitches = rng.sample(range(40, 77), rng.randint(2, 6))
        placed = assign_strings_and_frets([note(0, p) for p in pitches], "guitar")
        strings = [n["string"] for n in placed if n["string"] is not None]
        assert len(strings) == len(set(strings)), pitches


def test_a_note_still_ringing_blocks_its_string():
    long_a = note(0.0, 45, duration=2.0)  # A2 rings for two seconds on the open A string
    again = note(0.5, 45, duration=0.3)  # the same pitch again: its first choice is taken
    placed = assign_strings_and_frets([long_a, again], "guitar")
    assert (placed[0]["string"], placed[0]["fret"]) == (5, 0)
    assert (placed[1]["string"], placed[1]["fret"]) == (6, 5)  # low E, fret 5, because the A string is still sounding


def test_a_note_may_reuse_a_string_after_the_first_has_stopped():
    placed = assign_strings_and_frets([note(0.0, 45, duration=0.3), note(1.0, 45, duration=0.3)], "guitar")
    assert [(n["string"], n["fret"]) for n in placed] == [(5, 0), (5, 0)]


def _spans_within(pitches, instrument, limit):
    """Brute force: is there any assignment of distinct strings whose fretted notes span at most `limit` frets?"""
    options = [positions_for(p, instrument) for p in pitches]
    for combo in itertools.product(*options):
        strings = [s for s, _ in combo]
        if len(set(strings)) < len(strings):
            continue
        fretted = [f for _, f in combo if f > 0]
        if not fretted or max(fretted) - min(fretted) <= limit:
            return True
    return False


def test_simultaneous_notes_stay_within_four_frets_whenever_that_is_possible():
    rng = random.Random(3)
    checked = 0
    for _ in range(300):
        pitches = rng.sample(range(40, 80), rng.randint(2, 4))
        if not _spans_within(pitches, "guitar", 4):
            continue
        checked += 1
        placed = assign_strings_and_frets([note(0, p) for p in pitches], "guitar")
        fretted = [n["fret"] for n in placed if n["fret"]]
        assert not fretted or max(fretted) - min(fretted) <= 4, pitches
    assert checked > 100


def test_a_wide_chord_that_cannot_be_narrowed_is_still_played():
    pitches = [40, 76]  # low E open and high E at fret 12: the 12-fret reach cannot be shortened
    placed = assign_strings_and_frets([note(0, p) for p in pitches], "guitar")
    assert all(n["string"] is not None for n in placed)


# --- never drop a note ---

def test_a_pitch_below_the_lowest_string_is_kept_with_null_string_and_fret():
    placed = assign_strings_and_frets([note(0, 30), note(1, 45)], "guitar")
    assert len(placed) == 2
    assert (placed[0]["string"], placed[0]["fret"]) == (None, None)
    assert (placed[1]["string"], placed[1]["fret"]) == (5, 0)


def test_more_simultaneous_notes_than_strings_keeps_every_note():
    notes = [note(0, p) for p in (40, 45, 50, 55, 59, 64, 67)]  # seven notes, six strings
    placed = assign_strings_and_frets(notes, "guitar")
    assert len(placed) == 7
    assert sum(1 for n in placed if n["string"] is None) == 1
    strings = [n["string"] for n in placed if n["string"] is not None]
    assert len(strings) == len(set(strings)) == 6


def test_the_input_is_not_changed_and_order_is_kept():
    notes = [note(1.0, 52), note(0.0, 45)]
    placed = assign_strings_and_frets(notes, "guitar")
    assert notes[0]["string"] is None and notes[1]["string"] is None
    assert [n["id"] for n in placed] == [n["id"] for n in notes]
    assert assign_strings_and_frets([], "guitar") == []


# --- bass ---

def test_bass_has_four_strings_and_string_one_is_g():
    assert pos([note(0, 28, name="b")], "bass") == [(4, 0)]  # E1: the open low E string
    assert pos([note(0, 43, name="b")], "bass") == [(1, 0)]  # G2: the open G string
    assert pos([note(0, 24, name="b")], "bass") == [(None, None)]  # below a four-string bass
    assert all(s <= 4 for s, _ in pos([note(i * 0.3, 28 + i, duration=0.2) for i in range(30)], "bass"))


# --- tuning offset ---

def test_a_tuning_offset_of_a_semitone_flat_moves_every_position():
    assert pos([note(0, 39)], tuning_offset_cents=0.0) == [(None, None)]  # D#2 is below a standard low E
    assert pos([note(0, 39)], tuning_offset_cents=-100.0) == [(6, 0)]  # but it is the open low string when tuned down
    assert pos([note(0, 40)], tuning_offset_cents=-100.0) == [(6, 1)]


def test_the_pipelines_own_fractional_offsets_do_not_move_positions():
    for cents in (None, 0.0, -30.0, 30.0, -49.0, 49.0):
        assert tuning_shift_semitones(cents) == 0
        assert pos([note(0, 45)], tuning_offset_cents=cents) == [(5, 0)]
    assert tuning_shift_semitones(-100.0) == -1 and tuning_shift_semitones(200.0) == 2


# --- weights ---

def test_the_weights_are_adjustable():
    low = TabWeights(open_string_bonus=0.0, fret=-1.0)  # absurd on purpose: now HIGH frets are preferred
    assert pos([note(0, 52)], weights=low) == [(6, 12)]


@pytest.mark.parametrize("beam", [1, 4, 32])
def test_a_longer_run_finishes_quickly_at_any_beam_width(beam):
    rng = random.Random(4)
    notes = [note(i * 0.25, rng.randint(40, 76), duration=0.2) for i in range(400)]
    placed = assign_strings_and_frets(notes, "guitar", weights=TabWeights(beam_width=beam))
    assert len(placed) == 400 and all(n["string"] is not None for n in placed)
