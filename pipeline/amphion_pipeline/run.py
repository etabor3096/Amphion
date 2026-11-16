"""The whole analysis: one audio file in, one RC-20 document out."""
from __future__ import annotations

import logging
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

from . import rc20
from .audio import load_audio, sha256_file
from .beats import track_beats
from .harmony import detect_chords, detect_key
from .notes import detect_notes
from .separate import INSTRUMENTS, separate
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


def analyze(audio_path: str | Path, *, tmp_root: str | Path | None = None, timings: dict[str, float] | None = None) -> dict:
    """Analyze one audio file and return its RC-20 document.

    The separated guitar and bass parts are written only inside a temporary folder under `tmp_root` (the system
    temp folder if None). That folder is deleted when this function leaves, on success and on any exception (RC-03).
    Any failure in separation, note detection, beats or chords raises: a partial tab is never returned (RC-09).
    """
    timings = {} if timings is None else timings
    audio_path = Path(audio_path)
    with _stage("load", timings):
        sha256 = sha256_file(audio_path)
        audio = load_audio(audio_path)

    tabs: dict[str, list[dict]] = {}
    with tempfile.TemporaryDirectory(prefix="amphion-", dir=tmp_root) as work_dir:
        with _stage("separate", timings):
            stems = separate(audio.stereo, audio.sample_rate, Path(work_dir))
        with _stage("notes", timings):
            for instrument in INSTRUMENTS:
                tabs[instrument] = detect_notes(stems[instrument], instrument)

    with _stage("beats", timings):
        beats, downbeats, beats_per_bar = track_beats(audio.mono, audio.sample_rate)
    with _stage("chords", timings):
        chords = detect_chords(audio.mono, audio.sample_rate)
    with _stage("details", timings):
        key = _detail("key", lambda: detect_key(audio.mono, audio.sample_rate))
        bpm = _detail("tempo", lambda: estimate_tempo(audio.mono, audio.sample_rate))
        tuning = _detail("tuning", lambda: estimate_tuning_offset_cents(audio.mono, audio.sample_rate))

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
