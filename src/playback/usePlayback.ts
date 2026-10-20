import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { PlaybackClock } from "./clock";

/** Discrete playback state (playing, speed, loop) for buttons and labels. */
export function usePlaybackState(clock: PlaybackClock) {
  const subscribe = useCallback((listener: () => void) => clock.subscribe(listener), [clock]);
  const playing = useSyncExternalStore(subscribe, () => clock.isPlaying());
  const rate = useSyncExternalStore(subscribe, () => clock.rate());
  const loop = useSyncExternalStore(subscribe, () => clock.loop());
  return { playing, rate, loop };
}

/** Where animation frames come from; tests pass one that never fires, like a hidden tab. */
export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const animationFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * Reads the clock and passes the song time the listener is hearing right now to `onTime`: once
 * per animation frame, and at once on every discrete change (play, pause, seek, speed, loop, end).
 * The second path is what keeps a seek visible when frames don't run, as in a hidden tab.
 * Returns a function that stops both.
 */
export function watchPlayback(clock: PlaybackClock, onTime: (songTime: number) => void, frames: FrameScheduler = animationFrames) {
  const report = () => {
    const position = clock.currentTime();
    onTime(clock.isPlaying() ? Math.max(0, position - clock.outputLatency()) : position);
  };
  let frame = 0;
  const tick = () => {
    report();
    frame = frames.request(tick);
  };
  frame = frames.request(tick);
  const unsubscribe = clock.subscribe(report);
  return () => {
    frames.cancel(frame);
    unsubscribe();
  };
}

/**
 * The single animation-frame loop for synced playback (see watchPlayback). The playhead, note
 * highlights and auto-scroll are all drawn from the song time it passes to `onFrame`; there is
 * no other timer.
 */
export function usePlaybackFrame(clock: PlaybackClock, onFrame: (songTime: number) => void) {
  const callback = useRef(onFrame);
  useLayoutEffect(() => {
    callback.current = onFrame;
  });

  useEffect(() => watchPlayback(clock, (songTime) => callback.current(songTime)), [clock]);
}
