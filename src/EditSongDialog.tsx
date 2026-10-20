import { useState } from "react";
import type { LibrarySong } from "./mock/types";

export interface SongDetails {
  title: string;
  /** Undefined when the user leaves Artist empty (DD-12: artist is optional). */
  artist?: string;
}

interface EditSongDialogProps {
  song: Pick<LibrarySong, "title" | "artist">;
  onSave: (details: SongDetails) => void;
  onCancel: () => void;
}

/** "Edit details" dialog shared by the Library and Song screen: song name is required, artist is optional (DD-12). */
export default function EditSongDialog({ song, onSave, onCancel }: EditSongDialogProps) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? "");
  const trimmedTitle = title.trim();

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="confirm-dialog edit-song-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-song-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmedTitle) onSave({ title: trimmedTitle, artist: artist.trim() || undefined });
        }}
      >
        <h2 id="edit-song-title">Edit details</h2>
        <p>Choose a name you'll recognize later.</p>
        <label>
          <span>Song name</span>
          <input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>Artist <small>Optional</small></span>
          <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Artist name" />
        </label>
        <div>
          <button className="dialog-cancel" type="button" onClick={onCancel}>Cancel</button>
          <button className="dialog-confirm" type="submit" disabled={!trimmedTitle}>Save</button>
        </div>
      </form>
    </div>
  );
}
