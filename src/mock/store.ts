import { useSyncExternalStore } from "react";
import { INITIAL_TRANSCRIPTIONS } from "./transcriptions";
import type { Transcription } from "./types";

/*
 * In-memory stand-in for the saved transcriptions (Firestore in the real app).
 * Edits replace a song's Transcription object, so React re-renders whatever reads it.
 * Each song keeps an undo stack for this session (US-11). Reloading the page resets everything.
 */

let transcriptions = new Map<number, Transcription>(INITIAL_TRANSCRIPTIONS.map((t) => [t.songId, t]));
const undoStacks = new Map<number, Transcription[]>();
const listeners = new Set<() => void>();

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
