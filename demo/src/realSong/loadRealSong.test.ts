import { describe, expect, it, vi } from "vitest";
import { checkDuration, checkHash, DURATION_TOLERANCE_SECONDS, loadRealSong, sha256Hex, type LoaderDeps } from "./loadRealSong";
import { parseRc20, toTranscription } from "./rc20";

const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
// shasum -a 256 of the bytes above
const AUDIO_SHA = "66840dda154e8a113c31dd0ad32f7f3a366a80e8136979d8f5a101d3d29d6f72";

const note = (id: string, startTime: number, over: Record<string, unknown> = {}) => ({
  id,
  startTime,
  duration: 0.4,
  string: 2,
  fret: 3,
  pitch: 52,
  confidence: 0.9,
  edited: false,
  ...over,
});

const rc20 = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  audioSha256: AUDIO_SHA,
  duration: 20,
  key: "E minor",
  bpm: 120,
  tuningOffsetCents: -12,
  beatsPerBar: 4,
  beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  downbeats: [0, 2],
  chords: [{ id: "chord-0", startTime: 0, endTime: 2, name: "Em", confidence: null, edited: false }],
  guitar: { notes: [note("guitar-0", 0), note("guitar-1", 0.5, { string: null, fret: null, pitch: 30 })] },
  bass: null,
  ...over,
});

const jsonBlob = (value: unknown) => new Blob([typeof value === "string" ? value : JSON.stringify(value)]);
const audioBlob = () => new Blob([AUDIO_BYTES]);

const fakeDeps = (over: Partial<LoaderDeps> = {}): LoaderDeps => ({
  readAudioDuration: async () => 20,
  sha256: async (file) => sha256Hex(await file.arrayBuffer()),
  createAudioUrl: () => ({ url: "blob:fake", release: () => undefined }),
  ...over,
});

describe("parseRc20", () => {
  it("accepts a valid file", () => {
    const result = parseRc20(JSON.stringify(rc20()));
    expect(result.ok).toBe(true);
  });

  it("explains text that is not JSON", () => {
    const result = parseRc20("not json {");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("can't be read as an Amphion tab file") });
  });

  it("explains a missing field", () => {
    const { key: _key, ...withoutKey } = rc20();
    const result = parseRc20(JSON.stringify(withoutKey));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('"key" is missing');
  });

  it("points at the note with a bad value", () => {
    const bad = rc20({ guitar: { notes: [note("guitar-0", 0), note("guitar-1", 0.5, { confidence: 1.5 })] } });
    const result = parseRc20(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/guitar, note 2, confidence/);
  });

  it("rejects a different format version in plain words", () => {
    const result = parseRc20(JSON.stringify(rc20({ schemaVersion: 2 })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("(version 2)");
  });

  it("rejects the old demo shape (not the pipeline format)", () => {
    const result = parseRc20(JSON.stringify({ songId: 1, duration: 20, beats: [], downbeats: [], chords: [], guitar: null, bass: null }));
    expect(result.ok).toBe(false);
  });

  it("rejects an array", () => {
    expect(parseRc20("[]").ok).toBe(false);
  });

  it("rejects a file with no bars, because there is nothing to draw", () => {
    const result = parseRc20(JSON.stringify(rc20({ downbeats: [] })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no bars");
  });

  it("rejects a bad audio fingerprint", () => {
    expect(parseRc20(JSON.stringify(rc20({ audioSha256: "ABC" }))).ok).toBe(false);
  });
});

describe("toTranscription", () => {
  const convert = (over: Record<string, unknown> = {}) => {
    const parsed = parseRc20(JSON.stringify(rc20(over)));
    if (!parsed.ok) throw new Error(parsed.error);
    return toTranscription(parsed.data, 7);
  };

  it("keeps the details and carries nulls through so the screen can say Unknown (RC-11)", () => {
    const { transcription } = convert({ key: null, bpm: null, tuningOffsetCents: null });
    expect(transcription.songId).toBe(7);
    expect(transcription.key).toBeNull();
    expect(transcription.bpm).toBeNull();
    expect(transcription.tuningOffsetCents).toBeNull();
    expect(transcription.bass).toBeNull();
  });

  it("counts notes that have no string and fret instead of silently losing them", () => {
    const { transcription, unplayableNotes } = convert();
    expect(unplayableNotes).toBe(1);
    expect(transcription.guitar?.notes.map((n) => n.id)).toEqual(["guitar-0"]);
  });

  it("keeps the real confidence values on notes", () => {
    const { transcription } = convert({ guitar: { notes: [note("guitar-0", 0, { confidence: 0.31 })] } });
    expect(transcription.guitar?.notes[0].confidence).toBe(0.31);
  });

  it("does not flag a chord that has no confidence score", () => {
    const { transcription } = convert();
    expect(transcription.chords[0].confidence).toBe(1);
  });

  it("uses 4 beats to a bar only when the file has none", () => {
    expect(convert({ beatsPerBar: null }).transcription.beatsPerBar).toBe(4);
    expect(convert({ beatsPerBar: 3 }).transcription.beatsPerBar).toBe(3);
  });
});

describe("checkDuration and checkHash", () => {
  it("allows a difference up to 0.5 s and no more", () => {
    expect(checkDuration(20, 20 + DURATION_TOLERANCE_SECONDS).match).toBe(true);
    expect(checkDuration(20, 20 - DURATION_TOLERANCE_SECONDS).match).toBe(true);
    expect(checkDuration(20, 20.51).match).toBe(false);
    expect(checkDuration(20, 19.4).match).toBe(false);
  });

  it("compares fingerprints exactly", () => {
    expect(checkHash("a".repeat(64), "a".repeat(64)).match).toBe(true);
    expect(checkHash("a".repeat(64), "b".repeat(64)).match).toBe(false);
  });

  it("hashes like shasum -a 256", async () => {
    expect(await sha256Hex(AUDIO_BYTES.buffer)).toBe(AUDIO_SHA);
  });
});

describe("loadRealSong", () => {
  it("loads a valid file with its own audio and synced playback", async () => {
    const result = await loadRealSong(jsonBlob(rc20()), audioBlob(), 1, fakeDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.audio?.url).toBe("blob:fake");
    expect(result.song.noSyncReason).toBeNull();
    expect(result.song.transcription.downbeats).toEqual([0, 2]);
  });

  it("returns a readable error for invalid JSON and never touches the audio", async () => {
    const readAudioDuration = vi.fn(async () => 20);
    const result = await loadRealSong(jsonBlob("{nope"), audioBlob(), 1, fakeDeps({ readAudioDuration }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("can't be read as an Amphion tab file") });
    expect(readAudioDuration).not.toHaveBeenCalled();
  });

  it("shows the tab without playback when the hash differs", async () => {
    const result = await loadRealSong(jsonBlob(rc20({ audioSha256: "0".repeat(64) })), audioBlob(), 1, fakeDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.audio).toBeNull();
    expect(result.song.noSyncReason).toContain("same file");
    expect(result.song.transcription.guitar?.notes).toHaveLength(1);
  });

  it("shows the tab without playback when the duration differs by more than 0.5 s, and skips the hash", async () => {
    const sha256 = vi.fn(async () => AUDIO_SHA);
    const result = await loadRealSong(jsonBlob(rc20()), audioBlob(), 1, fakeDeps({ readAudioDuration: async () => 21, sha256 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.audio).toBeNull();
    expect(result.song.noSyncReason).toContain("21.0 s");
    expect(sha256).not.toHaveBeenCalled();
  });

  it("accepts a duration 0.4 s off when the hash matches", async () => {
    const result = await loadRealSong(jsonBlob(rc20()), audioBlob(), 1, fakeDeps({ readAudioDuration: async () => 20.4 }));
    expect(result.ok && result.song.audio !== null).toBe(true);
  });

  it("shows the tab without playback when the audio cannot be read", async () => {
    const result = await loadRealSong(
      jsonBlob(rc20()),
      audioBlob(),
      1,
      fakeDeps({
        readAudioDuration: async () => {
          throw new Error("The browser can't read this audio file.");
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.audio).toBeNull();
    expect(result.song.noSyncReason).toContain("can't read");
  });

  it("does not play audio it could not verify", async () => {
    const result = await loadRealSong(
      jsonBlob(rc20()),
      audioBlob(),
      1,
      fakeDeps({
        sha256: async () => {
          throw new Error("no crypto");
        },
      }),
    );
    expect(result.ok && result.song.audio === null).toBe(true);
  });
});
