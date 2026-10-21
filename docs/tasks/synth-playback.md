# Task: make demo playback audible with a Web Audio synth

You are working in the **Amphion front-end demo**, a React 19 + Vite 8 + TypeScript + Tailwind v4 project.
It is a click-through web demo of an iOS app that turns a song into guitar or bass tab and plays the
song in sync with the tab. Read `AGENTS.md` (project rules and file map) and `README.md` first.
`docs/SDD.pdf` is the design authority (`docs/SDD.txt` is a plain-text copy). The relevant parts are RC-18, DD-14 and US-12 to US-14.

## Goal

Today playback is **silent**. A `SimulatedClock` advances "song time" and the tab follows it.
Make playback **audible**: synthesize the notes of the tab being shown (guitar or bass) with the
Web Audio API, and make the audio itself the clock. You should be able to hear the highlighted notes
land exactly as they sound, at every speed and across loops.

## Hard constraints

- **No network calls, no backend, no audio files.** All sound is synthesized in the browser.
- **One clock for sync (RC-18, DD-14).** The UI already reads `PlaybackClock.currentTime()` once per
  animation frame in `usePlaybackFrame` (`src/playback/usePlayback.ts`) and draws the playhead, note
  highlights and auto-scroll from it. Keep that. The new clock's song time must be derived from
  `AudioContext.currentTime`. Do not add any timer that drives UI.
  - An audio-side note scheduler (the standard Web Audio "lookahead" pattern with a ~25 ms interval)
    is allowed. It only schedules sound and the UI must never read from it. Say so in a code comment.
- **Do not change the UI or styling** except for the small wiring described below.
  Keep the warm orange/cream look and the light and dark themes.
- TypeScript strict mode must stay clean.

## How the code works now

- `src/playback/clock.ts`: the `PlaybackClock` interface and `SimulatedClock`. Read both fully.
  Your class must behave the same:
  - `currentTime()` returns song seconds.
  - `play()` at the end restarts from the loop start, or from 0.
  - `pause()` / `seek(t)` / `setRate(r)`. Rate is 0.5–1.0, from the speed menu in `src/tab/PracticeBar.tsx`.
  - `setLoop({start, end} | null)`. Once playback that started before `end` reaches `end`, it jumps back to `start`.
  - Stops at `duration`.
  - `subscribe()` fires on discrete changes, including reaching the end.
  - `outputLatency()` returns seconds of output delay. `usePlaybackFrame` subtracts it while playing.
- `src/SongScreen.tsx` creates the clock: `const [clock] = useState(() => new SimulatedClock(transcription.duration))`.
  It also calls `useEffect(() => () => clock.pause(), [clock])` on unmount. One clock per open song.
- `src/tab/SyncedTab.tsx` owns the instrument choice (`instrument` state, Guitar or Bass), the current
  `transcription`, and the frame loop. `transcription[instrument]?.notes` is the note list being shown.
  It can be null, e.g. "First Full Song" has no bass part.
- Note data (`src/mock/types.ts`, `TabNote`) has `startTime` (song seconds), `duration` (seconds),
  `string`, `fret`, `pitch` (MIDI note number, always correct after edits), `confidence` and `edited`.
- Users can edit notes while the song is open (fret change, move string, add, delete, undo). Edits go
  through `src/mock/store.ts`, which replaces the `Transcription` object, so React re-renders with new notes.
- `src/main.tsx` renders inside `<React.StrictMode>`, so `useState` initializers and effects run twice in dev.
- On desktop the app runs inside a same-origin iframe (`src/device/PhoneFrame.tsx`). Clicking Play inside it
  counts as a user gesture for the AudioContext autoplay policy.

## What to build

1. **`src/playback/SynthClock.ts`**: a class implementing `PlaybackClock`.
   - **Song time:** `anchorSongTime + (audioContext.currentTime - anchorContextTime) * rate`.
     Re-anchor on every play, pause, seek, rate and loop change, like `SimulatedClock` does.
   - **Notes:** a `setNotes(notes: TabNote[])` method sets which notes to play. When called while
     playing, cancel pending sounds and reschedule from the current position.
   - **Scheduling:** schedule each note at its song time mapped to context time:
     `anchorContextTime + (note.startTime - anchorSongTime) / rate`, with length `note.duration / rate`.
     Pitch never changes with speed. Notes simply play slower, which is what the SDD asks for (US-13).
   - **Loops:** wrap seamlessly at B. Schedule ahead into the next loop pass so the first notes after
     the jump are not clipped or late. `currentTime()` must report the wrapped time.
   - **Seek, pause and end:** stop or cancel every scheduled or sounding node (fast fade-out, about 10 ms,
     to avoid clicks).
   - **Sound:** a simple plucked-string voice. For example, a triangle or sawtooth oscillator through
     a lowpass filter, with a fast attack and an exponential decay. Use frequency = `440 * 2 ** ((pitch - 69) / 12)`.
     Bass notes are just lower pitches. Use the same voice, or a slightly darker filter, for bass.
     Route everything through a master gain (about 0.25) and a `DynamicsCompressorNode` so stacked
     chord notes don't clip.
   - **Latency:** `outputLatency()` returns `audioContext.outputLatency || audioContext.baseLatency || 0`.
   - **StrictMode safety:** create the `AudioContext` lazily on the first `play()` (that is the user
     gesture), not in the constructor. Call `audioContext.resume()` if it is suspended. Add an
     idempotent `dispose()` that stops sound and closes the context. A later `play()` after
     `dispose()` must still work by creating a new context, because StrictMode unmounts and remounts.
2. **Interface:** add an optional method to `PlaybackClock` in `src/playback/clock.ts`:
   `setAudibleNotes?(notes: TabNote[]): void`, with a doc comment ("for clocks that synthesize the part").
   `SynthClock` implements it. `SimulatedClock` doesn't need to.
3. **Wiring:**
   - In `src/SongScreen.tsx`, use `SynthClock` when `song.audioOnThisDevice` is true and
     `window.AudioContext` exists. Otherwise keep `SimulatedClock`.
   - Replace the unmount effect with one that pauses and calls `dispose()` when it exists.
   - In `src/tab/SyncedTab.tsx`, add an effect that calls `clock.setAudibleNotes?.(tab?.notes ?? [])`
     whenever the instrument or the notes change. Depend on `tab?.notes`, not on a fresh `[]`.
   - When the shown instrument has no part, pass an empty list (silence).
4. **Docs:**
   - Update the "Real vs. mocked" table and "Where things live" in `README.md`.
   - Update the `src/playback/` line in `AGENTS.md`.
   - In `AGENTS.md`'s Rules, note that an audio-only scheduler is allowed but nothing in the UI may read it.

## Done when

- `npm install` and `npm run typecheck` pass, and `npm run build` passes.
- `npm run dev` runs, and on http://localhost:5173:
  - **Back Porch Chorus, Guitar:** Play is audible, and each highlighted (filled, bold) note lights up
    as you hear it, for the whole song.
  - **Speed 50%:** notes play at half tempo, same pitch, and stay in sync.
  - **A-B loop:** tap A-B at bar 3, then again at bar 4. Playback repeats bars 3–4 with no gap or
    double notes at the jump, at 100% and at 50%.
  - **While playing:** tapping a note, tapping a bar number, or dragging the scrubber jumps the
    sound and the playhead together, with no stuck or overlapping notes.
  - **Bass toggle:** switching to Bass while playing switches to the bass line within a frame or two.
    "First Full Song" on Bass is silent ("No bass part found").
  - **Editing:** after long-pressing a note and changing its fret, the new pitch plays. Undo plays the old one again.
  - **Leaving a song while it plays** stops the sound. Coming back and pressing Play works.
  - **Lantern Light** (audio on another iPhone) still shows no practice bar and makes no sound.
  - No console errors or warnings in dev (StrictMode).
- No new runtime dependencies.

## Out of scope

Real recorded audio, pitch-preserving time-stretch of audio files, a mute or volume control
(optional if trivial), and any change to the mock data.
