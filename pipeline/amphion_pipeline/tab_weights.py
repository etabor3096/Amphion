"""The tab-assignment weights (DD-15): the one place to tune how a pitch becomes a string and fret.

Every number here is a named, adjustable preference, not a rule. They are tuned against the benchmark (RC-10), never by
feel: change one, rerun `benchmark/`, and report the scores (ARCHITECTURE.md rule A9). The hard rules (no two notes that
sound together on one string, and every fret inside the instrument's range) are not weights and live in `tab_assign.py`.

A cost is something the search tries to avoid, so a bigger number means "avoid this more".
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class TabWeights:
    # --- which position for one note ---
    fret: float = 1.0
    """Cost per fret number, so lower frets win: fret 2 costs 2, fret 12 costs 12."""

    open_string_bonus: float = 3.0
    """Subtracted from the cost of an open string (fret 0), so an open string beats a low fretted position. A beginner
    finds open strings easiest to play and they ring clearly."""

    thick_string_bonus: float = 0.0
    """Subtracted per string number, so a thicker (lower-pitched) string is preferred: string 4 of a bass earns three times
    what string 2 earns. 0 turns it off. Published bass tabs tend to stay on the low strings in the middle of the neck
    instead of jumping to the open string above."""

    # --- notes that sound together (one column) ---
    max_span: int = 4
    """Widest stretch, in frets, a beginner's hand can cover for notes that sound together. Open strings do not count."""

    span_excess: float = 20.0
    """Cost per fret beyond `max_span`. Large on purpose: a shape wider than 4 frets is chosen only if nothing narrower
    exists (US-08: 'within a four-fret span wherever the instrument allows')."""

    spread: float = 0.5
    """Small cost per fret of span even inside `max_span`, to prefer compact shapes."""

    # --- moving between neighboring notes ---
    hand_jump: float = 1.5
    """Cost per fret the hand has to move between one column and the next (average fretted position; open strings do not
    move the hand)."""

    string_change: float = 0.0
    """Cost per string the hand has to cross between one column and the next (average string number). 0 turns it off.
    Staying on one string is easier to read and to play."""

    jump_relief_seconds: float = 1.0
    """A jump matters less when there is time to make it: the cost is divided by (1 + gap / this), where gap is the time
    between the two columns' starts."""

    # --- what counts as sounding together ---
    column_window: float = 0.05
    """Notes whose start times are within this many seconds of the first note of a column are played together and stacked
    in one column (US-07)."""

    overlap_tolerance: float = 0.08
    """A note is still ringing on its string until its end time. A new note may use that string only if it starts no more
    than this many seconds before the ringing note ends. The detector's note ends are not exact, so a little overlap is
    forgiven."""

    # --- last resort ---
    unplayable: float = 1000.0
    """Cost of leaving a note without a string and fret. A note is never dropped (the issue's guardrail); it only gets
    null string and fret when no legal position exists, for example a pitch below the lowest string or a seventh
    simultaneous note on a six-string guitar. Keep this far above every other cost."""

    # --- search size ---
    beam_width: int = 32
    """How many partial tabs the search keeps at each column. Bigger is closer to the single best path through the whole
    song and slower."""

    candidates_per_column: int = 24
    """How many of the best shapes for one column are tried against each partial tab."""


DEFAULT_WEIGHTS = TabWeights()
"""Guitar. Tuned against the benchmark (P1-06): the defaults held up. Where a guitar part scored low it was because the
reference plays a chord as a barre shape and the pipeline plays the same pitches as an open shape, which no audio can
tell apart, so the beginner-friendly open shape stays."""

BASS_WEIGHTS = TabWeights(
    fret=0.5,
    open_string_bonus=-3.0,  # a penalty: published bass tabs stay in position on the low strings, not on the open string above
    thick_string_bonus=1.5,
    string_change=1.0,
    hand_jump=0.0,  # string_change and thick_string_bonus carry the "stay in position" preference
)
"""Bass. Tuned on the 2 benchmark songs with a published bass tab (Know Your Name, Maple Syrup), chosen from the middle of a
wide plateau (see benchmark/README.md, "Tuning"), not the single best point. With Rob as My Witness is not used for tuning:
its strings are a low-fret guess, not a tab."""

WEIGHTS_BY_INSTRUMENT = {"guitar": DEFAULT_WEIGHTS, "bass": BASS_WEIGHTS}

# Fret range and open-string pitches (MIDI note numbers) in standard tuning. String 1 is the highest-pitched string, as in
# the RC-20 format and demo/src/music/tuning.ts.
MAX_FRET = 20  # the demo's limit; rc20.schema.json allows up to 24
OPEN_STRING_PITCHES = {
    "guitar": (64, 59, 55, 50, 45, 40),  # e B G D A E
    "bass": (43, 38, 33, 28),  # G D A E
}
