import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import schema from "../../../pipeline/rc20.schema.json";
import type { ChordSegment, InstrumentTab, TabNote, Transcription } from "../mock/types";

/*
 * Reads the pipeline's RC-20 tab data (pipeline/rc20.schema.json, schema version 1) and turns it
 * into the Transcription the Song screen draws. The schema file is the one the pipeline checks its
 * own output against, so the viewer and the pipeline cannot disagree about the format (A8).
 */

/** A note as the pipeline writes it. `string` and `fret` are null for a pitch the instrument cannot play. */
export interface Rc20Note {
  id: string;
  startTime: number;
  duration: number;
  string: number | null;
  fret: number | null;
  pitch: number;
  confidence: number;
  edited: boolean;
}

export interface Rc20 {
  schemaVersion: 1;
  /** Lowercase hex SHA-256 of the exact audio file that was analyzed (RC-19). */
  audioSha256: string;
  duration: number;
  key: string | null;
  bpm: number | null;
  tuningOffsetCents: number | null;
  beatsPerBar: number | null;
  beats: number[];
  downbeats: number[];
  /** `confidence` is null when the chord recognizer gives no score. */
  chords: Array<Omit<ChordSegment, "confidence"> & { confidence: number | null }>;
  guitar: { notes: Rc20Note[] } | null;
  bass: { notes: Rc20Note[] } | null;
}

export type ParseResult = { ok: true; data: Rc20 } | { ok: false; error: string };

const ajv = new Ajv2020({ allErrors: false, strict: false });
const validate = ajv.compile<Rc20>(schema);

const FIELD_NAMES: Record<string, string> = {
  audioSha256: "audio fingerprint",
  tuningOffsetCents: "tuning offset",
  beatsPerBar: "beats per bar",
  startTime: "start time",
};

/** "/guitar/notes/3/confidence" becomes "guitar, note 4, confidence". */
function describePath(path: string) {
  const parts = path.split("/").slice(1);
  const words: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === "notes") continue;
    if (/^\d+$/.test(part)) {
      const owner = parts[i - 1];
      const noun = owner === "notes" ? "note" : owner === "chords" ? "chord" : owner === "beats" ? "beat" : owner === "downbeats" ? "bar" : "item";
      words.push(`${noun} ${Number(part) + 1}`);
    } else {
      words.push(FIELD_NAMES[part] ?? part);
    }
  }
  return words.join(", ");
}

function describeError(error: ErrorObject) {
  const where = describePath(error.instancePath);
  if (error.keyword === "required") return `${where ? `${where}: ` : ""}the field "${(error.params as { missingProperty: string }).missingProperty}" is missing`;
  if (error.keyword === "additionalProperties") return `${where ? `${where}: ` : ""}it has an unexpected field "${(error.params as { additionalProperty: string }).additionalProperty}"`;
  return `${where || "the file"} ${error.message ?? "is not valid"}`;
}

/** Parses and validates the text of an RC-20 file. The error is written for a person to read. */
export function parseRc20(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON, so it can't be a tab file from the Amphion pipeline." };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "This isn't a tab file from the Amphion pipeline: expected a JSON object." };
  }
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (version !== undefined && version !== 1) {
    return { ok: false, error: `This tab file uses format version ${String(version)}. This viewer reads version 1.` };
  }

  if (!validate(value)) {
    // A choice between shapes (oneOf, such as "null or a tab") reports every branch's complaint.
    // The deepest one points at the actual bad value, so say that one.
    const errors = (validate.errors ?? []).filter((e) => e.keyword !== "oneOf");
    const first = errors.reduce<ErrorObject | undefined>((best, e) => (!best || e.instancePath.length > best.instancePath.length ? e : best), undefined);
    return { ok: false, error: `This tab file doesn't match the Amphion format: ${first ? describeError(first) : "unknown problem"}.` };
  }
  if (value.downbeats.length === 0) {
    return { ok: false, error: "This tab file has no bars (the analysis found no beat grid), so there is no tab to draw." };
  }
  return { ok: true, data: value };
}

const FALLBACK_BEATS_PER_BAR = 4;

export interface Conversion {
  transcription: Transcription;
  /** Notes the pipeline kept but could not place on a string, so the tab cannot draw them. */
  unplayableNotes: number;
}

function toTab(tab: { notes: Rc20Note[] } | null): { tab: InstrumentTab | null; dropped: number } {
  if (!tab) return { tab: null, dropped: 0 };
  const notes: TabNote[] = [];
  for (const note of tab.notes) {
    if (note.string === null || note.fret === null) continue;
    notes.push({ ...note, string: note.string, fret: note.fret });
  }
  return { tab: { notes }, dropped: tab.notes.length - notes.length };
}

/**
 * Turns validated RC-20 data into the Transcription the Song screen draws.
 * - A note with no string and fret (a pitch outside the instrument's range) cannot be drawn; it is counted, not hidden.
 * - A chord with no confidence score is not flagged: chord flagging is decided in P6-01 (OQ-01).
 * - `beatsPerBar` is null when no full bar was found; 4 is used only to snap taps on the tab.
 */
export function toTranscription(rc20: Rc20, songId: number): Conversion {
  const guitar = toTab(rc20.guitar);
  const bass = toTab(rc20.bass);
  return {
    unplayableNotes: guitar.dropped + bass.dropped,
    transcription: {
      songId,
      duration: rc20.duration,
      key: rc20.key,
      bpm: rc20.bpm,
      tuningOffsetCents: rc20.tuningOffsetCents,
      beatsPerBar: rc20.beatsPerBar ?? FALLBACK_BEATS_PER_BAR,
      beats: rc20.beats,
      downbeats: rc20.downbeats,
      chords: rc20.chords.map((chord) => ({ ...chord, confidence: chord.confidence ?? 1 })),
      guitar: guitar.tab,
      bass: bass.tab,
    },
  };
}
