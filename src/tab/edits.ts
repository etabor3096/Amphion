import { pitchAt } from "../music/tuning";
import type { ChordSegment, Instrument, TabNote, Transcription } from "../mock/types";

/**
 * Notes and chord names below this confidence get a "?" marker. The real threshold will be
 * calibrated against the benchmark songs (OQ-01); 0.6 is the demo's placeholder.
 */
export const LOW_CONFIDENCE = 0.6;

export function isUnsure(item: Pick<TabNote | ChordSegment, "confidence" | "edited">) {
  return !item.edited && item.confidence < LOW_CONFIDENCE;
}

/** How many notes (both instruments) and chord names still need checking by ear. */
export function countToCheck(transcription: Transcription) {
  const notes = [...(transcription.guitar?.notes ?? []), ...(transcription.bass?.notes ?? [])];
  return { notes: notes.filter(isUnsure).length, chords: transcription.chords.filter(isUnsure).length };
}

/** "3 notes to check", "1 chord to check", "4 notes, 1 chord to check", or "" when nothing is flagged. */
export function toCheckLabel(transcription: Transcription) {
  const { notes, chords } = countToCheck(transcription);
  const parts = [
    notes > 0 ? `${notes} ${notes === 1 ? "note" : "notes"}` : "",
    chords > 0 ? `${chords} ${chords === 1 ? "chord" : "chords"}` : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")} to check` : "";
}

/** True if another note on this string sounds during [start, end) — US-08 allows one note per string at a time. */
export function isStringBusy(notes: TabNote[], string: number, start: number, end: number, ignoreId?: string) {
  return notes.some(
    (note) => note.id !== ignoreId && note.string === string && note.startTime < end && start < note.startTime + note.duration,
  );
}

function updateNotes(transcription: Transcription, instrument: Instrument, update: (notes: TabNote[]) => TabNote[]): Transcription {
  const tab = transcription[instrument];
  if (!tab) return transcription;
  return { ...transcription, [instrument]: { ...tab, notes: update(tab.notes) } };
}

function updateNote(transcription: Transcription, instrument: Instrument, noteId: string, change: (note: TabNote) => TabNote) {
  return updateNotes(transcription, instrument, (notes) => notes.map((note) => (note.id === noteId ? change(note) : note)));
}

export function setNoteFret(transcription: Transcription, instrument: Instrument, noteId: string, fret: number) {
  return updateNote(transcription, instrument, noteId, (note) => ({
    ...note,
    fret,
    pitch: pitchAt(instrument, note.string, fret),
    edited: true,
  }));
}

/** Moves a note to another string, keeping its pitch (the fret changes to match). */
export function moveNoteToString(transcription: Transcription, instrument: Instrument, noteId: string, string: number, fret: number) {
  return updateNote(transcription, instrument, noteId, (note) => ({ ...note, string, fret, edited: true }));
}

/** The user listened and agrees with the note: it stays as is but loses its "?" marker. */
export function confirmNote(transcription: Transcription, instrument: Instrument, noteId: string) {
  return updateNote(transcription, instrument, noteId, (note) => ({ ...note, edited: true }));
}

export function deleteNote(transcription: Transcription, instrument: Instrument, noteId: string) {
  return updateNotes(transcription, instrument, (notes) => notes.filter((note) => note.id !== noteId));
}

let addedNoteCount = 0;

export function addNote(
  transcription: Transcription,
  instrument: Instrument,
  fields: { string: number; fret: number; startTime: number; duration: number },
): [Transcription, string] {
  const id = `s${transcription.songId}-${instrument[0]}-added${++addedNoteCount}`;
  const note: TabNote = {
    id,
    ...fields,
    pitch: pitchAt(instrument, fields.string, fields.fret),
    confidence: 1,
    edited: true,
  };
  const next = updateNotes(transcription, instrument, (notes) =>
    [...notes, note].sort((a, b) => a.startTime - b.startTime || a.string - b.string),
  );
  return [next, id];
}

export function renameChord(transcription: Transcription, chordId: string, name: string): Transcription {
  return {
    ...transcription,
    chords: transcription.chords.map((chord) => (chord.id === chordId ? { ...chord, name, edited: true } : chord)),
  };
}
