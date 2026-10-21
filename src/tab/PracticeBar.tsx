import { useState } from "react";
import type { CSSProperties } from "react";
import type { LoopRange, PlaybackClock } from "../playback/clock";
import type { Instrument } from "../mock/types";
import { formatTime } from "./layout";
import type { Mix } from "./SyncedTab";

const SPEED_OPTIONS = [50, 60, 70, 75, 80, 90, 100];

interface PracticeBarProps {
  clock: PlaybackClock;
  time: number;
  playing: boolean;
  rate: number;
  loop: LoopRange | null;
  pendingLoopStart: number | null;
  /** The shown instrument: "Mute my part" mutes this one. */
  instrument: Instrument;
  mix: Mix;
  hasBass: boolean;
  onMixChange: (mix: Mix) => void;
  /** Back to the default mix, which follows the shown instrument. */
  onResetMix: () => void;
  onToggleLoop: () => void;
  onScrub: (time: number) => void;
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg>
  );
}

const INSTRUMENT_NAMES: Record<Instrument, string> = { guitar: "Guitar", bass: "Bass" };

function describeMix(mix: Mix, hasBass: boolean) {
  const heard = (["guitar", "bass"] as const).filter((part) => mix[part] > 0 && (part === "guitar" || hasBass));
  return heard.length ? `hearing ${heard.join(" and ")}` : "silent";
}

/** Pinned practice bar: play/pause, scrubber with times, speed (50-100%) and A-B loop (US-12 to US-14). */
export default function PracticeBar({ clock, time, playing, rate, loop, pendingLoopStart, instrument, mix, hasBass, onMixChange, onResetMix, onToggleLoop, onScrub }: PracticeBarProps) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const [mixOpen, setMixOpen] = useState(false);
  const { duration } = clock;
  const speed = Math.round(rate * 100);
  const other: Instrument = instrument === "guitar" ? "bass" : "guitar";
  const mutedMine = mix[instrument] === 0 && mix[other] === 1;
  const canMute = other === "guitar" || hasBass;
  const loopLabel = loop ? "Clear loop" : pendingLoopStart !== null ? "Set loop end (B) at the current bar" : "Set loop start (A) at the current bar";

  return (
    <section className="practice-controls compact-practice-controls" aria-label="Playback controls">
      <button className="song-play-button" type="button" aria-label={playing ? "Pause song" : "Play song"} onClick={() => (playing ? clock.pause() : clock.play())}>
        <PlayIcon playing={playing} />
      </button>
      <div className="song-scrubber">
        <div className="scrubber-track">
          {loop && (
            <span
              className="scrubber-loop"
              style={{ "--loop-start": `${(loop.start / duration) * 100}%`, "--loop-width": `${((loop.end - loop.start) / duration) * 100}%` } as CSSProperties}
            />
          )}
          <input
            aria-label="Song position"
            aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
            type="range"
            min="0"
            max={duration}
            step="0.01"
            value={time}
            onChange={(event) => onScrub(Number(event.target.value))}
          />
        </div>
        <div><time>{formatTime(time)}</time><time>{formatTime(duration)}</time></div>
      </div>
      <div className="speed-picker mix-picker">
        <button
          className={`practice-tool-button ${mutedMine ? "active" : ""}`}
          type="button"
          aria-label={`Mix: ${describeMix(mix, hasBass)}`}
          aria-expanded={mixOpen}
          onClick={() => {
            setMixOpen(!mixOpen);
            setSpeedOpen(false);
          }}
        >
          Mix
        </button>
        {mixOpen && (
          <div className="mix-sheet" role="dialog" aria-label="Mix">
            <button
              className="mix-mute-mine"
              type="button"
              aria-pressed={mutedMine}
              disabled={!canMute}
              onClick={() => (mutedMine ? onResetMix() : onMixChange({ ...mix, [instrument]: 0, [other]: 1 }))}
            >
              Mute my part
              <small>{canMute ? `Silences the ${instrument} so you can play it.` : "No bass part found"}</small>
            </button>
            {(["guitar", "bass"] as const).map((part) => {
              const missing = part === "bass" && !hasBass;
              const name = INSTRUMENT_NAMES[part];
              const percent = Math.round(mix[part] * 100);
              return (
                <div className={`mix-row ${missing ? "disabled" : ""}`} key={part}>
                  <strong>{name}</strong>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    aria-label={`${name} volume`}
                    aria-valuetext={`${percent}%`}
                    disabled={missing}
                    value={percent}
                    onChange={(event) => onMixChange({ ...mix, [part]: Number(event.target.value) / 100 })}
                  />
                  <button
                    className="mix-mute"
                    type="button"
                    aria-label={`Mute ${name}`}
                    aria-pressed={mix[part] === 0}
                    disabled={missing}
                    onClick={() => onMixChange({ ...mix, [part]: mix[part] === 0 ? 1 : 0 })}
                  >
                    {mix[part] === 0 ? "Muted" : "Mute"}
                  </button>
                  {missing && <small>No bass part found</small>}
                </div>
              );
            })}
            <p>Play along: mute your part and let Amphion play the rest.</p>
          </div>
        )}
      </div>
      <div className="speed-picker">
        <button className="practice-tool-button" type="button" aria-label={`Speed ${speed}%`} aria-expanded={speedOpen} onClick={() => {
            setSpeedOpen(!speedOpen);
            setMixOpen(false);
          }}>
          {speed}%
        </button>
        {speedOpen && (
          <div className="speed-menu" role="menu" aria-label="Playback speed">
            {SPEED_OPTIONS.map((option) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={speed === option}
                className={speed === option ? "selected" : ""}
                onClick={() => {
                  clock.setRate(option / 100);
                  setSpeedOpen(false);
                }}
                key={option}
              >
                {option}%
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className={`practice-tool-button loop-toggle ${loop ? "active" : ""} ${pendingLoopStart !== null ? "pending" : ""}`}
        type="button"
        aria-pressed={loop !== null}
        aria-label={loopLabel}
        onClick={onToggleLoop}
      >
        {pendingLoopStart !== null ? "Set B" : "A-B"}
      </button>
    </section>
  );
}
