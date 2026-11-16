import type { Transcription } from "../mock/types";

/** Two bars per tab row. */
export const BARS_PER_ROW = 2;
/** Notes snap to an eighth-note grid when added or tapped on empty space. */
export const SLOTS_PER_BEAT = 2;
/** Fraction of each bar kept clear next to its bar lines so fret numbers never sit on them. */
const BAR_INSET = 0.07;

export interface BarSpan {
  index: number;
  start: number;
  end: number;
}

export interface RowSpan {
  index: number;
  bars: BarSpan[];
  start: number;
  end: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function getBars(transcription: Transcription): BarSpan[] {
  const { downbeats, duration } = transcription;
  return downbeats.map((start, index) => ({ index, start, end: downbeats[index + 1] ?? duration }));
}

export function getRows(bars: BarSpan[]): RowSpan[] {
  const rows: RowSpan[] = [];
  for (let index = 0; index * BARS_PER_ROW < bars.length; index += 1) {
    const rowBars = bars.slice(index * BARS_PER_ROW, (index + 1) * BARS_PER_ROW);
    rows.push({ index, bars: rowBars, start: rowBars[0].start, end: rowBars[rowBars.length - 1].end });
  }
  return rows;
}

export function barIndexAt(bars: BarSpan[], time: number) {
  const index = bars.findIndex((bar) => time < bar.end);
  return index === -1 ? bars.length - 1 : index;
}

export function rowIndexAt(rows: RowSpan[], time: number) {
  const index = rows.findIndex((row) => time < row.end);
  return index === -1 ? rows.length - 1 : index;
}

/**
 * Horizontal position of a song time inside its row: 0 is the row's first bar line, 1 its last.
 * Notes and the playhead use this same mapping, so the playhead crosses a note exactly when it sounds.
 */
export function rowX(row: RowSpan, time: number) {
  let barOffset = row.bars.findIndex((bar) => time < bar.end);
  if (barOffset === -1) barOffset = row.bars.length - 1;
  const bar = row.bars[barOffset];
  const progress = clamp((time - bar.start) / (bar.end - bar.start), 0, 1);
  return (barOffset + BAR_INSET + progress * (1 - 2 * BAR_INSET)) / BARS_PER_ROW;
}

/** Position of the bar line before bar `offset` in the row (offset = row.bars.length is the closing line). */
export function barLineX(offset: number) {
  return offset / BARS_PER_ROW;
}

/** Inverse of rowX, snapped to the nearest eighth note. Returns null past the row's last bar. */
export function snappedTimeAtX(row: RowSpan, x: number, beatsPerBar: number) {
  const barOffset = Math.floor(clamp(x, 0, 0.9999) * BARS_PER_ROW);
  const bar = row.bars[barOffset];
  if (!bar) return null;
  const local = x * BARS_PER_ROW - barOffset;
  const progress = clamp((local - BAR_INSET) / (1 - 2 * BAR_INSET), 0, 1);
  const slots = beatsPerBar * SLOTS_PER_BEAT;
  const slot = Math.min(slots - 1, Math.round(progress * slots));
  return bar.start + (slot * (bar.end - bar.start)) / slots;
}

/** Length of one eighth-note slot in the bar that contains `time`. */
export function slotLengthAt(bars: BarSpan[], time: number, beatsPerBar: number) {
  const bar = bars[barIndexAt(bars, time)];
  return (bar.end - bar.start) / (beatsPerBar * SLOTS_PER_BEAT);
}

/** "Bar 3, beat 2" or "Bar 3, beat 2 and" (the eighth note between beats). */
export function describePosition(bars: BarSpan[], time: number, beatsPerBar: number) {
  const bar = bars[barIndexAt(bars, time)];
  const beats = ((time - bar.start) / (bar.end - bar.start)) * beatsPerBar;
  const beat = Math.floor(beats + 0.001);
  const between = beats - beat > 0.25;
  return `Bar ${bar.index + 1}, beat ${beat + 1}${between ? " and" : ""}`;
}

export function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
