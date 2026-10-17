# Amphion — front-end demo

Amphion is an AI-powered mobile app that listens to a song, live or from an uploaded file, and generates
synced guitar and bass tabs so beginner and intermediate players can learn and play along.

This branch holds a click-through demo of the Amphion iOS app (song → guitar/bass tab, played in sync), built from
the Figma Make prototype. It is front-end only: no Firebase, no sign-in, no network calls.
Everything runs on mock data in `src/mock/`.

## Documents

- `docs/SDD.pdf`: the Software Design Document (v0.3), the authority on behavior.
- `docs/SDD.txt`: plain-text copy of the SDD for search and for agents that can't read PDFs.
- `docs/tasks/`: self-contained task briefs for the next pieces of work (start with `synth-playback.md`).
- `AGENTS.md`: project rules and file map for coding agents (`CLAUDE.md` points to it).

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Needs Node 20.19+ (22 or newer recommended).

- On a desktop browser the app runs inside an iPhone-sized frame (390×844).
- `http://localhost:5173/?frame=0` shows it without the frame; on a phone it fills the screen.
- `npm run build` type-checks and builds; `npm run typecheck` only type-checks.

## Things to try

| Song | Shows |
| --- | --- |
| Back Porch Chorus | Guitar and bass tabs, a few "?" notes on guitar and bass, and an unsure chord |
| Old Mill Road | Everything confident: no "?" markers at all |
| First Full Song | "No bass part found", tuning reported as an offset |
| Lantern Light | Audio is on another iPhone: tab only, no synced playback; tuning "Unknown" |
| Sunday Morning Idea / Phone Recording 04 | Processing and Failed states |

On a song: press play, change speed, tap **A-B** once at the start bar and again at the end bar,
tap a note or bar number to jump, scroll away during playback to get **Back to playhead**,
press and hold (or right-click) a note to edit it, tap an empty spot on a string for **+ Add note**,
and tap a chord name for its diagram. **Undo** reverts tab edits.

## Real vs. mocked

| Real (works as in the app) | Mocked |
| --- | --- |
| All screens, navigation, light/dark/system appearance | Sign-in: every option is a fake "Continue" |
| Library search, filters, sort, folders, rename, delete | Songs and tabs come from `src/mock/`; edits live in memory and reset on reload |
| Tab layout, confidence markers, note editor, chord picker, undo | Audio: a simulated clock stands in for the audio player (no sound) |
| Synced playback logic: playhead, highlights, auto-scroll, speed, A-B loop | Recording and upload create a song that stays "Processing" |
| Upload file-type and 3-minute checks (read locally in the browser) | Notifications, account changes, account deletion |

## Where things live

- `src/playback/clock.ts`: the `PlaybackClock` interface (the one clock for song time, RC-18/DD-14) and
  `SimulatedClock`. To use real audio, implement the interface around an audio player and pass it to
  `SongScreen` instead; the UI does not change.
- `src/playback/usePlayback.ts`: the single `requestAnimationFrame` loop that drives everything synced.
- `src/tab/`: tab view (`TabRow`, `TabView`, `SyncedTab`), practice bar, note editor, chord popover, edits.
- `src/mock/`: data types (match the SDD's stored tab format, RC-20), songs, tab data, in-memory store.
- `src/device/`: the desktop phone frame and simulated status bar.
