import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { ChordSegment, Instrument, Transcription } from "../mock/types";
import type { LoopRange } from "../playback/clock";
import ChordDiagram from "./ChordDiagram";
import ChordPopover from "./ChordPopover";
import { isUnsure } from "./edits";
import { barLineX, BARS_PER_ROW, rowIndexAt, rowX } from "./layout";
import type { BarSpan, RowSpan } from "./layout";

interface ChordViewProps {
  transcription: Transcription;
  instrument: Instrument;
  bars: BarSpan[];
  rows: RowSpan[];
  /** Song time from the playback clock, for this frame. */
  time: number;
  /** False when the song's audio is not on this iPhone: the chords show, but nothing plays or seeks. */
  canSeek: boolean;
  loop: LoopRange | null;
  rowRef: (index: number, element: HTMLDivElement | null) => void;
  onSeek: (time: number) => void;
  onRenameChord: (chordId: string, name: string) => void;
}

interface BarChord {
  chord: ChordSegment;
  x: number;
  unsure: boolean;
}

const percent = (fraction: number) => `${fraction * 100}%`;

/** One chord name per distinct chord in the song, in order of first appearance. */
function distinctChordNames(chords: ChordSegment[]) {
  return [...new Set([...chords].sort((a, b) => a.startTime - b.startTime).map((chord) => chord.name))];
}

interface ChordStripProps {
  names: string[];
  instrument: Instrument;
  currentName: string | null;
}

/** Horizontally scrollable diagrams, one per distinct chord. Only re-renders when the playing chord changes. */
const ChordStrip = memo(function ChordStrip({ names, instrument, currentName }: ChordStripProps) {
  return (
    <ul className="chord-view-strip" aria-label="Chords in this song">
      {names.map((name) => (
        <li className={`chord-view-strip-item ${name === currentName ? "current" : ""}`} aria-current={name === currentName || undefined} key={name}>
          <ChordDiagram name={name} instrument={instrument} />
          <strong>{name}</strong>
        </li>
      ))}
    </ul>
  );
});

interface ChordRowProps {
  row: RowSpan;
  chords: BarChord[];
  /** Song time while the playhead is in this row, otherwise null (other rows then skip re-rendering). */
  time: number | null;
  canSeek: boolean;
  loop: LoopRange | null;
  openChordId: string | null;
  popover: ReactNode;
  rowRef: (index: number, element: HTMLDivElement | null) => void;
  onBarTap: (time: number) => void;
  onChordTap: (chordId: string) => void;
}

/** Two bars with their bar numbers, chord names placed by time within the bar, and the playhead. */
const ChordRow = memo(function ChordRow({ row, chords, time, canSeek, loop, openChordId, popover, rowRef, onBarTap, onChordTap }: ChordRowProps) {
  const firstBar = row.bars[0].index + 1;
  const lastBar = row.bars[row.bars.length - 1].index + 1;

  return (
    <div
      className="chord-view-row"
      ref={(element) => rowRef(row.index, element)}
      role="group"
      aria-label={firstBar === lastBar ? `Bar ${firstBar}` : `Bars ${firstBar} to ${lastBar}`}
    >
      <div className="chord-view-lane">
        {row.bars.map((bar, offset) => {
          const inLoop = loop !== null && bar.start >= loop.start - 0.001 && bar.end <= loop.end + 0.001;
          return (
            <div
              className={`chord-view-bar ${inLoop ? "in-loop" : ""}`}
              style={{ left: percent(barLineX(offset)), width: percent(1 / BARS_PER_ROW) }}
              key={bar.index}
            >
              <button
                className="tab-bar-number"
                type="button"
                onClick={() => onBarTap(bar.start)}
                disabled={!canSeek}
                aria-label={canSeek ? `Bar ${bar.index + 1}. Play from here` : `Bar ${bar.index + 1}`}
              >
                {bar.index + 1}
              </button>
            </div>
          );
        })}
        <span className="chord-view-bar-line" style={{ left: "100%" }} aria-hidden="true" />

        {time !== null && canSeek && <span className="tab-playhead chord-view-playhead" style={{ left: percent(rowX(row, time)) }} aria-hidden="true" />}

        {chords.map(({ chord, x, unsure }) => {
          const current = time !== null && chord.startTime <= time && time < chord.endTime;
          return (
            <button
              className={`chord-view-chord ${unsure ? "unsure" : ""} ${current ? "current" : ""} ${openChordId === chord.id ? "open" : ""}`}
              type="button"
              style={{ left: percent(x) }}
              aria-expanded={openChordId === chord.id}
              aria-current={current || undefined}
              aria-label={`Chord ${chord.name}${unsure ? ", not sure" : ""}. Show finger diagram`}
              onClick={() => onChordTap(chord.id)}
              key={chord.id}
            >
              {chord.name}
              {unsure && <span className="tab-flag" aria-hidden="true">?</span>}
            </button>
          );
        })}
      </div>

      {popover}
    </div>
  );
});

/**
 * The Chords view: a strip of one diagram per distinct chord, then the progression in the same
 * bar rows as the tab. It reads the same per-frame `time` as the tab (RC-18) and has no timer of its own.
 * Tap a chord → diagram, "Play from here" and "Change chord" · tap a bar number → jump to the bar.
 */
export default function ChordView({ transcription, instrument, bars, rows, time, canSeek, loop, rowRef, onSeek, onRenameChord }: ChordViewProps) {
  const [openChordId, setOpenChordId] = useState<string | null>(null);
  const { chords } = transcription;

  const names = useMemo(() => distinctChordNames(chords), [chords]);

  const rowChords = useMemo(() => {
    const grouped: BarChord[][] = rows.map(() => []);
    for (const chord of chords) {
      const rowIndex = rowIndexAt(rows, chord.startTime);
      grouped[rowIndex].push({ chord, x: rowX(rows[rowIndex], chord.startTime), unsure: isUnsure(chord) });
    }
    return grouped;
  }, [chords, rows]);

  // Callbacks handed to the memoized rows read the latest props through a ref, so they never change.
  const latest = useRef({ onSeek });
  latest.current = { onSeek };

  const handleBarTap = useCallback((barStart: number) => {
    setOpenChordId(null);
    latest.current.onSeek(barStart);
  }, []);

  const handleChordTap = useCallback((chordId: string) => {
    setOpenChordId((open) => (open === chordId ? null : chordId));
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") setOpenChordId(null);
  };

  const currentRow = rowIndexAt(rows, time);
  const currentChord = canSeek ? chords.find((chord) => chord.startTime <= time && time < chord.endTime) : undefined;
  const openChord = openChordId ? chords.find((chord) => chord.id === openChordId) : undefined;
  const openChordRow = openChord ? rowIndexAt(rows, openChord.startTime) : -1;

  return (
    <div className="chord-view">
      <ChordStrip names={names} instrument={instrument} currentName={currentChord?.name ?? null} />

      <div className="chord-view-score" onKeyDown={onKeyDown}>
        {rows.map((row) => (
          <ChordRow
            key={row.index}
            row={row}
            chords={rowChords[row.index]}
            time={canSeek && row.index === currentRow ? time : null}
            canSeek={canSeek}
            loop={loop}
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
          />
        ))}
      </div>
    </div>
  );
}
