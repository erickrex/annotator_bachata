"""Unit tests for the bachata audio analyzer."""

import json
import math
import struct
import subprocess
import sys
import wave

import numpy as np
import pytest

from analyzer.analyze import analyze, _compute_bpm_confidence, _identify_downbeat


# --- Helpers ---

def make_wav(path, sr=22050, duration=5.0, freq=440.0, amplitude=0.5):
    """Create a WAV file with a sine wave tone."""
    num_samples = int(sr * duration)
    t = np.linspace(0, duration, num_samples, endpoint=False)
    samples = (amplitude * np.sin(2 * np.pi * freq * t) * 32767).astype(np.int16)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(samples.tobytes())
    return str(path)


def make_silent_wav(path, sr=22050, duration=2.0):
    """Create a WAV file with silence."""
    num_samples = int(sr * duration)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(struct.pack(f"<{num_samples}h", *([0] * num_samples)))
    return str(path)


def make_click_track_wav(path, sr=22050, duration=10.0, bpm=130.0):
    """Create a WAV with periodic clicks at the given BPM to simulate beats."""
    num_samples = int(sr * duration)
    samples = np.zeros(num_samples, dtype=np.float64)
    beat_interval = 60.0 / bpm
    click_duration = 0.02  # 20ms click
    click_samples = int(sr * click_duration)

    t_click = np.linspace(0, click_duration, click_samples, endpoint=False)
    click = 0.8 * np.sin(2 * np.pi * 1000 * t_click) * np.exp(-t_click * 50)

    beat_time = 0.0
    while beat_time < duration:
        idx = int(beat_time * sr)
        end_idx = min(idx + click_samples, num_samples)
        actual_len = end_idx - idx
        if actual_len > 0:
            samples[idx:end_idx] += click[:actual_len]
        beat_time += beat_interval

    samples = (samples * 32767).astype(np.int16)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(samples.tobytes())
    return str(path)


# --- Tests for analyze() output contract ---

class TestAnalyzeOutputContract:
    """Verify the output JSON matches the design contract."""

    def test_output_has_all_required_keys(self, tmp_path):
        wav = make_wav(tmp_path / "tone.wav", duration=5.0)
        result = analyze(wav, fps=30)
        required_keys = {
            "bpm", "bpm_confidence", "downbeat_offset_seconds",
            "beat_timestamps", "beat_frames", "energy_profile",
        }
        assert required_keys == set(result.keys())

    def test_bpm_is_positive_float(self, tmp_path):
        wav = make_wav(tmp_path / "tone.wav", duration=5.0)
        result = analyze(wav, fps=30)
        assert isinstance(result["bpm"], float)
        assert result["bpm"] >= 0

    def test_bpm_confidence_in_range(self, tmp_path):
        wav = make_wav(tmp_path / "tone.wav", duration=5.0)
        result = analyze(wav, fps=30)
        assert 0.0 <= result["bpm_confidence"] <= 1.0

    def test_beat_timestamps_are_sorted(self, tmp_path):
        wav = make_click_track_wav(tmp_path / "clicks.wav", duration=10.0, bpm=130)
        result = analyze(wav, fps=30)
        ts = result["beat_timestamps"]
        assert ts == sorted(ts)

    def test_beat_frames_match_timestamps(self, tmp_path):
        fps = 30
        wav = make_click_track_wav(tmp_path / "clicks.wav", duration=10.0, bpm=130)
        result = analyze(wav, fps=fps)
        for ts, frame in zip(result["beat_timestamps"], result["beat_frames"]):
            assert frame == round(ts * fps)

    def test_energy_profile_is_nonempty_list(self, tmp_path):
        wav = make_wav(tmp_path / "tone.wav", duration=5.0)
        result = analyze(wav, fps=30)
        assert isinstance(result["energy_profile"], list)
        assert len(result["energy_profile"]) > 0

    def test_energy_profile_values_nonnegative(self, tmp_path):
        wav = make_wav(tmp_path / "tone.wav", duration=5.0)
        result = analyze(wav, fps=30)
        for val in result["energy_profile"]:
            assert val >= 0.0


# --- Tests for edge cases ---

class TestEdgeCases:
    """Test error handling and edge cases."""

    def test_file_not_found_raises(self):
        with pytest.raises(FileNotFoundError, match="WAV file not found"):
            analyze("/nonexistent/path.wav", fps=30)

    def test_silent_audio_raises(self, tmp_path):
        wav = make_silent_wav(tmp_path / "silent.wav", duration=2.0)
        with pytest.raises(ValueError, match="silent"):
            analyze(wav, fps=30)

    def test_very_short_audio_raises(self, tmp_path):
        wav = make_wav(tmp_path / "short.wav", duration=0.1)
        with pytest.raises(ValueError, match="too short"):
            analyze(wav, fps=30)

    def test_different_fps_values(self, tmp_path):
        wav = make_click_track_wav(tmp_path / "clicks.wav", duration=10.0, bpm=120)
        result_30 = analyze(wav, fps=30)
        result_60 = analyze(wav, fps=60)
        # Same timestamps, different frame numbers
        assert result_30["beat_timestamps"] == result_60["beat_timestamps"]
        # 60fps frames should be roughly 2x the 30fps frames
        if result_30["beat_frames"] and result_60["beat_frames"]:
            ratio = result_60["beat_frames"][0] / max(result_30["beat_frames"][0], 1)
            assert 1.5 < ratio < 2.5


# --- Tests for CLI interface ---

class TestCLI:
    """Test the CLI entry point."""

    def test_cli_outputs_valid_json(self, tmp_path):
        wav = make_click_track_wav(tmp_path / "clicks.wav", duration=5.0, bpm=130)
        result = subprocess.run(
            ["uv", "run", "python", "-m", "analyzer.analyze", str(wav), "--fps", "30"],
            capture_output=True, text=True, timeout=60,
        )
        assert result.returncode == 0
        data = json.loads(result.stdout)
        assert "bpm" in data
        assert "beat_timestamps" in data

    def test_cli_nonexistent_file_exits_nonzero(self):
        result = subprocess.run(
            ["uv", "run", "python", "-m", "analyzer.analyze", "/no/such/file.wav"],
            capture_output=True, text=True, timeout=30,
        )
        assert result.returncode != 0
        assert "Error" in result.stderr

    def test_cli_default_fps(self, tmp_path):
        wav = make_click_track_wav(tmp_path / "clicks.wav", duration=5.0, bpm=120)
        result = subprocess.run(
            ["uv", "run", "python", "-m", "analyzer.analyze", str(wav)],
            capture_output=True, text=True, timeout=60,
        )
        assert result.returncode == 0
        data = json.loads(result.stdout)
        # Default fps is 30
        for ts, frame in zip(data["beat_timestamps"], data["beat_frames"]):
            assert frame == round(ts * 30)

    def test_cli_accepts_fractional_fps_ntsc(self, tmp_path):
        """29.97 etc. must parse (ffprobe often reports fractional fps)."""
        wav = make_click_track_wav(tmp_path / "clicks.wav", duration=5.0, bpm=130)
        fps = 30000 / 1001  # ~29.97
        result = subprocess.run(
            [
                "uv", "run", "python", "-m", "analyzer.analyze",
                str(wav), "--fps", str(fps),
            ],
            capture_output=True, text=True, timeout=60,
        )
        assert result.returncode == 0, result.stderr
        data = json.loads(result.stdout)
        for ts, frame in zip(data["beat_timestamps"], data["beat_frames"]):
            assert frame == round(ts * fps)
