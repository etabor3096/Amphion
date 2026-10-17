import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import type { Instrument, Transcription } from "../mock/types";
import { TUNINGS } from "../music/tuning";
import type { LoopRange } from "../playback/clock";
import ChordPopover from "./ChordPopover";
import { isStringBusy, isUnsure } from "./edits";
import { describePosition, rowIndexAt, rowX, slotLengthAt, snappedTimeAtX } from "./layout";
import type { BarSpan, RowSpan } from "./layout";
import TabRow from "./TabRow";
import type { AddTarget, RowChord, RowNote } from "./TabRow";

const LONG_PRESS_MS = 450;
const TAP_SLOP_PX = 8;

interface TabViewProps {
  transcription: Transcription;
  instrument: Instrument;
  bars: BarSpan[];
  rows: RowSpan[];
  /** Song time from the playback clock, for this frame. */
  time: number;
  /** False when the song's audio is not on this iPhone: the tab shows, but nothing plays. */
  canSeek: boolean;
  loop: LoopRange | null;
  pendingLoopStart: number | null;
  selectedNoteId: string | null;
  rowRef: (index: number, element: HTMLDivElement | null) => void;
  onSeek: (time: number) => void;
  onEditNote: (noteId: string) => void;
  onAddNote: (string: number, time: number) => void;
  onRenameChord: (chordId: string, name: string) => void;
}

interface Gesture {
  kind: "note" | "track";
  noteId?: string;
  track?: HTMLElement;
  startX: number;
  startY: number;
  timer: number;
  longPressed: boolean;
  moved: boolean;
}

/**
 * The stacked tab rows plus their interactions:
 * tap a note → jump there · press and hold a note → edit it · tap an empty spot on a string →
 * jump there and offer "+ Add note" · tap a bar number → jump to the bar · tap a chord → diagram.
 */
export default function TabView({
  transcription,
  instrument,
  bars,
  rows,
  time,
  canSeek,
  loop,
  pendingLoopStart,
  selectedNoteId,
  rowRef,
  onSeek,
  onEditNote,
  onAddNote,
  onRenameChord,
}: TabViewProps) {
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [openChordId, setOpenChordId] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const strings = TUNINGS[instrument];
  const notes = useMemo(() => transcription[instrument]?.notes ?? [], [transcription, instrument]);
  const { beatsPerBar } = transcription;

  // Notes and chords grouped by row, with their x position and spoken label worked out once per edit.
  const rowNotes = useMemo(() => {
    const grouped: RowNote[][] = rows.map(() => []);
    for (const note of notes) {
      const rowIndex = rowIndexAt(rows, note.startTime);
      const unsure = isUnsure(note);
      grouped[rowIndex].push({
        note,
        x: rowX(rows[rowIndex], note.startTime),
        unsure,
        label: `${describePosition(bars, note.startTime, beatsPerBar)}: ${strings[note.string - 1].spoken}, fret ${note.fret}${unsure ? ". Not sure, check by ear" : ""}`,
      });
    }
    for (const group of grouped) group.sort((a, b) => a.note.startTime - b.note.startTime || a.note.string - b.note.string);
    return grouped;
  }, [notes, rows, bars, beatsPerBar, strings]);

  const rowChords = useMemo(() => {
    const grouped: RowChord[][] = rows.map(() => []);
    for (const chord of transcription.chords) {
      const rowIndex = rowIndexAt(rows, chord.startTime);
      grouped[rowIndex].push({ chord, x: rowX(rows[rowIndex], chord.startTime), unsure: isUnsure(chord) });
    }
    return grouped;
  }, [transcription.chords, rows]);

  // Callbacks handed to the memoized rows read the latest props through a ref, so they never change.
  const latest = useRef({ onSeek, onAddNote, addTarget });
  latest.current = { onSeek, onAddNote, addTarget };

  const handleBarTap = useCallback((barStart: number) => {
    setAddTarget(null);
    setOpenChordId(null);
    latest.current.onSeek(barStart);
  }, []);

  const handleChordTap = useCallback((chordId: string) => {
    setAddTarget(null);
    setOpenChordId((open) => (open === chordId ? null : chordId));
  }, []);

  const handleAddNote = useCallback(() => {
    const target = latest.current.addTarget;
    if (!target) return;
    setAddTarget(null);
    latest.current.onAddNote(target.string, target.time);
  }, []);

  const tapNote = (noteId: string) => {
    setAddTarget(null);
    setOpenChordId(null);
    const note = notes.find((item) => item.id === noteId);
    if (note && canSeek) onSeek(note.startTime);
  };

  const tapTrack = (track: HTMLElement, clientX: number) => {
    const rowIndex = Number(track.dataset.row);
    const string = Number(track.dataset.string);
    const rect = track.getBoundingClientRect();
    const snapped = snappedTimeAtX(rows[rowIndex], (clientX - rect.left) / rect.width, beatsPerBar);
    setOpenChordId(null);
    if (snapped === null) {
      setAddTarget(null);
      return;
    }
    if (canSeek) onSeek(snapped);
    const slot = slotLengthAt(bars, snapped, beatsPerBar);
    // One note per string at a time (US-08): no "+ Add note" where this string is already sounding.
    setAddTarget(isStringBusy(notes, string, snapped, snapped + slot * 0.9) ? null : { row: rowIndex, string, time: snapped });
  };

  const cancelGesture = () => {
    if (gesture.current) window.clearTimeout(gesture.current.timer);
    gesture.current = null;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const noteElement = target.closest<HTMLElement>("[data-note-id]");
    const track = noteElement ? null : target.closest<HTMLElement>("[data-track]");
    if (!noteElement && !track) return;
    cancelGesture();
    const state: Gesture = {
      kind: noteElement ? "note" : "track",
      noteId: noteElement?.dataset.noteId,
      track: track ?? undefined,
      startX: event.clientX,
      startY: event.clientY,
      timer: 0,
      longPressed: false,
      moved: false,
    };
    if (state.noteId) {
      const noteId = state.noteId;
      state.timer = window.setTimeout(() => {
        state.longPressed = true;
        setAddTarget(null);
        setOpenChordId(null);
        onEditNote(noteId);
      }, LONG_PRESS_MS);
    }
    gesture.current = state;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = gesture.current;
    if (!state || state.moved) return;
    if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > TAP_SLOP_PX) {
      state.moved = true;
      window.clearTimeout(state.timer);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = gesture.current;
    gesture.current = null;
    if (!state) return;
    window.clearTimeout(state.timer);
    if (state.moved || state.longPressed) return;
    if (state.kind === "note" && state.noteId) tapNote(state.noteId);
    else if (state.track) tapTrack(state.track, event.clientX);
  };

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const noteElement = (event.target as HTMLElement).closest<HTMLElement>("[data-note-id]");
    if (!noteElement?.dataset.noteId) return;
    event.preventDefault();
    cancelGesture();
    setAddTarget(null);
    onEditNote(noteElement.dataset.noteId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setAddTarget(null);
      setOpenChordId(null);
      return;
    }
    const noteId = (event.target as HTMLElement).closest<HTMLElement>("[data-note-id]")?.dataset.noteId;
    if (!noteId) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      tapNote(noteId);
    } else if (event.key === "e" || event.key === "E" || event.key === "ContextMenu") {
      event.preventDefault();
      onEditNote(noteId);
    }
  };

  const currentRow = rowIndexAt(rows, time);
  const openChord = openChordId ? transcription.chords.find((chord) => chord.id === openChordId) : undefined;
  const openChordRow = openChord ? rowIndexAt(rows, openChord.startTime) : -1;

  return (
    <div
      className={`tab-score ${instrument === "bass" ? "bass-tab-score" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelGesture}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      {rows.map((row) => (
        <TabRow
          key={row.index}
          row={row}
          strings={strings}
          notes={rowNotes[row.index]}
          chords={rowChords[row.index]}
          time={canSeek && row.index === currentRow ? time : null}
          canSeek={canSeek}
          loop={loop}
          pendingLoopStart={pendingLoopStart}
          selectedNoteId={selectedNoteId}
          addTarget={addTarget?.row === row.index ? addTarget : null}
          openChordId={openChordRow === row.index ? openChordId : null}
          popover={
            openChord && openChordRow === row.index ? (
              <ChordPopover
                chord={openChord}
                x={rowX(row, openChord.startTime)}
                unsure={isUnsure(openChord)}
                instrument={instrument}
                canSeek={canSeek}
                onPlayFrom={() => {
                  setOpenChordId(null);
                  onSeek(openChord.startTime);
                }}
                onRename={(name) => onRenameChord(openChord.id, name)}
                onClose={() => setOpenChordId(null)}
              />
            ) : null
          }
          rowRef={rowRef}
          onBarTap={handleBarTap}
          onChordTap={handleChordTap}
          onAddNote={handleAddNote}
        />
      ))}
    </div>
  );
}
