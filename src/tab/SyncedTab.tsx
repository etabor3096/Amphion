import { useCallback, useEffect, useMemo, useState } from "react";
import { editTranscription, undoLastEdit, useUndoCount } from "../mock/store";
import type { Instrument, Transcription } from "../mock/types";
import type { PlaybackClock } from "../playback/clock";
import { usePlaybackFrame, usePlaybackState } from "../playback/usePlayback";
import ChordView from "./ChordView";
import { addNote, confirmNote, deleteNote, isUnsure, moveNoteToString, renameChord, setNoteFret } from "./edits";
import { barIndexAt, describePosition, getBars, getRows, rowIndexAt, slotLengthAt } from "./layout";
import NoteEditorSheet from "./NoteEditorSheet";
import PracticeBar from "./PracticeBar";
import TabView from "./TabView";
import { useAutoFollow } from "./useAutoFollow";

type SongView = "tab" | "chords";

interface SyncedTabProps {
  songId: number;
  transcription: Transcription;
  clock: PlaybackClock;
  /** False when this song's audio is on another iPhone (RC-19): the tab shows, playback does not. */
  audioAvailable: boolean;
  defaultInstrument: Instrument;
}

// The "?" hint stays dismissed for the rest of the session once closed.
let hintDismissedThisSession = false;

function BassIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 3.5 20 2l-1.5 5.5-6.2 6.2" />
      <path d="m14.8 5.2 4 4M11.8 11.2c2.2 2.2 2.3 5.6.3 7.6s-5.4 1.9-7.6-.3-2.3-5.6-.3-7.6 5.4-1.9 7.6.3Z" />
      <circle cx="8.2" cy="15.2" r="1.4" />
    </svg>
  );
}

/**
 * The tab section of the Song screen and everything synced to playback. One animation-frame
 * loop reads the clock and drives the playhead, note highlights and auto-scroll (RC-18).
 */
export default function SyncedTab({ songId, transcription, clock, audioAvailable, defaultInstrument }: SyncedTabProps) {
  const [instrument, setInstrument] = useState<Instrument>(defaultInstrument);
  const [view, setView] = useState<SongView>("tab");
  const [time, setTime] = useState(() => clock.currentTime());
  const [pendingLoopStart, setPendingLoopStart] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(hintDismissedThisSession);
  const { playing, rate, loop } = usePlaybackState(clock);
  const undoCount = useUndoCount(songId);
  const follow = useAutoFollow(playing && audioAvailable);

  const bars = useMemo(() => getBars(transcription), [transcription]);
  const rows = useMemo(() => getRows(bars), [bars]);
  const tab = transcription[instrument];
  const notes = tab?.notes ?? [];
  const tabNotes = tab?.notes;
  const editingNote = editingNoteId ? notes.find((note) => note.id === editingNoteId) : undefined;
  const unsureChordCount = transcription.chords.filter(isUnsure).length;
  const unsureCount = notes.filter(isUnsure).length + unsureChordCount;
  const chordsView = view === "chords";
  const showHint = !hintDismissed && (chordsView ? unsureChordCount > 0 : Boolean(tab) && unsureCount > 0);

  // The single per-frame update: song time from the clock → state for drawing → auto-scroll.
  usePlaybackFrame(clock, (songTime) => {
    setTime(songTime);
    if (audioAvailable) follow.step(rowIndexAt(rows, songTime));
  });

  // The synth clock plays whichever part is shown; no part means silence.
  useEffect(() => {
    clock.setAudibleNotes?.(tabNotes ?? []);
  }, [clock, tabNotes]);

  // Keep the screen awake while a song plays (US-12), where the browser supports it.
  useEffect(() => {
    if (!playing || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    navigator.wakeLock
      .request("screen")
      .then((sentinel) => {
        if (released) void sentinel.release();
        else lock = sentinel;
      })
      .catch(() => undefined);
    return () => {
      released = true;
      lock?.release().catch(() => undefined);
    };
  }, [playing]);

  const edit = (change: (current: Transcription) => Transcription) => editTranscription(songId, change);

  const openEditor = useCallback(
    (noteId: string) => {
      clock.pause();
      setEditingNoteId(noteId);
    },
    [clock],
  );

  const seek = useCallback((songTime: number) => clock.seek(songTime), [clock]);

  const toggleLoop = () => {
    const bar = bars[barIndexAt(bars, clock.currentTime())];
    if (loop) {
      clock.setLoop(null);
      return;
    }
    if (pendingLoopStart === null) {
      setPendingLoopStart(bar.start);
      return;
    }
    const firstBar = bars[barIndexAt(bars, pendingLoopStart)];
    clock.setLoop({ start: Math.min(firstBar.start, bar.start), end: Math.max(firstBar.end, bar.end) });
    setPendingLoopStart(null);
  };

  const handleAddNote = (string: number, startTime: number) => {
    const slot = slotLengthAt(bars, startTime, transcription.beatsPerBar);
    const nextOnString = notes
      .filter((note) => note.string === string && note.startTime > startTime)
      .reduce((soonest, note) => Math.min(soonest, note.startTime), Infinity);
    const length = Math.min(instrument === "bass" ? slot * 2 : slot, nextOnString - startTime) * 0.9;
    let newId = "";
    edit((current) => {
      const [next, id] = addNote(current, instrument, { string, fret: 0, startTime, duration: length });
      newId = id;
      return next;
    });
    openEditor(newId);
  };

  const switchInstrument = (next: Instrument) => {
    setEditingNoteId(null);
    setInstrument(next);
  };

  const switchView = (next: SongView) => {
    setEditingNoteId(null);
    setView(next);
  };

  return (
    <>
      <section className="tab-section" aria-labelledby="tab-title">
        <div className="song-section-heading">
          <div>
            <span>{instrument === "guitar" ? "Guitar" : "Bass"} · {bars.length} bars</span>
            <h2 id="tab-title">{chordsView ? "Chords" : instrument === "guitar" ? "Guitar tab" : "Bass tab"}</h2>
          </div>
          <button className="tab-undo-button" type="button" disabled={undoCount === 0} onClick={() => undoLastEdit(songId)} aria-label="Undo last tab edit">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
            Undo
          </button>
        </div>

        <div className="segmented-control song-view-switch" role="group" aria-label="Song view">
          <button type="button" className={!chordsView ? "selected" : ""} aria-pressed={!chordsView} onClick={() => switchView("tab")}>Tab</button>
          <button type="button" className={chordsView ? "selected" : ""} aria-pressed={chordsView} onClick={() => switchView("chords")}>Chords</button>
        </div>

        <div className="song-instrument-switch" role="group" aria-label="Tab instrument">
          <button type="button" className={instrument === "guitar" ? "selected" : ""} aria-pressed={instrument === "guitar"} onClick={() => switchInstrument("guitar")}>
            <strong>Guitar</strong>
            <small>Acoustic or electric</small>
          </button>
          <button type="button" className={instrument === "bass" ? "selected" : ""} aria-pressed={instrument === "bass"} onClick={() => switchInstrument("bass")}>
            <strong>Bass</strong>
          </button>
        </div>

        {!chordsView && tab && (
          <p className="tab-explainer">
            Each line is a string. Each number is the fret to press (0 = open string).{" "}
            {audioAvailable ? "Tap a note to jump there; press and hold it to edit." : "Press and hold a note to edit it."}
          </p>
        )}

        {showHint && (
          <div className="tab-confidence-hint" role="note">
            <span className="tab-flag" aria-hidden="true">?</span>
            <p><strong>? = Amphion isn't sure about this {chordsView ? "chord" : "note"}.</strong> Check it by ear.</p>
            <button
              type="button"
              aria-label="Dismiss hint"
              onClick={() => {
                hintDismissedThisSession = true;
                setHintDismissed(true);
              }}
            >
              ×
            </button>
          </div>
        )}

        {chordsView ? (
          <ChordView
            transcription={transcription}
            instrument={instrument}
            bars={bars}
            rows={rows}
            time={time}
            canSeek={audioAvailable}
            loop={loop}
            rowRef={follow.rowRef}
            onSeek={seek}
            onRenameChord={(chordId, name) => edit((current) => renameChord(current, chordId, name))}
          />
        ) : tab ? (
          <TabView
            transcription={transcription}
            instrument={instrument}
            bars={bars}
            rows={rows}
            time={time}
            canSeek={audioAvailable}
            loop={loop}
            pendingLoopStart={pendingLoopStart}
            selectedNoteId={editingNoteId}
            rowRef={follow.rowRef}
            onSeek={seek}
            onEditNote={openEditor}
            onAddNote={handleAddNote}
            onRenameChord={(chordId, name) => edit((current) => renameChord(current, chordId, name))}
          />
        ) : (
          <div className="bass-empty-state" role="status">
            <span><BassIcon /></span>
            <strong>No bass part found</strong>
            <p>Amphion couldn't hear a bass in this recording.</p>
          </div>
        )}
      </section>

      {audioAvailable ? (
        <>
          {follow.followPaused && (
            <button className="back-to-playhead" type="button" onClick={follow.backToPlayhead}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              Back to playhead
            </button>
          )}
          <PracticeBar
            clock={clock}
            time={time}
            playing={playing}
            rate={rate}
            loop={loop}
            pendingLoopStart={pendingLoopStart}
            onToggleLoop={toggleLoop}
            onScrub={(songTime) => {
              clock.seek(songTime);
              follow.backToPlayhead();
            }}
          />
        </>
      ) : (
        <section className="practice-controls no-audio-bar" role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
          <p>Synced playback is only available on the iPhone that recorded or uploaded this song.</p>
        </section>
      )}

      {editingNote && !chordsView && (
        <NoteEditorSheet
          instrument={instrument}
          note={editingNote}
          notes={notes}
          position={describePosition(bars, editingNote.startTime, transcription.beatsPerBar)}
          onFretChange={(fret) => edit((current) => setNoteFret(current, instrument, editingNote.id, fret))}
          onMoveToString={(string, fret) => edit((current) => moveNoteToString(current, instrument, editingNote.id, string, fret))}
          onConfirm={() => edit((current) => confirmNote(current, instrument, editingNote.id))}
          onDelete={() => {
            edit((current) => deleteNote(current, instrument, editingNote.id));
            setEditingNoteId(null);
          }}
          onClose={() => setEditingNoteId(null)}
        />
      )}
    </>
  );
}
