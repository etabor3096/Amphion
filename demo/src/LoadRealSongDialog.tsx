import { useState } from "react";
import { loadRealSong, type RealSong } from "./realSong/loadRealSong";

interface LoadRealSongDialogProps {
  songId: number;
  onLoaded: (song: RealSong, fileNames: { tab: string; audio: string }) => void;
  onCancel: () => void;
}

/**
 * Proof-of-concept loader (POC-03): pick the tab file the pipeline wrote (RC-20 JSON) and the
 * audio file it was made from. A bad tab file shows an error here; audio that does not match
 * still opens the tab, without synced playback.
 */
export default function LoadRealSongDialog({ songId, onLoaded, onCancel }: LoadRealSongDialogProps) {
  const [tabFile, setTabFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!tabFile || !audioFile) return;
    setBusy(true);
    setError(null);
    try {
      const result = await loadRealSong(tabFile, audioFile, songId);
      if (result.ok) onLoaded(result.song, { tab: tabFile.name, audio: audioFile.name });
      else setError(result.error);
    } catch {
      setError("Something went wrong while reading these files. Try them again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="confirm-dialog edit-song-dialog load-real-song-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-real-song-title"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <h2 id="load-real-song-title">Load a real transcription</h2>
        <p>Choose the tab file made by the Amphion pipeline and the audio file it was made from.</p>
        <label>
          <span>Tab file <small>.json</small></span>
          <input
            type="file"
            accept=".json,application/json"
            required
            onChange={(event) => {
              setTabFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>
        <label>
          <span>Audio file <small>Same file</small></span>
          <input
            type="file"
            accept="audio/*,.m4a,.mp3,.wav"
            required
            onChange={(event) => {
              setAudioFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>
        {error && <p className="load-real-song-error" role="alert">{error}</p>}
        {busy && <p role="status">Checking the files…</p>}
        <div>
          <button className="dialog-cancel" type="button" onClick={onCancel}>Cancel</button>
          <button className="dialog-confirm" type="submit" disabled={!tabFile || !audioFile || busy}>Load</button>
        </div>
      </form>
    </div>
  );
}
