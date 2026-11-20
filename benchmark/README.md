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
| `tests/` | Tests for the checker |

### The proof-of-concept set (3 songs, PoC amendment on #47)

| Song | Input | Parts in the reference |
| --- | --- | --- |
| Know Your Name | `mic` (Voice Memos recording) | guitar, bass |
| With Rob as My Witness | `mic` (Voice Memos recording) | guitar, bass |
| Maple Syrup | `upload` (MP3) | guitar, bass |

The full 10-song set is still required before MVP sign-off, and any G1 result from 3 songs is provisional (OQ-07).

**Every entry is a draft.** `referenceStatus: "draft-from-pipeline"` means the reference was written from the pipeline's
own output (`python -m amphion_pipeline`), so it proves nothing about accuracy until Elijah has checked each part by ear and
corrected it. Scoring the pipeline against an unchecked draft would score it against itself. When a song's reference is
checked, change its `referenceStatus` to `checked`. The input types and instruments are also unconfirmed: the input type
is inferred from the file (a Voice Memos file is a phone-mic recording), and the parts are only the ones the pipeline found,
which may include a bass part that is really low guitar notes.

### The audio (private)

The three songs are each longer than the app's 3-minute limit (RC-07), so the benchmark uses the first 179.9 s of each,
cut without re-encoding (`ffmpeg -t 179.9 -c copy -map_metadata -1`). The cuts live in `benchmark/audio/trimmed/` on the
machine that has the audio (gitignored). The manifest records each cut file's SHA-256 and the SHA-256 of the full
original, so anyone with the audio can check they have the same files.

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
