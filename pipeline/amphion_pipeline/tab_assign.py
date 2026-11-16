"""Stage 6: choose a string and fret for every detected note (DD-15, US-08).

A pitch can usually be played in several places on the neck. This scores each option and picks the best-scoring path
through the whole song with a beam search. The preferences are the named weights in `tab_weights.py`.

Hard rules (never traded for a better score):
  * no two notes that sound together share a string (notes in one column, or a note still ringing from earlier);
  * a fret is between 0 and MAX_FRET, and a string exists on the instrument;
  * the fret is correct for the tuning offset;
  * no note is ever dropped. A note with no legal position keeps string and fret null (it is reported, not hidden).
"""
from __future__ import annotations

import heapq
import logging
import math
from dataclasses import dataclass
from itertools import count

from .tab_weights import DEFAULT_WEIGHTS, MAX_FRET, OPEN_STRING_PITCHES, TabWeights

log = logging.getLogger("amphion_pipeline")

_NODE_BUDGET = 30000  # most shapes tried for one column and one set of blocked strings


def tuning_shift_semitones(tuning_offset_cents: float | None) -> int:
    """Whole semitones the instrument sits from standard tuning.

    The pipeline's own estimate is a fraction of a semitone (within +-50 cents), so this is 0 for it and positions do
    not move. A song a whole step down cannot be told from a lower key (OQ-05), so a larger offset only arrives when
    someone sets it: -100 cents means every string is a semitone flat, and a pitch one semitone lower than the open
    string is then fret 0.
    """
    if not tuning_offset_cents:
        return 0
    return int(math.floor(tuning_offset_cents / 100.0 + 0.5))


def positions_for(pitch: int, instrument: str, shift: int = 0) -> list[tuple[int, int]]:
    """Every legal (string, fret) for a MIDI pitch, lowest fret first."""
    options = [
        (string, pitch - (open_pitch + shift))
        for string, open_pitch in enumerate(OPEN_STRING_PITCHES[instrument], start=1)
    ]
    return sorted(((s, f) for s, f in options if 0 <= f <= MAX_FRET), key=lambda sf: (sf[1], sf[0]))


@dataclass
class _Column:
    start: float
    indexes: list[int]  # positions in the sorted note list
    options: list[list[tuple[int, int]]]  # legal positions for each note


def _group_columns(notes: list[dict], instrument: str, shift: int, weights: TabWeights) -> list[_Column]:
    order = sorted(range(len(notes)), key=lambda i: (notes[i]["startTime"], notes[i]["pitch"]))
    columns: list[_Column] = []
    for i in order:
        if columns and notes[i]["startTime"] - columns[-1].start <= weights.column_window:
            columns[-1].indexes.append(i)
            columns[-1].options.append(positions_for(notes[i]["pitch"], instrument, shift))
        else:
            columns.append(_Column(notes[i]["startTime"], [i], [positions_for(notes[i]["pitch"], instrument, shift)]))
    return columns


def _shape_cost(frets: list[int | None], weights: TabWeights) -> float:
    """Cost of one column's shape: how high, how stretched, and how many notes had to be left out."""
    cost = 0.0
    fretted = []
    for fret in frets:
        if fret is None:
            cost += weights.unplayable
        elif fret == 0:
            cost -= weights.open_string_bonus
        else:
            cost += weights.fret * fret
            fretted.append(fret)
    if len(fretted) >= 2:
        span = max(fretted) - min(fretted)
        cost += weights.spread * span + weights.span_excess * max(0, span - weights.max_span)
    return cost


def _shapes(column: _Column, blocked: int, weights: TabWeights) -> list[tuple[float, tuple[tuple[int, int] | None, ...]]]:
    """The best shapes for one column, given strings (a bitmask) that are still ringing. Cheapest first."""
    n = len(column.indexes)
    found: list[tuple[float, tuple]] = []
    budget = [_NODE_BUDGET]
    tiebreak = count()

    def walk(k: int, used: int, chosen: list):
        if budget[0] <= 0:
            return
        if k == n:
            budget[0] -= 1
            frets = [None if c is None else c[1] for c in chosen]
            found.append((_shape_cost(frets, weights), next(tiebreak), tuple(chosen)))
            return
        free = [(s, f) for s, f in column.options[k] if not (used | blocked) & (1 << s)]
        for s, f in free:
            chosen.append((s, f))
            walk(k + 1, used | (1 << s), chosen)
            chosen.pop()
        if not free:  # no legal position left: the note is kept, with null string and fret
            chosen.append(None)
            walk(k + 1, used, chosen)
            chosen.pop()

    walk(0, 0, [])
    best = heapq.nsmallest(weights.candidates_per_column, found, key=lambda item: (item[0], item[1]))
    return [(cost, shape) for cost, _, shape in best]


@dataclass
class _State:
    cost: float
    shape: tuple
    hand: float | None  # average fretted position of the latest column that had one
    ringing: dict[int, float]  # string -> time its note stops sounding
    parent: "_State | None"


def assign_strings_and_frets(
    notes: list[dict],
    instrument: str,
    tuning_offset_cents: float | None = 0.0,
    weights: TabWeights = DEFAULT_WEIGHTS,
) -> list[dict]:
    """Return copies of `notes` (same order) with `string` and `fret` filled in. Nothing is added or removed.

    `notes` need `startTime`, `duration` and `pitch`. A note keeps null string and fret only when no legal position exists.
    """
    if not notes:
        return []
    shift = tuning_shift_semitones(tuning_offset_cents)
    columns = _group_columns(notes, instrument, shift, weights)
    ends = [n["startTime"] + n["duration"] for n in notes]
    cache: dict[tuple[int, int], list] = {}

    beam = [_State(0.0, (), None, {}, None)]
    previous_start = None
    for ci, column in enumerate(columns):
        next_states: dict[tuple, _State] = {}
        for state in beam:
            blocked = 0
            for string, end in state.ringing.items():
                if end - weights.overlap_tolerance > column.start:
                    blocked |= 1 << string
            key = (ci, blocked)
            if key not in cache:
                cache[key] = _shapes(column, blocked, weights)
            for shape_cost, shape in cache[key]:
                fretted = [c[1] for c in shape if c is not None and c[1] > 0]
                hand = sum(fretted) / len(fretted) if fretted else state.hand
                cost = state.cost + shape_cost
                if fretted and state.hand is not None and previous_start is not None:
                    gap = max(0.0, column.start - previous_start)
                    cost += weights.hand_jump * abs(hand - state.hand) / (1.0 + gap / weights.jump_relief_seconds)
                ringing = {s: e for s, e in state.ringing.items() if e - weights.overlap_tolerance > column.start}
                for note_index, position in zip(column.indexes, shape):
                    if position is not None:
                        ringing[position[0]] = max(ends[note_index], ringing.get(position[0], 0.0))
                new = _State(cost, shape, hand, ringing, state)
                kept = next_states.get(shape)
                if kept is None or new.cost < kept.cost:
                    next_states[shape] = new
        beam = heapq.nsmallest(weights.beam_width, next_states.values(), key=lambda s: s.cost)
        previous_start = column.start

    best = min(beam, key=lambda s: s.cost)
    shapes: list[tuple] = []
    while best.parent is not None:
        shapes.append(best.shape)
        best = best.parent
    shapes.reverse()

    result = [dict(note) for note in notes]
    for column, shape in zip(columns, shapes):
        for note_index, position in zip(column.indexes, shape):
            result[note_index]["string"], result[note_index]["fret"] = position if position is not None else (None, None)
    left_out = sum(1 for note in result if note["string"] is None)
    if left_out:
        log.warning("%d of %d %s notes have no playable string and fret and keep them null", left_out, len(notes), instrument)
    return result
