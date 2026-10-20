import type { Instrument, TabNote } from "../mock/types";

export interface LoopRange {
  start: number;
  end: number;
}

/**
 * The one clock for synced playback (RC-18, DD-14).
 *
 * "Song time" is seconds from the start of the song's audio file. The Song screen reads
 * currentTime() on every animation frame and draws the playhead, note highlights and scroll
 * position from it. Nothing in the UI runs its own timer.
 *
 * The demo uses SimulatedClock. To play real audio, implement this interface around the audio
 * player (an HTMLAudioElement's currentTime/playbackRate here, AVPlayer on iOS) and pass that in
 * instead. The UI does not change.
 */
export interface PlaybackClock {
  /** Length of the song's audio, in seconds. */
  readonly duration: number;
  /** Current song position in seconds, read fresh from the player on every call. */
  currentTime(): number;
  /**
   * Seconds between the player's position and what the listener actually hears (for example,
   * Bluetooth headphones). The display subtracts it so highlights match the sound (RC-18).
   */
  outputLatency(): number;
  isPlaying(): boolean;
  /** Playback speed, 0.5 to 1. Changes how fast song time advances, never the stored tab. */
  rate(): number;
  loop(): LoopRange | null;
  play(): void;
  pause(): void;
  seek(time: number): void;
  setRate(rate: number): void;
  /** While set, reaching `end` jumps song time back to `start`. */
  setLoop(loop: LoopRange | null): void;
  /** For clocks that synthesize the part: the notes to play. Others ignore it. */
  setAudibleNotes?(notes: TabNote[]): void;
  /** For clocks that synthesize the song: which parts to play and how loud (volume 0 to 1). */
  setAudibleParts?(parts: ReadonlyArray<{ instrument: Instrument; notes: TabNote[]; volume: number }>): void;
  /** Notifies on discrete changes (play, pause, seek, speed, loop, reaching the end), not every frame. */
  subscribe(listener: () => void): () => void;
}

/**
 * Stand-in for an audio player: song time advances with the wall clock at the current rate.
 * Song time is computed from an anchor (song time + wall time at the last change), so it
 * never drifts no matter how often it is read.
 */
export class SimulatedClock implements PlaybackClock {
  private anchorTime = 0;
  private anchorWall = 0;
  private playing = false;
  private playbackRate = 1;
  private loopRange: LoopRange | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly duration: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  currentTime() {
    if (!this.playing) return this.anchorTime;
    let time = this.anchorTime + ((this.now() - this.anchorWall) / 1000) * this.playbackRate;

    // Loop: once playback that started before B reaches B, jump back to A (keeping the overshoot).
    const loop = this.loopRange;
    if (loop && this.anchorTime < loop.end && time >= loop.end) {
      time = loop.start + ((time - loop.end) % (loop.end - loop.start));
      this.setAnchor(time);
    }

    if (time >= this.duration) {
      this.playing = false;
      this.anchorTime = this.duration;
      this.emit();
      return this.duration;
    }
    return time;
  }

  outputLatency() {
    return 0;
  }

  isPlaying() {
    return this.playing;
  }

  rate() {
    return this.playbackRate;
  }

  loop() {
    return this.loopRange;
  }

  play() {
    if (this.playing) return;
    if (this.anchorTime >= this.duration) this.anchorTime = this.loopRange?.start ?? 0;
    this.anchorWall = this.now();
    this.playing = true;
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.anchorTime = this.currentTime();
    this.playing = false;
    this.emit();
  }

  seek(time: number) {
    this.setAnchor(Math.min(this.duration, Math.max(0, time)));
    this.emit();
  }

  setRate(rate: number) {
    this.setAnchor(this.currentTime());
    this.playbackRate = rate;
    this.emit();
  }

  setLoop(loop: LoopRange | null) {
    this.setAnchor(this.currentTime());
    this.loopRange = loop;
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setAnchor(time: number) {
    this.anchorTime = time;
    this.anchorWall = this.now();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
