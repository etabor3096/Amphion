import type { Instrument, TabNote } from "../mock/types";
import type { LoopRange, PlaybackClock } from "./clock";

/** How often the audio scheduler wakes up, and how far ahead of the audio clock it schedules notes. */
const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD = 0.1;
/** Fade applied when every sounding note is cut off (seek, pause, end), to avoid clicks. */
const FADE_TIME_CONSTANT = 0.003;
const FADE_STOP_AFTER = 0.015;
const MASTER_GAIN = 0.25;
/** Ramp time for a volume-only change, so playing notes aren't cut or clicked. */
const VOLUME_RAMP_TIME = 0.03;

/** One part of the mix: a note list with its own volume. */
export interface AudiblePart {
  instrument: Instrument;
  notes: TabNote[];
  /** 0 = silent, 1 = full. */
  volume: number;
}

/** How an instrument sounds. Bass is darker and rings a little longer. */
interface VoiceStyle {
  /** Lowpass cutoff as a multiple of the note frequency, and the same for notes below MIDI 48. */
  brightness: number;
  lowBrightness: number;
  minCutoff: number;
  /** The cutoff closes to this floor (or a quarter of the start, whichever is higher) as the string rings out. */
  endFloor: number;
  /** Multiplies the note length. */
  decay: number;
}

const VOICE_STYLES: Record<Instrument, VoiceStyle> = {
  guitar: { brightness: 8, lowBrightness: 4, minCutoff: 300, endFloor: 200, decay: 1 },
  bass: { brightness: 3, lowBrightness: 3, minCutoff: 120, endFloor: 100, decay: 1.25 },
};

interface Part {
  instrument: Instrument;
  /** The array last passed in, kept to tell a notes change from a volume-only change. */
  source: TabNote[];
  /** Sorted by start time. */
  notes: TabNote[];
  volume: number;
  /** Sits between this part's voices and the master gain. Made lazily, recreated with the context. */
  gain: GainNode | null;
  // Scheduler cursor (see SynthClock): per part, so one part can be rescheduled alone.
  cursorSong: number;
  cursorContext: number;
}

interface Voice {
  part: Part;
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
  private readonly parts = new Map<Instrument, Part>();
  private readonly listeners = new Set<() => void>();

  // Each part has a scheduler cursor: song time up to which its notes are already scheduled, and the
  // context time it maps to. It runs ahead of the anchor and is not re-anchored when playback wraps.
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

  /** Shorthand for one guitar part at full volume. */
  setNotes(notes: TabNote[]) {
    this.setAudibleParts([{ instrument: "guitar", notes, volume: 1 }]);
  }

  setAudibleNotes(notes: TabNote[]) {
    this.setNotes(notes);
  }

  /**
   * Which parts make sound, each at its own volume. A volume-only change ramps that part's gain.
   * A notes change, or adding, removing, silencing or un-silencing a part, cancels and reschedules
   * only that part from the current position. Parts at volume 0 schedule nothing.
   */
  setAudibleParts(parts: ReadonlyArray<AudiblePart>) {
    const incoming = new Map<Instrument, AudiblePart>();
    for (const part of parts) incoming.set(part.instrument, part);

    for (const [instrument, part] of this.parts) {
      if (incoming.has(instrument)) continue;
      this.parts.delete(instrument);
      this.stopVoices(part);
      this.releaseGain(part);
    }

    let positioned = false;
    for (const [instrument, next] of incoming) {
      const volume = Number.isFinite(next.volume) ? Math.min(1, Math.max(0, next.volume)) : 0;
      let part = this.parts.get(instrument);
      let reschedule = false;
      if (!part) {
        part = { instrument, source: next.notes, notes: sortNotes(next.notes), volume: 0, gain: null, cursorSong: 0, cursorContext: 0 };
        this.parts.set(instrument, part);
        reschedule = volume > 0;
      } else {
        if (part.source !== next.notes) {
          part.source = next.notes;
          part.notes = sortNotes(next.notes);
          reschedule = volume > 0;
        }
        if ((part.volume > 0) !== (volume > 0)) reschedule = true;
      }
      const wasSilent = part.volume <= 0;
      const changed = part.volume !== volume;
      part.volume = volume;
      if (changed) this.setPartGain(part, wasSilent);
      if (!reschedule || !this.playing) continue;

      this.stopVoices(part);
      if (volume <= 0) continue;
      if (!positioned) {
        this.reanchor(this.currentTime());
        positioned = true;
        if (!this.playing) return; // reached the end, which already stopped everything
      }
      this.startPart(part);
    }
    if (positioned) this.schedule();
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
    for (const part of this.parts.values()) part.gain = null;
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
    for (const part of this.parts.values()) this.startPart(part);
    this.schedule();
    if (this.timer === null) this.timer = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
  }

  /** Points a part's cursor at the anchor, so it schedules from the current position. */
  private startPart(part: Part) {
    part.cursorSong = this.anchorSongTime;
    part.cursorContext = this.anchorContextTime;
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
    for (const part of this.parts.values()) {
      if (part.volume <= 0) continue;
      while (part.cursorContext < horizon) {
        const loop = this.activeLoop();
        const segmentEnd = Math.min(this.duration, loop && part.cursorSong < loop.end ? loop.end : this.duration);
        if (part.cursorSong >= segmentEnd) break;
        const windowEnd = Math.min(segmentEnd, part.cursorSong + (horizon - part.cursorContext) * this.playbackRate);
        this.scheduleWindow(ctx, part, part.cursorSong, windowEnd);
        part.cursorContext += (windowEnd - part.cursorSong) / this.playbackRate;
        part.cursorSong = windowEnd;
        if (loop && windowEnd >= loop.end && segmentEnd === loop.end) part.cursorSong = loop.start;
      }
    }
  }

  private scheduleWindow(ctx: AudioContext, part: Part, from: number, to: number) {
    const notes = part.notes;
    // First note with startTime >= from (notes are sorted).
    let low = 0;
    let high = notes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (notes[mid].startTime < from) low = mid + 1;
      else high = mid;
    }
    for (let i = low; i < notes.length && notes[i].startTime < to; i++) {
      const note = notes[i];
      const when = part.cursorContext + (note.startTime - from) / this.playbackRate;
      if (when < ctx.currentTime - 0.03) continue; // already in the past (for example, after a throttled timer)
      this.playNote(ctx, part, note, when);
    }
  }

  /** The part's gain node, made on first use after the context is created. */
  private partGain(ctx: AudioContext, part: Part) {
    if (part.gain) return part.gain;
    const gain = ctx.createGain();
    gain.gain.value = part.volume;
    if (this.master) gain.connect(this.master);
    part.gain = gain;
    return gain;
  }

  /** Moves a part's gain to its volume: a short ramp, or at once when it was silent (nothing is sounding). */
  private setPartGain(part: Part, immediate: boolean) {
    const ctx = this.ctx;
    if (!ctx || !part.gain) return;
    const param = part.gain.gain;
    const now = ctx.currentTime;
    const level = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(level, now);
    if (immediate) param.setValueAtTime(part.volume, now);
    else param.linearRampToValueAtTime(part.volume, now + VOLUME_RAMP_TIME);
  }

  /** Disconnects a removed part's gain once its voices have faded out. */
  private releaseGain(part: Part) {
    const gain = part.gain;
    part.gain = null;
    if (gain) setTimeout(() => gain.disconnect(), 100);
  }

  /** A plucked string: oscillator → lowpass → exponential decay. Speed changes length, never pitch. */
  private playNote(ctx: AudioContext, part: Part, note: TabNote, when: number) {
    if (!this.master) return;
    const style = VOICE_STYLES[part.instrument];
    const frequency = 440 * 2 ** ((note.pitch - 69) / 12);
    const length = Math.max(0.12, (note.duration * style.decay) / this.playbackRate);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    // Low notes are a little darker, and bass darker still. The cutoff closes as the string rings out.
    const brightness = note.pitch < 48 ? style.lowBrightness : style.brightness;
    const cutoff = Math.min(8000, Math.max(style.minCutoff, frequency * brightness));
    filter.frequency.setValueAtTime(cutoff, when);
    filter.frequency.exponentialRampToValueAtTime(Math.min(cutoff, Math.max(style.endFloor, cutoff / 4)), when + length);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.8, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.partGain(ctx, part));
    osc.start(when);
    osc.stop(when + length + 0.05);

    const voice = { part, osc, gain, when };
    this.voices.add(voice);
    osc.onended = () => {
      this.voices.delete(voice);
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /** Fades out every voice, or only those of one part. */
  private stopVoices(only?: Part) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const { part, osc, gain, when } of this.voices) {
      if (only && part !== only) continue;
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

function sortNotes(notes: TabNote[]) {
  return [...notes].sort((a, b) => a.startTime - b.startTime);
}
