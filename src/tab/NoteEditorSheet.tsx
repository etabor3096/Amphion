import { useEffect, useRef } from "react";
import type { Instrument, TabNote } from "../mock/types";
import { MAX_FRET, pitchName, TUNINGS } from "../music/tuning";
import { isStringBusy, isUnsure } from "./edits";

interface NoteEditorSheetProps {
  instrument: Instrument;
  note: TabNote;
  /** All notes on this instrument, to keep one note per string at a time (US-08). */
  notes: TabNote[];
  position: string;
  onFretChange: (fret: number) => void;
  onMoveToString: (string: number, fret: number) => void;
  onConfirm: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Bottom sheet opened by pressing and holding a note (US-11). Every change applies right away. */
export default function NoteEditorSheet({ instrument, note, notes, position, onFretChange, onMoveToString, onConfirm, onDelete, onClose }: NoteEditorSheetProps) {
  const strings = TUNINGS[instrument];
  const string = strings[note.string - 1];
  const openedAt = useRef(performance.now());
  const doneRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    doneRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const moveOptions = strings
    .filter((candidate) => candidate.number !== note.string)
    .map((candidate) => {
      const fret = note.pitch - candidate.openPitch;
      const reason =
        fret < 0
          ? "Too low for this string"
          : fret > MAX_FRET
            ? "Too high for this string"
            : isStringBusy(notes, candidate.number, note.startTime, note.startTime + note.duration, note.id)
              ? "Another note is playing on it"
              : null;
      return { string: candidate, fret, reason };
    });

  return (
    <div
      className="modal-backdrop note-editor-backdrop"
      role="presentation"
      onClick={() => {
        // Ignore the click that can follow the long press that opened the sheet.
        if (performance.now() - openedAt.current > 350) onClose();
      }}
    >
      <section className="note-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="note-editor-title" onClick={(event) => event.stopPropagation()}>
        <span className="sheet-handle" />
        <div className="filter-sheet-heading">
          <h2 id="note-editor-title">Edit note</h2>
          <button type="button" ref={doneRef} onClick={onClose}>Done</button>
        </div>

        <div className="note-editor-summary">
          <span className="note-editor-fret-badge" aria-hidden="true">{note.fret}</span>
          <div>
            <strong>{string.spoken[0].toUpperCase() + string.spoken.slice(1)} · fret {note.fret}</strong>
            <span>{position} · note {pitchName(note.pitch)}</span>
          </div>
        </div>

        {isUnsure(note) && (
          <div className="note-editor-unsure">
            <span className="tab-flag" aria-hidden="true">?</span>
            <p>Amphion isn't sure about this note. Check it by ear.</p>
            <button type="button" onClick={onConfirm}>It's right</button>
          </div>
        )}

        <div className="note-editor-section">
          <h3 id="fret-label">Fret</h3>
          <div className="fret-stepper" role="group" aria-labelledby="fret-label">
            <button type="button" aria-label="One fret lower" disabled={note.fret <= 0} onClick={() => onFretChange(note.fret - 1)}>−</button>
            <output aria-live="polite">{note.fret}</output>
            <button type="button" aria-label="One fret higher" disabled={note.fret >= MAX_FRET} onClick={() => onFretChange(note.fret + 1)}>+</button>
          </div>
        </div>

        <div className="note-editor-section">
          <h3>Move to another string</h3>
          <p>Same note ({pitchName(note.pitch)}), played somewhere else on the neck.</p>
          <div className="note-move-options">
            {moveOptions.map(({ string: candidate, fret, reason }) => (
              <button
                type="button"
                disabled={reason !== null}
                onClick={() => onMoveToString(candidate.number, fret)}
                aria-label={reason ? `${candidate.spoken}: ${reason}` : `Move to ${candidate.spoken}, fret ${fret}`}
                key={candidate.number}
              >
                <strong>{candidate.label} string</strong>
                <span>{reason ?? `Fret ${fret}`}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="note-delete-button" onClick={onDelete}>Delete note</button>
      </section>
    </div>
  );
}
