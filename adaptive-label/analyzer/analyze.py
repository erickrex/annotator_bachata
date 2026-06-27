#!/usr/bin/env python3
"""
Bachata audio analyzer CLI.

Usage: python analyze.py <wav_path> --fps <fps>
Output: JSON to stdout
Exit code: 0 on success, non-zero on failure (stderr has error message)

Output JSON shape:
{
  "bpm": 128.0,
  "bpm_confidence": 0.92,
  "downbeat_offset_seconds": 1.35,
  "beat_timestamps": [1.35, 1.819, 2.288, ...],
  "beat_frames": [40, 54, 68, ...],
  "energy_profile": [0.12, 0.15, 0.18, ...]
}
"""

import argparse
import json
import os
import sys

import numpy as np
from beat_this.inference import File2Beats


# ---------------------------------------------------------------------------
# Lazy singleton for the File2Beats inference model
# ---------------------------------------------------------------------------

_file2beats: File2Beats | None = None


def _get_file2beats() -> File2Beats:
    """Lazy-initialize the File2Beats inference object.

    Auto-detects GPU availability and falls back to CPU.
    Uses the 'final0' checkpoint with DBN postprocessing disabled.
    """
    global _file2beats
    if _file2beats is None:
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _file2beats = File2Beats(checkpoint_path="final0", device=device, dbn=False)
    return _file2beats


# ---------------------------------------------------------------------------
# Audio validation
# ---------------------------------------------------------------------------


def _validate_audio(wav_path: str) -> None:
    """Validate that the audio file exists, is long enough, and is not silent.

    Raises:
        FileNotFoundError: if wav_path doesn't exist
        ValueError: if audio is too short (< 1 second) or silent
    """
    if not os.path.isfile(wav_path):
        raise FileNotFoundError(f"WAV file not found: {wav_path}")

    from scipy.io import wavfile

    sr, audio = wavfile.read(wav_path)

    # Convert to float32
    if audio.dtype == np.int16:
        audio = audio.astype(np.float32) / 32768.0
    elif audio.dtype == np.int32:
        audio = audio.astype(np.float32) / 2147483648.0
    elif audio.dtype != np.float32:
        audio = audio.astype(np.float32)

    # Mix to mono if stereo
    if audio.ndim == 2:
        audio = audio.mean(axis=1)

    duration = len(audio) / sr
    if duration < 1.0:
        raise ValueError(
            f"Audio too short for analysis ({duration:.2f}s). Need at least 1 second."
        )

    if np.max(np.abs(audio)) < 1e-6:
        raise ValueError("Audio appears to be silent — no signal detected.")


# ---------------------------------------------------------------------------
# BPM computation (Task 2.2)
# ---------------------------------------------------------------------------


def _compute_bpm(beat_timestamps: np.ndarray) -> tuple[float, float]:
    """Compute BPM and confidence from beat timestamps.

    Returns (bpm, confidence) where:
    - bpm = 60 / median(inter-beat intervals), or 0.0 if < 2 beats
    - confidence = 1 - clamp(cv, 0, 1) where cv is the coefficient of variation
      of inter-beat intervals. Perfectly regular beats → confidence ≈ 1.0.
    """
    if len(beat_timestamps) < 2:
        return 0.0, 0.0

    ibis = np.diff(beat_timestamps)
    median_ibi = float(np.median(ibis))

    if median_ibi <= 0:
        return 0.0, 0.0

    bpm = 60.0 / median_ibi

    # Confidence: based on coefficient of variation of IBIs
    # Low CV = consistent intervals = high confidence
    std_ibi = float(np.std(ibis))
    cv = std_ibi / median_ibi
    confidence = float(np.clip(1.0 - cv, 0.0, 1.0))

    return bpm, confidence


# ---------------------------------------------------------------------------
# Energy profile computation (Task 2.3)
# ---------------------------------------------------------------------------


def _compute_energy_profile(
    wav_path: str, sr: int = 22050, hop_length: int = 512
) -> list[float]:
    """Compute RMS energy profile using scipy for audio loading and numpy for RMS.

    Uses the previous librosa parameter values (sr=22050, hop_length=512,
    frame_length=2048) for output compatibility.
    """
    from scipy.io import wavfile
    from scipy.signal import resample

    file_sr, audio = wavfile.read(wav_path)

    # Convert to float32
    if audio.dtype == np.int16:
        audio = audio.astype(np.float32) / 32768.0
    elif audio.dtype == np.int32:
        audio = audio.astype(np.float32) / 2147483648.0
    elif audio.dtype != np.float32:
        audio = audio.astype(np.float32)

    # Mix to mono if stereo
    if audio.ndim == 2:
        audio = audio.mean(axis=1)

    # Resample to target sr if needed
    if file_sr != sr:
        num_samples = int(len(audio) * sr / file_sr)
        audio = resample(audio, num_samples).astype(np.float32)

    # Compute RMS with windowed frames using the preserved frame_length value (2048)
    frame_length = 2048
    # Pad audio to ensure we get frames for the full duration (center padding)
    pad_length = frame_length // 2
    audio_padded = np.pad(audio, (pad_length, pad_length), mode="reflect")

    num_frames = 1 + (len(audio_padded) - frame_length) // hop_length
    energy = np.zeros(num_frames, dtype=np.float32)

    for i in range(num_frames):
        start = i * hop_length
        frame = audio_padded[start : start + frame_length]
        energy[i] = np.sqrt(np.mean(frame**2))

    return energy.tolist()


# ---------------------------------------------------------------------------
# Output formatter and main analyze() function (Task 2.4)
# ---------------------------------------------------------------------------


def _format_output(
    bpm: float,
    confidence: float,
    downbeat_offset: float,
    beat_timestamps: np.ndarray,
    fps: float,
    energy_profile: list[float],
) -> dict:
    """Format analysis results into the output contract."""
    timestamps_list = sorted(float(t) for t in beat_timestamps)
    frames_list = [round(t * fps) for t in timestamps_list]

    return {
        "bpm": round(bpm, 2),
        "bpm_confidence": round(confidence, 4),
        "downbeat_offset_seconds": round(downbeat_offset, 6),
        "beat_timestamps": [round(t, 6) for t in timestamps_list],
        "beat_frames": frames_list,
        "energy_profile": [round(e, 6) for e in energy_profile],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze a WAV file for BPM, beat grid, and energy profile."
    )
    parser.add_argument(
        "wav_path",
        type=str,
        help="Path to the WAV audio file to analyze.",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=30.0,
        help="Video frame rate for timestamp-to-frame conversion (default: 30). "
        "Fractional rates (e.g. 29.97, 23.976) are supported.",
    )
    return parser.parse_args()


def analyze(wav_path: str, fps: float) -> dict:
    """Run beat_this analysis on the given WAV file.

    Returns a dict matching the JSON output contract:
      bpm, bpm_confidence, downbeat_offset_seconds,
      beat_timestamps, beat_frames, energy_profile
    """
    # 1. Validate audio
    _validate_audio(wav_path)

    # 2. Run beat_this inference
    try:
        f2b = _get_file2beats()
    except Exception as exc:
        raise RuntimeError(f"Failed to load beat_this model: {exc}") from exc

    beats, downbeats = f2b(wav_path)

    # 3. Compute BPM and confidence
    bpm, confidence = _compute_bpm(beats)

    # 4. Determine downbeat offset
    downbeat_offset = float(downbeats[0]) if len(downbeats) > 0 else 0.0

    # 5. Compute energy profile
    energy_profile = _compute_energy_profile(wav_path)

    # 6. Format and return
    return _format_output(bpm, confidence, downbeat_offset, beats, fps, energy_profile)


def main() -> None:
    args = parse_args()

    try:
        result = analyze(args.wav_path, args.fps)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
