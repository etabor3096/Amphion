import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ChordSegment, TabNote } from "../mock/types";
import type { TabString } from "../music/tuning";
import type { LoopRange } from "../playback/clock";
import { barLineX, BARS_PER_ROW, rowX } from "./layout";
import type { RowSpan } from "./layout";

/** Height of one string line in px. Keep in sync with --tab-string-height in index.css. */
export const STRING_HEIGHT = 24;

export interface RowNote {
  note: TabNote;
  x: number;
  label: string;
  unsure: boolean;
}

export interface RowChord {
  chord: ChordSegment;
  x: number;
  unsure: boolean;
}

export interface AddTarget {
  row: number;
  string: number;
  time: number;
}

interface TabRowProps {
  row: RowSpan;
  strings: TabString[];
  /** Notes in this row in time order, so VoiceOver reads the tab bar by bar (RC-12). */
  notes: RowNote[];
  chords: RowChord[];
  /** Song time while the playhead is in this row, otherwise null (other rows then skip re-rendering). */
  time: number | null;
  canSeek: boolean;
  loop: LoopRange | null;
  pendingLoopStart: number | null;
  selectedNoteId: string | null;
  addTarget: AddTarget | null;
  openChordId: string | null;
  popover: ReactNode;
  rowRef: (index: number, element: HTMLDivElement | null) => void;
  onBarTap: (time: number) => void;
  onChordTap: (chordId: string) => void;
  onAddNote: () => void;
}

const percent = (fraction: number) => `${fraction * 100}%`;
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** x of the bar line where a bar in this row starts at `time`, else null. */
function barStartLineAt(row: RowSpan, time: number) {
  const offset = row.bars.findIndex((bar) => near(bar.start, time));
  return offset === -1 ? null : barLineX(offset);
}

/** x of the bar line where a bar in this row ends at `time`, else null. */
function barEndLineAt(row: RowSpan, time: number) {
  const offset = row.bars.findIndex((bar) => near(bar.end, time));
  return offset === -1 ? null : barLineX(offset + 1);
}

/**
 * One row of tab: two bars with a thin chord-name line on top, one line per string with its
 * label on the left, fret numbers placed at their exact time, bar lines with bar numbers, and
 * the playhead and loop markers when they fall in this row.
 */
function TabRow({
  row,
  strings,
  notes,
  chords,
  time,
  canSeek,
  loop,
  pendingLoopStart,
  selectedNoteId,
  addTarget,
  openChordId,
  popover,
  rowRef,
  onBarTap,
  onChordTap,
  onAddNote,
}: TabRowProps) {
  const firstBar = row.bars[0].index + 1;
  const lastBar = row.bars[row.bars.length - 1].index + 1;
  const loopStart = loop?.start ?? pendingLoopStart;
  const loopStartX = loopStart !== null ? barStartLineAt(row, loopStart) : null;
  const loopEndX = loop ? barEndLineAt(row, loop.end) : null;

  return (
    <div
      className="tab-row"
      ref={(element) => rowRef(row.index, element)}
      role="group"
      aria-label={firstBar === lastBar ? `Bar ${firstBar}` : `Bars ${firstBar} to ${lastBar}`}
      style={{ "--string-count": strings.length } as CSSProperties}
    >
      {loop && (
        <div className="tab-row-lane tab-loop-layer" aria-hidden="true">
          {row.bars.map((bar, offset) =>
            bar.start >= loop.start - 0.001 && bar.end <= loop.end + 0.001 ? (
              <i className="tab-loop-shade" style={{ left: percent(barLineX(offset)), width: percent(1 / BARS_PER_ROW) }} key={bar.index} />
            ) : null,
          )}
        </div>
      )}

      <div className="tab-row-header">
        <div className="tab-row-lane">
          {row.bars.map((bar, offset) => (
            <button
              className="tab-bar-number"
              type="button"
              style={{ left: percent(barLineX(offset)) }}
              onClick={() => onBarTap(bar.start)}
              disabled={!canSeek}
              aria-label={canSeek ? `Bar ${bar.index + 1}. Play from here` : `Bar ${bar.index + 1}`}
              key={bar.index}
            >
              {bar.index + 1}
            </button>
          ))}
          {chords.map(({ chord, x, unsure }) => (
            <button
              className={`tab-chord ${unsure ? "unsure" : ""} ${openChordId === chord.id ? "open" : ""}`}
              type="button"
              style={{ left: percent(x) }}
              aria-expanded={openChordId === chord.id}
              aria-label={`Chord ${chord.name}${unsure ? ", not sure" : ""}. Show finger diagram`}
              onClick={() => onChordTap(chord.id)}
              key={chord.id}
            >
              {chord.name}
              {unsure && <span className="tab-flag" aria-hidden="true">?</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-row-staff">
        {strings.map((string) => (
          <div className="tab-string-row" key={string.number}>
            <span className="tab-string-label" aria-hidden="true">{string.label}</span>
            <div className="tab-string-track" data-track="" data-row={row.index} data-string={string.number} aria-hidden="true" />
          </div>
        ))}

        <div className="tab-row-lane tab-staff-lane">
          {Array.from({ length: row.bars.length + 1 }, (_, offset) => (
            <span className="tab-bar-line" style={{ left: percent(barLineX(offset)) }} aria-hidden="true" key={offset} />
          ))}
          {loopStartX !== null && <i className="tab-loop-marker" style={{ left: percent(loopStartX) }} aria-hidden="true">A</i>}
          {loopEndX !== null && <i className="tab-loop-marker" style={{ left: percent(loopEndX) }} aria-hidden="true">B</i>}
          {time !== null && canSeek && <span className="tab-playhead" style={{ left: percent(rowX(row, time)) }} aria-hidden="true" />}

          {notes.map(({ note, x, label, unsure }) => {
            const current = time !== null && note.startTime <= time && time < note.startTime + note.duration;
            const played = time !== null && !current && note.startTime + note.duration <= time;
            const inLoop = loop !== null && note.startTime >= loop.start && note.startTime < loop.end;
            return (
              <button
                className={`tab-note ${inLoop ? "in-loop" : ""} ${current ? "current" : ""} ${played ? "played" : ""} ${unsure ? "unsure" : ""} ${selectedNoteId === note.id ? "selected" : ""}`}
                type="button"
                data-note-id={note.id}
                style={{ left: percent(x), top: (note.string - 1) * STRING_HEIGHT + STRING_HEIGHT / 2 }}
                aria-label={label}
                aria-current={current || undefined}
                key={note.id}
              >
                {note.fret}
                {unsure && <span className="tab-flag" aria-hidden="true">?</span>}
              </button>
            );
          })}

          {addTarget && (
            <button
              className="tab-add-chip"
              type="button"
              style={{ left: `clamp(40px, ${percent(rowX(row, addTarget.time))}, calc(100% - 40px))`, top: (addTarget.string - 1) * STRING_HEIGHT + STRING_HEIGHT / 2 }}
              onClick={onAddNote}
            >
              + Add note
            </button>
          )}
        </div>
      </div>

      {popover}
    </div>
  );
}

export default memo(TabRow);
