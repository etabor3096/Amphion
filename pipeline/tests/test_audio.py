import subprocess

import numpy as np
import pytest
import soundfile as sf

from amphion_pipeline.audio import SAMPLE_RATE, load_audio, sha256_file


def test_sha256_matches_shasum_of_the_exact_file(clip_path):
    expected = subprocess.run(["shasum", "-a", "256", clip_path], capture_output=True, text=True, check=True).stdout.split()[0]
    assert sha256_file(clip_path) == expected
    assert len(expected) == 64 and expected == expected.lower()


def test_load_gives_44k_stereo_and_a_mono_mix_with_the_files_length(audio):
    assert audio.sample_rate == SAMPLE_RATE
    assert audio.stereo.shape[0] == 2 and audio.stereo.dtype == np.float32
    assert audio.mono.shape == audio.stereo.shape[1:]
    assert abs(audio.duration - 10.0) < 0.001


def test_a_mono_file_is_duplicated_to_two_channels(tmp_path):
    path = tmp_path / "mono.wav"
    sf.write(path, np.sin(np.linspace(0, 200, 22050)).astype(np.float32) * 0.5, 22050)
    loaded = load_audio(path)
    assert loaded.stereo.shape[0] == 2 and np.array_equal(loaded.stereo[0], loaded.stereo[1])
    assert abs(loaded.duration - 1.0) < 0.001  # resampled to 44.1 kHz without changing song time


def test_mp3_and_m4a_are_read_at_the_same_length(clip_path, tmp_path):
    import shutil

    mp3 = tmp_path / "clip.mp3"
    try:
        data, rate = sf.read(clip_path)
        sf.write(mp3, data, rate, format="MP3")
    except Exception:  # libsndfile older than 1.1 cannot write MP3
        pytest.skip("this libsndfile cannot write MP3")
    assert abs(load_audio(mp3).duration - 10.0) < 0.1
    if shutil.which("ffmpeg"):
        m4a = tmp_path / "clip.m4a"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-i", clip_path, "-c:a", "aac", str(m4a)], check=True)
        assert abs(load_audio(m4a).duration - 10.0) < 0.1
