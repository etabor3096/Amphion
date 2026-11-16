import { useEffect, useState } from "react";
import type { LibrarySong } from "./types";

const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

/** "Today", "Yesterday", or a short date like "Sep 28". */
export function addedLabel(addedAt: number, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(addedAt)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The added label for a song, kept current: it re-renders at local midnight and when the app
 * comes back to the foreground (timers can be paused while the phone sleeps).
 */
export function useAddedLabel(addedAt: number) {
  const [today, setToday] = useState(() => startOfDay(Date.now()));
  useEffect(() => {
    const refresh = () => setToday(startOfDay(Date.now()));
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const timer = window.setTimeout(refresh, tomorrow.getTime() - Date.now() + 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [today]);
  return addedLabel(addedAt, today);
}

function song(fields: Omit<LibrarySong, "audioOnThisDevice"> & { audioOnThisDevice?: boolean }): LibrarySong {
  return { audioOnThisDevice: true, ...fields };
}

const now = Date.now();

/** Library contents on launch. Ready songs have tab data in transcriptions.ts under the same id. */
export const INITIAL_SONGS: LibrarySong[] = [
  song({ id: 1, title: "Sunday Morning Idea", artist: "Hillsong", folder: "Worship Set", addedAt: now, length: "2:41", status: "processing", art: 1 }),
  song({ id: 2, title: "Back Porch Chorus", artist: "Elijah", folder: "Practice This Week", addedAt: now - DAY, length: "0:20", status: "ready", art: 2 }),
  song({ id: 6, title: "Old Mill Road", artist: "Elijah", addedAt: now - DAY * 3, length: "0:20", status: "ready", art: 4 }),
  song({ id: 3, title: "First Full Song", artist: "The Paper Kites", addedAt: now - DAY * 12, length: "0:20", status: "ready", art: 3 }),
  song({ id: 5, title: "Lantern Light", artist: "Maya", folder: "Worship Set", addedAt: now - DAY * 20, length: "0:20", status: "ready", art: 1, audioOnThisDevice: false }),
  song({ id: 4, title: "Phone Recording 04", folder: "Practice This Week", addedAt: now - DAY * 35, length: "1:37", status: "failed", art: 4 }),
];
