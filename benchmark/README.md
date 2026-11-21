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
| `tools/make_reference/` | Scripts that build a reference from a published tab or a pitch track, work out its chords, and check its timing (below) |
| `tests/` | Tests for the checker |

### The proof-of-concept set (3 songs, PoC amendment on #47)

| Song | Input | Parts in the reference |
| --- | --- | --- |
| Know Your Name | `mic` (Voice Memos recording) | guitar, bass |
| With Rob as My Witness | `mic` (Voice Memos recording of a bass alone) | bass only |
| Maple Syrup | `upload` (MP3) | guitar, bass |

The first update uses these 3 songs only. Elijah moved the rest of the 10-song set (RC-10) to the second update
(2026-11-21), so until then any G1 result from 3 songs is provisional (OQ-07).

**Where the notes come from.** All three references are `checked`: Elijah checked every part, notes and chords, by ear
against the recording (2026-11-21). How each one was made:

| Song | Made from | Notes |
| --- | --- | --- |
| Know Your Name | published tab | Guitar and bass transcribed from the published Songsterr tabs, bars 1 to 122 (the cut ends in bar 120) |
| Maple Syrup | published tab | Guitar and bass transcribed from the published Songsterr tabs, tab bars 1 to 85 (the cut ends in tab bar 77) |
| With Rob as My Witness | pitch tracking, then hand corrections | Bass found by pitch tracking the recording (librosa pYIN), not by the pipeline |

For the two published tabs, every bar's rhythm was read off the tab and checked to add up to a full bar (6 quarter beats
in Maple Syrup, 4 in Know Your Name), then the bars were lined up to the audio. Dead (X) notes are left out because they
have no pitch, and tied notes lengthen the note they continue instead of adding a new one. The timing was fitted to the
audio's note onsets (constant-Q spectrum), not to the pipeline's notes, so the pipeline gets no head start:

- Maple Syrup: bar 1 at 0.27 s, a steady 153 bpm. 85 to 88% of the reference notes land within 100 ms of a note the
  pipeline found with the same pitch class, against 50% or less when the reference is shifted by half a beat or a beat.
- Know Your Name: the phone recording starts just after the first chord, so bar 1 is at about -0.19 s and its opening
  chord is left out. Bars 1 to 17 are placed from two anchors read off the earlier pipeline draft's notes (the first B
  and A# notes at 0.77 s and 2.6 s, and the bass entry at bar 17, 23.9 s, which the onset fit also finds on its own at
  23.86 s); later bars follow the tab's tempo marks (156 to 164 bpm) and the onset fit. The fit is clear in
  the intro and verse; the strummed chorus (bars 57 to 96) repeats every beat, so there it only follows from the bars
  around it. The fit suggested bars 25 to 32 might sit about half a beat late, but Elijah listened to the whole song
  against the recording (2026-11-21) and it lines up fairly well, so it was left as it is.

With Rob as My Witness is a bass recording alone, so its reference has no guitar part. Its notes are the recording's
pitch track cut at onsets and pitch changes (median 0.198 s apart, the eighth note at 152 bpm); low-confidence blips, short
slides into a note and doubled attacks were removed. Its strings and frets are a choice (low frets, small hand moves),
because a recording does not say where a note was played.

Elijah then corrected the opening by hand in `review.html` (0 to 49 s: the first main riff, the first verse and the first
prechorus; 108 notes, saved with `"edited": true` and kept exactly as he made them). Each later section copies the
matching section he fixed (2026-11-21): the same position for each pitch; in verse 2 the first pass and the ending one
string up, as in verse 1; each main-riff ending as 3 F# then 2 G#; the tracker's F#3 and C#3 moved down an octave, split
notes joined and tiny low-confidence notes removed, as he did. Those notes keep `"edited": false`. The section from about
139 to 167 s does not repeat an earlier part; its notes use the same positions, and Elijah has since checked it by ear with the rest.

**Chords** (2026-11-21) are worked out from each reference's own notes by `tools/make_reference/chords_from_notes.py`,
not by the pipeline. Each half of a tab bar (Know Your Name, Maple Syrup) or every 2 beats (With Rob as My Witness) gets
the major or minor triad that best fits the notes sounding there, favouring the lowest note as the root and chords in
the key. In the tab songs a lone passing note keeps the chord before it. With Rob as My Witness is a bass part alone,
so its chords are mostly the bass note's triad in C# minor: a guide, not a transcription. Elijah checked them by ear with the notes (2026-11-21).

**Not changed:** the beat grids below. Maple Syrup is in 5/4 (Elijah, 2026-11-21) and its
reference keeps `beatsPerBar` 5. The Songsterr tab groups the same quarter notes into bars of 6, so its bar numbers
(in the table above and in the tab text) are the tab's, not the song's. The note times do not depend on bar lines,
so the notes are the same either way.

### Key, tempo, time and tuning (given by Elijah, 2026-11-20)

| Song | Key | `bpm` in the reference | Other tempo levels | Time | Tuning |
| --- | --- | --- | --- | --- | --- |
| Know Your Name | B major | 80 | 160 (double time) | 4/4 | standard (E A D G B E), 0 cents |
| Maple Syrup | D major | 153 | 77 (half time), 306 (double time) | 5/4 | standard, 0 cents |
| With Rob as My Witness | C# minor | 152 | | 4/4 | standard, 0 cents |

`beats` and `downbeats` follow the `bpm` level above (one beat per `bpm` tick), so a chord-per-beat score (RC-10) counts
beats at that level. I rebuilt them by re-running madmom's beat tracker limited to that tempo and bar length, so the grid
is still the tracker's guess and its start position is **not** checked by ear.

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
   To fix several notes at once, drag a box around them, or Shift-click or Command-click to add or remove one. Zoom out
   to box a longer stretch. Then set their string or fret (leave a box empty to keep each note's own), move them by
   semitones (or the up and down arrow keys), move them to another string at the same pitch, nudge them 20 ms earlier or
   later, or delete them. Every note you change is saved with `"edited": true`, so it is clear which notes were fixed by
   hand.
6. **Download corrected JSON**, save it over the file in `benchmark/references/`, and run the check below.

To skip the file pickers, serve a folder that holds `review.html`, `references/` and the audio, and open
`review.html?ref=references/<id>.json&audio=audio/<file>`. The page then loads both files from that local server.

It shows only what the reference says. It does not move the beat grid; if the bar lines sit in the wrong place, say so and
the grid is rebuilt.

## Build a reference from a published tab or a pitch track

`tools/make_reference/` holds the scripts that made the current references. Use them for a new song, or to rebuild
one after fixing its tab text. Run them from the repo root with a Python that has `librosa` (the pipeline virtualenv)
and, for the stitcher only, `opencv-python`. Each script's top comment gives the full details.

**A published tab works only if it was written for this exact recording.** A different take, a live version or a cover
will not line up. For a recording of your own playing, use the pitch track instead.

From a published tab:

1. Screen-record the tab scrolling, then turn the recording into pages:
   `python benchmark/tools/make_reference/stitch_video.py tab.mov /tmp/pages/<id>-guitar`.
   Where bars look missing or doubled, check the page against the recording.
2. Write the tab out as text, one line per bar, following the format at the top of `tabtext.py`. Save it as
   `benchmark/audio/tabs/<id>.guitar.txt` and `<id>.bass.txt`. Tab text is copied from a published tab, so it stays
   in private storage with the audio (gitignored), like the audio.
3. Check that every bar adds up:
   `python benchmark/tools/make_reference/tabtext.py benchmark/audio/tabs/<id>.guitar.txt guitar 4`.
   The last number is the beats per bar. Any bar it lists has a wrong duration.
4. Copy a config in `tools/make_reference/configs/` and set its `bpm` and `offset_range`. Keep `offset_range`
   narrow, around where bar 1 starts: a wide range can lock on a beat early or late. Then build:
   `python benchmark/tools/make_reference/from_tab.py benchmark/tools/make_reference/configs/<id>.json --audio-dir benchmark/audio/trimmed --tabs-dir benchmark/audio/tabs`.
   This overwrites the reference's guitar and bass notes and leaves everything else alone.
5. Check the timing against the pipeline's notes for the same audio:
   `python benchmark/tools/make_reference/agreement.py benchmark/references/<id>.json result.json --bpm <bpm> --by-section benchmark/audio/tabs/<id>.timing.json`.
   A good fit peaks clearly at a shift of 0. A section with no clear peak, or a peak somewhere else, needs a listen in
   `review.html`. If the start is wrong, pin bars to times you have heard with `anchors` in the config.
6. Set `referenceStatus` to `from-published-tab`, then run the check below.

From a pitch track (a bass recording alone):

```bash
python benchmark/tools/make_reference/from_pitch_track.py <id> --audio-dir benchmark/audio/trimmed --allowed "C# D# E F# G# A B"
```

`--allowed` lists the pitch classes the song uses. With Rob as My Witness used `"C C# D D# E F# G# A B"`. Set
`referenceStatus` to `draft-from-pitch-tracking`.

Chords, after the notes are in:

```bash
python benchmark/tools/make_reference/chords_from_notes.py <id> --timing benchmark/audio/tabs/<id>.timing.json --splits 2 --min-tones 2   # tab songs
python benchmark/tools/make_reference/chords_from_notes.py <id> --beats-per-window 2                                                    # a bass part alone
```

To check the tools still give the committed references, build into a scratch file with `--out /tmp/<id>.json`, then
`diff` it against `references/<id>.json`. For all three songs they are identical.

## Check the references

Run from the repo root, with the pipeline's Python 3.10 virtualenv active (setup in `pipeline/README.md`):

```bash
python benchmark/check_references.py --min-songs 3     # the proof-of-concept set
python benchmark/check_references.py                   # the full set: needs 10 songs, so it fails until there are 10
python benchmark/check_references.py --min-songs 3 --audio-dir benchmark/audio/trimmed    # also re-hash the private audio
python -m pytest benchmark/                            # the checker's and the tab parser's tests
```

It checks that the manifest and each reference follow their schemas; that each reference's `audioSha256` and `duration`
match its manifest entry; that a part is null in the reference exactly when it is not in `instruments`; and that no
reference file is missing or unlisted. It **cannot** tell whether a reference is correct. That is the by-ear check.
