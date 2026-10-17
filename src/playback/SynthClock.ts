import type { TabNote } from "../mock/types";
import type { LoopRange, PlaybackClock } from "./clock";

/** How often the audio scheduler wakes up, and how far ahead of the audio clock it schedules notes. */
const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD = 0.1;
/** Fade applied when every sounding note is cut off (seek, pause, end), to avoid clicks. */
const FADE_TIME_CONSTANT = 0.003;
const FADE_STOP_AFTER = 0.015;
const MASTER_GAIN = 0.25;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  /** Context time the note starts sounding. */
  when: number;
}

/**
 * A clock whose song time comes from the Web Audio clock, and which plays the tab's notes with a
 * synthesized plucked-string voice. Behaves like SimulatedClock, so the UI doesn't change.
 *
 * Song time is anchorSongTime + (audioContext.currentTime - anchorContextTime) * rate, re-anchored
 * on every play, pause, seek, speed or loop change.
 *
 * The note scheduler below (the standard Web Audio lookahead timer) only schedules sound. It is
 * not a UI clock: nothing in the UI reads from it, and the playhead, highlights and scroll all
 * still read currentTime() once per animation frame (RC-18, DD-14).
 */
export class SynthClock implements PlaybackClock {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private anchorSongTime = 0;
  private anchorContextTime = 0;
  private playing = false;
  private playbackRate = 1;
  private loopRange: LoopRange | null = null;
  private notes: TabNote[] = [];
  private readonly listeners = new Set<() => void>();

  // Scheduler cursor: song time up to which notes are already scheduled, and the context time it maps to.
  // It runs ahead of the anchor and is not re-anchored when playback wraps at the end of a loop.
  private cursorSong = 0;
  private cursorContext = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly voices = new Set<Voice>();

  constructor(readonly duration: number) {}

  currentTime() {
    const ctx = this.ctx;
    if (!this.playing || !ctx) return this.anchorSongTime;
    const now = ctx.currentTime;
    let time = this.anchorSongTime + (now - this.anchorContextTime) * this.playbackRate;

    // Loop: once playback that started before B reaches B, jump back to A (keeping the overshoot).
    // The anchor moves exactly to A at the context time B was reached, so no time is lost.
    const loop = this.activeLoop();
    if (loop && this.anchorSongTime < loop.end && time >= loop.end) {
      const span = loop.end - loop.start;
      const extraPasses = Math.floor((time - loop.end) / span);
      this.anchorContextTime += (loop.end - this.anchorSongTime) / this.playbackRate + (extraPasses * span) / this.playbackRate;
      this.anchorSongTime = loop.start;
      time = this.anchorSongTime + (now - this.anchorContextTime) * this.playbackRate;
    }

    if (time >= this.duration) {
      this.playing = false;
      this.anchorSongTime = this.duration;
      this.halt();
      this.emit();
      return this.duration;
    }
    return time;
  }

  outputLatency() {
    const ctx = this.ctx;
    return ctx ? ctx.outputLatency || ctx.baseLatency || 0 : 0;
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
    if (this.anchorSongTime >= this.duration) this.anchorSongTime = this.loopRange?.start ?? 0;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    this.anchorContextTime = ctx.currentTime;
    this.playing = true;
    this.startScheduling();
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    const time = this.currentTime();
    if (!this.playing) return; // reached the end, which already stopped and notified
    this.anchorSongTime = time;
    this.playing = false;
    this.halt();
    this.emit();
  }

  seek(time: number) {
    this.reanchor(Math.min(this.duration, Math.max(0, time)));
    this.restartScheduling();
    this.emit();
  }

  setRate(rate: number) {
    this.reanchor(this.currentTime());
    this.playbackRate = rate;
    this.restartScheduling();
    this.emit();
  }

  setLoop(loop: LoopRange | null) {
    this.reanchor(this.currentTime());
    this.loopRange = loop;
    this.restartScheduling();
    this.emit();
  }

  /** Which notes make sound. While playing, pending sounds are cancelled and rescheduled from the current position. */
  setNotes(notes: TabNote[]) {
    this.notes = [...notes].sort((a, b) => a.startTime - b.startTime);
    if (!this.playing) return;
    this.reanchor(this.currentTime());
    this.restartScheduling();
  }

  setAudibleNotes(notes: TabNote[]) {
    this.setNotes(notes);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stops all sound and closes the audio context. Safe to call repeatedly; a later play() makes a new context. */
  dispose() {
    if (this.playing) this.anchorSongTime = this.currentTime();
    this.playing = false;
    this.halt();
    this.voices.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
  }

  private activeLoop() {
    const loop = this.loopRange;
    return loop && loop.end > loop.start ? loop : null;
  }

  private ensureContext() {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    // The compressor keeps stacked chord notes from clipping.
    const compressor = ctx.createDynamicsCompressor();
    master.connect(compressor);
    compressor.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  /** Moves the anchor to `songTime` as of now. */
  private reanchor(songTime: number) {
    this.anchorSongTime = songTime;
    this.anchorContextTime = this.ctx?.currentTime ?? 0;
  }

  private restartScheduling() {
    if (!this.playing) return;
    this.stopVoices();
    this.startScheduling();
  }

  private startScheduling() {
    this.cursorSong = this.anchorSongTime;
    this.cursorContext = this.anchorContextTime;
    this.schedule();
    if (this.timer === null) this.timer = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
  }

  /** Stops the scheduler and fades out everything that is sounding or queued. */
  private halt() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.stopVoices();
  }

  /** Queues every note that falls inside the lookahead window, following the loop into its next pass. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    while (this.cursorContext < horizon) {
      const loop = this.activeLoop();
      const segmentEnd = Math.min(this.duration, loop && this.cursorSong < loop.end ? loop.end : this.duration);
      if (this.cursorSong >= segmentEnd) return;
      const windowEnd = Math.min(segmentEnd, this.cursorSong + (horizon - this.cursorContext) * this.playbackRate);
      this.scheduleWindow(ctx, this.cursorSong, windowEnd);
      this.cursorContext += (windowEnd - this.cursorSong) / this.playbackRate;
      this.cursorSong = windowEnd;
      if (loop && windowEnd >= loop.end && segmentEnd === loop.end) this.cursorSong = loop.start;
    }
  }

  private scheduleWindow(ctx: AudioContext, from: number, to: number) {
    // First note with startTime >= from (notes are sorted).
    let low = 0;
    let high = this.notes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.notes[mid].startTime < from) low = mid + 1;
      else high = mid;
    }
    for (let i = low; i < this.notes.length && this.notes[i].startTime < to; i++) {
      const note = this.notes[i];
      const when = this.cursorContext + (note.startTime - from) / this.playbackRate;
      if (when < ctx.currentTime - 0.03) continue; // already in the past (for example, after a throttled timer)
      this.playNote(ctx, note, when);
    }
  }

  /** A plucked string: oscillator → lowpass → exponential decay. Speed changes length, never pitch. */
  private playNote(ctx: AudioContext, note: TabNote, when: number) {
    if (!this.master) return;
    const frequency = 440 * 2 ** ((note.pitch - 69) / 12);
    const length = Math.max(0.12, note.duration / this.playbackRate);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    // Bass is a little darker. The cutoff closes as the string rings out.
    const brightness = note.pitch < 48 ? 4 : 8;
    const cutoff = Math.min(8000, Math.max(300, frequency * brightness));
    filter.frequency.setValueAtTime(cutoff, when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff / 4), when + length);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.8, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + length + 0.05);

    const voice = { osc, gain, when };
    this.voices.add(voice);
    osc.onended = () => {
      this.voices.delete(voice);
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private stopVoices() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const { osc, gain, when } of this.voices) {
      if (when >= now) {
        // Not sounding yet: cancel outright, no fade needed.
        osc.stop(now);
        continue;
      }
      const level = gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(level, now);
      gain.gain.setTargetAtTime(0, now, FADE_TIME_CONSTANT);
      osc.stop(now + FADE_STOP_AFTER);
    }
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
