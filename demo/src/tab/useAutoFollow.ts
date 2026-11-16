import { useCallback, useEffect, useRef, useState } from "react";

/** Where the current row's top edge is kept: 22% down the screen, inside the upper third. */
const FOLLOW_ANCHOR = 0.22;
/** Fraction of the remaining distance scrolled per frame, for a smooth glide. */
const EASE = 0.2;

/**
 * Auto-scroll for synced playback. It has no timer of its own: the playback frame loop calls
 * `step(rowIndex)` each frame with the row under the playhead.
 *
 * Scrolling by hand (wheel, touch drag, arrow/page keys) during playback pauses following, and
 * `followPaused` drives the "Back to playhead" pill. Pressing play or the pill resumes it.
 */
export function useAutoFollow(playing: boolean) {
  const rows = useRef<Array<HTMLElement | null>>([]);
  const [followPaused, setFollowPausedState] = useState(false);
  const pausedRef = useRef(false);
  const playingRef = useRef(playing);
  const jumpRef = useRef(false);

  const setFollowPaused = useCallback((value: boolean) => {
    pausedRef.current = value;
    setFollowPausedState(value);
  }, []);

  useEffect(() => {
    playingRef.current = playing;
    if (playing) setFollowPaused(false);
  }, [playing, setFollowPaused]);

  useEffect(() => {
    const userScrolled = () => {
      jumpRef.current = false;
      if (playingRef.current) setFollowPaused(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) userScrolled();
    };
    window.addEventListener("wheel", userScrolled, { passive: true });
    window.addEventListener("touchmove", userScrolled, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", userScrolled);
      window.removeEventListener("touchmove", userScrolled);
      window.removeEventListener("keydown", onKey);
    };
  }, [setFollowPaused]);

  const step = useCallback((rowIndex: number) => {
    const following = playingRef.current && !pausedRef.current;
    if (!following && !jumpRef.current) return;
    const row = rows.current[rowIndex];
    if (!row) return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const wanted = window.scrollY + row.getBoundingClientRect().top - window.innerHeight * FOLLOW_ANCHOR;
    const remaining = Math.min(maxScroll, Math.max(0, wanted)) - window.scrollY;
    if (Math.abs(remaining) < 1) {
      jumpRef.current = false;
      return;
    }
    window.scrollTo(0, window.scrollY + (Math.abs(remaining) < 3 ? remaining : remaining * EASE));
  }, []);

  /** Scroll back to the playhead once, even while paused, and resume following. */
  const backToPlayhead = useCallback(() => {
    setFollowPaused(false);
    jumpRef.current = true;
  }, [setFollowPaused]);

  const rowRef = useCallback((index: number, element: HTMLElement | null) => {
    rows.current[index] = element;
  }, []);

  return { followPaused, step, backToPlayhead, rowRef };
}
