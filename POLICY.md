# Amphion policy

This file sets the product rules every Issue follows: what Amphion does and does not do, how it treats users' data and
accounts, the legal and ethical limits, and the words users see. It also sets what an agent may and may not do in this
repo. Technical rules (the clock, the pipeline, data paths) are in [ARCHITECTURE.md](ARCHITECTURE.md). The build order is in
[ROADMAP.md](ROADMAP.md).

[SDD v0.3](docs/SDD.pdf) is the authority. This file points to it by ID and does not restate it. If this file, an Issue and
the SDD disagree, stop and ask in an Issue comment.

## Scope

Build only the MVP in SDD 2.2. Anything else needs Elijah's approval first.

- **Out of scope (SDD 2.3):** real-time transcription; sharing or a public tab library; importing from streaming links;
  payments; Android, web, desktop and iPad layouts.
- **Stretch goals, only after P8 sign-off:** bends, slides and other techniques; separate guitar parts and muted
  play-along; simplified fingering; capo suggestions; other instruments; full-length songs (OQ-04).
- **Fixed limits:** songs up to 3 minutes; MP3, M4A and WAV only; iPhone on iOS 17 or later (RC-07, RC-14).

## Privacy

- **Private by design.** A user's songs, tabs, edits and artwork are visible only to them. No feature may publish,
  share or export them to anyone else (RC-04, DD-07).
- **Audio leaves the phone only to be processed.** The cloud copy is deleted when the job ends. Only results and
  artwork are kept (RC-03; see ARCHITECTURE.md rule A3).
- **Microphone.** Recording starts only when the user taps Record. It stops on Stop or at 3 minutes. There is never
  background listening. The permission prompt says why the app needs the microphone (RC-05).
- **Photos and camera.** Choosing artwork uses the system photo picker, so the app never asks for the whole photo
  library. The camera permission is asked only when the user chooses to take a photo, with a plain reason (RC-17).
- **No extra data.** Collect only what a user story needs. Analytics, tracking, ads and third-party services that see
  user data are not part of the MVP.

## Accounts

- Every screen except sign-in needs a signed-in account. Sign-in methods: Apple, Google, and email and password (RC-01,
  US-01). Until OD-05 is decided, only email and Google sign-in are built.
- Email and password users can reset a forgotten password from the sign-in screen (US-01).
- Users have an editable display name, not a username (DD-09).
- Apple and Google users have no Amphion password; their email is managed by that provider. Email and password users
  re-enter their current password before changing their email or password. A new email takes effect only after its
  verification link is opened (DD-10, US-15).
- Account deletion is in Settings > Account. It needs typed confirmation and a recent sign-in. It removes the sign-in
  record, every Firestore record the user owns and their artwork, and it cannot be undone. Apple requires this
  (RC-15, US-15).

## Legal and ethical limits

- **Rights to the audio.** Users may process only audio they have the right to use. The Terms of Use say so, and
  Settings links to the Terms and the Privacy Policy (RC-16, RISK-05).
- **Legal text is Elijah's.** The Terms and Privacy text in the app is a draft until Elijah approves it (OD-07). Agents
  may place the text but must not present it as final.
- **No song recognition.** Amphion never identifies songs or artists. The user types the artist (DD-12).
- **Benchmark audio stays private.** It may be copyrighted, so it is never committed. Only reference tabs go in the repo
  (OD-04).
- **Honest output.** Amphion never presents a guess as certain (RC-11, DD-06):
  - Notes and chord names below their confidence threshold are always marked.
  - The marker does not rely on color alone: a dotted outline and a "?" (US-10, RC-12).
  - A value that could not be found shows "Unknown", never a guess (US-09).
  - A song with no bass part says "No bass part found" instead of showing an empty tab (US-08).
  - A partial or empty tab is never shown as finished (RC-09).
  - Thresholds come from the benchmark (OQ-01), not from taste.

## User-facing language

Write for a beginner guitar or bass player (RC-13).

- Use plain musical words. Briefly explain tab, BPM and tuning offset where they appear.
- Never show machine-learning or internal terms. Examples: model, AI confidence score, stem, separation, Demucs,
  Basic Pitch, F-measure, MIDI, Firestore, upload bucket, job, pipeline.
- Speak as Amphion, in short sentences. Explain what happened and what the user can do. For example: "Amphion couldn't
  tell the key of this recording, so it's marked Unknown instead of guessed."
- Every control has a VoiceOver label, and text follows Dynamic Type. The tab reads bar by bar ("Bar 3, beat 1: A
  string, fret 2"). Chord diagrams have a text alternative ("G major, open position") (RC-12).
- Error messages say why and what to do next. A rejected upload names the accepted types and the 3-minute limit
  (US-05).

## Terminology

Use these words in code, docs and Issues, and the "Users see" wording in the app. The React demo shows each one in
context.

| Term | Users see | Meaning |
| --- | --- | --- |
| Song | song | One recording or imported file and everything made from it. The SDD also says "transcription". |
| Status | Processing, Ready, Failed | A song's processing state. Use exactly these three words (US-06). |
| Retry | Retry | Upload the phone's copy again after Failed (RC-09). |
| Song time | (not shown) | Seconds from the start of the song's audio file. Every stored time uses it (RC-18). |
| Tab | tab | Tablature: string lines with fret numbers on the song's beats and bars (US-07). |
| Guitar tab, bass tab | Guitar, Bass | The two instruments. Guitar covers acoustic and electric (US-08). |
| Chord line | chord names above the tab | The secondary layer of chord names. Tap one for its finger diagram (US-08, OQ-06). |
| Low-confidence note or chord | "?" marker; "Not sure, check by ear"; "3 notes to check" | Below its confidence threshold (US-10). |
| Unknown | Unknown | A key, tempo or tuning value that could not be found (RC-11). |
| Tuning offset | Tuning | How far the recording sits from standard pitch, not a named tuning (DD-08). The wording is final in P8-02 (OQ-05). |
| Speed | 50% to 100% | Slow-down without a pitch change (US-13). |
| A-B loop | A-B | Repeat from point A to point B (US-14). |
| Playhead, auto-follow | Back to playhead | The moving line, and the scrolling that keeps it on screen (US-12). |
| Folder | folder; All Songs | At most one folder per song. All Songs means no folder (US-16, DD-11). |
| Artwork | Change Photo | The song's square picture; generated art until changed (US-18). |
| Display name | display name | The name used in the app's own greetings (DD-09). |

## What agents may do

AiDev (Claude Code under the AiDev identity) writes most of the code. Elijah owns intent and every decision below.

- Take only Issues that the [pickup rule](ROADMAP.md#how-work-is-picked-up) allows. Never take an Issue labeled
  `human-task` or `blocked`.
- Open one PR per Issue, into `dev` only. Never merge into `staging` or `main`.
- Never change rulesets, required checks, IAM roles, billing or repo settings. Never create cloud projects or accounts.
- Never decide an open decision (OD) or open question (OQ). Use the default in [ROADMAP.md](ROADMAP.md#open-decisions),
  or stop.
- When an Issue, this file and the SDD disagree, or the SDD does not settle something, stop and ask in an Issue
  comment. Do not invent an answer.
- Label AI-drafted Issues and PRs `ai-generated`.
