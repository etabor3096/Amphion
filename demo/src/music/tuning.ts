import type { Instrument } from "../mock/types";

export interface TabString {
  /** 1 is the highest-pitched string. */
  number: number;
  /** Label at the left of the tab line. */
  label: string;
  /** Name read aloud by VoiceOver. */
  spoken: string;
  /** MIDI note number of the open string. */
  openPitch: number;
}

/** Standard tuning, listed top line first (string 1 = highest pitch). */
export const TUNINGS: Record<Instrument, TabString[]> = {
  guitar: [
    { number: 1, label: "e", spoken: "high E string", openPitch: 64 },
    { number: 2, label: "B", spoken: "B string", openPitch: 59 },
    { number: 3, label: "G", spoken: "G string", openPitch: 55 },
    { number: 4, label: "D", spoken: "D string", openPitch: 50 },
    { number: 5, label: "A", spoken: "A string", openPitch: 45 },
    { number: 6, label: "E", spoken: "low E string", openPitch: 40 },
  ],
  bass: [
    { number: 1, label: "G", spoken: "G string", openPitch: 43 },
    { number: 2, label: "D", spoken: "D string", openPitch: 38 },
    { number: 3, label: "A", spoken: "A string", openPitch: 33 },
    { number: 4, label: "E", spoken: "E string", openPitch: 28 },
  ],
};

export const MAX_FRET = 20;

export function tabString(instrument: Instrument, string: number): TabString {
  return TUNINGS[instrument][string - 1];
}

export function pitchAt(instrument: Instrument, string: number, fret: number) {
  return tabString(instrument, string).openPitch + fret;
}

/** Every other string and fret that plays the same pitch, within the playable fret range. */
export function samePitchPositions(instrument: Instrument, pitch: number, excludeString: number) {
  return TUNINGS[instrument]
    .filter((candidate) => candidate.number !== excludeString)
    .map((candidate) => ({ string: candidate.number, fret: pitch - candidate.openPitch }))
    .filter((position) => position.fret >= 0 && position.fret <= MAX_FRET);
}

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** "E3", "F♯2" … */
export function pitchName(pitch: number) {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function pitchClassName(pitchClass: number) {
  return NOTE_NAMES[((pitchClass % 12) + 12) % 12];
}
