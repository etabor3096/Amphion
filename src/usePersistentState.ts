import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

const PREFIX = "amphion-demo:v1:";
const RESET_PREFIX = "amphion-demo:";
const WRITE_DELAY_MS = 250;

const RESET_FLAG = "amphion-demo-reset";

let warned = false;
let resetting = false;

function clearDemoKeys() {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const name = window.localStorage.key(i);
    if (name?.startsWith(RESET_PREFIX)) keys.push(name);
  }
  keys.forEach((name) => window.localStorage.removeItem(name));
}

// A reset reloads the page, and the old page's pending debounced writes (ours or the tab-edit store's)
// can flush on pagehide after the keys were removed. Reset leaves a sessionStorage flag; the next load
// clears the keys again here, at module load, before anything reads them. MainApp imports this module first.
try {
  if (window.sessionStorage.getItem(RESET_FLAG)) {
    window.sessionStorage.removeItem(RESET_FLAG);
    clearDemoKeys();
  }
} catch {
  // Storage unavailable: nothing was saved, so there is nothing to clear.
}

function warnOnce(error: unknown) {
  if (warned) return;
  warned = true;
  console.warn("Amphion demo: could not save to this browser's storage; changes will last until reload.", error);
}

function read<T>(key: string, initial: T, validate?: (value: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return initial;
    const value: unknown = JSON.parse(raw);
    if (validate && !validate(value)) return initial;
    return value as T;
  } catch {
    return initial;
  }
}

function write(key: string, value: unknown) {
  if (resetting) return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (error) {
    warnOnce(error);
  }
}

/**
 * Same shape as useState, but the value is kept in localStorage under `amphion-demo:v1:<key>`.
 * Read once on mount; writes are debounced and flushed when the page is hidden or the component unmounts.
 * Missing, corrupt, or invalid data falls back to `initial`.
 */
export function usePersistentState<T>(key: string, initial: T, validate?: (value: unknown) => boolean): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, initial, validate));
  const latest = useRef(value);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const saved = useRef(value);

  useEffect(() => {
    latest.current = value;
    if (Object.is(value, saved.current)) return;
    saved.current = value;
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      dirty.current = false;
      write(key, latest.current);
    }, WRITE_DELAY_MS);
  }, [key, value]);

  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      window.clearTimeout(timer.current);
      dirty.current = false;
      write(key, latest.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [key]);

  return [value, setValue];
}

/** Removes every saved demo value (including tab edits) and reloads the page. */
export function resetDemoData() {
  resetting = true;
  try {
    window.sessionStorage.setItem(RESET_FLAG, "1");
    clearDemoKeys();
  } catch (error) {
    warnOnce(error);
  }
  window.location.reload();
}
