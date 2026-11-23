import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./loadRealSong";
import { parseRc20 } from "./rc20";

// demo/fixtures/click-track/: a click every 0.5 s and one tab note per click (see make_click_track.py).
const read = (name: string) => readFileSync(new URL(`../../fixtures/click-track/${name}`, import.meta.url));

describe("click-track fixture", () => {
  const wav = read("click-track.wav");
  const parsed = parseRc20(read("click-track.rc20.json").toString("utf8"));

  it("is valid RC-20 data", () => {
    expect(parsed.ok).toBe(true);
  });

  it("belongs to its audio file (same SHA-256, same length)", async () => {
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await sha256Hex(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength))).toBe(parsed.data.audioSha256);
    const sampleRate = wav.readUInt32LE(24);
    const seconds = (wav.byteLength - 44) / 2 / sampleRate;
    expect(Math.abs(seconds - parsed.data.duration)).toBeLessThan(0.01);
  });

  it("has one note on every click", () => {
    if (!parsed.ok) throw new Error(parsed.error);
    const starts = parsed.data.guitar?.notes.map((note) => note.startTime) ?? [];
    expect(starts).toEqual(parsed.data.beats);
  });
});
