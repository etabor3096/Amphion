"""Tune the tab-assignment weights against the reference tabs (P1-06, ARCHITECTURE.md rule A9).

    python benchmark/tools/tune_tab_weights.py                      # accuracy of the current weights, per song and part
    python benchmark/tools/tune_tab_weights.py --search bass        # coordinate descent, then a one-song-to-the-other check

Run from the repo root with the pipeline virtualenv active.

It feeds each reference part's pitches and times to the tab assigner with the strings and frets removed, and counts how many
notes get the reference's string and fret. That measures the choice of position on its own, with no detection errors mixed
in. Two cautions, both learned the hard way:

* Only songs whose strings and frets come from a published tab are used (`TAB_SONGS`). With Rob as My Witness has a low-fret
  guess for its strings, so scoring against it would reward the same guess.
* One pitch can have several equally good positions, and a published tab picks one. Maple Syrup's guitar plays A major as a
  barre chord at the 5th fret, while the open A shape has the same pitches, is easier, and is what DD-15 asks for. The score
  calls that a miss. Do not chase it: change a weight only when it also holds up on the other song (the cross-check below),
  and prefer the middle of a flat range to the single best point.

With only 2 tab songs the "held out" song is one song, so treat a gain as evidence, not proof. Redo this when the full
10-song set exists, and keep some songs out of the search.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))

from amphion_pipeline.tab_assign import assign_strings_and_frets  # noqa: E402
from amphion_pipeline.tab_weights import WEIGHTS_BY_INSTRUMENT  # noqa: E402

TAB_SONGS = ["know-your-name", "maple-syrup"]
GRID = {
    "fret": [0.0, 0.25, 0.5, 1.0, 1.5, 2.0],
    "open_string_bonus": [-3.0, -1.0, 0.0, 1.0, 3.0, 6.0],
    "thick_string_bonus": [0.0, 0.5, 1.0, 2.0, 4.0],
    "string_change": [0.0, 0.5, 1.0, 2.0, 4.0],
    "hand_jump": [0.0, 0.5, 1.5, 3.0, 6.0],
    "spread": [0.0, 0.5, 1.5, 3.0],
    "jump_relief_seconds": [0.25, 1.0, 4.0],
    "max_span": [4, 5],
}


def load(song: str, part: str) -> list[dict]:
    return json.loads((REPO / "benchmark" / "references" / f"{song}.json").read_text())[part]["notes"]


def accuracy(weights, part: str, songs: list[str]) -> float:
    """Share of the reference notes that get exactly the reference's string and fret."""
    right = total = 0
    for song in songs:
        reference = load(song, part)
        placed = assign_strings_and_frets([dict(n, string=None, fret=None) for n in reference], part, 0.0, weights)
        right += sum((a["string"], a["fret"]) == (b["string"], b["fret"]) for a, b in zip(placed, reference))
        total += len(reference)
    return right / total


def descend(part: str, songs: list[str], start, rounds: int = 3):
    best, best_score = start, accuracy(start, part, songs)
    for _ in range(rounds):
        moved = False
        for name, values in GRID.items():
            for value in values:
                if getattr(best, name) == value:
                    continue
                candidate = replace(best, **{name: value})
                score = accuracy(candidate, part, songs)
                if score > best_score + 1e-9:
                    best, best_score, moved = candidate, score, True
        if not moved:
            break
    return best, best_score


def changed(weights, start) -> str:
    return " ".join(f"{k}={getattr(weights, k)}" for k in GRID if getattr(weights, k) != getattr(start, k)) or "(unchanged)"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--search", choices=["guitar", "bass"], help="search the weights for this part, starting from the current ones")
    args = parser.parse_args()
    for part, weights in WEIGHTS_BY_INSTRUMENT.items():
        print(f"{part:6s} current weights:", "  ".join(f"{s}={accuracy(weights, part, [s]):.3f}" for s in TAB_SONGS))
    if not args.search:
        return
    part, start = args.search, WEIGHTS_BY_INSTRUMENT[args.search]
    print(f"\nsearching {part} (start: " + "  ".join(f"{s}={accuracy(start, part, [s]):.3f}" for s in TAB_SONGS) + ")")
    for train, test in [(TAB_SONGS[0], TAB_SONGS[1]), (TAB_SONGS[1], TAB_SONGS[0])]:
        found, score = descend(part, [train], start)
        print(f"  tuned on {train}: {score:.3f}; on {test}: {accuracy(found, part, [test]):.3f} (was {accuracy(start, part, [test]):.3f})  {changed(found, start)}")
    found, score = descend(part, TAB_SONGS, start)
    print(f"  tuned on both: {score:.3f}  {changed(found, start)}")


if __name__ == "__main__":
    main()
