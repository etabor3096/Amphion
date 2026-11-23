import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AudioFileClock, type AudioLike } from "./AudioFileClock";

/** A stand-in for the browser's audio element. Only a test moves its position, as the sound would. */
class FakeAudio implements AudioLike {
  currentTime = 0;
  playbackRate = 1;
  preservesPitch: boolean | undefined;
  paused = true;
  duration = 20;
  private readonly handlers = new Map<string, Set<() => void>>();

  play() {
    this.paused = false;
    this.fire("play");
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.fire("pause");
  }
  addEventListener(type: string, listener: () => void) {
    this.handlers.set(type, (this.handlers.get(type) ?? new Set()).add(listener));
  }
  removeEventListener(type: string, listener: () => void) {
    this.handlers.get(type)?.delete(listener);
  }
  fire(type: string) {
    for (const listener of this.handlers.get(type) ?? []) listener();
  }
  listenerCount() {
    return [...this.handlers.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

const setup = (duration = 20) => {
  const audio = new FakeAudio();
  audio.duration = duration;
  return { audio, clock: new AudioFileClock(audio, duration) };
};

describe("AudioFileClock position", () => {
  it("reports exactly the audio element's position, and nothing else moves it", () => {
    const { audio, clock } = setup();
    expect(clock.currentTime()).toBe(0);
    audio.currentTime = 7.25;
    expect(clock.currentTime()).toBe(7.25);
    // Reading again without the audio moving gives the same time: the clock has no time of its own.
    expect(clock.currentTime()).toBe(7.25);
  });

  it("reports the loaded audio's duration, falling back to the analysis duration until it loads", () => {
    const audio = new FakeAudio();
    audio.duration = Number.NaN;
    const clock = new AudioFileClock(audio, 180);
    expect(clock.duration).toBe(180);
    audio.duration = 179.9;
    expect(clock.duration).toBe(179.9);
  });

  it("has no output latency (Bluetooth correction is #31)", () => {
    expect(setup().clock.outputLatency()).toBe(0);
  });
});

describe("AudioFileClock play, pause and seek", () => {
  it("plays and pauses the audio and reports the state", () => {
    const { audio, clock } = setup();
    expect(clock.isPlaying()).toBe(false);
    clock.play();
    expect(audio.paused).toBe(false);
    expect(clock.isPlaying()).toBe(true);
    clock.pause();
    expect(audio.paused).toBe(true);
    expect(clock.isPlaying()).toBe(false);
  });

  it("seeks the audio, clamped to the song", () => {
    const { audio, clock } = setup();
    clock.seek(12);
    expect(audio.currentTime).toBe(12);
    clock.seek(-5);
    expect(audio.currentTime).toBe(0);
    clock.seek(999);
    expect(audio.currentTime).toBe(20);
  });

  it("starts again from the beginning when play is pressed at the end", () => {
    const { audio, clock } = setup();
    audio.currentTime = 20;
    clock.play();
    expect(audio.currentTime).toBe(0);
  });

  it("starts again from A when play is pressed at the end with a loop set", () => {
    const { audio, clock } = setup();
    clock.setLoop({ start: 4, end: 8 });
    audio.currentTime = 20;
    clock.play();
    expect(audio.currentTime).toBe(4);
  });

  it("stays paused if the browser refuses to start the audio", async () => {
    const { audio, clock } = setup();
    audio.play = () => Promise.reject(new Error("NotAllowedError"));
    const listener = vi.fn();
    clock.subscribe(listener);
    clock.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(clock.isPlaying()).toBe(false);
    expect(listener).toHaveBeenCalled();
  });
});

describe("AudioFileClock speed", () => {
  it("sets the playback rate and keeps the pitch", () => {
    const { audio, clock } = setup();
    clock.setRate(0.5);
    expect(audio.playbackRate).toBe(0.5);
    expect(audio.preservesPitch).toBe(true);
    expect(clock.rate()).toBe(0.5);
  });

  it("keeps the speed between 50% and 100%", () => {
    const { audio, clock } = setup();
    clock.setRate(0.1);
    expect(audio.playbackRate).toBe(0.5);
    clock.setRate(2);
    expect(audio.playbackRate).toBe(1);
  });

  it("does not move song time when the speed changes", () => {
    const { audio, clock } = setup();
    audio.currentTime = 9;
    clock.setRate(0.75);
    expect(clock.currentTime()).toBe(9);
  });
});

describe("AudioFileClock A-B loop", () => {
  it("jumps back to A when the audio reaches B", () => {
    const { audio, clock } = setup();
    clock.setLoop({ start: 4, end: 8 });
    clock.play();
    audio.currentTime = 7.99;
    expect(clock.currentTime()).toBe(7.99);
    audio.currentTime = 8.01; // the sound passed B between two screen refreshes
    expect(clock.currentTime()).toBeCloseTo(4.01, 5);
    expect(audio.currentTime).toBeCloseTo(4.01, 5);
  });

  it("loops again on the next pass", () => {
    const { audio, clock } = setup();
    clock.setLoop({ start: 4, end: 8 });
    clock.play();
    audio.currentTime = 7.9;
    clock.currentTime();
    audio.currentTime = 8.1;
    clock.currentTime();
    audio.currentTime = 7.95;
    clock.currentTime();
    audio.currentTime = 8.05;
    expect(clock.currentTime()).toBeCloseTo(4.05, 5);
  });

  it("does not loop after a seek to somewhere past B", () => {
    const { audio, clock } = setup();
    clock.setLoop({ start: 4, end: 8 });
    clock.play();
    audio.currentTime = 5;
    clock.currentTime();
    clock.seek(12);
    expect(clock.currentTime()).toBe(12);
    audio.currentTime = 12.5;
    expect(clock.currentTime()).toBe(12.5);
  });

  it("does not loop while paused", () => {
    const { audio, clock } = setup();
    clock.setLoop({ start: 4, end: 8 });
    audio.currentTime = 7;
    clock.currentTime();
    audio.currentTime = 9;
    expect(clock.currentTime()).toBe(9);
  });

  it("stops looping once the loop is cleared", () => {
    const { audio, clock } = setup();
    clock.setLoop({ start: 4, end: 8 });
    clock.setLoop(null);
    clock.play();
    audio.currentTime = 7.9;
    clock.currentTime();
    audio.currentTime = 8.1;
    expect(clock.currentTime()).toBe(8.1);
    expect(clock.loop()).toBeNull();
  });
});

describe("AudioFileClock notifications", () => {
  it("tells listeners about play, pause, seek, speed, loop and the end", () => {
    const { audio, clock } = setup();
    const listener = vi.fn();
    clock.subscribe(listener);
    clock.play();
    clock.pause();
    clock.seek(3);
    clock.setRate(0.75);
    clock.setLoop({ start: 1, end: 2 });
    audio.fire("ended");
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it("stops notifying after unsubscribe, and releases everything on dispose", () => {
    const audio = new FakeAudio();
    const onDispose = vi.fn();
    const clock = new AudioFileClock(audio, 20, onDispose);
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);
    unsubscribe();
    clock.seek(1);
    expect(listener).not.toHaveBeenCalled();

    clock.play();
    clock.dispose();
    expect(audio.paused).toBe(true);
    expect(audio.listenerCount()).toBe(0);
    expect(onDispose).toHaveBeenCalledOnce();
  });
});

describe("rule A1: nothing but the audio moves song time", () => {
  const forbidden = /\b(setInterval|setTimeout|requestAnimationFrame|performance\.now|Date\.now)\b/;

  it.each(["AudioFileClock.ts", "../realSong/loadRealSong.ts", "../realSong/rc20.ts"])("%s has no timer or counter", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    // Comments may talk about timers; only code counts.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(forbidden);
  });
});
