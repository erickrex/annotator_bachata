"""Shared fixtures for analyzer tests."""

import pytest
import os
import tempfile
import wave
import struct


@pytest.fixture
def sample_wav(tmp_path):
    """Create a minimal valid WAV file for testing."""
    wav_path = tmp_path / "test.wav"
    sample_rate = 22050
    duration_seconds = 1
    num_samples = sample_rate * duration_seconds

    with wave.open(str(wav_path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        # Write silence
        wf.writeframes(struct.pack(f"<{num_samples}h", *([0] * num_samples)))

    return str(wav_path)
