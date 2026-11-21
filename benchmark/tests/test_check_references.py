"""Tests for the benchmark manifest and reference checker (P1-02)."""
import copy
import hashlib
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import check_references as cr  # noqa: E402

BENCHMARK = Path(__file__).resolve().parents[1]


@pytest.fixture
def root(tmp_path):
    """A copy of the real manifest and references that a test can break."""
    shutil.copy(BENCHMARK / "manifest.json", tmp_path / "manifest.json")
    shutil.copytree(BENCHMARK / "references", tmp_path / "references")
    return tmp_path


def read(path):
    return json.loads(path.read_text())


def write(path, document):
    path.write_text(json.dumps(document))


def edit_manifest(root, change):
    manifest = read(root / "manifest.json")
    change(manifest)
    write(root / "manifest.json", manifest)


def edit_reference(root, song_id, change):
    path = root / "references" / f"{song_id}.json"
    reference = read(path)
    change(reference)
    write(path, reference)


def test_the_committed_set_passes_for_the_proof_of_concept():
    problems, count = cr.check(min_songs=3)
    assert problems == []
    assert count == 3


def test_the_committed_set_is_not_yet_the_full_ten():
    problems, _ = cr.check(min_songs=10)
    assert any("at least 10 are needed" in p for p in problems)


def test_manifest_lists_input_type_and_instruments():
    for song in read(BENCHMARK / "manifest.json")["songs"]:
        assert song["input"] in ("upload", "mic")
        assert song["instruments"]


def test_a_reference_that_breaks_the_rc20_schema_fails(root):
    edit_reference(root, "maple-syrup", lambda r: r["guitar"]["notes"][0].update(pitch=300))
    problems, _ = cr.check(root, min_songs=3)
    assert any("maple-syrup.json" in p and "300" in p for p in problems)


def test_a_reference_missing_a_required_field_fails(root):
    edit_reference(root, "know-your-name", lambda r: r.pop("beats"))
    problems, _ = cr.check(root, min_songs=3)
    assert any("beats" in p for p in problems)


def test_a_missing_reference_file_fails(root):
    (root / "references" / "maple-syrup.json").unlink()
    problems, _ = cr.check(root, min_songs=3)
    assert any("maple-syrup" in p and "missing" in p for p in problems)


def test_a_reference_not_in_the_manifest_fails(root):
    shutil.copy(root / "references" / "maple-syrup.json", root / "references" / "stray.json")
    problems, _ = cr.check(root, min_songs=3)
    assert any("stray.json" in p and "not listed" in p for p in problems)


def test_a_reference_for_different_audio_fails(root):
    edit_reference(root, "maple-syrup", lambda r: r.update(audioSha256="0" * 64))
    problems, _ = cr.check(root, min_songs=3)
    assert any("different audio file" in p for p in problems)


def test_a_duration_mismatch_fails(root):
    edit_reference(root, "maple-syrup", lambda r: r.update(duration=r["duration"] + 2))
    problems, _ = cr.check(root, min_songs=3)
    assert any("differs from the manifest" in p for p in problems)


def test_a_song_over_three_minutes_fails(root):
    # RC-07: the manifest schema caps duration at 180 s
    edit_manifest(root, lambda m: m["songs"][0].update(duration=200))
    problems, _ = cr.check(root, min_songs=3)
    assert any("duration" in p for p in problems)


def test_a_part_the_manifest_does_not_list_must_be_null(root):
    edit_manifest(root, lambda m: m["songs"][0].update(instruments=["guitar"]))
    problems, _ = cr.check(root, min_songs=3)
    assert any("has a bass part but instruments does not list it" in p for p in problems)


def test_a_listed_part_must_not_be_null(root):
    edit_reference(root, "know-your-name", lambda r: r.update(bass=None))
    problems, _ = cr.check(root, min_songs=3)
    assert any("lists bass but the reference has no bass part" in p for p in problems)


def test_duplicate_ids_fail(root):
    def duplicate(manifest):
        manifest["songs"].append(copy.deepcopy(manifest["songs"][0]))
    edit_manifest(root, duplicate)
    problems, _ = cr.check(root, min_songs=3)
    assert any("used more than once" in p for p in problems)


def test_an_unknown_input_type_fails(root):
    edit_manifest(root, lambda m: m["songs"][0].update(input="stream"))
    problems, _ = cr.check(root, min_songs=3)
    assert problems


def test_audio_dir_catches_a_changed_file(root, tmp_path_factory):
    audio = tmp_path_factory.mktemp("audio")
    for song in read(root / "manifest.json")["songs"]:
        (audio / song["audioFile"]).write_bytes(b"not the real audio")
    problems, _ = cr.check(root, min_songs=3, audio_dir=audio)
    assert sum("does not match audioSha256" in p for p in problems) == 3


def test_audio_dir_accepts_the_right_file(root, tmp_path_factory):
    audio = tmp_path_factory.mktemp("audio")
    data = b"pretend audio"
    for song in read(root / "manifest.json")["songs"]:
        (audio / song["audioFile"]).write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    for song_id in [s["id"] for s in read(root / "manifest.json")["songs"]]:
        edit_reference(root, song_id, lambda r: r.update(audioSha256=digest))
    edit_manifest(root, lambda m: [s.update(audioSha256=digest) for s in m["songs"]])
    problems, _ = cr.check(root, min_songs=3, audio_dir=audio)
    assert problems == []
