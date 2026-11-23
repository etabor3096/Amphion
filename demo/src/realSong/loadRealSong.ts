import type { Transcription } from "../mock/types";
import { parseRc20, toTranscription, type Rc20 } from "./rc20";

/** The audio's length may differ from the analysis's by this much before it counts as a different file (RC-19). */
export const DURATION_TOLERANCE_SECONDS = 0.5;

export type AudioCheck = { match: true } | { match: false; reason: string };

const formatSeconds = (seconds: number) => `${seconds.toFixed(1)} s`;

/** The quick check, done before hashing: is this audio the length of the one that was analyzed? */
export function checkDuration(expectedSeconds: number, actualSeconds: number): AudioCheck {
  if (Math.abs(expectedSeconds - actualSeconds) <= DURATION_TOLERANCE_SECONDS) return { match: true };
  return {
    match: false,
    reason: `This audio is ${formatSeconds(actualSeconds)} long, but the tab was made from audio that is ${formatSeconds(expectedSeconds)} long. It isn't the same file, so the tab would not line up with the sound.`,
  };
}

/** Is this the exact file that was analyzed? Both values are lowercase hex SHA-256. */
export function checkHash(expectedSha256: string, actualSha256: string): AudioCheck {
  if (expectedSha256 === actualSha256) return { match: true };
  return {
    match: false,
    reason: "This audio isn't the file the tab was made from (it isn't the same file), so the tab would not line up with the sound.",
  };
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("This browser can't check the audio file here (it needs https or localhost).");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What the loader needs from the browser, so tests can supply it. */
export interface LoaderDeps {
  /** Length of the audio in seconds, from the file's own metadata. */
  readAudioDuration(file: Blob): Promise<number>;
  sha256(file: Blob): Promise<string>;
  /** A URL the audio element can play. `release` frees it. */
  createAudioUrl(file: Blob): { url: string; release: () => void };
}

export const browserDeps: LoaderDeps = {
  readAudioDuration(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const probe = new Audio();
      const done = () => {
        probe.removeAttribute("src");
        probe.load();
        URL.revokeObjectURL(url);
      };
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        const seconds = probe.duration;
        done();
        if (Number.isFinite(seconds)) resolve(seconds);
        else reject(new Error("The audio has no length."));
      };
      probe.onerror = () => {
        done();
        reject(new Error("The browser can't read this audio file."));
      };
      probe.src = url;
    });
  },
  async sha256(file) {
    return sha256Hex(await file.arrayBuffer());
  },
  createAudioUrl(file) {
    const url = URL.createObjectURL(file);
    return { url, release: () => URL.revokeObjectURL(url) };
  },
};

export interface RealSong {
  transcription: Transcription;
  /** Notes the pipeline kept but that cannot be drawn because they have no string and fret. */
  unplayableNotes: number;
  /** The audio to play, present only when it is the file the tab was made from. */
  audio: { url: string; release: () => void } | null;
  /** Why there is no synced playback: the audio does not match, or could not be checked. */
  noSyncReason: string | null;
}

export type LoadResult = { ok: true; song: RealSong } | { ok: false; error: string };

/**
 * Loads one real song: the pipeline's RC-20 JSON and the audio file it was made from.
 *
 * A bad JSON file is an error. A bad or different audio file is not: the tab still shows, without
 * synced playback, and `noSyncReason` says why (RC-19). The length is compared first because it
 * is cheap; the SHA-256 is computed only when the length matches.
 */
export async function loadRealSong(jsonFile: Blob, audioFile: Blob, songId: number, deps: LoaderDeps = browserDeps): Promise<LoadResult> {
  const parsed = parseRc20(await jsonFile.text());
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const rc20: Rc20 = parsed.data;
  const { transcription, unplayableNotes } = toTranscription(rc20, songId);

  const withoutAudio = (noSyncReason: string): LoadResult => ({ ok: true, song: { transcription, unplayableNotes, audio: null, noSyncReason } });

  let audioSeconds: number;
  try {
    audioSeconds = await deps.readAudioDuration(audioFile);
  } catch (error) {
    return withoutAudio(`${error instanceof Error ? error.message : "The audio file couldn't be read."} The tab is shown without synced playback.`);
  }
  const length = checkDuration(rc20.duration, audioSeconds);
  if (!length.match) return withoutAudio(length.reason);

  let fingerprint: string;
  try {
    fingerprint = await deps.sha256(audioFile);
  } catch (error) {
    return withoutAudio(`${error instanceof Error ? error.message : "The audio file couldn't be checked."} The audio can't be matched to the tab, so it isn't played.`);
  }
  const same = checkHash(rc20.audioSha256, fingerprint);
  if (!same.match) return withoutAudio(same.reason);

  return { ok: true, song: { transcription, unplayableNotes, audio: deps.createAudioUrl(audioFile), noSyncReason: null } };
}
