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

import librosa
import numpy as np


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
        type=int,
        default=30,
        help="Video frame rate for timestamp-to-frame conversion (default: 30).",
    )
    return parser.parse_args()


def _compute_bpm_confidence(y: np.ndarray, sr: int, tempo: float) -> float:
    """Compute a confidence score (0.0–1.0) for the detected BPM.

    Uses the onset strength autocorrelation to measure how strong the
    detected tempo peak is relative to the overall autocorrelation energy.
    A strong, clear peak indicates high confidence.
    """
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    # Autocorrelation of onset envelope
    ac = librosa.autocorrelate(onset_env, max_size=len(onset_env))
    if ac.max() == 0:
        return 0.0

    # Normalize autocorrelation
    ac = ac / ac[0] if ac[0] > 0 else ac

    # Find the lag corresponding to the detected tempo
    # tempo in BPM -> period in seconds -> period in onset frames
    hop_length = 512  # librosa default
    period_seconds = 60.0 / tempo
    period_frames = period_seconds * sr / hop_length

    lag = int(round(period_frames))
    if lag <= 0 or lag >= len(ac):
        return 0.0

    # The autocorrelation value at the tempo lag is our raw confidence
    raw_confidence = float(ac[lag])

    # Clamp to [0, 1]
    return float(np.clip(raw_confidence, 0.0, 1.0))


def _identify_downbeat(
    y: np.ndarray, sr: int, beat_frames_lib: np.ndarray
) -> int:
    """Identify the downbeat (count 1) index by analyzing RMS accent patterns.

    In bachata, count 1 typically has stronger energy than count 5.
    We look at groups of 8 beats and find the offset where the accent
    pattern best matches the expected bachata pattern (strong on 1, weaker on 5).

    Returns the index into beat_frames_lib of the first detected downbeat.
    """
    if len(beat_frames_lib) < 8:
        return 0

    # Get RMS energy at each beat position
    rms = librosa.feature.rms(y=y, hop_length=512)[0]
    beat_energies = []
    for bf in beat_frames_lib:
        if bf < len(rms):
            beat_energies.append(float(rms[bf]))
        else:
            beat_energies.append(0.0)

    beat_energies = np.array(beat_energies)
    if beat_energies.max() == 0:
        return 0

    # Try each possible offset (0-7) as the downbeat position
    # For each offset, compute how well the accent pattern matches bachata
    # In bachata 8-count: 1-2-3-tap-5-6-7-tap
    # Count 1 (index 0 in cycle) should be strongest
    # Count 5 (index 4 in cycle) should be second strongest but weaker than 1
    best_offset = 0
    best_score = -float("inf")

    num_beats = len(beat_energies)
    for offset in range(min(8, num_beats)):
        score = 0.0
        count = 0
        # Evaluate full 8-count cycles starting from this offset
        for start in range(offset, num_beats - 7, 8):
            cycle = beat_energies[start : start + 8]
            if len(cycle) < 8:
                break
            # Score: count 1 energy minus count 5 energy
            # Higher score means count 1 is more accented than count 5
            score += cycle[0] - cycle[4]
            count += 1

        if count > 0:
            avg_score = score / count
            if avg_score > best_score:
                best_score = avg_score
                best_offset = offset

    return best_offset


def analyze(wav_path: str, fps: int) -> dict:
    """Run librosa analysis on the given WAV file.

    Returns a dict matching the JSON output contract:
      bpm, bpm_confidence, downbeat_offset_seconds,
      beat_timestamps, beat_frames, energy_profile
    """
    # Validate file exists
    if not os.path.isfile(wav_path):
        raise FileNotFoundError(f"WAV file not found: {wav_path}")

    # Load audio at standard sample rate
    try:
        y, sr = librosa.load(wav_path, sr=22050)
    except Exception as exc:
        raise RuntimeError(f"Failed to load audio file: {exc}") from exc

    # Check for very short or silent audio
    duration = librosa.get_duration(y=y, sr=sr)
    if duration < 0.5:
        raise ValueError(
            f"Audio too short for analysis ({duration:.2f}s). "
            "Need at least 0.5 seconds."
        )

    if np.max(np.abs(y)) < 1e-6:
        raise ValueError("Audio appears to be silent — no signal detected.")

    # Detect BPM and beat frames
    tempo, beat_frames_lib = librosa.beat.beat_track(y=y, sr=sr)

    # librosa >= 0.10 returns tempo as an ndarray
    if isinstance(tempo, np.ndarray):
        tempo = float(tempo[0]) if tempo.size > 0 else 0.0
    else:
        tempo = float(tempo)

    # Convert beat frames to timestamps
    beat_timestamps = librosa.frames_to_time(beat_frames_lib, sr=sr).tolist()

    # Handle edge case: no beats detected
    if len(beat_timestamps) == 0:
        return {
            "bpm": round(tempo, 2),
            "bpm_confidence": 0.0,
            "downbeat_offset_seconds": 0.0,
            "beat_timestamps": [],
            "beat_frames": [],
            "energy_profile": librosa.feature.rms(y=y)[0].tolist(),
        }

    # Identify downbeat position
    downbeat_index = _identify_downbeat(y, sr, beat_frames_lib)
    downbeat_offset_seconds = beat_timestamps[downbeat_index]

    # Compute BPM confidence
    bpm_confidence = _compute_bpm_confidence(y, sr, tempo)

    # Extract RMS energy profile
    energy_profile = librosa.feature.rms(y=y)[0].tolist()

    # Convert beat timestamps to video frame numbers
    beat_frames_video = [round(ts * fps) for ts in beat_timestamps]

    return {
        "bpm": round(tempo, 2),
        "bpm_confidence": round(bpm_confidence, 4),
        "downbeat_offset_seconds": round(downbeat_offset_seconds, 6),
        "beat_timestamps": [round(ts, 6) for ts in beat_timestamps],
        "beat_frames": beat_frames_video,
        "energy_profile": [round(e, 6) for e in energy_profile],
    }


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
