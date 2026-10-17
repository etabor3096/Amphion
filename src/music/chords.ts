import { pitchClassName, TUNINGS } from "./tuning";

/**
 * Guitar chord shapes for the finger diagrams. Frets are listed from the low E string
 * (string 6) to the high e string (string 1); null means "don't play this string".
 */
export const CHORD_SHAPES: Record<string, Array<number | null>> = {
  A: [null, 0, 2, 2, 2, 0],
  Am: [null, 0, 2, 2, 1, 0],
  A7: [null, 0, 2, 0, 2, 0],
  Am7: [null, 0, 2, 0, 1, 0],
  Asus2: [null, 0, 2, 2, 0, 0],
  Bm: [null, 2, 4, 4, 3, 2],
  B7: [null, 2, 1, 2, 0, 2],
  C: [null, 3, 2, 0, 1, 0],
  Cadd9: [null, 3, 2, 0, 3, 0],
  D: [null, null, 0, 2, 3, 2],
  Dm: [null, null, 0, 2, 3, 1],
  D7: [null, null, 0, 2, 1, 2],
  Dsus4: [null, null, 0, 2, 3, 3],
  "D/F♯": [2, null, 0, 2, 3, 2],
  E: [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  E7: [0, 2, 0, 1, 0, 0],
  Em7: [0, 2, 0, 0, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  Fmaj7: [null, null, 3, 2, 1, 0],
  G: [3, 2, 0, 0, 0, 3],
  G7: [3, 2, 0, 0, 0, 1],
  "G/B": [null, 2, 0, 0, 0, 3],
};

/** Chord names offered in the "Change chord" picker. */
export const CHORD_PICKER_OPTIONS = Object.keys(CHORD_SHAPES);

const LETTER_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

interface ParsedChord {
  letter: string;
  accidental: "" | "♯" | "♭";
  quality: string;
  bassNote?: string;
}

function parseChord(name: string): ParsedChord | null {
  const match = /^([A-G])([♯#♭b]?)([^/]*)(?:\/([A-G][♯#♭b]?))?$/.exec(name.trim());
  if (!match) return null;
  const accidental = match[2] === "#" || match[2] === "♯" ? "♯" : match[2] === "b" || match[2] === "♭" ? "♭" : "";
  return { letter: match[1], accidental, quality: match[3], bassNote: match[4] };
}

function notePitchClass(letter: string, accidental: string) {
  const offset = accidental === "♯" || accidental === "#" ? 1 : accidental === "♭" || accidental === "b" ? -1 : 0;
  return (LETTER_PITCH[letter] + offset + 12) % 12;
}

/** Pitch class (0 = C) of the note a bass player should play: the root, or the note after a slash. */
export function chordBassPitchClass(name: string): number | null {
  const parsed = parseChord(name);
  if (!parsed) return null;
  if (parsed.bassNote) return notePitchClass(parsed.bassNote[0], parsed.bassNote.slice(1));
  return notePitchClass(parsed.letter, parsed.accidental);
}

const QUALITY_WORDS: Record<string, string> = {
  "": "major",
  m: "minor",
  "7": "seven",
  m7: "minor seven",
  maj7: "major seven",
  sus2: "suspended second",
  sus4: "suspended fourth",
  add9: "add nine",
  dim: "diminished",
  aug: "augmented",
};

function spokenNote(letter: string, accidental: string) {
  return `${letter}${accidental === "♯" || accidental === "#" ? " sharp" : accidental === "♭" || accidental === "b" ? " flat" : ""}`;
}

/** "Em7" → "E minor seven", "D/F♯" → "D major over F sharp". */
export function spokenChordName(name: string) {
  const parsed = parseChord(name);
  if (!parsed) return name;
  const quality = QUALITY_WORDS[parsed.quality] ?? parsed.quality;
  const over = parsed.bassNote ? ` over ${spokenNote(parsed.bassNote[0], parsed.bassNote.slice(1))}` : "";
  return `${spokenNote(parsed.letter, parsed.accidental)} ${quality}${over}`;
}

/** Text alternative for a guitar diagram, e.g. "G major, open position" (RC-12). */
export function guitarShapeDescription(name: string) {
  const shape = CHORD_SHAPES[name];
  if (!shape) return `${spokenChordName(name)}, no diagram available`;
  const played = shape.filter((fret): fret is number => fret !== null);
  const isOpen = played.some((fret) => fret === 0);
  return isOpen
    ? `${spokenChordName(name)}, open position`
    : `${spokenChordName(name)}, barre chord at fret ${Math.min(...played)}`;
}

/** Where a bass player can find this chord's bass note in the first five frets. */
export function bassRootPositions(name: string) {
  const pitchClass = chordBassPitchClass(name);
  if (pitchClass === null) return [];
  return TUNINGS.bass
    .map((string) => ({ string: string.number, fret: (pitchClass - (string.openPitch % 12) + 12) % 12 }))
    .filter((position) => position.fret <= 5);
}

export function bassRootDescription(name: string) {
  const pitchClass = chordBassPitchClass(name);
  if (pitchClass === null) return `${name}, no diagram available`;
  const positions = bassRootPositions(name)
    .map((position) => `${TUNINGS.bass[position.string - 1].spoken} ${position.fret === 0 ? "open" : `fret ${position.fret}`}`)
    .join(", or ");
  return `${spokenChordName(name)}, bass note ${pitchClassName(pitchClass).replace("♯", " sharp")}: ${positions}`;
}
