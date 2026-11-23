import type { LoopRange, PlaybackClock } from "./clock";

/** The parts of an HTMLAudioElement the clock uses, so tests can stand in for the browser. */
export interface AudioLike {
  currentTime: number;
  playbackRate: number;
  preservesPitch?: boolean;
  readonly paused: boolean;
  readonly duration: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Events that mean play, pause, seek, speed or the end changed. They tell listeners to re-read; they never move song time. */
const CHANGE_EVENTS = ["play", "pause", "seeked", "ratechange", "ended"] as const;

export const MIN_RATE = 0.5;
export const MAX_RATE = 1;

/**
 * Song time read from the audio file's own playback position (RC-18, DD-14, rule A1).
 *
 * `currentTime()` returns what the audio element reports and nothing else: there is no timer,
 * counter or animation frame in this class, so the playhead can only be where the sound is.
 * Speed keeps the pitch (`preservesPitch`). The A-B loop is checked on each read, so it
 * jumps back within one screen refresh of reaching B.
 */
export class AudioFileClock implements PlaybackClock {
  private loopRange: LoopRange | null = null;
  /** The position at the previous read. A loop jump needs a read before B followed by one at or after it. */
  private lastRead = 0;
  private readonly listeners = new Set<() => void>();
  private readonly onChange = () => this.emit();

  /**
   * @param audio the loaded audio file
   * @param fallbackDuration the length to report until the audio has loaded its own
   * @param onDispose runs once when the clock is disposed (the owner releases the file's object URL here)
   */
  constructor(
    private readonly audio: AudioLike,
    private readonly fallbackDuration: number,
    private readonly onDispose?: () => void,
  ) {
    audio.preservesPitch = true;
    for (const type of CHANGE_EVENTS) audio.addEventListener(type, this.onChange);
  }

  get duration() {
    return Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : this.fallbackDuration;
  }

  currentTime() {
    const time = this.audio.currentTime;
    const loop = this.loopRange;
    if (loop && !this.audio.paused && this.lastRead < loop.end && time >= loop.end) {
      const jumped = loop.start + ((time - loop.end) % (loop.end - loop.start));
      this.audio.currentTime = jumped;
      this.lastRead = jumped;
      return jumped;
    }
    this.lastRead = time;
    return time;
  }

  /** Bluetooth output delay is corrected by #31, not here. */
  outputLatency() {
    return 0;
  }

  isPlaying() {
    return !this.audio.paused;
  }

  rate() {
    return this.audio.playbackRate;
  }

  loop() {
    return this.loopRange;
  }

  play() {
    if (!this.audio.paused) return;
    if (this.audio.currentTime >= this.duration - 0.01) this.seek(this.loopRange?.start ?? 0);
    // Browsers can refuse to start audio (no tap yet, file unreadable); the state then simply stays paused.
    Promise.resolve(this.audio.play()).catch(() => this.emit());
  }

  pause() {
    this.audio.pause();
  }

  seek(time: number) {
    const target = Math.min(this.duration, Math.max(0, time));
    this.audio.currentTime = target;
    this.lastRead = target;
    this.emit();
  }

  setRate(rate: number) {
    this.audio.preservesPitch = true;
    this.audio.playbackRate = Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
    this.emit();
  }

  setLoop(loop: LoopRange | null) {
    this.loopRange = loop;
    this.lastRead = this.audio.currentTime;
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stops the audio and lets go of the file. The clock cannot be used afterwards. */
  dispose() {
    this.audio.pause();
    for (const type of CHANGE_EVENTS) this.audio.removeEventListener(type, this.onChange);
    this.listeners.clear();
    this.onDispose?.();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
