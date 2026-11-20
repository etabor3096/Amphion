"""Check the benchmark manifest and every reference tab (RC-10, P1-02).

    python benchmark/check_references.py                  # needs 10 songs (RC-10)
    python benchmark/check_references.py --min-songs 3    # the proof of concept's 3 songs (#47 amendment)
    python benchmark/check_references.py --audio-dir benchmark/audio/trimmed    # also re-hash the private audio

What it checks: the manifest and each reference follow their JSON Schemas; each reference's `audioSha256` and `duration`
match its manifest entry; a part is null in the reference exactly when it is not in `instruments`; no song is longer
than 3 minutes (RC-07, in the manifest schema); no reference file is missing or unlisted. It cannot check that a
reference is *right*. Only Elijah's by-ear check does that, and `referenceStatus` records whether it happened. Exit code 0 when everything passes,
1 when anything fails.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
RC20_SCHEMA = HERE.parent / "pipeline" / "rc20.schema.json"
MANIFEST_SCHEMA = HERE / "manifest.schema.json"
DURATION_TOLERANCE = 0.5  # seconds, the same tolerance the viewer uses (POC-03)


def _load(path: Path):
    with path.open() as handle:
        return json.load(handle)


def _schema_errors(schema: dict, document, label: str) -> list[str]:
    validator = Draft202012Validator(schema)
    return [f"{label}: {'/'.join(str(p) for p in e.absolute_path) or '(top level)'}: {e.message}" for e in validator.iter_errors(document)]


def check(root: Path = HERE, min_songs: int = 10, audio_dir: Path | None = None) -> tuple[list[str], int]:
    """Return (problems, number of songs). An empty list of problems means everything passed."""
    problems: list[str] = []
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        return [f"{manifest_path} is missing"], 0
    manifest = _load(manifest_path)
    problems += _schema_errors(_load(MANIFEST_SCHEMA), manifest, "manifest.json")
    if problems:
        return problems, 0  # the rest assumes a well-formed manifest

    songs = manifest["songs"]
    if len(songs) < min_songs:
        problems.append(f"manifest.json: lists {len(songs)} songs, at least {min_songs} are needed")
    ids = [song["id"] for song in songs]
    problems += [f"manifest.json: id '{i}' is used more than once" for i in sorted(set(ids)) if ids.count(i) > 1]
    files = [song["audioFile"] for song in songs]
    problems += [f"manifest.json: audioFile '{f}' is used more than once" for f in sorted(set(files)) if files.count(f) > 1]

    rc20 = _load(RC20_SCHEMA)
    listed = set()
    for song in songs:
        label = song["id"]
        reference_path = root / song["reference"]
        listed.add(reference_path.resolve())
        if song["reference"] != f"references/{song['id']}.json":
            problems.append(f"{label}: reference must be references/{song['id']}.json, not {song['reference']}")
        if not reference_path.is_file():
            problems.append(f"{label}: reference file {song['reference']} is missing")
            continue
        reference = _load(reference_path)
        schema_problems = _schema_errors(rc20, reference, song["reference"])
        problems += schema_problems
        if schema_problems:
            continue
        if reference["audioSha256"] != song["audioSha256"]:
            problems.append(f"{label}: the reference was made from a different audio file (audioSha256 differs from the manifest)")
        if abs(reference["duration"] - song["duration"]) > DURATION_TOLERANCE:
            problems.append(f"{label}: reference duration {reference['duration']} s differs from the manifest's {song['duration']} s")
        for part in ("guitar", "bass"):
            listed_part = part in song["instruments"]
            if listed_part and reference[part] is None:
                problems.append(f"{label}: instruments lists {part} but the reference has no {part} part")
            if not listed_part and reference[part] is not None:
                problems.append(f"{label}: the reference has a {part} part but instruments does not list it")
        if audio_dir is not None:
            audio = audio_dir / song["audioFile"]
            if not audio.is_file():
                problems.append(f"{label}: {audio} not found")
            elif hashlib.sha256(audio.read_bytes()).hexdigest() != song["audioSha256"]:
                problems.append(f"{label}: {audio} does not match audioSha256 in the manifest")

    for path in sorted((root / "references").glob("*.json")):
        if path.resolve() not in listed:
            problems.append(f"references/{path.name}: not listed in manifest.json")
    return problems, len(songs)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--min-songs", type=int, default=10, help="fewest songs allowed (default 10, RC-10; the proof of concept uses 3)")
    parser.add_argument("--audio-dir", type=Path, help="also check the private audio files in this folder against the manifest's hashes")
    args = parser.parse_args(argv)
    problems, count = check(min_songs=args.min_songs, audio_dir=args.audio_dir)
    for problem in problems:
        print(f"FAIL {problem}")
    if problems:
        return 1
    manifest = _load(HERE / "manifest.json")
    drafts = [s["id"] for s in manifest["songs"] if s["referenceStatus"] != "checked"]
    print(f"OK {count} songs, every reference passes the schema check.")
    if drafts:
        print(f"NOTE {len(drafts)} of {count} references are still drafts and not checked by ear: {', '.join(drafts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
