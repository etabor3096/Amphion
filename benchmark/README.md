# benchmark/

The accuracy benchmark (RC-10, RISK-01): the hand-checked reference tabs and the scoring harness. It runs offline on a
developer machine and is never deployed.

Belongs here: reference files in the RC-20 note format (`references/`), the manifest, the scoring code (`score.py`, P1-03)
and its tests, and the dated reports (`reports/`).

Does not belong here: the benchmark audio. It may be copyrighted, so it lives in private storage outside the repo
(OD-04, POLICY.md). Only reference tabs are committed. `.gitignore` blocks `benchmark/audio/`.

## What is here (P1-02)

| File | Holds |
| --- | --- |
| `manifest.json` | One entry per song: title, input type (`upload` or `mic`), instruments, the private audio file name and its SHA-256, duration, where the file was cut from, the reference path, and `referenceStatus` |
| `manifest.schema.json` | The JSON Schema for the manifest. It caps `duration` at 180 s (RC-07) |
| `references/<id>.json` | The reference tab for one song, in the RC-20 format (`pipeline/rc20.schema.json`) |
| `check_references.py` | The schema check (below) |
| `tools/review.html` | The page for checking a reference by ear (below) |
| `tests/` | Tests for the checker |

### The proof-of-concept set (3 songs, PoC amendment on #47)

| Song | Input | Parts in the reference |
| --- | --- | --- |
| Know Your Name | `mic` (Voice Memos recording) | guitar, bass |
| With Rob as My Witness | `mic` (Voice Memos recording of a bass alone) | bass only |
| Maple Syrup | `upload` (MP3) | guitar, bass |

The full 10-song set is still required before MVP sign-off, and any G1 result from 3 songs is provisional (OQ-07).

**Every entry is a draft.** `referenceStatus: "draft-from-pipeline"` means the reference was written from the pipeline's
own output (`python -m amphion_pipeline`), so it proves nothing about accuracy until Elijah has checked each part by ear and
corrected it. Scoring the pipeline against an unchecked draft would score it against itself. When a song's reference is
checked, change its `referenceStatus` to `checked`. The input types and instruments are also unconfirmed: the input type
is inferred from the file (a Voice Memos file is a phone-mic recording). Elijah confirmed that With Rob as My Witness is a bass
recording alone, so its reference has no guitar part (the pipeline had found 642 guitar notes in it, which were bass notes
picked up again as guitar). Know Your Name and Maple Syrup have guitar and bass; their parts are the pipeline's, so a bass
part there may still be low guitar notes. A bass-only recording also has no real chords: the chord segments in that
reference are the pipeline's guesses from the bass line and should not be trusted.

### Key, tempo, time and tuning (given by Elijah, 2026-11-20)

| Song | Key | `bpm` in the reference | Other tempo levels | Time | Tuning |
| --- | --- | --- | --- | --- | --- |
| Know Your Name | B major | 80 | 160 (double time) | 4/4 | standard (E A D G B E), 0 cents |
| Maple Syrup | D major | 153 | 77 (half time), 306 (double time) | 5/4 | standard, 0 cents |
| With Rob as My Witness | C# minor | 152 | | 4/4 | standard, 0 cents |

`beats` and `downbeats` follow the `bpm` level above (one beat per `bpm` tick), so a chord-per-beat score (RC-10) counts
beats at that level. I rebuilt them by re-running madmom's beat tracker limited to that tempo and bar length, so the grid
is still the tracker's guess and its start position is **not** checked by ear. The notes, chords, and string and fret
choices are still the pipeline's draft, which is why `referenceStatus` is still `draft-from-pipeline`.

### The audio (private)

The three songs are each longer than the app's 3-minute limit (RC-07), so the benchmark uses the first 179.9 s of each,
cut without re-encoding (`ffmpeg -t 179.9 -c copy -map_metadata -1`). The cuts live in `benchmark/audio/trimmed/` on the
machine that has the audio (gitignored). The manifest records each cut file's SHA-256 and the SHA-256 of the full
original, so anyone with the audio can check they have the same files.

## Review a reference by ear

`tools/review.html` is a single page that plays a song and draws its reference as a scrolling tab, so a reference can be
checked and corrected without reading the JSON. Nothing is uploaded: the page runs in your browser and reads the two files
you pick.

1. Open `benchmark/tools/review.html` in Chrome or Safari (double-click it, or drag it into the browser).
2. Choose the **reference JSON** (`benchmark/references/<id>.json`) and its **audio** (the trimmed file from the manifest).
   The page warns if the audio's length does not match the reference.
3. Press **Play** (or the space bar). The orange line is the playhead; the big label is the chord at the playhead, with
   the bar and beat. Slow it to 0.5 or 0.75 for fast parts. **Click empty space to jump**; click a note or chord to select it.
4. To hear whether the transcription is right, turn the **Recording** slider to 0 and listen to the **Guitar notes**,
   **Bass notes** and **Chords** synth alone, or play them over the recording and listen for notes that clash.
5. Fix what is wrong in the right-hand panel: change a note's string and fret, delete a note, rename a chord or change its
   start and end, or add a note or chord at the playhead.
6. **Download corrected JSON**, save it over the file in `benchmark/references/`, and run the check below.

It shows only what the reference says. It does not move the beat grid; if the bar lines sit in the wrong place, say so and
the grid is rebuilt.

## Check the references

Run from the repo root, with the pipeline's Python 3.10 virtualenv active (setup in `pipeline/README.md`):

```bash
python benchmark/check_references.py --min-songs 3     # the proof-of-concept set
python benchmark/check_references.py                   # the full set: needs 10 songs, so it fails until there are 10
python benchmark/check_references.py --min-songs 3 --audio-dir benchmark/audio/trimmed    # also re-hash the private audio
python -m pytest benchmark/                            # the checker's tests
```

It checks that the manifest and each reference follow their schemas; that each reference's `audioSha256` and `duration`
match its manifest entry; that a part is null in the reference exactly when it is not in `instruments`; and that no
reference file is missing or unlisted. It **cannot** tell whether a reference is correct. That is the by-ear check.
