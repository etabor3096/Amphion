"""Shared helpers: the audio's constant-Q spectrum and a note roll to compare against it."""
import numpy as np
import librosa

SR = 22050
HOP = 512
FMIN_MIDI = 24
NBINS = 72  # MIDI 24..95


def audio_cqt(path):
    y, _ = librosa.load(path, sr=SR, mono=True)
    C = np.abs(librosa.cqt(y, sr=SR, hop_length=HOP, fmin=librosa.midi_to_hz(FMIN_MIDI),
                           n_bins=NBINS, bins_per_octave=12))
    C = np.log1p(10 * C / (C.max() + 1e-9))
    return C, len(y) / SR


def roll(notes, beat_to_sec, nframes, harmonics=(1.0, 0.5, 0.33)):
    """A piano roll of tab notes (beats mapped to seconds), with a few harmonics and a decay."""
    R = np.zeros((NBINS, nframes))
    fps = SR / HOP
    for n in notes:
        t0 = beat_to_sec(n['start'])
        t1 = beat_to_sec(n['start'] + n['dur'])
        a = int(t0 * fps)
        b = max(a + 1, int(min(t1, t0 + 1.5) * fps))
        if a >= nframes or b <= 0:
            continue
        for k, w in enumerate(harmonics):
            p = n['pitch'] + int(round(12 * np.log2(k + 1))) - FMIN_MIDI
            if 0 <= p < NBINS:
                env = w * np.exp(-np.arange(b - a) / (0.6 * fps))
                R[p, max(a, 0):min(b, nframes)] += env[max(0, -a):max(0, -a) + min(b, nframes) - max(a, 0)]
    return R


def onset_env(C):
    d = np.diff(C, axis=1, prepend=C[:, :1])
    return np.maximum(d, 0)


def score(C_on, R_on):
    return (C_on * R_on).sum() / (np.linalg.norm(R_on) + 1e-9)
