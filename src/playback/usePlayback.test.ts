import { describe, expect, it } from "vitest";
import { SimulatedClock } from "./clock";
import { watchPlayback, type FrameScheduler } from "./usePlayback";

/** Frames that only run when the test says so; never calling run() is a hidden tab. */
function manualFrames() {
  let pending: (() => void) | null = null;
  const scheduler: FrameScheduler = {
    request: (callback) => {
      pending = callback;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
  };
  return {
    scheduler,
    run() {
      const callback = pending;
      pending = null;
      callback?.();
    },
  };
}

function setup() {
  let wallMs = 0;
  const clock = new SimulatedClock(120, () => wallMs);
  const frames = manualFrames();
  const times: number[] = [];
  const stop = watchPlayback(clock, (songTime) => times.push(songTime), frames.scheduler);
  return { clock, frames, times, stop, advance: (ms: number) => (wallMs += ms) };
}

describe("watchPlayback", () => {
  it("reports a seek right after pausing even when no frame runs (hidden tab)", () => {
    const { clock, times, advance } = setup();
    clock.play();
    advance(5000);
    clock.pause();
    clock.seek(30);
    expect(times.at(-1)).toBe(30);
  });

  it("reports the clock's time on every frame", () => {
    const { clock, frames, times, advance } = setup();
    clock.play();
    advance(2000);
    frames.run();
    expect(times.at(-1)).toBe(2);
    advance(1000);
    frames.run();
    expect(times.at(-1)).toBe(3);
  });

  it("stops reporting once stopped", () => {
    const { clock, frames, times, stop } = setup();
    stop();
    clock.seek(30);
    frames.run();
    expect(times).toEqual([]);
  });
});
