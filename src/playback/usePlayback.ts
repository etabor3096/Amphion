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

/**
 * The single animation-frame loop for synced playback. Every frame it reads the clock once and
 * passes the song time the listener is hearing right now to `onFrame`. The playhead, note
 * highlights and auto-scroll are all drawn from that value; there is no other timer.
 */
export function usePlaybackFrame(clock: PlaybackClock, onFrame: (songTime: number) => void) {
  const callback = useRef(onFrame);
  useLayoutEffect(() => {
    callback.current = onFrame;
  });

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const position = clock.currentTime();
      const heard = clock.isPlaying() ? Math.max(0, position - clock.outputLatency()) : position;
      callback.current(heard);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock]);
}
