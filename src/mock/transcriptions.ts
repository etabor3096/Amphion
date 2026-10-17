import { CHORD_SHAPES, chordBassPitchClass } from "../music/chords";
import { pitchAt, TUNINGS } from "../music/tuning";
import type { ChordSegment, InstrumentTab, TabNote, Transcription } from "./types";

/*
 * Mock tab data for the Ready songs. Every song is 8 bars of 4/4 at 96 BPM (20 seconds),
 * built from simple open-position chord shapes (frets 0-5). Instead of hand-typing ~400
 * notes, each song lists its chords per bar plus a picking pattern, and the builder below
 * turns that into the stored note list (start time, length, string, fret, pitch,
 * confidence, edited), the same shape the real pipeline will write (RC-20).
 */

const BPM = 96;
const BEATS_PER_BAR = 4;
const BEAT = 60 / BPM; // 0.625 s
const BAR = BEAT * BEATS_PER_BAR; // 2.5 s
const EIGHTH = BEAT / 2;

/** [beat within the bar (0-3), chord name] */
type ChordChange = [beat: number, name: string];
type Role = "root" | "alt" | 1 | 2 | 3;
type GuitarPattern = "travis" | "rolling" | "strum";
type BassPattern = "pulse" | "drive";

/** Eighth-note picking patterns. "root" is the chord's bass string, "alt" the alternating bass. */
const GUITAR_PATTERNS: Record<GuitarPattern, Array<{ eighth: number; roles: Role[]; length: number }>> = {
  travis: [
    { eighth: 0, roles: ["root", 1], length: 1 },
    { eighth: 1, roles: [3], length: 1 },
    { eighth: 2, roles: [2], length: 1 },
    { eighth: 3, roles: [3], length: 1 },
    { eighth: 4, roles: ["alt", 1], length: 1 },
    { eighth: 5, roles: [3], length: 1 },
    { eighth: 6, roles: [2], length: 1 },
    { eighth: 7, roles: [3], length: 1 },
  ],
  rolling: [
    { eighth: 0, roles: ["root"], length: 1 },
    { eighth: 1, roles: [3], length: 1 },
    { eighth: 2, roles: [2], length: 1 },
    { eighth: 3, roles: [1], length: 1 },
    { eighth: 4, roles: [2], length: 1 },
    { eighth: 5, roles: [3], length: 1 },
    { eighth: 6, roles: ["alt"], length: 1 },
    { eighth: 7, roles: [3], length: 1 },
  ],
  strum: [
    { eighth: 0, roles: ["root", 3, 2, 1], length: 2 },
    { eighth: 2, roles: [3, 2, 1], length: 1 },
    { eighth: 3, roles: [3, 2, 1], length: 1 },
    { eighth: 4, roles: ["alt", 3, 2, 1], length: 2 },
    { eighth: 6, roles: [3, 2, 1], length: 1 },
    { eighth: 7, roles: [3, 2, 1], length: 1 },
  ],
};

const BASS_PATTERNS: Record<BassPattern, Array<{ eighth: number; degree: "root" | "fifth" | "octave"; length: number }>> = {
  pulse: [
    { eighth: 0, degree: "root", length: 2 },
    { eighth: 2, degree: "fifth", length: 2 },
    { eighth: 4, degree: "octave", length: 2 },
    { eighth: 6, degree: "fifth", length: 2 },
  ],
  drive: [
    { eighth: 0, degree: "root", length: 3 },
    { eighth: 3, degree: "root", length: 1 },
    { eighth: 4, degree: "fifth", length: 2 },
    { eighth: 6, degree: "root", length: 2 },
  ],
};

interface SongSpec {
  songId: number;
  key: string | null;
  tuningOffsetCents: number | null;
  bars: ChordChange[][];
  guitar: GuitarPattern;
  bass: BassPattern | null;
  seed: number;
  /** Guitar notes the analysis is unsure about, keyed "bar:eighth:string" (bar is 1-based). */
  unsureGuitar?: Record<string, number>;
  /** Bass notes the analysis is unsure about, keyed "bar:eighth". */
  unsureBass?: Record<string, number>;
  /** Chord names the analysis is unsure about, keyed by chord index. */
  unsureChords?: Record<number, number>;
}

/** Small seeded random generator so confidences look natural but never change between reloads. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;

function chordAt(bar: ChordChange[], beat: number) {
  let name = bar[0][1];
  for (const [changeBeat, changeName] of bar) if (changeBeat <= beat) name = changeName;
  return name;
}

/** String number → fret for a guitar chord shape (string 1 = high e). */
function shapeFrets(name: string) {
  const shape = CHORD_SHAPES[name];
  if (!shape) throw new Error(`No chord shape for ${name}`);
  const frets = new Map<number, number>();
  shape.forEach((fret, index) => {
    if (fret !== null) frets.set(6 - index, fret);
  });
  return frets;
}

function buildGuitar(spec: SongSpec, random: () => number): InstrumentTab {
  const notes: TabNote[] = [];
  spec.bars.forEach((bar, barIndex) => {
    for (const step of GUITAR_PATTERNS[spec.guitar]) {
      const frets = shapeFrets(chordAt(bar, step.eighth / 2));
      const rootString = Math.max(...frets.keys());
      const altString = rootString === 6 ? 4 : rootString - 1;
      const strings = new Set<number>();
      for (const role of step.roles) {
        const string = role === "root" ? rootString : role === "alt" ? altString : role;
        if (frets.has(string)) strings.add(string);
      }
      for (const string of [...strings].sort((a, b) => b - a)) {
        const fret = frets.get(string)!;
        const unsure = spec.unsureGuitar?.[`${barIndex + 1}:${step.eighth}:${string}`];
        notes.push({
          id: `s${spec.songId}-g${notes.length}`,
          startTime: round(barIndex * BAR + step.eighth * EIGHTH),
          duration: round(step.length * EIGHTH * 0.9),
          string,
          fret,
          pitch: pitchAt("guitar", string, fret),
          confidence: unsure ?? round(0.74 + random() * 0.25, 2),
          edited: false,
        });
      }
    }
  });
  return { notes };
}

/**
 * Picks the easiest place on the bass for a pitch: open strings first, then the lowest fret
 * within the first five frets (DD-15). Returns null when nothing is in reach.
 */
function easiestBassPosition(pitch: number) {
  let best: { string: number; fret: number } | null = null;
  for (const string of TUNINGS.bass) {
    const fret = pitch - string.openPitch;
    if (fret < 0 || fret > 5) continue;
    if (!best || fret < best.fret) best = { string: string.number, fret };
  }
  return best;
}

function buildBass(spec: SongSpec, pattern: BassPattern, random: () => number): InstrumentTab {
  const notes: TabNote[] = [];
  spec.bars.forEach((bar, barIndex) => {
    for (const step of BASS_PATTERNS[pattern]) {
      const pitchClass = chordBassPitchClass(chordAt(bar, step.eighth / 2));
      if (pitchClass === null) continue;
      const root = 28 + ((pitchClass - 4 + 12) % 12); // lowest octave starting at E1
      const wanted = step.degree === "root" ? root : step.degree === "fifth" ? root + 7 : root + 12;
      const pitch = easiestBassPosition(wanted) ? wanted : root;
      const position = easiestBassPosition(pitch)!;
      const unsure = spec.unsureBass?.[`${barIndex + 1}:${step.eighth}`];
      notes.push({
        id: `s${spec.songId}-b${notes.length}`,
        startTime: round(barIndex * BAR + step.eighth * EIGHTH),
        duration: round(step.length * EIGHTH * 0.92),
        string: position.string,
        fret: position.fret,
        pitch,
        confidence: unsure ?? round(0.76 + random() * 0.23, 2),
        edited: false,
      });
    }
  });
  return { notes };
}

function buildChords(spec: SongSpec, random: () => number, duration: number): ChordSegment[] {
  const starts: Array<{ time: number; name: string }> = [];
  spec.bars.forEach((bar, barIndex) => {
    for (const [beat, name] of bar) starts.push({ time: round(barIndex * BAR + beat * BEAT), name });
  });
  return starts.map((start, index) => ({
    id: `s${spec.songId}-c${index}`,
    startTime: start.time,
    endTime: starts[index + 1]?.time ?? duration,
    name: start.name,
    confidence: spec.unsureChords?.[index] ?? round(0.8 + random() * 0.18, 2),
    edited: false,
  }));
}

function buildTranscription(spec: SongSpec): Transcription {
  const random = seededRandom(spec.seed);
  const barCount = spec.bars.length;
  const duration = round(barCount * BAR);
  return {
    songId: spec.songId,
    duration,
    key: spec.key,
    bpm: BPM,
    tuningOffsetCents: spec.tuningOffsetCents,
    beatsPerBar: BEATS_PER_BAR,
    beats: Array.from({ length: barCount * BEATS_PER_BAR }, (_, index) => round(index * BEAT)),
    downbeats: Array.from({ length: barCount }, (_, index) => round(index * BAR)),
    chords: buildChords(spec, random, duration),
    guitar: buildGuitar(spec, random),
    bass: spec.bass ? buildBass(spec, spec.bass, random) : null,
  };
}

const SPECS: SongSpec[] = [
  {
    // A few unsure notes and one unsure chord, with guitar and bass.
    songId: 2,
    key: "G major",
    tuningOffsetCents: 0,
    bars: [[[0, "G"]], [[0, "Em"]], [[0, "C"]], [[0, "D"]], [[0, "G"]], [[0, "Em"]], [[0, "C"], [2, "D"]], [[0, "G"]]],
    guitar: "travis",
    bass: "pulse",
    seed: 11,
    unsureGuitar: { "3:6:2": 0.46, "6:3:3": 0.52, "7:5:3": 0.41 },
    unsureBass: { "4:4": 0.5 },
    unsureChords: { 3: 0.48 },
  },
  {
    // No bass part was found in this recording.
    songId: 3,
    key: "A minor",
    tuningOffsetCents: -15,
    bars: [[[0, "Am"]], [[0, "F"]], [[0, "C"]], [[0, "G"]], [[0, "Am"]], [[0, "F"]], [[0, "C"]], [[0, "G"], [2, "E"]]],
    guitar: "rolling",
    bass: null,
    seed: 23,
    unsureGuitar: { "2:3:1": 0.44, "5:5:3": 0.55, "8:6:4": 0.38 },
    unsureChords: { 1: 0.52 },
  },
  {
    // Added on another iPhone, so its audio is not on this one (RC-19). Tuning could not be measured.
    songId: 5,
    key: "E minor",
    tuningOffsetCents: null,
    bars: [[[0, "Em"]], [[0, "C"]], [[0, "G"]], [[0, "D"]], [[0, "Em"]], [[0, "C"]], [[0, "G"]], [[0, "D/F♯"]]],
    guitar: "strum",
    bass: "pulse",
    seed: 37,
    unsureGuitar: { "3:2:2": 0.5, "6:7:1": 0.57 },
    unsureBass: { "5:6": 0.45 },
  },
  {
    // Everything confident: shows that a clean song has no "?" markers (US-10).
    songId: 6,
    key: "D major",
    tuningOffsetCents: 4,
    bars: [[[0, "D"]], [[0, "G"]], [[0, "A"]], [[0, "D"]], [[0, "Bm"]], [[0, "G"]], [[0, "A"]], [[0, "D"]]],
    guitar: "rolling",
    bass: "drive",
    seed: 41,
  },
];

export const INITIAL_TRANSCRIPTIONS: Transcription[] = SPECS.map(buildTranscription);
