import { useState } from "react";
import type { CSSProperties } from "react";
import type { LoopRange, PlaybackClock } from "../playback/clock";
import { formatTime } from "./layout";

const SPEED_OPTIONS = [50, 60, 70, 75, 80, 90, 100];

interface PracticeBarProps {
  clock: PlaybackClock;
  time: number;
  playing: boolean;
  rate: number;
  loop: LoopRange | null;
  pendingLoopStart: number | null;
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

/** Pinned practice bar: play/pause, scrubber with times, speed (50-100%) and A-B loop (US-12 to US-14). */
export default function PracticeBar({ clock, time, playing, rate, loop, pendingLoopStart, onToggleLoop, onScrub }: PracticeBarProps) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const { duration } = clock;
  const speed = Math.round(rate * 100);
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
      <div className="speed-picker">
        <button className="practice-tool-button" type="button" aria-label={`Speed ${speed}%`} aria-expanded={speedOpen} onClick={() => setSpeedOpen(!speedOpen)}>
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
