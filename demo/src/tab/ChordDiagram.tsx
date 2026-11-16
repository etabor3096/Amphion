import { bassRootDescription, bassRootPositions, CHORD_SHAPES, guitarShapeDescription } from "../music/chords";
import type { Instrument } from "../mock/types";

const FRETS_SHOWN = 5;
const FRET_GAP = 20;
const STRING_GAP = 16;
const TOP = 26;
const LEFT = 14;

/**
 * Finger diagram for a chord. Guitar shows the chord shape; bass shows where the chord's bass
 * note sits in the first five frets. Strings run left to right from the lowest-pitched string.
 */
export default function ChordDiagram({ name, instrument }: { name: string; instrument: Instrument }) {
  const stringCount = instrument === "guitar" ? 6 : 4;
  // Frets per string, lowest-pitched string first. null = don't play.
  let frets: Array<number | null> | null;
  if (instrument === "guitar") {
    frets = CHORD_SHAPES[name] ?? null;
  } else {
    const positions = bassRootPositions(name);
    frets = positions.length
      ? [4, 3, 2, 1].map((string) => positions.find((position) => position.string === string)?.fret ?? null)
      : null;
  }
  const label = instrument === "guitar" ? guitarShapeDescription(name) : bassRootDescription(name);
  const width = LEFT * 2 + STRING_GAP * (stringCount - 1);
  const height = TOP + FRET_GAP * FRETS_SHOWN + 8;

  if (!frets) {
    return <p className="chord-diagram-missing">No diagram for {name} yet.</p>;
  }

  return (
    <svg className="chord-diagram" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <rect className="chord-diagram-nut" x={LEFT - 1} y={TOP - 3} width={STRING_GAP * (stringCount - 1) + 2} height={3} rx={1} />
      {Array.from({ length: FRETS_SHOWN }, (_, fret) => (
        <line key={`fret-${fret}`} x1={LEFT} x2={LEFT + STRING_GAP * (stringCount - 1)} y1={TOP + FRET_GAP * (fret + 1)} y2={TOP + FRET_GAP * (fret + 1)} />
      ))}
      {frets.map((fret, index) => {
        const x = LEFT + STRING_GAP * index;
        return (
          <g key={`string-${index}`}>
            <line x1={x} x2={x} y1={TOP} y2={TOP + FRET_GAP * FRETS_SHOWN} />
            {fret === null && instrument === "guitar" && <text x={x} y={TOP - 9} className="chord-diagram-mark">×</text>}
            {fret === 0 && <circle cx={x} cy={TOP - 12} r={4} className={instrument === "bass" ? "chord-diagram-open-root" : "chord-diagram-open"} />}
            {fret !== null && fret > 0 && <circle cx={x} cy={TOP + FRET_GAP * (fret - 0.5)} r={6} className="chord-diagram-dot" />}
          </g>
        );
      })}
    </svg>
  );
}
