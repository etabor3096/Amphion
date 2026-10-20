import { useEffect, useRef, useState } from "react";
import { useAddedLabel } from "./mock/songs";
import type { Instrument, LibrarySong, Transcription } from "./mock/types";
import { SimulatedClock } from "./playback/clock";
import { usePlaybackState } from "./playback/usePlayback";
import SyncedTab from "./tab/SyncedTab";

interface SongScreenProps {
  song: LibrarySong;
  transcription: Transcription;
  defaultInstrument: Instrument;
  onBack: () => void;
  onRename: (title: string) => void;
  onPhotoChange: (photo?: string) => void;
  onDelete: () => void;
}

function SongIcon({ name }: { name: "back" | "more" | "info" | "play" | "pause" | "check" | "camera" }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true };
  if (name === "back") return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
  if (name === "more") return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
  if (name === "info") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>;
  if (name === "play") return <svg {...common}><path d="m9 6 9 6-9 6V6Z" /></svg>;
  if (name === "pause") return <svg {...common}><path d="M9 6v12M15 6v12" /></svg>;
  if (name === "camera") return <svg {...common}><path d="M4 7h4l1.5-2h5L16 7h4v12H4V7Z" /><circle cx="12" cy="13" r="3.5" /></svg>;
  return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

function SongArtwork({ art, photo, className = "" }: { art: number; photo?: string; className?: string }) {
  return (
    <div className={`playlist-artwork art-${art} ${photo ? "has-photo" : ""} ${className}`} role="img" aria-label="Song artwork">
      {photo ? <img src={photo} alt="" /> : <><span /><span /><span /></>}
    </div>
  );
}

/** Tuning is reported as an offset from standard pitch (DD-08), in words a beginner can follow (RC-13). */
function describeTuning(cents: number | null) {
  if (cents === null) return { value: "Unknown", info: "Amphion couldn't measure the tuning in this recording, so it's marked Unknown instead of guessed. Start from standard tuning." };
  if (Math.abs(cents) < 10) return { value: "Standard", info: "Tuning is how far the recording sits from standard pitch. This one is within a few cents of standard, so tune your instrument the usual way." };
  const direction = cents < 0 ? "flat" : "sharp";
  return {
    value: `${Math.abs(cents)} cents ${direction}`,
    info: `Tuning is how far the recording sits from standard pitch. This one is ${Math.abs(cents)} cents ${direction} (a cent is 1/100 of a half step). Standard tuning still works; tune slightly ${cents < 0 ? "down" : "up"} to match the recording exactly.`,
  };
}

export default function SongScreen({ song, transcription, defaultInstrument, onBack, onRename, onPhotoChange, onDelete }: SongScreenProps) {
  const { title, artist, length, folder, art, photo, audioOnThisDevice } = song;
  const added = useAddedLabel(song.addedAt);
  // One playback clock per open song. Swap SimulatedClock for a real audio-backed clock later.
  const [clock] = useState(() => new SimulatedClock(transcription.duration));
  const { playing } = usePlaybackState(clock);
  const [detailInfo, setDetailInfo] = useState<"key" | "tempo" | "tuning" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [photoActionsOpen, setPhotoActionsOpen] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => clock.pause(), [clock]);

  useEffect(() => {
    const handleScroll = () => setHeaderCollapsed(window.scrollY > 300);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const choosePhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPendingPhoto(reader.result);
        setCropOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const tuning = describeTuning(transcription.tuningOffsetCents);
  const details = [
    { id: "key", label: "Key", value: transcription.key ?? "Unknown" },
    { id: "tempo", label: "Tempo", value: transcription.bpm ? `${transcription.bpm} BPM` : "Unknown" },
    { id: "tuning", label: "Tuning", value: tuning.value },
  ] as const;

  const infoCopy = {
    key: transcription.key
      ? "The key is the group of notes and chords that feels like home for the song."
      : "Amphion couldn't tell the key of this recording, so it's marked Unknown instead of guessed.",
    tempo: "BPM means beats per minute, or how fast the song is.",
    tuning: tuning.info,
  };

  return (
    <div className="song-screen">
      <header className={`collapsed-song-bar ${headerCollapsed ? "visible" : ""}`} aria-hidden={!headerCollapsed}>
        <button type="button" tabIndex={headerCollapsed ? 0 : -1} aria-label="Back to Library" onClick={onBack}><SongIcon name="back" /></button>
        <SongArtwork art={art} photo={photo} className="compact-song-artwork" />
        <strong>{title}</strong>
      </header>

      <section className={`song-hero hero-art-${art} ${photo ? "has-photo" : ""}`}>
        <div className="song-hero-tint" aria-hidden="true">{photo && <img src={photo} alt="" />}</div>
        <button className="hero-back-button" type="button" aria-label="Back to Library" onClick={onBack}><SongIcon name="back" /></button>
        <SongArtwork art={art} photo={photo} className="hero-song-artwork" />
        <div className="song-hero-copy">
          <h1>{title}</h1>
          <p>{artist || "Unknown artist"}</p>
          <span>{length} <i aria-hidden="true">·</i> Added {added}{folder && <><i aria-hidden="true">·</i> {folder}</>}</span>
        </div>
        <div className="song-hero-actions">
          <button
            className="hero-play-button"
            type="button"
            disabled={!audioOnThisDevice}
            onClick={() => (playing ? clock.pause() : clock.play())}
            aria-label={!audioOnThisDevice ? "Playback unavailable on this iPhone" : playing ? "Pause song" : "Play song"}
          >
            <SongIcon name={playing ? "pause" : "play"} />
            {playing ? "Pause" : "Play"}
          </button>
          <button className="change-photo-button" type="button" onClick={() => setPhotoActionsOpen(true)}>
            <SongIcon name="camera" />
            Change Photo
          </button>
          <button className="hero-more-button" type="button" aria-label={`More actions for ${title}`} onClick={() => setMenuOpen(true)}><SongIcon name="more" /></button>
        </div>
        <input className="sr-only" ref={photoInputRef} type="file" accept="image/*" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <input className="sr-only" ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
      </section>

      <div className="song-detail-chips" aria-label="Song details">
        {details.map((detail) => (
          <button type="button" onClick={() => setDetailInfo(detailInfo === detail.id ? null : detail.id)} aria-label={`${detail.label}: ${detail.value}. More information`} key={detail.id}>
            <span>{detail.label}: <strong>{detail.value}</strong></span>
            <SongIcon name="info" />
          </button>
        ))}
      </div>

      {detailInfo && (
        <div className="detail-explanation" role="status">
          <span>{infoCopy[detailInfo]}</span>
          <button type="button" aria-label="Close explanation" onClick={() => setDetailInfo(null)}>Close</button>
        </div>
      )}

      <SyncedTab
        songId={song.id}
        transcription={transcription}
        clock={clock}
        audioAvailable={audioOnThisDevice}
        defaultInstrument={defaultInstrument}
      />

      {photoActionsOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPhotoActionsOpen(false)}>
          <div className="action-sheet" role="dialog" aria-modal="true" aria-label="Change song photo" onClick={(event) => event.stopPropagation()}>
            <p>Change Photo</p>
            <button type="button" onClick={() => { setPhotoActionsOpen(false); photoInputRef.current?.click(); }}>Choose from Photos</button>
            <button type="button" onClick={() => { setPhotoActionsOpen(false); cameraInputRef.current?.click(); }}>Take Photo</button>
            <button className="reset-photo-action" type="button" onClick={() => { onPhotoChange(undefined); setPhotoActionsOpen(false); }}>Reset to Default</button>
            <button className="cancel-action" type="button" onClick={() => setPhotoActionsOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {cropOpen && pendingPhoto && (
        <div className="photo-crop-screen" role="dialog" aria-modal="true" aria-labelledby="crop-title">
          <header>
            <button type="button" onClick={() => { setCropOpen(false); setPendingPhoto(null); }}>Cancel</button>
            <h2 id="crop-title">Move and scale</h2>
            <button type="button" onClick={() => { onPhotoChange(pendingPhoto); setCropOpen(false); setPendingPhoto(null); }}>Use Photo</button>
          </header>
          <div className="crop-stage">
            <div className="crop-square"><img src={pendingPhoto} alt="Selected song artwork preview" /></div>
            <p>Your photo will fill the square.</p>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setMenuOpen(false)}>
          <div className="action-sheet" role="dialog" aria-modal="true" aria-label={`Actions for ${title}`} onClick={(event) => event.stopPropagation()}>
            <p>{title}</p>
            <button type="button" onClick={() => { setRenameValue(title); setMenuOpen(false); setRenameOpen(true); }}>Rename</button>
            <button className="destructive" type="button" onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}>Delete</button>
            <button className="cancel-action" type="button" onClick={() => setMenuOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {renameOpen && (
        <div className="modal-backdrop">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-song-title">
            <h2 id="rename-song-title">Rename song</h2>
            <label><span className="sr-only">Song name</span><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label>
            <div>
              <button className="dialog-cancel" type="button" onClick={() => setRenameOpen(false)}>Cancel</button>
              <button className="dialog-confirm" type="button" onClick={() => { if (renameValue.trim()) onRename(renameValue.trim()); setRenameOpen(false); }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="modal-backdrop">
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-song-title">
            <h2 id="delete-song-title">Delete '{title}'?</h2>
            <p>This removes the song, its tab, and its audio from this phone.</p>
            <div>
              <button className="dialog-cancel" type="button" onClick={() => setDeleteOpen(false)}>Cancel</button>
              <button className="dialog-delete" type="button" onClick={onDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
