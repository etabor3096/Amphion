"""Builds the click-track fixture for the real-transcription viewer (POC-03).

Writes click-track.wav (12 s of clicks, one every half second) and click-track.rc20.json, the
matching RC-20 tab data: one guitar note per click, bars of 4 beats at 120 BPM. Loading both in
the viewer should highlight a note exactly when each click sounds.

Standard library only. Run from anywhere: python3 make_click_track.py
"""

import hashlib
import json
import math
import struct
import wave
from pathlib import Path

HERE = Path(__file__).parent
RATE = 8000
SECONDS = 12.0
CLICK_EVERY = 0.5  # 120 BPM
BEATS_PER_BAR = 4
CLICK_SECONDS = 0.012
CLICK_HZ = 1500

# Open-position guitar notes to cycle through: (string, fret, MIDI pitch). String 1 is the high e.
PATTERN = [(5, 3, 48), (4, 2, 52), (3, 0, 55), (2, 1, 60)]


def click_samples():
    total = int(RATE * SECONDS)
    samples = [0] * total
    length = int(RATE * CLICK_SECONDS)
    for k in range(int(SECONDS / CLICK_EVERY)):
        start = int(round(k * CLICK_EVERY * RATE))
        for i in range(length):
            if start + i >= total:
                break
            envelope = math.exp(-5 * i / length)
            samples[start + i] = int(20000 * envelope * math.sin(2 * math.pi * CLICK_HZ * i / RATE))
    return samples


def main():
    wav_path = HERE / "click-track.wav"
    with wave.open(str(wav_path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(b"".join(struct.pack("<h", s) for s in click_samples()))

    clicks = [round(k * CLICK_EVERY, 3) for k in range(int(SECONDS / CLICK_EVERY))]
    notes = []
    for k, start in enumerate(clicks):
        string, fret, pitch = PATTERN[k % len(PATTERN)]
        notes.append(
            {
                "id": f"guitar-{k}",
                "startTime": start,
                "duration": 0.4,
                "string": string,
                "fret": fret,
                "pitch": pitch,
                # A few low-confidence notes so the "?" marking can be seen on the screen.
                "confidence": 0.3 if k % 7 == 3 else 0.9,
                "edited": False,
            }
        )
    bar_seconds = BEATS_PER_BAR * CLICK_EVERY
    rc20 = {
        "schemaVersion": 1,
        "audioSha256": hashlib.sha256(wav_path.read_bytes()).hexdigest(),
        "duration": SECONDS,
        "key": None,
        "bpm": 120,
        "tuningOffsetCents": None,
        "beatsPerBar": BEATS_PER_BAR,
        "beats": clicks,
        "downbeats": [round(b * bar_seconds, 3) for b in range(int(SECONDS / bar_seconds))],
        "chords": [
            {"id": "chord-0", "startTime": 0.0, "endTime": 6.0, "name": "C", "confidence": None, "edited": False},
            {"id": "chord-1", "startTime": 6.0, "endTime": 12.0, "name": "G", "confidence": None, "edited": False},
        ],
        "guitar": {"notes": notes},
        "bass": None,
    }
    (HERE / "click-track.rc20.json").write_text(json.dumps(rc20, indent=2) + "\n")
    print(f"wrote {wav_path.name} and click-track.rc20.json ({len(notes)} notes)")


main()
