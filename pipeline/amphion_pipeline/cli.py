"""Command line: python -m amphion_pipeline song.wav -o result.json"""
from __future__ import annotations

import argparse
import contextlib
import json
import logging
import os
import signal
import sys
import tempfile
from pathlib import Path

from .run import analyze


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m amphion_pipeline",
        description="Turn a song (MP3, M4A or WAV) into RC-20 tab data. Times are seconds from the start of the file.",
    )
    parser.add_argument("audio", type=Path, help="the audio file to analyze")
    parser.add_argument("-o", "--output", type=Path, help="where to write the JSON (default: print to the terminal)")
    parser.add_argument("--tmp-dir", type=Path, help="where the temporary folder for separated parts goes (default: system temp)")
    parser.add_argument("-v", "--verbose", action="store_true", help="print the time each stage takes")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(message)s", stream=sys.stderr, force=True)
    if not args.audio.is_file():
        print(f"error: {args.audio} is not a file", file=sys.stderr)
        return 2
    # Turn a termination signal into a normal exit so the temporary folder is still deleted (RC-03).
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    try:
        # Basic Pitch prints progress lines with print(). Send anything printed during the analysis to stderr so that
        # stdout holds only the JSON when -o is not used.
        with contextlib.redirect_stdout(sys.stderr):
            document = analyze(args.audio, tmp_root=args.tmp_dir)
    except Exception as error:  # noqa: BLE001 - reported once, with a non-zero exit and no output file (RC-09)
        print(f"error: could not analyze {args.audio}: {error}", file=sys.stderr)
        return 1
    text = json.dumps(document, indent=2) + "\n"
    if args.output is None:
        sys.stdout.write(text)
        return 0
    # Write to a temporary file in the same folder, then rename, so a half-written result is never left behind.
    args.output.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(dir=args.output.parent, prefix=".result-", suffix=".json")
    try:
        with os.fdopen(handle, "w") as out:
            out.write(text)
        os.replace(temp_name, args.output)
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise
    return 0
