# G1: tab accuracy go/no-go (RISK-01)

**Status: DRAFT, waiting for Elijah's decision.** Written by the dev agent from `benchmark/reports/2026-11-22.md` (first baseline, PR #112). The measurements are final for this run; the decision line at the bottom is Elijah's alone (ROADMAP.md, Gate G1; Issue #51). Nothing here lowers a bar (ARCHITECTURE.md A9).

## The bars

| Bar | Value | Source |
| --- | --- | --- |
| Guitar note F-measure, uploaded files | 60% | RISK-01, OQ-07 (a proposal) |
| Chord accuracy | 70% | RISK-01 |

Note match: pitch equal and onset within 50 ms. Chord accuracy: share of the reference's beats whose chord matches.

## Results

Pipeline on `dev` at 3459052 (Demucs `htdemucs_6s`, Basic Pitch for guitar with onset snapping, pYIN for bass, madmom beats and chords, tuned tab weights). 3 proof-of-concept songs, not the 10-song RC-10 set.

| Measure | Result | Against the bar |
| --- | --- | --- |
| Guitar notes, uploads | 62.4% (1 song: Maple Syrup) | Above 60% |
| Chords, uploads | 79.7% (1 song) | Above 70% |
| Chords, all songs | 59.7% (3 songs) | Below 70% |
| Guitar notes, phone mic | 20.4% (1 song: Know Your Name) | No bar set; far below 60% |
| Bass notes, uploads | 72.0% (1 song) | No bar set |
| Bass notes, phone mic | 16.1% (2 songs) | No bar set; far below 60% |

String and fret accuracy on matched notes: 96.8% for bass on the upload, 33.6% for guitar on the upload (mostly open shape against the published tab's barre shape for the same pitches, which is the beginner-friendly choice, DD-15).

## What these numbers do and do not show

- **One song per cell.** Every upload result is a single song, so the bar is passed on one data point. OQ-07 asked for the 60% bar to be confirmed on 2 or 3 songs; there is only one upload song in the set.
- **In-sample.** Bass notes, bass tab weights, chord input and onset snapping were tuned on these same 3 songs, so every figure is optimistic. No held-out song exists yet.
- **Phone recordings are the weak spot.** The bass fundamental is 5 to 10 times weaker than its harmonics, and guitar competes with the room. Several fixes were tried and did not help (tuning correction, ensembling, dropping short chords, gap filling, Chordino, SwiftF0, torchcrepe). `htdemucs_ft` helped one song and was rejected for cost (about twice the run time).
- **Run time** is about 106 to 150 s per 3-minute song on a Mac CPU against RC-08's 2 minutes. That is a separate question from accuracy (see `pipeline/README.md`).

## Agent recommendation (not the decision)

**Go on note-level tabs for uploaded files**, because both upload bars are passed, with these conditions recorded:

1. The result stands on one song. Score the remaining RC-10 songs once as they are added, without tuning on them, and reopen this record if the upload guitar score falls under 60%.
2. Phone-mic accuracy is far below any usable level. The SDD's live-recording use case (US-04) is therefore at risk even though the gate bar is defined for uploads. Decide whether to (a) ship uploads first and treat mic as best-effort, with the low-confidence markers (P6) carrying the honesty load, or (b) fall back to the chord chart for mic recordings only.
3. Chords miss 70% overall because of the two mic songs. If chord accuracy is a product claim for mic input, it fails today.

If you disagree on (2), the fallback in ROADMAP (P4-02, P4-03 and P5-01 switch to the synced chord chart, DD-01) is the documented path; it needs this record first.

## Decision

- [ ] **Go**: build note-level tabs (P4, P5) as planned.
- [ ] **Go, uploads only**: as above, mic treated as best-effort.
- [ ] **No-go**: switch to the synced chord chart; the agent then opens the follow-up Issues for P4-02, P4-03 and P5-01.

Decided by: Elijah Tabor        Date: ____________
Notes:
