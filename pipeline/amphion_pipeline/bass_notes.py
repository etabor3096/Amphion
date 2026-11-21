"""Stage 2 for the bass: find its notes by tracking the pitch (librosa pYIN), not with Basic Pitch.

Why not Basic Pitch (benchmark, P1-06): a phone microphone barely records a bass's lowest notes, so the fundamental is
several times weaker than its 2nd and 3rd harmonics, and Basic Pitch reports the harmonic: notes 12, 19 or 24 semitones too
high. pYIN follows the period of the whole waveform, so it still finds the fundamental when it is weak. A bass plays one
note at a time, so one pitch track is enough. Basic Pitch still finds the guitar notes (`notes.py`).

The track is cut into notes at onsets and at pitch changes that last a few frames, short octave jumps are fixed, and
quiet or unsteady stretches are dropped. Every number is a named, adjustable value in `BassParams`.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

SAMPLE_RATE = 22050
HOP = 256
FRAME_LENGTH = 4096  # pYIN needs a few periods of the lowest note (B0, 31 Hz)
LOWEST, HIGHEST = "B0", "G4"  # a four-string bass with 24 frets stays inside this


@dataclass(frozen=True)
class BassParams:
    quiet_db: float = -30.0
    """A frame this far below the loudest frame of the part is silence, whatever pYIN says."""

    boundary_frames: int = 6
    """A pitch change that lasts at least this many frames (hop = 11.6 ms) starts a new note."""

    octave_fix_frames: int = 12
    """A run this short that sits exactly an octave from both neighbours is a tracker error: it is moved to its neighbour."""

    min_voiced_frames: int = 7
    """A piece with fewer voiced, audible frames than this is not a note."""

    dominance: float = 0.5
    """The note's pitch must hold at least this share of the voiced frames in its piece, or the piece is dropped."""

    merge_gap: float = 0.06
    """Two pieces of the same pitch with no new attack between them, closer than this many seconds, are one note."""

    min_note: float = 0.1
    """Shortest note kept, in seconds."""


DEFAULT_PARAMS = BassParams()


@dataclass(frozen=True)
class Track:
    f0: np.ndarray  # Hz per frame, NaN where unvoiced
    voiced: np.ndarray  # bool per frame
    probability: np.ndarray  # pYIN's voiced probability per frame
    onsets: np.ndarray  # onset frame indexes
    rms: np.ndarray  # loudness per frame


def track_pitch(audio: np.ndarray, sample_rate: int) -> Track:
    """Track the pitch of one mono signal. Slow (about 15 s for 3 minutes), so it is done once per song."""
    y = librosa.resample(audio, orig_sr=sample_rate, target_sr=SAMPLE_RATE) if sample_rate != SAMPLE_RATE else audio
    f0, voiced, probability = librosa.pyin(
        y,
        fmin=librosa.note_to_hz(LOWEST),
        fmax=librosa.note_to_hz(HIGHEST),
        sr=SAMPLE_RATE,
        frame_length=FRAME_LENGTH,
        hop_length=HOP,
    )
    envelope = librosa.onset.onset_strength(y=y, sr=SAMPLE_RATE, hop_length=HOP)
    onsets = librosa.onset.onset_detect(onset_envelope=envelope, sr=SAMPLE_RATE, hop_length=HOP, backtrack=False, units="frames")
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    return Track(f0=f0, voiced=voiced, probability=probability, onsets=onsets, rms=rms)


def _runs(values: np.ndarray) -> list[tuple[int, int, float]]:
    """(first index, last index, value) of every stretch of equal values; NaN counts as equal to NaN."""
    out = []
    i = 0
    while i < len(values):
        j = i
        while j + 1 < len(values) and (values[j + 1] == values[i] or (np.isnan(values[j + 1]) and np.isnan(values[i]))):
            j += 1
        out.append((i, j, values[i]))
        i = j + 1
    return out


def segment(track: Track, params: BassParams = DEFAULT_PARAMS) -> list[dict]:
    """Cut a pitch track into notes. Returns note dicts in time order with null string and fret (tab assignment fills them)."""
    n = len(track.f0)
    if n == 0:
        return []
    seconds = librosa.frames_to_time(np.arange(n), sr=SAMPLE_RATE, hop_length=HOP)
    midi = librosa.hz_to_midi(np.where(track.voiced, track.f0, np.nan))
    rounded = np.round(midi)

    # An isolated run exactly an octave off both of its neighbours is the tracker jumping to a harmonic.
    for _ in range(2):
        runs = _runs(rounded)
        for k in range(1, len(runs) - 1):
            first, last, pitch = runs[k]
            if np.isnan(pitch) or last - first > params.octave_fix_frames:
                continue
            for neighbour in (runs[k - 1][2], runs[k + 1][2]):
                if not np.isnan(neighbour) and abs(pitch - neighbour) == 12:
                    rounded[first : last + 1] = neighbour
                    break

    loudest = max(float(track.rms.max()), 1e-9)
    quiet = 20.0 * np.log10(np.maximum(track.rms, 1e-9) / loudest) < params.quiet_db
    onset_frames = {int(o) for o in track.onsets}
    bounds = set(onset_frames)
    i = 1
    while i < n:
        if not np.isnan(rounded[i]) and not np.isnan(rounded[i - 1]) and rounded[i] != rounded[i - 1]:
            j = i
            while j < n and rounded[j] == rounded[i]:
                j += 1
            if j - i >= params.boundary_frames:
                bounds.add(i)
            i = j
        else:
            i += 1
    edges = sorted(b for b in bounds if 0 <= b < n) + [n]

    pieces = []
    for a, b in zip(edges, edges[1:]):
        piece = rounded[a:b]
        usable = ~np.isnan(piece) & ~quiet[a:b]
        if usable.sum() < params.min_voiced_frames:
            continue
        values, counts = np.unique(piece[usable], return_counts=True)
        pitch = int(values[np.argmax(counts)])
        if counts.max() < params.dominance * usable.sum():
            continue
        held = np.where(usable & (piece == pitch))[0]
        pieces.append(
            {
                "start": float(seconds[a + held[0]]),
                "end": float(seconds[min(a + held[-1] + 1, n - 1)]),
                "pitch": pitch,
                "confidence": float(np.clip(np.mean(track.probability[a:b][usable]), 0.0, 1.0)),
                "attack": a in onset_frames,
            }
        )

    merged: list[dict] = []
    for piece in pieces:  # the same pitch split at a pitch boundary with no new attack is one note
        if merged and piece["pitch"] == merged[-1]["pitch"] and not piece["attack"] and piece["start"] - merged[-1]["end"] < params.merge_gap:
            merged[-1]["end"] = piece["end"]
        else:
            merged.append(piece)
    kept = [p for p in merged if p["end"] - p["start"] >= params.min_note]
    return [
        {
            "id": f"bass-{index}",
            "startTime": round(p["start"], 3),
            "duration": round(p["end"] - p["start"], 3),
            "string": None,
            "fret": None,
            "pitch": p["pitch"],
            "confidence": round(p["confidence"], 3),
            "edited": False,
        }
        for index, p in enumerate(kept)
    ]


def detect_bass_notes(audio: np.ndarray, sample_rate: int, params: BassParams = DEFAULT_PARAMS) -> list[dict]:
    """The bass notes in a mono bass part, in time order. `string` and `fret` are null until tab assignment (P1-05)."""
    return segment(track_pitch(audio, sample_rate), params)


def detect_bass_notes_from_file(path: Path) -> list[dict]:
    """Same, reading a WAV file (the separated bass part)."""
    audio, rate = librosa.load(str(path), sr=SAMPLE_RATE, mono=True)
    return detect_bass_notes(audio, rate)
