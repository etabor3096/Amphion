"""The whole analysis: one audio file in, one RC-20 document out."""
from __future__ import annotations

import logging
import tempfile
import time
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

from . import rc20
from .audio import load_audio, sha256_file
from .beats import track_beats
from .bass_notes import detect_bass_notes_from_file
from .harmony import detect_chords, detect_key
from .notes import detect_notes
from .onsets import snap_part_to_onsets
from .separate import INSTRUMENTS, separate_parts
from .tab_assign import assign_strings_and_frets
from .tempo_tuning import estimate_tempo, estimate_tuning_offset_cents

log = logging.getLogger("amphion_pipeline")


@contextmanager
def _stage(name: str, timings: dict[str, float]):
    started = time.perf_counter()
    try:
        yield
    finally:
        timings[name] = round(time.perf_counter() - started, 2)
        log.info("stage %-10s %6.2f s", name, timings[name])


def _detail(name: str, compute):
    """Key, tempo and tuning may be Unknown (RC-11): a failure here gives null, not a guess and not a crash."""
    try:
        return compute()
    except Exception as error:  # noqa: BLE001 - recorded, and the value is reported as Unknown
        log.warning("could not determine %s, leaving it Unknown: %s", name, error)
        return None


class _InlineExecutor:
    """Runs each task immediately, in the calling thread: the one-stage-at-a-time order, for comparison and debugging."""

    def submit(self, fn, *args):
        future: Future = Future()
        try:
            future.set_result(fn(*args))
        except BaseException as error:  # noqa: BLE001 - re-raised by result(), exactly as a pool would
            future.set_exception(error)
        return future

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


# Threads, not processes: the heavy work (PyTorch, ONNX Runtime, NumPy) runs outside the GIL, and the stages share
# the audio in memory instead of copying it. Separation runs on the calling thread. Beats and details (2 stages) run
# during it, then notes and chords (2 stages) after it, so 4 workers means nothing ever waits for a free one.
_WORKERS = 4


def analyze(
    audio_path: str | Path,
    *,
    tmp_root: str | Path | None = None,
    timings: dict[str, float] | None = None,
    parallel: bool = True,
) -> dict:
    """Analyze one audio file and return its RC-20 document.

    The separated guitar and bass parts are written only inside a temporary folder under `tmp_root` (the system
    temp folder if None). That folder is deleted when this function leaves, on success and on any exception (RC-03).
    Any failure in separation, note detection, beats or chords raises: a partial tab is never returned (RC-09).

    Stages that do not need each other run at the same time (`parallel=True`, the default). Beats and the key, tempo and
    tuning only need the mixed audio, so they run while Demucs separates. Notes and chords both need the separated
    parts and run side by side once separation is done. The result is identical to `parallel=False`. Each entry in
    `timings` is that stage's own duration, so with `parallel=True` they add up to more than the real time taken;
    `timings["total"]` is the real time from loading to the finished tab.
    """
    timings = {} if timings is None else timings
    began = time.perf_counter()
    audio_path = Path(audio_path)
    with _stage("load", timings):
        sha256 = sha256_file(audio_path)
        audio = load_audio(audio_path)

    def beats_task():
        with _stage("beats", timings):
            return track_beats(audio.mono, audio.sample_rate)

    def details_task():
        with _stage("details", timings):
            return (
                _detail("key", lambda: detect_key(audio.mono, audio.sample_rate)),
                _detail("tempo", lambda: estimate_tempo(audio.mono, audio.sample_rate)),
                _detail("tuning", lambda: estimate_tuning_offset_cents(audio.mono, audio.sample_rate)),
            )

    def notes_task(stems):
        tabs: dict[str, list[dict]] = {}
        with _stage("notes", timings):
            for instrument in INSTRUMENTS:
                if instrument == "bass":  # pitch tracking, not Basic Pitch: see bass_notes.py
                    tabs[instrument] = detect_bass_notes_from_file(stems[instrument])
                else:
                    tabs[instrument] = snap_part_to_onsets(detect_notes(stems[instrument], instrument), stems[instrument])
        return tabs

    def chords_task(harmonic):
        with _stage("chords", timings):
            return detect_chords(harmonic, audio.sample_rate)  # the song without drums and vocals

    # The pool is left (and so every task has finished) before the temporary folder is deleted, even on an error.
    with tempfile.TemporaryDirectory(prefix="amphion-", dir=tmp_root) as work_dir:
        with (ThreadPoolExecutor(max_workers=_WORKERS) if parallel else _InlineExecutor()) as pool:
            beats_future = pool.submit(beats_task)
            details_future = pool.submit(details_task)
            with _stage("separate", timings):
                stems, harmonic = separate_parts(audio.stereo, audio.sample_rate, Path(work_dir))
            notes_future = pool.submit(notes_task, stems)
            chords_future = pool.submit(chords_task, harmonic)
            # result() re-raises a stage's error here, so a failed stage means no document (RC-09).
            beats, downbeats, beats_per_bar = beats_future.result()
            key, bpm, tuning = details_future.result()
            chords = chords_future.result()
            tabs = notes_future.result()

    with _stage("tab", timings):
        for instrument in INSTRUMENTS:
            tabs[instrument] = assign_strings_and_frets(tabs[instrument], instrument, tuning)
    timings["total"] = round(time.perf_counter() - began, 2)
    log.info("total      %6.2f s", timings["total"])

    document = {
        "schemaVersion": rc20.SCHEMA_VERSION,
        "audioSha256": sha256,
        "duration": round(audio.duration, 3),
        "key": key,
        "bpm": bpm,
        "tuningOffsetCents": tuning,
        "beatsPerBar": beats_per_bar,
        "beats": beats,
        "downbeats": downbeats,
        "chords": chords,
        # A part with no detected notes is reported as not found (guitar null, bass null: "No bass part found").
        "guitar": {"notes": tabs["guitar"]} if tabs["guitar"] else None,
        "bass": {"notes": tabs["bass"]} if tabs["bass"] else None,
    }
    rc20.validate(document)
    return document
