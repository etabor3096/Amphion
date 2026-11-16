import soundfile as sf


def test_only_the_guitar_and_bass_parts_are_written(stems, audio):
    assert set(stems) == {"guitar", "bass"}
    assert sorted(p.name for p in stems["guitar"].parent.iterdir()) == ["bass.wav", "guitar.wav"]  # no other part (RC-03)
    for path in stems.values():
        info = sf.info(path)
        assert info.samplerate == audio.sample_rate and info.channels == 2
        assert info.frames == audio.stereo.shape[1]  # same length as the input, so song time is unchanged (RC-18)
