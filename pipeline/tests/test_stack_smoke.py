"""P1-01 (#46): prove Demucs, Basic Pitch, madmom and librosa work together in one environment (RISK-04).

Each test imports one library and runs it on the same 10-second clip. This does not test accuracy, only that the stack
installs, loads its pretrained models and returns output of the right shape. Demucs downloads its model on first use.
"""
import numpy as np


def test_librosa_tempo_and_tuning(clip_path):
    import librosa

    y, sr = librosa.load(clip_path, sr=None, mono=True)
    assert abs(len(y) / sr - 10.0) < 0.05
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    assert float(np.atleast_1d(tempo)[0]) > 0
    assert isinstance(float(librosa.estimate_tuning(y=y, sr=sr)), float)


def test_madmom_beats_downbeats_chords_key(clip_path):
    from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor
    from madmom.features.downbeats import DBNDownBeatTrackingProcessor, RNNDownBeatProcessor
    from madmom.features.key import CNNKeyRecognitionProcessor

    activations = RNNDownBeatProcessor()(clip_path)
    beats = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)(activations)
    assert beats.ndim == 2 and beats.shape[1] == 2 and len(beats) > 0  # (time in seconds, position in bar)

    chords = CRFChordRecognitionProcessor()(CNNChordFeatureProcessor()(clip_path))
    assert len(chords) > 0  # (start, end, label) segments

    key = CNNKeyRecognitionProcessor()(clip_path)
    assert key.shape == (1, 24)  # probability for each of 12 major and 12 minor keys


def test_basic_pitch_finds_notes(clip_path):
    from basic_pitch import ICASSP_2022_MODEL_PATH, FilenameSuffix, build_icassp_2022_model_path
    from basic_pitch.inference import predict

    # Pin the ONNX backend. Left alone, Basic Pitch picks CoreML on macOS and TensorFlow or TFLite elsewhere, so results
    # would differ between a laptop and the Linux container.
    onnx_model = build_icassp_2022_model_path(FilenameSuffix.onnx)
    assert str(onnx_model).endswith(".onnx"), ICASSP_2022_MODEL_PATH
    _, midi, note_events = predict(clip_path, onnx_model)
    assert len(note_events) > 0  # (start, end, pitch, amplitude, bends)
    assert len(midi.instruments) >= 1


def test_demucs_six_part_separation_includes_guitar_and_bass(clip_path):
    import soundfile as sf
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    model = get_model("htdemucs_6s")
    assert {"guitar", "bass"} <= set(model.sources)
    audio, sr = sf.read(clip_path, dtype="float32", always_2d=True)
    assert sr == model.samplerate
    wav = torch.from_numpy(audio.T)[None]  # (batch, channels, samples)
    out = apply_model(model, wav, device="cpu")
    assert out.shape == (1, len(model.sources), 2, wav.shape[-1])
    assert float(out[0, model.sources.index("guitar")].abs().max()) >= 0.0
