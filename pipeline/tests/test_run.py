"""The whole analysis on the 10-second clip: output contract, song time, and the RC-03 temp-folder guarantee."""
import json
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

from amphion_pipeline import analyze, rc20
from amphion_pipeline.audio import sha256_file

PIPELINE_DIR = Path(__file__).resolve().parent.parent


def test_result_validates_and_has_the_approved_top_level_fields(result, clip_path):
    rc20.validate(result)
    assert result["schemaVersion"] == 1
    assert result["audioSha256"] == sha256_file(clip_path)  # equals shasum -a 256 of the input (RC-19)
    assert abs(result["duration"] - 10.0) < 0.01


def test_string_and_fret_stay_null_until_tab_assignment(result):
    notes = [n for part in ("guitar", "bass") if result[part] for n in result[part]["notes"]]
    assert notes
    assert all(n["string"] is None and n["fret"] is None for n in notes)


def test_every_time_is_song_time_inside_the_file(result):
    end = result["duration"] + 0.1
    notes = [n for part in ("guitar", "bass") if result[part] for n in result[part]["notes"]]
    times = result["beats"] + result["downbeats"] + [n["startTime"] for n in notes] + [n["startTime"] + n["duration"] for n in notes]
    times += [c["startTime"] for c in result["chords"]] + [c["endTime"] for c in result["chords"]]
    assert times and all(0 <= t <= end for t in times)


def test_the_temp_folder_is_used_then_gone_after_success(clip_path, tmp_path, monkeypatch):
    from amphion_pipeline import run

    seen = []
    real = run.detect_notes

    def spy(stem_path, instrument):
        seen.append(sorted(p.name for p in Path(tmp_path).glob("amphion-*/*")))  # the parts exist here, under tmp_path
        return real(stem_path, instrument)

    monkeypatch.setattr(run, "detect_notes", spy)
    analyze(clip_path, tmp_root=tmp_path)
    assert seen and seen[0] == ["bass.wav", "guitar.wav"]
    assert list(tmp_path.iterdir()) == []


def test_the_temp_folder_is_gone_after_an_exception(clip_path, tmp_path, monkeypatch):
    from amphion_pipeline import run

    def boom(stem_path, instrument):
        assert list(Path(tmp_path).glob("amphion-*/guitar.wav")), "parts should exist while the stage runs"
        raise RuntimeError("note detection failed")

    monkeypatch.setattr(run, "detect_notes", boom)
    with pytest.raises(RuntimeError, match="note detection failed"):
        analyze(clip_path, tmp_root=tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_unknown_details_are_null_not_guessed(clip_path, monkeypatch):
    from amphion_pipeline import run

    def fail(*_):
        raise RuntimeError("cannot tell")

    monkeypatch.setattr(run, "detect_key", fail)
    monkeypatch.setattr(run, "estimate_tempo", fail)
    monkeypatch.setattr(run, "estimate_tuning_offset_cents", fail)
    document = analyze(clip_path)
    assert document["key"] is None and document["bpm"] is None and document["tuningOffsetCents"] is None
    rc20.validate(document)


def _run_cli(*args, cwd=PIPELINE_DIR):
    return subprocess.run([sys.executable, "-m", "amphion_pipeline", *map(str, args)], capture_output=True, text=True, cwd=cwd)


def test_cli_writes_a_valid_file(clip_path, tmp_path):
    out = tmp_path / "nested" / "result.json"
    done = _run_cli(clip_path, "-o", out, "--tmp-dir", tmp_path)
    assert done.returncode == 0, done.stderr
    rc20.validate(json.loads(out.read_text()))
    assert [p.name for p in tmp_path.iterdir()] == ["nested"]  # no leftover temp folder or half-written result
    assert [p.name for p in out.parent.iterdir()] == ["result.json"]


def test_cli_without_output_prints_only_json_on_stdout(clip_path, tmp_path):
    done = _run_cli(clip_path, "--tmp-dir", tmp_path)
    assert done.returncode == 0, done.stderr
    rc20.validate(json.loads(done.stdout))  # no "Predicting MIDI ..." lines mixed in


def test_cli_fails_cleanly_on_a_missing_file(tmp_path):
    out = tmp_path / "result.json"
    done = _run_cli(tmp_path / "nope.wav", "-o", out)
    assert done.returncode == 2 and "is not a file" in done.stderr
    assert not out.exists()


def test_cli_fails_cleanly_on_a_file_that_is_not_audio(tmp_path):
    bad = tmp_path / "bad.wav"
    bad.write_bytes(b"this is not audio")
    out = tmp_path / "result.json"
    done = _run_cli(bad, "-o", out, "--tmp-dir", tmp_path)
    assert done.returncode == 1 and "could not analyze" in done.stderr
    assert not out.exists()  # a partial or empty tab is never written as if it were complete (RC-09)
    assert [p.name for p in tmp_path.iterdir()] == ["bad.wav"]


def test_a_terminate_signal_still_deletes_the_temp_folder(clip_path, tmp_path):
    """RC-03: stopping the CLI part way through must not leave separated parts on disk."""
    process = subprocess.Popen(
        [sys.executable, "-m", "amphion_pipeline", str(clip_path), "-o", str(tmp_path / "result.json"), "--tmp-dir", str(tmp_path)],
        cwd=PIPELINE_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    deadline = time.time() + 120
    while not list(tmp_path.glob("amphion-*/guitar.wav")):  # wait until the separated parts exist
        assert process.poll() is None and time.time() < deadline, "the run ended before the parts were written"
        time.sleep(0.02)
    process.send_signal(signal.SIGTERM)
    assert process.wait(timeout=60) == 143
    assert list(tmp_path.iterdir()) == []
