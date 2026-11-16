# Amphion front-end demo (applies to `demo/` only)

> **Demo only.** The file map and rules below describe the React demo in `demo/`. They do not apply to the planned `ios/`, `pipeline/` or `firebase/` code. The project-wide rules (sources of truth, Git trust rules, Definition of Done, escalation) are in `CLAUDE.md`.

React + Vite + Tailwind CSS click-through demo of the Amphion iOS app, originally exported from Figma Make.
Front-end only: no backend, no network calls, all data from `demo/src/mock/`. `docs/SDD.pdf` is the authority on behavior (`docs/SDD.txt` is a plain-text copy). The GitHub Issues define the work; `docs/tasks/` holds older task briefs for reference.

## Before you start any Issue

Read `ARCHITECTURE.md`, `POLICY.md` and `ROADMAP.md` (repo root) first; `CLAUDE.md` says when to consult each. If an Issue, these files and the SDD disagree, stop and ask in an Issue comment instead of guessing.

## Development Server

From `demo/`: run `npm install`, then `npm run dev` (Vite on http://localhost:5173). `npm run typecheck` type-checks; `npm run build` type-checks and builds.

## Repository layout

| Folder | Holds | Rules |
| --- | --- | --- |
| `demo/` | The React demo (this file's rules apply) | Below |
| `ios/` | The native SwiftUI app (empty until P0-02) | `ARCHITECTURE.md` |
| `pipeline/` | The Python analysis code and processing function | `ARCHITECTURE.md` |
| `firebase/` | Firebase config, security rules, rules tests, `SCHEMA.md` | `ARCHITECTURE.md` |
| `benchmark/` | Reference tabs, scoring harness and reports. Never the audio (OD-04) | `ARCHITECTURE.md`, `POLICY.md` |
| `docs/` | The SDD, decision records, task briefs, backlog spec and design screenshots | `CLAUDE.md` |
| `.claude/`, `.github/` | Agent config and hooks; the PR build check | `CLAUDE.md` |
| `.figma/` | Figma Make platform scripts from the original export. They still assume the project is at the repo root, so they do not work for `demo/` | Do not edit |

The root also holds `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `POLICY.md`, `ROADMAP.md` and `README.md`.

## Project Structure (inside `demo/`)

- `demo/src/main.tsx` - Entry point. Desktop browsers get `device/PhoneFrame` (the app in a 390×844 iframe); inside the frame or on a phone it mounts `App`
- `demo/src/App.tsx` - Splash → fake sign-in → `MainApp`
- `demo/src/MainApp.tsx` - Library, Add Song, Settings screens and their dialogs
- `demo/src/SongScreen.tsx` - Song screen header, details, and photo/edit-details/delete (`EditSongDialog.tsx` is shared with the Library); the tab itself is `demo/src/tab/SyncedTab.tsx`
- `demo/src/playback/` - `PlaybackClock` (the single clock for song time, RC-18/DD-14), `SynthClock` (Web Audio synth; song time from `AudioContext.currentTime`), `SimulatedClock` (silent fallback), and the one animation-frame hook
- `demo/src/tab/` - Tab rows, `ChordView` (the Chords view), interactions, practice bar, note editor, chord popover, and pure edit functions
- `demo/src/mock/` - Data types (mirror RC-20), songs, generated tab data, in-memory store with undo
- `demo/src/music/` - Tuning and chord-shape helpers
- `demo/src/index.css` - All styling (Tailwind v4 import, design tokens, component CSS). Safe areas use `--safe-top/--safe-bottom`, which the phone frame sets

## Rules

- Never add a second timer for synced UI: everything synced reads `PlaybackClock.currentTime()` in `usePlaybackFrame`.
- An audio-only note scheduler (Web Audio lookahead timer) is allowed inside a clock, but nothing in the UI may read it or run on it.
- All times are song time in seconds.
- Keep the warm orange/cream visual style and the light and dark themes.
