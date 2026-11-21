"""Score the pipeline's tabs against the hand-checked references (RC-10, RISK-01, P1-03).

    python benchmark/score.py --results-dir results/          # results/<song id>.json for every song in the manifest
    python benchmark/score.py --self-test                     # each reference scored against itself (must be 100%)
    python benchmark/score.py --results-dir results/ --out /tmp/report.md --date 2026-11-21

`results/<song id>.json` is what `python -m amphion_pipeline <audio> -o <file>` writes (RC-20). The references are the
files in `benchmark/references/`, listed in `manifest.json`. A report is written to `benchmark/reports/<date>.md`.

What is scored (RC-10):

* Note detection. mir_eval matches a detected note to a reference note when the pitch is the same and it starts within
  50 ms of it (offsets are ignored). Precision, recall and F-measure, for guitar and bass separately, and for uploads and
  mic recordings separately.
* String and fret. Scored apart from note detection, over the notes that were matched: the share on the same string, the
  share on the same fret, and the share on both.
* Chord accuracy. The share of beats whose chord matches the reference. The beats are the reference's own beat grid. A
  beat where the reference has no chord is not counted. A beat where the pipeline has no chord is wrong.

Totals add up the counts of every song in the group and then divide (they are not an average of per-song scores), so a
longer song counts for more.

The 50 ms window and the RISK-01 bars are fixed (ARCHITECTURE.md A9). Do not change them here.
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import mir_eval
import numpy as np
from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
RC20_SCHEMA = HERE.parent / "pipeline" / "rc20.schema.json"

ONSET_TOLERANCE = 0.05  # seconds. RC-10: "starts within 50 ms". Fixed; the Issue forbids changing it.
PITCH_TOLERANCE_CENTS = 50.0  # pitches are whole MIDI numbers, 100 cents apart, so this means "same pitch"
INSTRUMENTS = ("guitar", "bass")
INPUTS = ("upload", "mic")

# Enharmonic spellings the schema allows (^[A-G][#b]?m?$), written as a pitch class so A# and Bb compare equal.
_PITCH_CLASS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


class ScoreError(Exception):
    """Something is wrong with the inputs (a missing or invalid results file), not with the scoring."""


# ----------------------------------------------------------------------------------------------------------------------
# Counts. Everything is kept as counts so totals can be pooled, then turned into percentages at the end.
# ----------------------------------------------------------------------------------------------------------------------


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


@dataclass
class NoteCounts:
    reference: int = 0  # notes in the reference
    detected: int = 0  # notes the pipeline found
    matched: int = 0  # detected notes with the right pitch and onset
    string_ok: int = 0  # matched notes on the right string
    fret_ok: int = 0  # matched notes on the right fret
    both_ok: int = 0  # matched notes on the right string and fret

    def add(self, other: "NoteCounts") -> None:
        for name in ("reference", "detected", "matched", "string_ok", "fret_ok", "both_ok"):
            setattr(self, name, getattr(self, name) + getattr(other, name))

    @property
    def precision(self) -> float | None:
        return _ratio(self.matched, self.detected)

    @property
    def recall(self) -> float | None:
        return _ratio(self.matched, self.reference)

    @property
    def f_measure(self) -> float | None:
        if not self.reference and not self.detected:
            return None
        if not self.matched:
            return 0.0
        return 2 * self.matched / (self.reference + self.detected)  # = 2PR / (P + R)

    @property
    def string_accuracy(self) -> float | None:
        return _ratio(self.string_ok, self.matched)

    @property
    def fret_accuracy(self) -> float | None:
        return _ratio(self.fret_ok, self.matched)

    @property
    def string_fret_accuracy(self) -> float | None:
        return _ratio(self.both_ok, self.matched)


@dataclass
class ChordCounts:
    beats: int = 0  # beats where the reference has a chord
    correct: int = 0  # of those, beats where the pipeline's chord is the same

    def add(self, other: "ChordCounts") -> None:
        self.beats += other.beats
        self.correct += other.correct

    @property
    def accuracy(self) -> float | None:
        return _ratio(self.correct, self.beats)


@dataclass
class SongScore:
    id: str
    title: str
    input: str  # "upload" or "mic"
    notes: dict[str, NoteCounts] = field(default_factory=dict)  # only the parts the song has
    chords: ChordCounts = field(default_factory=ChordCounts)


# ----------------------------------------------------------------------------------------------------------------------
# Scoring one song
# ----------------------------------------------------------------------------------------------------------------------


def _midi_to_hz(pitches: np.ndarray) -> np.ndarray:
    return 440.0 * 2.0 ** ((pitches - 69.0) / 12.0)


def _arrays(notes: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    intervals = np.array([[n["startTime"], n["startTime"] + n["duration"]] for n in notes], dtype=float).reshape(-1, 2)
    hz = _midi_to_hz(np.array([n["pitch"] for n in notes], dtype=float))
    return intervals, hz


def score_notes(reference_notes: list[dict], detected_notes: list[dict]) -> NoteCounts:
    """Match detected notes to reference notes (pitch and onset only) and count the string and fret hits."""
    counts = NoteCounts(reference=len(reference_notes), detected=len(detected_notes))
    if not reference_notes or not detected_notes:
        return counts
    ref_intervals, ref_hz = _arrays(reference_notes)
    det_intervals, det_hz = _arrays(detected_notes)
    matches = mir_eval.transcription.match_notes(
        ref_intervals,
        ref_hz,
        det_intervals,
        det_hz,
        onset_tolerance=ONSET_TOLERANCE,
        pitch_tolerance=PITCH_TOLERANCE_CENTS,
        offset_ratio=None,  # RC-10 scores the start of a note only
    )
    for ref_index, det_index in matches:
        ref, det = reference_notes[ref_index], detected_notes[det_index]
        same_string, same_fret = ref["string"] == det["string"], ref["fret"] == det["fret"]
        counts.matched += 1
        counts.string_ok += same_string
        counts.fret_ok += same_fret
        counts.both_ok += same_string and same_fret
    return counts


def _chord_key(name: str) -> tuple[int, bool]:
    """A chord as (pitch class, minor?), so A# and Bb are the same chord."""
    pitch = _PITCH_CLASS[name[0]]
    rest = name[1:]
    if rest.startswith("#"):
        pitch, rest = pitch + 1, rest[1:]
    elif rest.startswith("b"):
        pitch, rest = pitch - 1, rest[1:]
    return pitch % 12, rest == "m"


def _chord_at(times: np.ndarray, starts: np.ndarray, ends: np.ndarray, keys: list) -> list:
    """The chord sounding at each time (a segment holds its start but not its end), or None.

    The schema allows overlapping segments; where they overlap, the one that started last wins.
    """
    found = []
    for t in times:
        hit = None
        for start, end, key in zip(starts, ends, keys):  # ascending start, so the last hit is the latest-starting
            if start <= t < end:
                hit = key
        found.append(hit)
    return found


def score_chords(reference: dict, detected: dict) -> ChordCounts:
    """The share of the reference's beats where the pipeline's chord is the reference's chord."""
    beats = np.array(reference["beats"], dtype=float)
    if not len(beats):
        return ChordCounts()

    def lookup(chords: list[dict]) -> list:
        ordered = sorted(chords, key=lambda c: c["startTime"])
        starts = np.array([c["startTime"] for c in ordered], dtype=float)
        ends = np.array([c["endTime"] for c in ordered], dtype=float)
        return _chord_at(beats, starts, ends, [_chord_key(c["name"]) for c in ordered])

    expected, found = lookup(reference["chords"]), lookup(detected["chords"])
    counts = ChordCounts()
    for want, got in zip(expected, found):
        if want is None:
            continue
        counts.beats += 1
        counts.correct += want == got
    return counts


def score_song(song: dict, reference: dict, detected: dict) -> SongScore:
    """Score one manifest entry. `song` is its manifest entry, the other two are RC-20 documents."""
    score = SongScore(id=song["id"], title=song["title"], input=song["input"])
    for instrument in song["instruments"]:
        ref_part, det_part = reference.get(instrument), detected.get(instrument)
        score.notes[instrument] = score_notes(
            ref_part["notes"] if ref_part else [],
            det_part["notes"] if det_part else [],  # a missing part scores zero, it is not skipped
        )
    score.chords = score_chords(reference, detected)
    return score


# ----------------------------------------------------------------------------------------------------------------------
# Totals
# ----------------------------------------------------------------------------------------------------------------------


@dataclass
class Total:
    label: str
    notes: NoteCounts | None = None  # None for a chord-only total
    chords: ChordCounts | None = None
    songs: int = 0


def totals(scores: list[SongScore]) -> tuple[list[Total], list[Total]]:
    """Pooled totals: for notes, each instrument over all songs and then per input; for chords, all songs and per input."""
    note_totals: list[Total] = []
    for instrument in INSTRUMENTS:
        for input_type in (None, *INPUTS):
            group = [s for s in scores if instrument in s.notes and input_type in (None, s.input)]
            if not group:
                continue
            pooled = NoteCounts()
            for s in group:
                pooled.add(s.notes[instrument])
            where = "all songs" if input_type is None else ("uploads" if input_type == "upload" else "mic recordings")
            note_totals.append(Total(f"Total, {instrument}, {where}", notes=pooled, songs=len(group)))

    chord_totals: list[Total] = []
    for input_type in (None, *INPUTS):
        group = [s for s in scores if input_type in (None, s.input)]
        if not group:
            continue
        pooled_chords = ChordCounts()
        for s in group:
            pooled_chords.add(s.chords)
        where = "all songs" if input_type is None else ("uploads" if input_type == "upload" else "mic recordings")
        chord_totals.append(Total(f"Total, {where}", chords=pooled_chords, songs=len(group)))
    return note_totals, chord_totals


# ----------------------------------------------------------------------------------------------------------------------
# The report
# ----------------------------------------------------------------------------------------------------------------------


def pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def _table(header: list[str], rows: list[list[str]], text_columns: int = 3) -> list[str]:
    """A markdown table whose first `text_columns` columns are left-aligned and the rest (numbers) right-aligned."""
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join("---" if i < text_columns else "---:" for i in range(len(header))) + " |"]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return lines


def render_report(scores: list[SongScore], date: str, source: str, self_test: bool = False) -> str:
    note_totals, chord_totals = totals(scores)
    lines = [f"# Benchmark report {date}", ""]
    if self_test:
        lines += ["> **Self-test.** Every reference was scored against itself, so every metric must be 100%. This checks the scorer, not the pipeline.", ""]
    lines += [
        f"- Results: `{source}`",
        f"- Songs scored: {len(scores)} (the full RC-10 set is 10)",
        f"- Note match: pitch equal and onset within {ONSET_TOLERANCE * 1000:.0f} ms (mir_eval {mir_eval.__version__}); note ends are not scored",
        "- Totals pool the counts of every song in the group; they are not an average of the per-song percentages",
        "",
    ]

    lines += ["## Note detection", ""]
    rows = []
    for s in scores:
        for instrument, c in s.notes.items():
            rows.append([s.title, s.input, instrument, str(c.reference), str(c.detected), str(c.matched), pct(c.precision), pct(c.recall), pct(c.f_measure)])
    for t in note_totals:
        c = t.notes
        rows.append([f"**{t.label}** ({t.songs})", "", "", str(c.reference), str(c.detected), str(c.matched), pct(c.precision), pct(c.recall), f"**{pct(c.f_measure)}**"])
    lines += _table(["Song", "Input", "Part", "Reference notes", "Detected", "Matched", "Precision", "Recall", "F-measure"], rows)

    lines += ["", "## String and fret", "", "Of the matched notes only; a note that was not detected is already counted in note detection.", ""]
    rows = []
    for s in scores:
        for instrument, c in s.notes.items():
            rows.append([s.title, s.input, instrument, str(c.matched), pct(c.string_accuracy), pct(c.fret_accuracy), pct(c.string_fret_accuracy)])
    for t in note_totals:
        c = t.notes
        rows.append([f"**{t.label}** ({t.songs})", "", "", str(c.matched), pct(c.string_accuracy), pct(c.fret_accuracy), f"**{pct(c.string_fret_accuracy)}**"])
    lines += _table(["Song", "Input", "Part", "Matched notes", "String", "Fret", "String and fret"], rows)

    lines += ["", "## Chord accuracy", "", "The share of the reference's beats whose chord matches. A beat with no reference chord is not counted.", ""]
    rows = [[s.title, s.input, str(s.chords.beats), str(s.chords.correct), pct(s.chords.accuracy)] for s in scores]
    for t in chord_totals:
        rows.append([f"**{t.label}** ({t.songs})", "", str(t.chords.beats), str(t.chords.correct), f"**{pct(t.chords.accuracy)}**"])
    lines += _table(["Song", "Input", "Beats counted", "Correct", "Chord accuracy"], rows, text_columns=2)
    return "\n".join(lines) + "\n"


# ----------------------------------------------------------------------------------------------------------------------
# Running it
# ----------------------------------------------------------------------------------------------------------------------


def _load(path: Path):
    with path.open() as handle:
        return json.load(handle)


def score_all(manifest_path: Path, results_dir: Path | None) -> list[SongScore]:
    """Score every song in the manifest. With no `results_dir`, each reference is scored against itself."""
    manifest = _load(manifest_path)
    validator = Draft202012Validator(_load(RC20_SCHEMA))
    scores = []
    for song in manifest["songs"]:
        reference = _load(manifest_path.parent / song["reference"])
        if results_dir is None:
            detected = reference
        else:
            path = results_dir / f"{song['id']}.json"
            if not path.is_file():
                raise ScoreError(f"{path} is missing: run the pipeline on {song['audioFile']} and write its result there")
            detected = _load(path)
            problems = [e.message for e in validator.iter_errors(detected)]
            if problems:
                raise ScoreError(f"{path} is not valid RC-20: {problems[0]}")
            if detected["audioSha256"] != song["audioSha256"]:
                raise ScoreError(f"{path} was made from a different audio file than {song['audioFile']} (audioSha256 differs)")
        scores.append(score_song(song, reference, detected))
    return scores


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--results-dir", type=Path, help="folder holding <song id>.json from the pipeline, one per manifest song")
    parser.add_argument("--self-test", action="store_true", help="score each reference against itself (every metric must be 100%%)")
    parser.add_argument("--manifest", type=Path, default=HERE / "manifest.json")
    parser.add_argument("--date", default=datetime.date.today().isoformat(), help="date for the report title and file name (default: today)")
    parser.add_argument("--out", type=Path, help="report path (default: benchmark/reports/<date>.md)")
    args = parser.parse_args(argv)
    if bool(args.results_dir) == args.self_test:
        parser.error("give exactly one of --results-dir or --self-test")

    try:
        scores = score_all(args.manifest, None if args.self_test else args.results_dir)
    except ScoreError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    source = "the references themselves (self-test)" if args.self_test else str(args.results_dir)
    report = render_report(scores, args.date, source, self_test=args.self_test)
    out = args.out or HERE / "reports" / f"{args.date}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report)
    print(report)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
