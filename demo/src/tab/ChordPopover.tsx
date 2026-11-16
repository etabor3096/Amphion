import { useState } from "react";
import type { CSSProperties } from "react";
import type { ChordSegment, Instrument } from "../mock/types";
import { CHORD_PICKER_OPTIONS, spokenChordName } from "../music/chords";
import ChordDiagram from "./ChordDiagram";

interface ChordPopoverProps {
  chord: ChordSegment;
  x: number;
  unsure: boolean;
  instrument: Instrument;
  canSeek: boolean;
  onPlayFrom: () => void;
  onRename: (name: string) => void;
  onClose: () => void;
}

/** Small card under a chord name: finger diagram, "Play from here", and a chord picker (US-08, US-11). */
export default function ChordPopover({ chord, x, unsure, instrument, canSeek, onPlayFrom, onRename, onClose }: ChordPopoverProps) {
  const [picking, setPicking] = useState(false);

  return (
    <>
      <div className="tab-popover-scrim" onClick={onClose} aria-hidden="true" />
      <section
        className="tab-chord-popover"
        role="dialog"
        aria-label={`${spokenChordName(chord.name)} chord`}
        style={{ "--anchor": x } as CSSProperties}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <header>
          <div>
            <strong>{chord.name}</strong>
            <span>{spokenChordName(chord.name)}</span>
          </div>
          <button type="button" className="tab-popover-close" aria-label="Close chord" onClick={onClose}>×</button>
        </header>

        {unsure && (
          <p className="tab-popover-unsure"><span className="tab-flag" aria-hidden="true">?</span> Amphion isn't sure about this chord. Check it by ear.</p>
        )}

        {picking ? (
          <div className="chord-picker-grid" role="group" aria-label="Choose the right chord">
            {CHORD_PICKER_OPTIONS.map((name) => (
              <button
                type="button"
                className={name === chord.name ? "selected" : ""}
                aria-pressed={name === chord.name}
                onClick={() => {
                  onRename(name);
                  setPicking(false);
                }}
                key={name}
              >
                {name}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="tab-popover-diagram">
              <ChordDiagram name={chord.name} instrument={instrument} />
              <small>{instrument === "guitar" ? "Guitar shape" : "Bass note for this chord"}</small>
            </div>
            <div className="tab-popover-actions">
              {canSeek && <button type="button" className="primary" onClick={onPlayFrom}>Play from here</button>}
              <button type="button" onClick={() => setPicking(true)}>Change chord</button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
