# Amphion front-end demo

React + Vite + Tailwind CSS click-through demo of the Amphion iOS app, originally exported from Figma Make.
Front-end only: no backend, no network calls, all data from `src/mock/`. `docs/SDD.pdf` is the authority on behavior (`docs/SDD.txt` is a plain-text copy). Task briefs live in `docs/tasks/`.

## Development Server

Run `npm install`, then `npm run dev` (Vite on http://localhost:5173). `npm run typecheck` type-checks; `npm run build` type-checks and builds.

## Project Structure

- `src/main.tsx` - Entry point. Desktop browsers get `device/PhoneFrame` (the app in a 390×844 iframe); inside the frame or on a phone it mounts `App`
- `src/App.tsx` - Splash → fake sign-in → `MainApp`
- `src/MainApp.tsx` - Library, Add Song, Settings screens and their dialogs
- `src/SongScreen.tsx` - Song screen header, details, and photo/rename/delete; the tab itself is `src/tab/SyncedTab.tsx`
- `src/playback/` - `PlaybackClock` (the single clock for song time, RC-18/DD-14), `SimulatedClock`, and the one animation-frame hook
- `src/tab/` - Tab rows, interactions, practice bar, note editor, chord popover, and pure edit functions
- `src/mock/` - Data types (mirror RC-20), songs, generated tab data, in-memory store with undo
- `src/music/` - Tuning and chord-shape helpers
- `src/index.css` - All styling (Tailwind v4 import, design tokens, component CSS). Safe areas use `--safe-top/--safe-bottom`, which the phone frame sets

## Rules

- Never add a second timer for synced UI: everything synced reads `PlaybackClock.currentTime()` in `usePlaybackFrame`.
- All times are song time in seconds.
- Keep the warm orange/cream visual style and the light and dark themes.
