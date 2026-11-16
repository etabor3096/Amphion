"""Reading the input file. All stages share one decode so they agree on song time (RC-18)."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

SAMPLE_RATE = 44100  # Demucs and madmom both work at 44.1 kHz


@dataclass(frozen=True)
class Audio:
    stereo: np.ndarray  # shape (2, samples), float32
    mono: np.ndarray  # shape (samples,), float32: the mix, used for beats, chords, key, tempo and tuning
    sample_rate: int

    @property
    def duration(self) -> float:
        """Length in seconds, as decoded."""
        return self.mono.shape[-1] / self.sample_rate


def sha256_file(path: str | Path) -> str:
    """Lowercase hex SHA-256 of the exact bytes of the file (RC-19). Same as `shasum -a 256`."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def load_audio(path: str | Path, sample_rate: int = SAMPLE_RATE) -> Audio:
    """Decode MP3, M4A or WAV to 44.1 kHz stereo and its mono mix. No trimming (RC-19)."""
    data, _ = librosa.load(str(path), sr=sample_rate, mono=False)
    data = np.atleast_2d(data).astype(np.float32)
    if data.shape[0] == 1:
        data = np.repeat(data, 2, axis=0)  # a mono file: Demucs needs two channels
    stereo = np.ascontiguousarray(data[:2])
    if stereo.shape[-1] == 0:
        raise ValueError("the audio file has no samples")
    return Audio(stereo=stereo, mono=np.ascontiguousarray(stereo.mean(axis=0)), sample_rate=sample_rate)
