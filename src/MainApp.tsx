import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Theme } from "./LoginPage";
import ReadyBanner from "./ReadyBanner";
import SongScreen from "./SongScreen";
import { INITIAL_SONGS } from "./mock/songs";
import { addTranscription, removeTranscription, useAllTranscriptions } from "./mock/store";
import { createDemoTranscription } from "./mock/transcriptions";
import type { LibrarySong, Transcription } from "./mock/types";
import { toCheckLabel } from "./tab/edits";
import { systemTheme } from "./theme";

type Tab = "library" | "add" | "settings";
type Song = LibrarySong;

type SortOption = "newest" | "oldest" | "song" | "artist";
type DateOption = "any" | "7" | "30" | "custom";

interface LibraryFilters {
  sort: SortOption;
  date: DateOption;
  artists: string[];
  customStart: string;
  customEnd: string;
}

interface MainAppProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => void;
}

const DAY = 24 * 60 * 60 * 1000;
/** How long the demo takes to turn a new song into a tab. */
const PROCESSING_MS = 8000;

function Icon({ name }: { name: "library" | "folder" | "filter" | "add" | "settings" | "search" | "mic" | "mic-off" | "upload" | "more" | "alert" | "retry" | "lock" | "music" | "play" | "stop" | "chevron" | "back" | "eye" | "check" | "mail" | "bell" }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true };
  switch (name) {
    case "library":
      return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" /></svg>;
    case "folder":
      return <svg {...common}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z" /></svg>;
    case "filter":
      return <svg {...common}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
    case "add":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34A1.7 1.7 0 0 0 14 20.92V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>;
    case "mic":
      return <svg {...common}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" /></svg>;
    case "mic-off":
      return <svg {...common}><path d="m4 4 16 16M9 5.5V5a3 3 0 0 1 5.83-1M15 10.5V5M6 10v1a6 6 0 0 0 9.3 5M18 11v1a6 6 0 0 1-.5 2.4M12 18v3M9 21h6" /></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 14v5h14v-5" /></svg>;
    case "more":
      return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
    case "alert":
      return <svg {...common}><path d="M12 4 3.5 19h17L12 4Z" /><path d="M12 9v4M12 16.5h.01" /></svg>;
    case "retry":
      return <svg {...common}><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 .9-7.7L20 12" /></svg>;
    case "lock":
      return <svg {...common}><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case "play":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8Z" /></svg>;
    case "stop":
      return <svg {...common}><rect x="7" y="7" width="10" height="10" rx="1" /></svg>;
    case "chevron":
      return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;
    case "back":
      return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
    case "eye":
      return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
    case "check":
      return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
    case "mail":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
    case "bell":
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
    default:
      return <svg {...common}><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>;
  }
}

type AccountMethod = "apple" | "google" | "email";

function ProviderLogo({ method }: { method: AccountMethod }) {
  if (method === "apple") {
    return (
      <span className="provider-logo provider-apple" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z" />
        </svg>
      </span>
    );
  }
  if (method === "google") {
    return (
      <span className="provider-logo provider-google" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path fill="#4285F4" stroke="none" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z" />
          <path fill="#34A853" stroke="none" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.25-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z" />
          <path fill="#FBBC05" stroke="none" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.62.39 3.15 1.04 4.54l3.35-2.62Z" />
          <path fill="#EA4335" stroke="none" d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.94 12 5.94Z" />
        </svg>
      </span>
    );
  }
  return <span className="provider-logo provider-email" aria-hidden="true"><Icon name="mail" /></span>;
}

function Artwork({ variant, photo }: { variant: number; photo?: string }) {
  return (
    <span className={`song-art art-${variant}`} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : <><span /><span /><span /></>}
    </span>
  );
}

function SongStatusContent({ song, transcription, onRetry }: { song: Song; transcription?: Transcription; onRetry: () => void }) {
  if (song.status === "processing") {
    return (
      <div className="song-status status-processing">
        <span className="processing-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>Analyzing your song… you'll get a notification when it's ready.</span>
      </div>
    );
  }
  if (song.status === "failed") {
    return (
      <div className="song-status status-failed">
        <span><Icon name="alert" /> Couldn't process this song</span>
        <button className="retry-button" type="button" onClick={onRetry}><Icon name="retry" /> Retry</button>
      </div>
    );
  }
  const toCheck = transcription ? toCheckLabel(transcription) : "";
  return (
    <div className="ready-details">
      <span><strong>Key</strong> {transcription?.key ?? "Unknown"}</span>
      <span><strong>Tempo</strong> {transcription?.bpm ? `${transcription.bpm} BPM` : "Unknown"}</span>
      {toCheck && <span className="review-badge"><Icon name="alert" /> {toCheck}</span>}
      {!song.audioOnThisDevice && <span className="other-device-badge">Audio on another iPhone</span>}
    </div>
  );
}

function SongCard({
  song,
  transcription,
  revealed,
  onReveal,
  onAction,
  onRetry,
  onOpen,
}: {
  song: Song;
  transcription?: Transcription;
  revealed: boolean;
  onReveal: () => void;
  onAction: (action: "menu" | "rename" | "delete" | "move") => void;
  onRetry: () => void;
  onOpen?: () => void;
}) {
  const pointerStart = useRef(0);
  const longPressTimer = useRef<number | null>(null);

  const startGesture = (event: ReactPointerEvent) => {
    pointerStart.current = event.clientX;
    longPressTimer.current = window.setTimeout(() => onAction("menu"), 550);
  };

  const finishGesture = (event: ReactPointerEvent) => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    if (pointerStart.current - event.clientX > 42) onReveal();
  };

  return (
    <article
      className={`song-card-wrap ${revealed ? "actions-revealed" : ""}`}
      onPointerDown={startGesture}
      onPointerUp={finishGesture}
      onPointerCancel={() => longPressTimer.current && window.clearTimeout(longPressTimer.current)}
      onContextMenu={(event) => {
        event.preventDefault();
        onAction("menu");
      }}
    >
      <div className="swipe-actions" aria-hidden={!revealed}>
        <button tabIndex={revealed ? 0 : -1} type="button" onClick={() => onAction("rename")}>Rename</button>
        <button tabIndex={revealed ? 0 : -1} className="delete-action" type="button" onClick={() => onAction("delete")}>Delete</button>
      </div>
      <div
        className={`song-card ${onOpen ? "song-card-openable" : ""}`}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        aria-label={onOpen ? `Open ${song.title} tab` : undefined}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          onOpen?.();
        }}
        onKeyDown={(event) => {
          if (onOpen && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <Artwork variant={song.art} photo={song.photo} />
        <div className="song-card-content">
          <div className="song-card-heading">
            <div>
              <h3>{song.title}</h3>
              {song.artist && <p className="song-artist">{song.artist}</p>}
              <p aria-label={`Added ${song.added}, length ${song.length}${song.folder ? `, folder ${song.folder}` : ""}`}>
                {song.added} <span aria-hidden="true">·</span> <span className="sr-only">Length </span>{song.length}
                {song.folder && <span className="song-folder-label"><Icon name="folder" /> {song.folder}</span>}
              </p>
            </div>
            <button
              className="card-more"
              type="button"
              aria-label={`More actions for ${song.title}`}
              onClick={() => onAction("menu")}
            >
              <Icon name="more" />
            </button>
          </div>
          <SongStatusContent song={song} transcription={transcription} onRetry={onRetry} />
        </div>
      </div>
    </article>
  );
}

function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="empty-library">
      <span className="empty-icon"><Icon name="music" /></span>
      <h2>No songs yet</h2>
      <p>Record or upload a song to get your first tab.</p>
      <div>
        <button className="button button-primary" type="button" onClick={onAdd}><Icon name="mic" /> Record with Mic</button>
        <button className="button button-secondary" type="button" onClick={onAdd}><Icon name="upload" /> Upload Audio File</button>
      </div>
    </section>
  );
}

function FolderSelector({
  folders,
  value,
  onChange,
  onCreate,
}: {
  folders: string[];
  value: string;
  onChange: (folder: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="folder-selector">
      <label>
        <span>Folder <small>Optional</small></span>
        <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Choose a folder for this song">
          <option value="">No folder</option>
          {folders.map((folder) => <option value={folder} key={folder}>{folder}</option>)}
        </select>
      </label>
      <button type="button" onClick={onCreate}><Icon name="folder" /> Make folder</button>
    </div>
  );
}

function FolderChip({
  name,
  count,
  selected,
  onSelect,
  onLongPress,
}: {
  name: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onLongPress?: () => void;
}) {
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  return (
    <button
      className={`folder-chip ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onPointerDown={() => {
        longPressed.current = false;
        if (onLongPress) timer.current = window.setTimeout(() => { longPressed.current = true; onLongPress(); }, 550);
      }}
      onPointerUp={() => timer.current && window.clearTimeout(timer.current)}
      onPointerCancel={() => timer.current && window.clearTimeout(timer.current)}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        onLongPress();
      }}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onSelect();
      }}
    >
      <span>{name}</span>
      <strong>{count}</strong>
    </button>
  );
}

export default function MainApp({ theme, onThemeChange, onSignOut }: MainAppProps) {
  const [tab, setTab] = useState<Tab>("library");
  const [songs, setSongs] = useState(INITIAL_SONGS);
  const [query, setQuery] = useState("");
  const [revealedSong, setRevealedSong] = useState<number | null>(null);
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [instrument, setInstrument] = useState<"guitar" | "bass">("guitar");
  const [appearance, setAppearance] = useState<"system" | Theme>("system");
  const [addStep, setAddStep] = useState<"choose" | "mic-permission" | "record" | "review">("choose");
  const [recording, setRecording] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState<"unknown" | "allowed" | "denied">("unknown");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [songName, setSongName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<"main" | "account" | "password" | "email">("main");
  const [accountMethod, setAccountMethod] = useState<AccountMethod>("apple");
  const [displayName, setDisplayName] = useState("Elijah");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, next: false, confirm: false });
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [toast, setToast] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [providerConfirmed, setProviderConfirmed] = useState(false);
  const [uploadError, setUploadError] = useState<"type" | "length" | null>(null);
  const [notificationsPrompt, setNotificationsPrompt] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [hasAskedForNotifications, setHasAskedForNotifications] = useState(false);
  const [activeSongId, setActiveSongId] = useState<number | null>(null);
  const [discardRecordingOpen, setDiscardRecordingOpen] = useState(false);
  const [folders, setFolders] = useState<string[]>(["Worship Set", "Practice This Week"]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeFolder, setActiveFolder] = useState("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>({ sort: "newest", date: "any", artists: [], customStart: "", customEnd: "" });
  const [draftFilters, setDraftFilters] = useState<LibraryFilters>(filters);
  const [moveFolderOpen, setMoveFolderOpen] = useState(false);
  const [folderActionFolder, setFolderActionFolder] = useState<string | null>(null);
  const [folderAction, setFolderAction] = useState<"menu" | "rename" | "delete" | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [readyBanner, setReadyBanner] = useState<{ songId: number; title: string } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const artists = useMemo(
    () => Array.from(new Set(songs.map((song) => song.artist).filter((artist): artist is string => Boolean(artist)))).sort(),
    [songs],
  );
  const filteredSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = Date.now();
    const result = songs.filter((song) => {
      const matchesQuery = !normalizedQuery || song.title.toLowerCase().includes(normalizedQuery) || song.artist?.toLowerCase().includes(normalizedQuery);
      const matchesFolder = activeFolder === "all" || song.folder === activeFolder;
      const matchesArtist = filters.artists.length === 0 || (song.artist && filters.artists.includes(song.artist));
      let matchesDate = true;
      if (filters.date === "7") matchesDate = song.addedAt >= now - DAY * 7;
      if (filters.date === "30") matchesDate = song.addedAt >= now - DAY * 30;
      if (filters.date === "custom") {
        const start = filters.customStart ? new Date(filters.customStart).getTime() : 0;
        const end = filters.customEnd ? new Date(filters.customEnd).getTime() + DAY : Number.POSITIVE_INFINITY;
        matchesDate = song.addedAt >= start && song.addedAt < end;
      }
      return matchesQuery && matchesFolder && matchesArtist && matchesDate;
    });
    return result.sort((a, b) => {
      if (filters.sort === "oldest") return a.addedAt - b.addedAt;
      if (filters.sort === "song") return a.title.localeCompare(b.title);
      if (filters.sort === "artist") return (a.artist ?? "ZZZ").localeCompare(b.artist ?? "ZZZ");
      return b.addedAt - a.addedAt;
    });
  }, [activeFolder, filters, query, songs]);
  const transcriptions = useAllTranscriptions();
  const activeSong = songs.find((song) => song.id === activeSongId) ?? null;
  const activeTranscription = activeSong ? transcriptions.get(activeSong.id) : undefined;

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setRecordSeconds((current) => {
        if (current >= 179) {
          window.clearInterval(timer);
          setRecording(false);
          setAddStep("review");
          return 180;
        }
        return current + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Turns processing songs Ready once their readyAt passes. Scheduled from readyAt so it survives a reload.
  useEffect(() => {
    const next = Math.min(...songs.filter((song) => song.status === "processing" && song.readyAt !== undefined).map((song) => song.readyAt as number));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const due = songs.filter((song) => song.status === "processing" && song.readyAt !== undefined && song.readyAt <= now);
      for (const song of due) {
        if (!transcriptions.has(song.id)) addTranscription(createDemoTranscription(song.id));
      }
      const dueIds = new Set(due.map((song) => song.id));
      // The demo tab is a fixed-length sample, so the card shows its length rather than the recording's.
      setSongs((current) => current.map((song) => dueIds.has(song.id) ? { ...song, status: "ready", readyAt: undefined, length: formatTime(Math.round(createDemoTranscription(song.id).duration)) } : song));
      const last = due[due.length - 1];
      if (!last) return;
      if (notificationsEnabled) setReadyBanner({ songId: last.id, title: last.title });
      else setToast(`Your tab for '${last.title}' is ready`);
    }, Math.max(0, next - Date.now()));
    return () => window.clearTimeout(timer);
  }, [songs, transcriptions, notificationsEnabled]);

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  const selectAppearance = (value: "system" | Theme) => {
    setAppearance(value);
    onThemeChange(value === "system" ? systemTheme() : value);
  };

  // "System" follows the device's light/dark setting, including changes while the app is open.
  useEffect(() => {
    if (appearance !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => onThemeChange(query.matches ? "dark" : "light");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [appearance, onThemeChange]);

  const beginRecording = () => {
    setRecordSeconds(0);
    setRecording(true);
    setAddStep("record");
  };

  const finishRecording = () => {
    setRecording(false);
    setRecordSeconds((current) => Math.max(1, current));
    setAddStep("review");
  };

  const submitSong = () => {
    const title = songName.trim() || "Untitled Song";
    setSongs((current) => [
      {
        id: Date.now(),
        title,
        artist: artistName.trim() || undefined,
        added: "Today",
        addedAt: Date.now(),
        length: formatTime(Math.max(1, recordSeconds || 132)),
        status: "processing",
        readyAt: Date.now() + PROCESSING_MS,
        art: ((current.length + 1) % 4) + 1,
        folder: selectedFolder || undefined,
        audioOnThisDevice: true,
      },
      ...current,
    ]);
    setSongName("");
    setArtistName("");
    setSelectedFolder("");
    setRecordSeconds(0);
    setIsPlaying(false);
    setAddStep("choose");
    setTab("library");
    if (!hasAskedForNotifications) {
      setHasAskedForNotifications(true);
      setNotificationsPrompt(true);
    }
  };

  const handleUpload = (file: File) => {
    setUploadError(null);
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["mp3", "m4a", "wav"].includes(extension)) {
      setUploadError("type");
      return;
    }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (audio.duration > 180) {
        setRecordSeconds(Math.round(audio.duration));
        setUploadError("length");
        return;
      }
      setSongName(file.name.replace(/\.[^/.]+$/, ""));
      setRecordSeconds(Math.max(1, Math.round(audio.duration || 132)));
      setAddStep("review");
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      setUploadError("type");
    };
    audio.src = url;
  };

  const openAction = (song: Song, action: "menu" | "rename" | "delete" | "move") => {
    setMenuSong(song);
    if (action === "rename") {
      setRenameValue(song.title);
      setDialog("rename");
    } else if (action === "delete") {
      setDialog("delete");
    } else if (action === "move") {
      setMoveFolderOpen(true);
    }
  };

  const saveRename = () => {
    if (menuSong && renameValue.trim()) {
      setSongs((current) => current.map((song) => song.id === menuSong.id ? { ...song, title: renameValue.trim() } : song));
    }
    setDialog(null);
    setMenuSong(null);
  };

  const deleteSong = () => {
    if (menuSong) {
      setSongs((current) => current.filter((song) => song.id !== menuSong.id));
      removeTranscription(menuSong.id);
      if (activeSongId === menuSong.id) setActiveSongId(null);
    }
    setDialog(null);
    setMenuSong(null);
  };

  const passwordIsValid =
    passwords.current.length > 0 &&
    passwords.next.length >= 8 &&
    /\d/.test(passwords.next) &&
    passwords.confirm === passwords.next;

  const accountEmail = accountMethod === "apple" ? "elijah@icloud.com" : accountMethod === "google" ? "elijah@gmail.com" : "elijah@example.com";

  const openDeleteAccount = () => {
    setDeleteText("");
    setProviderConfirmed(accountMethod === "email");
    setDeleteAccountOpen(true);
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const existingFolder = folders.find((folder) => folder.toLowerCase() === name.toLowerCase());
    if (!existingFolder) {
      setFolders((current) => [...current, name]);
    }
    setSelectedFolder(existingFolder ?? name);
    setNewFolderName("");
    setFolderDialogOpen(false);
  };

  const renameFolder = () => {
    if (!folderActionFolder || !folderRenameValue.trim()) return;
    const nextName = folderRenameValue.trim();
    setFolders((current) => current.map((folder) => folder === folderActionFolder ? nextName : folder));
    setSongs((current) => current.map((song) => song.folder === folderActionFolder ? { ...song, folder: nextName } : song));
    if (activeFolder === folderActionFolder) setActiveFolder(nextName);
    if (selectedFolder === folderActionFolder) setSelectedFolder(nextName);
    setFolderAction(null);
    setFolderActionFolder(null);
  };

  const deleteFolder = () => {
    if (!folderActionFolder) return;
    setFolders((current) => current.filter((folder) => folder !== folderActionFolder));
    setSongs((current) => current.map((song) => song.folder === folderActionFolder ? { ...song, folder: undefined } : song));
    if (activeFolder === folderActionFolder) setActiveFolder("all");
    if (selectedFolder === folderActionFolder) setSelectedFolder("");
    setFolderAction(null);
    setFolderActionFolder(null);
  };

  const clearFilters = () => {
    const cleared: LibraryFilters = { sort: "newest", date: "any", artists: [], customStart: "", customEnd: "" };
    setFilters(cleared);
    setDraftFilters(cleared);
  };

  if (activeSong && activeTranscription) {
    return (
      <main className="app-page" data-theme={theme}>
        <SongScreen
          key={activeSong.id}
          song={activeSong}
          transcription={activeTranscription}
          defaultInstrument={instrument}
          onBack={() => {
            setActiveSongId(null);
            window.scrollTo({ top: 0 });
          }}
          onRename={(title) => setSongs((current) => current.map((song) => song.id === activeSong.id ? { ...song, title } : song))}
          onPhotoChange={(photo) => setSongs((current) => current.map((song) => song.id === activeSong.id ? { ...song, photo } : song))}
          onDelete={() => {
            setSongs((current) => current.filter((song) => song.id !== activeSong.id));
            removeTranscription(activeSong.id);
            setActiveSongId(null);
          }}
        />
        {readyBanner && (
          <ReadyBanner
            title={readyBanner.title}
            onOpen={() => {
              window.scrollTo({ top: 0 });
              setActiveSongId(readyBanner.songId);
              setReadyBanner(null);
            }}
            onDismiss={() => setReadyBanner(null)}
          />
        )}
        {toast && <div className="success-toast" role="status"><Icon name="check" /> {toast}</div>}
      </main>
    );
  }

  return (
    <main className="app-page" data-theme={theme}>
      <div className="app-content">
        {tab === "library" && (
          <section className="library-screen" aria-labelledby="library-title">
            <header className="library-header">
              <div>
                <span className="screen-eyebrow">Library</span>
                <h1 id="library-title">Your Songs</h1>
                <p><Icon name="lock" /> Private to you</p>
              </div>
              <button className="new-folder-button" type="button" onClick={() => setFolderDialogOpen(true)}>
                <Icon name="folder" />
                New folder
              </button>
            </header>

            <div className="library-search-row">
              <label className="search-field">
                <span className="sr-only">Search by song name or artist</span>
                <Icon name="search" />
                <input
                  type="search"
                  placeholder="Search songs or artists"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <button
                className="library-filter-button"
                type="button"
                aria-label="Filter and sort songs"
                onClick={() => { setDraftFilters(filters); setFilterSheetOpen(true); }}
              >
                <Icon name="filter" />
                {(filters.date !== "any" || filters.artists.length > 0 || filters.sort !== "newest") && <span className="filter-active-dot" />}
              </button>
            </div>

            {(filters.date !== "any" || filters.artists.length > 0 || filters.sort !== "newest") && (
              <div className="active-filter-chips" aria-label="Active filters">
                {filters.sort !== "newest" && (
                  <button type="button" onClick={() => setFilters({ ...filters, sort: "newest" })}>
                    {filters.sort === "oldest" ? "Oldest" : filters.sort === "song" ? "Song name A–Z" : "Artist A–Z"} <span aria-hidden="true">×</span>
                  </button>
                )}
                {filters.date !== "any" && (
                  <button type="button" onClick={() => setFilters({ ...filters, date: "any", customStart: "", customEnd: "" })}>
                    {filters.date === "7" ? "Last 7 days" : filters.date === "30" ? "Last 30 days" : "Custom range"} <span aria-hidden="true">×</span>
                  </button>
                )}
                {filters.artists.map((artist) => (
                  <button type="button" onClick={() => setFilters({ ...filters, artists: filters.artists.filter((item) => item !== artist) })} key={artist}>
                    Artist: {artist} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}

            <div className="folder-chip-row" aria-label="Song folders">
              <FolderChip name="All Songs" count={songs.length} selected={activeFolder === "all"} onSelect={() => setActiveFolder("all")} />
              {folders.map((folder) => (
                <FolderChip
                  name={folder}
                  count={songs.filter((song) => song.folder === folder).length}
                  selected={activeFolder === folder}
                  onSelect={() => setActiveFolder(folder)}
                  onLongPress={() => { setFolderActionFolder(folder); setFolderAction("menu"); }}
                  key={folder}
                />
              ))}
              <button className="new-folder-chip" type="button" onClick={() => setFolderDialogOpen(true)}>+ New Folder</button>
            </div>

            {songs.length === 0 ? (
              <EmptyLibrary onAdd={() => setTab("add")} />
            ) : activeFolder !== "all" && filteredSongs.length === 0 && !query && filters.date === "any" && filters.artists.length === 0 ? (
              <section className="no-results empty-folder-state">
                <span><Icon name="folder" /></span>
                <h2>No songs in this folder yet.</h2>
                <p>Add a new song or move one here from its menu.</p>
              </section>
            ) : filteredSongs.length === 0 ? (
              <section className="no-results">
                <h2>{query ? `No songs match '${query}'.` : "No songs match these filters."}</h2>
                <p>{query ? "Try a different song name or clear your search." : "Try removing a filter."}</p>
              </section>
            ) : (
              <div className="song-list" aria-label="Songs, newest first">
                {filteredSongs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    transcription={transcriptions.get(song.id)}
                    revealed={revealedSong === song.id}
                    onReveal={() => setRevealedSong(revealedSong === song.id ? null : song.id)}
                    onAction={(action) => openAction(song, action)}
                    onRetry={() => setSongs((current) => current.map((item) => item.id === song.id ? { ...item, status: "processing", readyAt: Date.now() + PROCESSING_MS } : item))}
                    onOpen={song.status === "ready" && transcriptions.has(song.id) ? () => {
                      window.scrollTo({ top: 0 });
                      setActiveSongId(song.id);
                    } : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "add" && addStep === "choose" && (
          <section className="placeholder-screen add-song-screen" aria-labelledby="add-title">
            <span className="placeholder-icon"><Icon name="add" /></span>
            <span className="screen-eyebrow">Add Song</span>
            <h1 id="add-title">Make a tab</h1>
            <p>Record with your phone's microphone or choose an audio file you own.</p>
            <div className="placeholder-actions">
              <button className="button button-primary" type="button" onClick={() => { setUploadError(null); setAddStep("mic-permission"); }}><Icon name="mic" /> Record with Mic</button>
              <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()}><Icon name="upload" /> Upload Audio File</button>
              <input
                className="sr-only"
                ref={uploadInputRef}
                type="file"
                accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
                onChange={(event) => {
                  if (event.target.files?.length) {
                    handleUpload(event.target.files[0]);
                    event.target.value = "";
                  }
                }}
              />
            </div>
            {uploadError && (
              <div className="upload-error" role="alert">
                <Icon name="alert" />
                <span>
                  {uploadError === "length"
                    ? `This song is ${formatTime(recordSeconds)} — Amphion can take songs up to 3 minutes right now.`
                    : "Amphion can't open this file. Try an MP3, M4A, or WAV."}
                </span>
              </div>
            )}
            <p className="supported-files">Supported: MP3, M4A, WAV <span aria-hidden="true">·</span> up to 3 minutes.</p>
            <FolderSelector folders={folders} value={selectedFolder} onChange={setSelectedFolder} onCreate={() => setFolderDialogOpen(true)} />
            <article className="recording-tips">
              <h2>Tips for a good recording</h2>
              <ul>
                <li>Get close to the speaker.</li>
                <li>Keep the room quiet.</li>
                <li>Avoid talking while recording.</li>
              </ul>
            </article>
          </section>
        )}

        {tab === "add" && addStep === "mic-permission" && (
          <section className="permission-screen" aria-labelledby="microphone-permission-title">
            <span className="permission-icon"><Icon name="mic" /></span>
            <span className="screen-eyebrow">Microphone</span>
            <h1 id="microphone-permission-title">Record only when you choose</h1>
            <p>Amphion uses your microphone only while you're recording a song. It never listens in the background.</p>
            <FolderSelector folders={folders} value={selectedFolder} onChange={setSelectedFolder} onCreate={() => setFolderDialogOpen(true)} />
            <div>
              <button className="button button-primary" type="button" onClick={() => { setMicrophonePermission("allowed"); beginRecording(); }}>Allow Microphone</button>
              <button className="permission-later" type="button" onClick={() => { setMicrophonePermission("denied"); setAddStep("record"); }}>Not now</button>
            </div>
          </section>
        )}

        {tab === "add" && addStep === "record" && (
          <section className="record-screen" aria-labelledby="record-title">
            <button className="record-cancel" type="button" onClick={() => setDiscardRecordingOpen(true)}>Cancel</button>
            {microphonePermission === "denied" ? (
              <div className="microphone-off">
                <span className="permission-icon"><Icon name="mic-off" /></span>
                <span className="screen-eyebrow">Record</span>
                <h1 id="record-title">Microphone is off</h1>
                <p>Turn on microphone access in iPhone Settings when you're ready to record.</p>
                <button className="button button-primary" type="button" onClick={() => setToast("Opening iPhone Settings…")}>Open iPhone Settings</button>
                <button className="permission-later" type="button" onClick={() => setAddStep("choose")}>Back</button>
              </div>
            ) : (
              <>
                <span className="screen-eyebrow">Record</span>
                <h1 id="record-title">{recording ? "Listening…" : "Ready to record"}</h1>
                <p className="recording-privacy"><Icon name="lock" /> The mic only listens while you're recording.</p>
                <FolderSelector folders={folders} value={selectedFolder} onChange={setSelectedFolder} onCreate={() => setFolderDialogOpen(true)} />
                <div className={`live-waveform ${recording ? "is-recording" : ""}`} aria-label={recording ? "Live audio waveform" : "Recording stopped"}>
                  {Array.from({ length: 27 }, (_, index) => <i key={index} />)}
                </div>
                <time className="record-timer" dateTime={`PT${recordSeconds}S`}>{formatTime(recordSeconds)} <span>/ 3:00</span></time>
                <button
                  className={`record-button ${recording ? "is-recording" : ""}`}
                  type="button"
                  aria-label={recording ? "Stop recording" : "Start recording"}
                  onClick={recording ? finishRecording : () => setRecording(true)}
                >
                  <Icon name={recording ? "stop" : "mic"} />
                </button>
                <button className="record-action-label" type="button" onClick={recording ? finishRecording : () => setRecording(true)}>{recording ? "Tap to stop" : "Tap to record"}</button>
              </>
            )}
          </section>
        )}

        {tab === "add" && addStep === "review" && (
          <section className="review-screen" aria-labelledby="review-title">
            <span className="screen-eyebrow">Review</span>
            <h1 id="review-title">Ready to make your tab?</h1>
            <p>Listen once more, then give your song a name you'll recognize.</p>
            <div className="audio-review-card">
              <button type="button" aria-label={isPlaying ? "Pause audio" : "Play audio"} onClick={() => setIsPlaying(!isPlaying)}>
                <Icon name={isPlaying ? "stop" : "play"} />
              </button>
              <div>
                <div className={`review-waveform ${isPlaying ? "is-playing" : ""}`} aria-hidden="true">
                  {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
                </div>
                <span>{isPlaying ? "Playing" : "Play recording"} <time>{formatTime(recordSeconds || 132)}</time></span>
              </div>
            </div>
            <label className="review-name-field">
              <span>Song name</span>
              <input value={songName} onChange={(event) => setSongName(event.target.value)} placeholder="e.g., Sunday morning idea" />
            </label>
            <label className="review-name-field review-artist-field">
              <span>Artist <small>Optional</small></span>
              <input value={artistName} onChange={(event) => setArtistName(event.target.value)} placeholder="Artist name" />
            </label>
            <FolderSelector folders={folders} value={selectedFolder} onChange={setSelectedFolder} onCreate={() => setFolderDialogOpen(true)} />
            <button className="button button-primary make-chart-button" type="button" onClick={submitSong}>Make Tab</button>
            <button className="review-back" type="button" onClick={() => { setIsPlaying(false); setAddStep("choose"); }}>Choose a different recording</button>
          </section>
        )}

        {tab === "settings" && settingsView === "main" && (
          <section className="settings-screen" aria-labelledby="settings-title">
            <span className="screen-eyebrow">Settings</span>
            <h1 id="settings-title">Make it yours</h1>
            <div className="settings-groups">
              <section className="settings-card">
                <h2>Default instrument</h2>
                <p>Choose which tab opens first on a song.</p>
                <div className="segmented-control default-instrument-control">
                  {(["guitar", "bass"] as const).map((option) => (
                    <button
                      type="button"
                      className={instrument === option ? "selected" : ""}
                      aria-pressed={instrument === option}
                      onClick={() => setInstrument(option)}
                      key={option}
                    >
                      {option === "guitar" ? "Guitar (acoustic or electric)" : "Bass"}
                    </button>
                  ))}
                </div>
                <p className="settings-footer-note">You can switch instruments on any song.</p>
              </section>
              <section className="settings-card">
                <h2>Appearance</h2>
                <p>Choose the look that's most comfortable for you.</p>
                <div className="segmented-control appearance-control">
                  {(["system", "light", "dark"] as const).map((option) => (
                    <button
                      type="button"
                      className={appearance === option ? "selected" : ""}
                      aria-pressed={appearance === option}
                      onClick={() => selectAppearance(option)}
                      key={option}
                    >
                      {option === "system" ? "System" : option === "light" ? "Light" : "Dark"}
                    </button>
                  ))}
                </div>
              </section>
              <section className="settings-card notification-setting">
                <div>
                  <h2>Notifications</h2>
                  <p>Tab ready alerts</p>
                </div>
                <button
                  className={`ios-switch ${notificationsEnabled ? "on" : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={notificationsEnabled}
                  aria-label="Tab ready notifications"
                  onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                >
                  <span />
                </button>
              </section>
              <button className="settings-card account-settings account-card-button" type="button" onClick={() => setSettingsView("account")}>
                <div className="account-heading">
                  <h2>Account</h2>
                  <span>Signed in with {accountMethod === "apple" ? "Apple" : accountMethod === "google" ? "Google" : "Email"}</span>
                  <span>{accountEmail}</span>
                </div>
                <Icon name="chevron" />
              </button>
              <section className="settings-card about-card">
                <h2>About</h2>
                <div className="about-links">
                  <button type="button">Terms of Use <Icon name="chevron" /></button>
                  <button type="button">Privacy Policy <Icon name="chevron" /></button>
                  <div><span>App version</span><span>1.0.0</span></div>
                </div>
              </section>
            </div>
          </section>
        )}

        {tab === "settings" && settingsView === "account" && (
          <section className="account-screen" aria-labelledby="account-title">
            <button className="screen-back icon-only-back" type="button" aria-label="Back" onClick={() => setSettingsView("main")}><Icon name="back" /></button>
            <h1 id="account-title">Account</h1>

            <div className="account-preview-control" aria-label="Preview account type">
              <span>Show account version</span>
              <div className="segmented-control">
                {(["apple", "email"] as const).map((method) => (
                  <button
                    type="button"
                    className={accountMethod === method ? "selected" : ""}
                    aria-pressed={accountMethod === method}
                    onClick={() => setAccountMethod(method)}
                    key={method}
                  >
                    {method === "apple" ? "Apple" : "Email"}
                  </button>
                ))}
              </div>
            </div>

            <section className="account-detail-card profile-card">
              <h2>Profile</h2>
              <div className="profile-content">
                <span className="profile-avatar" aria-label={`${displayName || "User"} initials`}>{(displayName.trim()[0] || "E").toUpperCase()}</span>
                <label className="account-field">
                  <span>Display name</span>
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                  <small>Used in greetings only. Only you can see this.</small>
                </label>
              </div>
            </section>

            <section className="account-detail-card sign-in-card">
              <h2>Sign-in</h2>
              <div className="provider-row">
                <ProviderLogo method={accountMethod} />
                <div>
                  <strong>{accountMethod === "email" ? "Email and password" : `Sign in with ${accountMethod === "apple" ? "Apple" : "Google"}`}</strong>
                  <span>{accountEmail}</span>
                  {accountMethod !== "email" && <small>Managed by {accountMethod === "apple" ? "Apple" : "Google"}</small>}
                </div>
              </div>
              {accountMethod === "email" && (
                <div className="account-link-list">
                  <button type="button" onClick={() => { setEmailSent(false); setSettingsView("email"); }}>Change email <Icon name="chevron" /></button>
                  <button type="button" onClick={() => setSettingsView("password")}>Change password <Icon name="chevron" /></button>
                </div>
              )}
            </section>

            <section className="account-detail-card danger-zone">
              <h2>Danger zone</h2>
              <button type="button" onClick={onSignOut}>Sign out</button>
              <button className="danger-action" type="button" onClick={openDeleteAccount}>Delete account</button>
            </section>
          </section>
        )}

        {tab === "settings" && settingsView === "password" && (
          <section className="credential-screen" aria-labelledby="password-title">
            <button className="screen-back" type="button" onClick={() => setSettingsView("account")}><Icon name="back" /> Account</button>
            <span className="screen-eyebrow">Account</span>
            <h1 id="password-title">Change password</h1>
            <p>Choose a password that's easy for you to remember and hard for others to guess.</p>
            <div className="credential-card">
              {([
                { key: "current", label: "Current password" },
                { key: "next", label: "New password" },
                { key: "confirm", label: "Confirm new password" },
              ] as const).map((field) => (
                <label className="account-field password-account-field" key={field.key}>
                  <span>{field.label}</span>
                  <span className="account-password-input">
                    <input
                      type={visiblePasswords[field.key] ? "text" : "password"}
                      autoComplete={field.key === "current" ? "current-password" : "new-password"}
                      value={passwords[field.key]}
                      onChange={(event) => setPasswords({ ...passwords, [field.key]: event.target.value })}
                    />
                    <button
                      type="button"
                      aria-label={`${visiblePasswords[field.key] ? "Hide" : "Show"} ${field.label.toLowerCase()}`}
                      onClick={() => setVisiblePasswords({ ...visiblePasswords, [field.key]: !visiblePasswords[field.key] })}
                    >
                      <Icon name="eye" />
                    </button>
                  </span>
                </label>
              ))}
              <div className="password-rules" aria-live="polite">
                <span className={passwords.next.length >= 8 ? "valid" : ""}><Icon name="check" /> At least 8 characters</span>
                <span className={/\d/.test(passwords.next) ? "valid" : ""}><Icon name="check" /> Includes a number</span>
                <span className={passwords.confirm.length > 0 && passwords.confirm === passwords.next ? "valid" : ""}><Icon name="check" /> Passwords match</span>
              </div>
              <button
                className="button button-primary"
                type="button"
                disabled={!passwordIsValid}
                onClick={() => {
                  setPasswords({ current: "", next: "", confirm: "" });
                  setToast("Password updated.");
                  setSettingsView("account");
                }}
              >
                Save
              </button>
            </div>
          </section>
        )}

        {tab === "settings" && settingsView === "email" && (
          <section className="credential-screen" aria-labelledby="email-title">
            <button className="screen-back" type="button" onClick={() => setSettingsView("account")}><Icon name="back" /> Account</button>
            <span className="screen-eyebrow">Account</span>
            <h1 id="email-title">Change email</h1>
            {emailSent ? (
              <div className="confirmation-card">
                <span><Icon name="mail" /></span>
                <h2>Check your inbox</h2>
                <p>We sent a link to confirm your new email.</p>
                <button className="button button-primary" type="button" onClick={() => setSettingsView("account")}>Done</button>
              </div>
            ) : (
              <>
                <p>We'll make sure the new address belongs to you before changing it.</p>
                <div className="credential-card">
                  <label className="account-field">
                    <span>New email</span>
                    <input type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
                  </label>
                  <label className="account-field">
                    <span>Current password</span>
                    <input type="password" autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} />
                  </label>
                  <button className="button button-primary" type="button" disabled={!newEmail.includes("@") || !emailPassword} onClick={() => setEmailSent(true)}>Send confirmation link</button>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {!(tab === "add" && addStep === "record") && <nav className="tab-bar" aria-label="Main navigation">
        {([
          { id: "library", label: "Library" },
          { id: "add", label: "Add Song" },
          { id: "settings", label: "Settings" },
        ] as const).map((item) => (
          <button
            className={`tab-button ${item.id === "add" ? "tab-primary" : ""} ${tab === item.id ? "active" : ""}`}
            type="button"
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => {
              setTab(item.id);
              if (item.id === "settings") setSettingsView("main");
              if (item.id !== "add") {
                setRecording(false);
                setIsPlaying(false);
              }
            }}
            key={item.id}
          >
            <span><Icon name={item.id} /></span>
            {item.label}
          </button>
        ))}
      </nav>}

      {filterSheetOpen && (
        <div className="modal-backdrop library-filter-backdrop" role="presentation" onClick={() => setFilterSheetOpen(false)}>
          <section className="library-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filters-title" onClick={(event) => event.stopPropagation()}>
            <span className="sheet-handle" />
            <div className="filter-sheet-heading">
              <h2 id="filters-title">Filter and sort</h2>
              <button type="button" onClick={() => setFilterSheetOpen(false)}>Done</button>
            </div>

            <fieldset>
              <legend>Sort by</legend>
              <div className="filter-option-grid">
                {([
                  ["newest", "Newest"],
                  ["oldest", "Oldest"],
                  ["song", "Song name A–Z"],
                  ["artist", "Artist A–Z"],
                ] as const).map(([value, label]) => (
                  <button type="button" className={draftFilters.sort === value ? "selected" : ""} aria-pressed={draftFilters.sort === value} onClick={() => setDraftFilters({ ...draftFilters, sort: value })} key={value}>{label}</button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Date saved</legend>
              <div className="filter-option-grid">
                {([
                  ["any", "Any time"],
                  ["7", "Last 7 days"],
                  ["30", "Last 30 days"],
                  ["custom", "Custom range"],
                ] as const).map(([value, label]) => (
                  <button type="button" className={draftFilters.date === value ? "selected" : ""} aria-pressed={draftFilters.date === value} onClick={() => setDraftFilters({ ...draftFilters, date: value })} key={value}>{label}</button>
                ))}
              </div>
              {draftFilters.date === "custom" && (
                <div className="custom-date-range">
                  <label><span>From</span><input type="date" value={draftFilters.customStart} onChange={(event) => setDraftFilters({ ...draftFilters, customStart: event.target.value })} /></label>
                  <label><span>To</span><input type="date" value={draftFilters.customEnd} onChange={(event) => setDraftFilters({ ...draftFilters, customEnd: event.target.value })} /></label>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend>Artist</legend>
              <div className="artist-checklist">
                {artists.map((artist) => {
                  const selected = draftFilters.artists.includes(artist);
                  return (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      className={selected ? "selected" : ""}
                      onClick={() => setDraftFilters({ ...draftFilters, artists: selected ? draftFilters.artists.filter((item) => item !== artist) : [...draftFilters.artists, artist] })}
                      key={artist}
                    >
                      <span>{selected && <Icon name="check" />}</span>
                      {artist}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="filter-sheet-actions">
              <button className="filter-clear" type="button" onClick={clearFilters}>Clear all</button>
              <button className="button button-primary" type="button" onClick={() => { setFilters(draftFilters); setFilterSheetOpen(false); }}>Apply</button>
            </div>
          </section>
        </div>
      )}

      {folderActionFolder && folderAction === "menu" && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setFolderAction(null); setFolderActionFolder(null); }}>
          <div className="action-sheet" role="dialog" aria-modal="true" aria-label={`Actions for ${folderActionFolder}`} onClick={(event) => event.stopPropagation()}>
            <p>{folderActionFolder}</p>
            <button type="button" onClick={() => { setFolderRenameValue(folderActionFolder); setFolderAction("rename"); }}>Rename</button>
            <button className="destructive" type="button" onClick={() => setFolderAction("delete")}>Delete</button>
            <button className="cancel-action" type="button" onClick={() => { setFolderAction(null); setFolderActionFolder(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {folderActionFolder && folderAction === "rename" && (
        <div className="modal-backdrop">
          <form className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-folder-title" onSubmit={(event) => { event.preventDefault(); renameFolder(); }}>
            <h2 id="rename-folder-title">Rename folder</h2>
            <label><span className="sr-only">Folder name</span><input autoFocus value={folderRenameValue} onChange={(event) => setFolderRenameValue(event.target.value)} /></label>
            <div>
              <button className="dialog-cancel" type="button" onClick={() => { setFolderAction(null); setFolderActionFolder(null); }}>Cancel</button>
              <button className="dialog-confirm" type="submit" disabled={!folderRenameValue.trim()}>Save</button>
            </div>
          </form>
        </div>
      )}

      {folderActionFolder && folderAction === "delete" && (
        <div className="modal-backdrop">
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-folder-title">
            <h2 id="delete-folder-title">Delete “{folderActionFolder}”?</h2>
            <p>Songs in this folder will move to All Songs.</p>
            <div>
              <button className="dialog-cancel" type="button" onClick={() => { setFolderAction(null); setFolderActionFolder(null); }}>Cancel</button>
              <button className="dialog-delete" type="button" onClick={deleteFolder}>Delete folder</button>
            </div>
          </div>
        </div>
      )}

      {menuSong && !dialog && !moveFolderOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setMenuSong(null)}>
          <div className="action-sheet" role="dialog" aria-modal="true" aria-label={`Actions for ${menuSong.title}`} onClick={(event) => event.stopPropagation()}>
            <p>{menuSong.title}</p>
            <button type="button" onClick={() => { setRenameValue(menuSong.title); setDialog("rename"); }}>Rename</button>
            <button type="button" onClick={() => { setMoveFolderOpen(true); }}>Move to Folder</button>
            <button className="destructive" type="button" onClick={() => setDialog("delete")}>Delete</button>
            <button className="cancel-action" type="button" onClick={() => setMenuSong(null)}>Cancel</button>
          </div>
        </div>
      )}

      {menuSong && moveFolderOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="folder-move-sheet" role="dialog" aria-modal="true" aria-labelledby="move-folder-title">
            <span className="sheet-handle" />
            <h2 id="move-folder-title">Move to Folder</h2>
            <p>Choose where to keep “{menuSong.title}.”</p>
            <div className="folder-move-list">
              {["", ...folders].map((folder) => (
                <button
                  type="button"
                  className={(menuSong.folder ?? "") === folder ? "selected" : ""}
                  onClick={() => {
                    setSongs((current) => current.map((song) => song.id === menuSong.id ? { ...song, folder: folder || undefined } : song));
                    setMoveFolderOpen(false);
                    setMenuSong(null);
                  }}
                  key={folder || "all"}
                >
                  <span><Icon name="folder" /> {folder || "All Songs (no folder)"}</span>
                  {(menuSong.folder ?? "") === folder && <Icon name="check" />}
                </button>
              ))}
            </div>
            <button className="picker-cancel" type="button" onClick={() => { setMoveFolderOpen(false); setMenuSong(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {menuSong && dialog && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            {dialog === "rename" ? (
              <>
                <h2 id="dialog-title">Rename song</h2>
                <p>Choose a name you'll recognize later.</p>
                <label>
                  <span className="sr-only">Song name</span>
                  <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
                </label>
                <div>
                  <button className="dialog-cancel" type="button" onClick={() => { setDialog(null); setMenuSong(null); }}>Cancel</button>
                  <button className="dialog-confirm" type="button" onClick={saveRename}>Save</button>
                </div>
              </>
            ) : (
              <>
                <h2 id="dialog-title">Delete '{menuSong.title}'?</h2>
                <p>This removes the tab and its audio from this phone.</p>
                <div>
                  <button className="dialog-cancel" type="button" onClick={() => { setDialog(null); setMenuSong(null); }}>Cancel</button>
                  <button className="dialog-delete" type="button" onClick={deleteSong}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteAccountOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog delete-account-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title">
            <h2 id="delete-account-title">Delete your account?</h2>
            <p>This permanently deletes your account and all your tabs. This can't be undone.</p>
            {accountMethod !== "email" && !providerConfirmed && (
              <button className="provider-confirm-button" type="button" onClick={() => setProviderConfirmed(true)}>
                <ProviderLogo method={accountMethod} />
                Re-confirm with {accountMethod === "apple" ? "Apple" : "Google"}
              </button>
            )}
            {providerConfirmed && accountMethod !== "email" && (
              <p className="provider-confirmed"><Icon name="check" /> Identity confirmed with {accountMethod === "apple" ? "Apple" : "Google"}.</p>
            )}
            <label className="delete-confirm-field">
              <span>Type <strong>DELETE</strong> to continue</span>
              <input autoCapitalize="characters" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} />
            </label>
            <div>
              <button className="dialog-cancel" type="button" onClick={() => setDeleteAccountOpen(false)}>Cancel</button>
              <button className="dialog-delete" type="button" disabled={deleteText !== "DELETE" || !providerConfirmed} onClick={onSignOut}>Delete account</button>
            </div>
          </div>
        </div>
      )}

      {discardRecordingOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-recording-title">
            <h2 id="discard-recording-title">Discard this recording?</h2>
            <p>Your recording hasn't been saved yet.</p>
            <div>
              <button className="dialog-cancel" type="button" onClick={() => setDiscardRecordingOpen(false)}>Keep recording</button>
              <button
                className="dialog-delete"
                type="button"
                onClick={() => {
                  setRecording(false);
                  setRecordSeconds(0);
                  setDiscardRecordingOpen(false);
                  setAddStep("choose");
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {notificationsPrompt && (
        <div className="permission-overlay">
          <section className="permission-screen notification-permission" role="dialog" aria-modal="true" aria-labelledby="notification-title">
            <span className="permission-icon"><Icon name="bell" /></span>
            <span className="screen-eyebrow">Notifications</span>
            <h1 id="notification-title">Want a heads-up when your tab is ready?</h1>
            <p>Amphion can let you know when your song is ready to play.</p>
            <div>
              <button className="button button-primary" type="button" onClick={() => { setNotificationsEnabled(true); setNotificationsPrompt(false); }}>Turn on notifications</button>
              <button className="permission-later" type="button" onClick={() => { setNotificationsEnabled(false); setNotificationsPrompt(false); }}>Maybe later</button>
            </div>
          </section>
        </div>
      )}

      {folderDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-folder-title"
            onSubmit={(event) => {
              event.preventDefault();
              createFolder();
            }}
          >
            <h2 id="new-folder-title">Make a folder</h2>
            <p>Folders can help keep songs for practice, lessons, or ideas together.</p>
            <label>
              <span className="sr-only">Folder name</span>
              <input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Folder name" />
            </label>
            <div>
              <button className="dialog-cancel" type="button" onClick={() => { setFolderDialogOpen(false); setNewFolderName(""); }}>Cancel</button>
              <button className="dialog-confirm" type="submit" disabled={!newFolderName.trim()}>Create folder</button>
            </div>
          </form>
        </div>
      )}

      {readyBanner && (
        <ReadyBanner
          title={readyBanner.title}
          onOpen={() => {
            window.scrollTo({ top: 0 });
            setActiveSongId(readyBanner.songId);
            setReadyBanner(null);
          }}
          onDismiss={() => setReadyBanner(null)}
        />
      )}
      {toast && <div className="success-toast" role="status"><Icon name="check" /> {toast}</div>}
    </main>
  );
}
