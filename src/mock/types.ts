/**
 * Data shapes for the demo. They mirror the SDD's stored tab format (RC-20) so the real
 * Firestore-backed data can replace src/mock/ later without changing the screens.
 *
 * Every time is "song time": seconds from the start of the song's audio file (RC-18).
 */

export type Instrument = "guitar" | "bass";

export type SongStatus = "processing" | "ready" | "failed";

/** A song card in the Library. */
export interface LibrarySong {
  id: number;
  title: string;
  artist?: string;
  folder?: string;
  /** When the song was added (ms since epoch). The card's "Today" / "Sep 28" label is derived from it. */
  addedAt: number;
  /** Audio length as m:ss. */
  length: string;
  status: SongStatus;
  /** Which generated default artwork to show (1-4). */
  art: number;
  photo?: string;
  /**
   * False when the song was recorded or uploaded on another iPhone. The tab still opens,
   * but the audio only lives on that phone, so synced playback is unavailable (RC-19, OQ-03).
   */
  audioOnThisDevice: boolean;
}

/** One note in a tab. */
export interface TabNote {
  id: string;
  /** Song time when the note starts, in seconds. */
  startTime: number;
  /** How long the note lasts, in seconds. */
  duration: number;
  /** String number. 1 is the highest-pitched string (guitar high e, bass G). */
  string: number;
  fret: number;
  /** MIDI note number. Always equals the string's open pitch plus the fret. */
  pitch: number;
  /** How sure the analysis is, from 0 to 1. */
  confidence: number;
  /** True once the user changed or confirmed this note. Edited notes are never flagged. */
  edited: boolean;
}

/** A chord name shown in the thin line above the tab. */
export interface ChordSegment {
  id: string;
  startTime: number;
  endTime: number;
  name: string;
  confidence: number;
  edited: boolean;
}

export interface InstrumentTab {
  notes: TabNote[];
}

/** Everything the Song screen shows for a Ready song. */
export interface Transcription {
  songId: number;
  /** Length of the song's audio file, in seconds. */
  duration: number;
  /** null means the analysis could not tell; the UI shows "Unknown" (RC-11). */
  key: string | null;
  bpm: number | null;
  /** How far the recording sits from standard pitch, in cents (DD-08). null = Unknown. */
  tuningOffsetCents: number | null;
  beatsPerBar: number;
  /** Time of every beat. */
  beats: number[];
  /** Time of the first beat of every bar. */
  downbeats: number[];
  chords: ChordSegment[];
  guitar: InstrumentTab | null;
  /** null when no bass part was found in the recording. */
  bass: InstrumentTab | null;
}
