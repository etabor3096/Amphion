import { useSyncExternalStore } from "react";
import { INITIAL_TRANSCRIPTIONS } from "./transcriptions";
import type { Transcription } from "./types";

/*
 * In-memory stand-in for the saved transcriptions (Firestore in the real app).
 * Edits replace a song's Transcription object, so React re-renders whatever reads it.
 * Each song keeps an undo stack for this session only (US-11). Saved transcriptions persist in
 * localStorage: every emit() schedules a debounced save, so any mutation is stored automatically.
 * On load, the mock data is overlaid with the saved entries by songId, minus any removed mock songs.
 */

const STORAGE_KEY = "amphion-demo:v1:transcriptions";
const STORAGE_VERSION = 1;
const SAVE_DELAY_MS = 250;

/** Only accepts things that look like a Transcription. */
function isTranscription(value: unknown): value is Transcription {
  const t = value as Transcription | null;
  return (
    typeof t === "object" &&
    t !== null &&
    typeof t.songId === "number" &&
    typeof t.duration === "number" &&
    Array.isArray(t.beats) &&
    Array.isArray(t.downbeats) &&
    Array.isArray(t.chords) &&
    (t.guitar === null || Array.isArray(t.guitar?.notes)) &&
    (t.bass === null || Array.isArray(t.bass?.notes))
  );
}

/** Starts from the mock data, then applies saved edits, saved additions and saved deletions. */
function loadTranscriptions() {
  const map = new Map<number, Transcription>(INITIAL_TRANSCRIPTIONS.map((t) => [t.songId, t]));
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return map;
    const data = JSON.parse(raw);
    if (data?.version !== STORAGE_VERSION) return map;
    if (Array.isArray(data.removed)) {
      for (const id of data.removed) if (typeof id === "number") map.delete(id);
    }
    if (Array.isArray(data.saved)) {
      for (const entry of data.saved) if (isTranscription(entry)) map.set(entry.songId, entry);
    }
  } catch {
    return new Map(INITIAL_TRANSCRIPTIONS.map((t) => [t.songId, t]));
  }
  return map;
}

let transcriptions = loadTranscriptions();
const undoStacks = new Map<number, Transcription[]>();
const listeners = new Set<() => void>();

let saveTimer: number | undefined;
let warnedAboutSave = false;

/** Writes entries that differ from the mock data, plus the ids of removed mock songs. */
function saveNow() {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  const mock = new Map(INITIAL_TRANSCRIPTIONS.map((t) => [t.songId, t]));
  const saved = [...transcriptions.values()].filter((t) => mock.get(t.songId) !== t);
  const removed = [...mock.keys()].filter((id) => !transcriptions.has(id));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, saved, removed }));
  } catch (error) {
    if (!warnedAboutSave) {
      warnedAboutSave = true;
      console.warn("Amphion demo: could not save edits, keeping them in memory only.", error);
    }
  }
}

function scheduleSave() {
  if (saveTimer === undefined) saveTimer = window.setTimeout(saveNow, SAVE_DELAY_MS);
}

// Save through the store's own change notification, so every mutation is persisted.
// Flush on the way out so a quick reload doesn't lose the last edit.
listeners.add(scheduleSave);
window.addEventListener("pagehide", () => {
  if (saveTimer !== undefined) saveNow();
});

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTranscription(songId: number) {
  return transcriptions.get(songId);
}

/** Applies an edit and remembers the previous version so it can be undone. */
export function editTranscription(songId: number, edit: (current: Transcription) => Transcription) {
  const current = transcriptions.get(songId);
  if (!current) return;
  const next = edit(current);
  if (next === current) return;
  undoStacks.set(songId, [...(undoStacks.get(songId) ?? []), current]);
  transcriptions = new Map(transcriptions).set(songId, next);
  emit();
}

export function undoLastEdit(songId: number) {
  const stack = undoStacks.get(songId);
  const previous = stack?.[stack.length - 1];
  if (!stack || !previous) return;
  undoStacks.set(songId, stack.slice(0, -1));
  transcriptions = new Map(transcriptions).set(songId, previous);
  emit();
}

export function removeTranscription(songId: number) {
  if (!transcriptions.has(songId)) return;
  transcriptions = new Map(transcriptions);
  transcriptions.delete(songId);
  undoStacks.delete(songId);
  emit();
}

export function useTranscription(songId: number) {
  return useSyncExternalStore(subscribe, () => transcriptions.get(songId));
}

export function useAllTranscriptions(): ReadonlyMap<number, Transcription> {
  return useSyncExternalStore(subscribe, () => transcriptions);
}

export function useUndoCount(songId: number) {
  return useSyncExternalStore(subscribe, () => undoStacks.get(songId)?.length ?? 0);
}
