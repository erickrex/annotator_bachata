"""Property-based tests for the bachata audio analyzer.

Uses hypothesis to verify correctness properties of the analyzer's
pure logic functions (BPM computation, formatting, energy profile).
The beat_this model is NOT tested here — these tests verify OUR logic.
"""

import math
import os
import tempfile
import wave

import numpy as np
import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from analyzer.analyze import _format_output, _compute_bpm, _compute_energy_profile


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Positive floats suitable for beat timestamps (0 to 600 seconds)
timestamp_floats = st.floats(min_value=0.0, max_value=600.0, allow_nan=False, allow_infinity=False)

# FPS values (common video frame rates)
fps_values = st.floats(min_value=1.0, max_value=240.0, allow_nan=False, allow_infinity=False)

# Sorted timestamp arrays with 2+ elements for BPM tests
sorted_timestamps = st.lists(
    st.floats(min_value=0.01, max_value=300.0, allow_nan=False, allow_infinity=False),
    min_size=2,
    max_size=200,
).map(sorted)

# Random timestamp arrays (0+ elements) for confidence bounds test
any_timestamps = st.lists(
    st.floats(min_value=0.0, max_value=300.0, allow_nan=False, allow_infinity=False),
    min_size=0,
    max_size=200,
)

# Downbeat arrays (sorted positive floats)
downbeat_arrays = st.lists(
    st.floats(min_value=0.0, max_value=300.0, allow_nan=False, allow_infinity=False),
    min_size=0,
    max_size=50,
).map(sorted)

# Energy profile values (non-negative floats)
energy_values = st.lists(
    st.floats(min_value=0.0, max_value=10.0, allow_nan=False, allow_infinity=False),
    min_size=1,
    max_size=500,
)


# ---------------------------------------------------------------------------
# Property 1: Beat timestamps are sorted and correctly rounded
# Feature: beat-this-integration, Property 1: Beat timestamps are sorted and correctly rounded
# Validates: Requirements 1.2, 5.5
# ---------------------------------------------------------------------------


@given(
    timestamps=st.lists(
        st.floats(min_value=0.0, max_value=600.0, allow_nan=False, allow_infinity=False),
        min_size=0,
        max_size=100,
    ),
    fps=fps_values,
)
@settings(max_examples=100)
def test_property_1_beat_timestamps_sorted_and_rounded(timestamps, fps):
    """Property 1: Beat timestamps are sorted and correctly rounded.

    **Validates: Requirements 1.2, 5.5**
    """
    beat_ts = np.array(timestamps, dtype=np.float64)
    energy = [0.1, 0.2, 0.3]

    result = _format_output(
        bpm=120.0,
        confidence=0.9,
        downbeat_offset=0.0,
        beat_timestamps=beat_ts,
        fps=fps,
        energy_profile=energy,
    )

    output_ts = result["beat_timestamps"]

    # Verify sorted in non-decreasing order
    for i in range(len(output_ts) - 1):
        assert output_ts[i] <= output_ts[i + 1], (
            f"Timestamps not sorted: {output_ts[i]} > {output_ts[i + 1]}"
        )

    # Verify rounded to 6 decimal places
    for t in output_ts:
        assert t == round(t, 6), f"Timestamp {t} not rounded to 6dp"


# ---------------------------------------------------------------------------
# Property 2: Frame conversion correctness
# Feature: beat-this-integration, Property 2: Frame conversion correctness
# Validates: Requirements 1.3, 5.6
# ---------------------------------------------------------------------------


@given(
    timestamps=st.lists(
        st.floats(min_value=0.0, max_value=600.0, allow_nan=False, allow_infinity=False),
        min_size=0,
        max_size=100,
    ),
    fps=fps_values,
)
@settings(max_examples=100)
def test_property_2_frame_conversion_correctness(timestamps, fps):
    """Property 2: Frame conversion correctness.

    **Validates: Requirements 1.3, 5.6**
    """
    beat_ts = np.array(timestamps, dtype=np.float64)
    energy = [0.1, 0.2, 0.3]

    result = _format_output(
        bpm=120.0,
        confidence=0.9,
        downbeat_offset=0.0,
        beat_timestamps=beat_ts,
        fps=fps,
        energy_profile=energy,
    )

    output_ts = result["beat_timestamps"]
    output_frames = result["beat_frames"]

    # Same length
    assert len(output_ts) == len(output_frames)

    # Each frame == round(timestamp * fps)
    for ts, frame in zip(output_ts, output_frames):
        expected_frame = round(ts * fps)
        assert frame == expected_frame, (
            f"Frame mismatch: round({ts} * {fps}) = {expected_frame}, got {frame}"
        )

    # Frames are sorted in non-decreasing order
    for i in range(len(output_frames) - 1):
        assert output_frames[i] <= output_frames[i + 1], (
            f"Frames not sorted: {output_frames[i]} > {output_frames[i + 1]}"
        )


# ---------------------------------------------------------------------------
# Property 3: BPM equals 60 divided by median inter-beat interval
# Feature: beat-this-integration, Property 3: BPM equals 60 divided by median inter-beat interval
# Validates: Requirements 3.1, 5.2
# ---------------------------------------------------------------------------


@given(timestamps=sorted_timestamps)
@settings(max_examples=100)
def test_property_3_bpm_formula(timestamps):
    """Property 3: BPM equals 60 divided by median inter-beat interval.

    **Validates: Requirements 3.1, 5.2**
    """
    ts_array = np.array(timestamps, dtype=np.float64)

    # Ensure we have strictly increasing timestamps with positive diffs
    diffs = np.diff(ts_array)
    assume(len(diffs) > 0)
    assume(np.all(diffs > 0))
    assume(float(np.median(diffs)) > 0)

    bpm, confidence = _compute_bpm(ts_array)

    expected_bpm = 60.0 / float(np.median(diffs))

    # Compare with tolerance (floating point rounding)
    assert abs(bpm - expected_bpm) < 1e-9, (
        f"BPM mismatch: got {bpm}, expected {expected_bpm}"
    )


# ---------------------------------------------------------------------------
# Property 4: BPM confidence is bounded in [0, 1]
# Feature: beat-this-integration, Property 4: BPM confidence is bounded in [0, 1]
# Validates: Requirements 3.3, 5.3
# ---------------------------------------------------------------------------


@given(timestamps=any_timestamps)
@settings(max_examples=100)
def test_property_4_bpm_confidence_bounds(timestamps):
    """Property 4: BPM confidence is bounded in [0, 1].

    **Validates: Requirements 3.3, 5.3**
    """
    ts_array = np.array(timestamps, dtype=np.float64)

    bpm, confidence = _compute_bpm(ts_array)

    assert 0.0 <= confidence <= 1.0, (
        f"Confidence {confidence} out of bounds [0, 1]"
    )


# ---------------------------------------------------------------------------
# Property 5: Downbeat offset equals first downbeat timestamp
# Feature: beat-this-integration, Property 5: Downbeat offset equals first downbeat timestamp
# Validates: Requirements 2.1, 2.2, 5.4
# ---------------------------------------------------------------------------


@given(downbeats=downbeat_arrays)
@settings(max_examples=100)
def test_property_5_downbeat_offset(downbeats):
    """Property 5: Downbeat offset equals first downbeat timestamp.

    **Validates: Requirements 2.1, 2.2, 5.4**
    """
    downbeat_array = np.array(downbeats, dtype=np.float64)

    # Replicate the logic from analyze(): first downbeat or 0.0
    if len(downbeat_array) > 0:
        expected_offset = float(downbeat_array[0])
    else:
        expected_offset = 0.0

    # Pass through _format_output to verify the rounding
    beat_ts = np.array([1.0, 2.0], dtype=np.float64)
    energy = [0.1, 0.2]

    result = _format_output(
        bpm=120.0,
        confidence=0.9,
        downbeat_offset=expected_offset,
        beat_timestamps=beat_ts,
        fps=30.0,
        energy_profile=energy,
    )

    output_offset = result["downbeat_offset_seconds"]

    if len(downbeats) == 0:
        assert output_offset == 0.0
    else:
        assert output_offset == round(expected_offset, 6), (
            f"Downbeat offset {output_offset} != round({expected_offset}, 6)"
        )


# ---------------------------------------------------------------------------
# Property 6: Energy profile is non-empty with non-negative values and correct length
# Feature: beat-this-integration, Property 6: Energy profile is non-empty with non-negative values and correct length
# Validates: Requirements 4.1, 4.2, 4.3, 5.7
# ---------------------------------------------------------------------------


@given(
    duration_ms=st.integers(min_value=1100, max_value=3000),
    freq=st.floats(min_value=100.0, max_value=4000.0, allow_nan=False, allow_infinity=False),
    amplitude=st.floats(min_value=0.01, max_value=0.9, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=100, deadline=None)
def test_property_6_energy_profile_invariants(duration_ms, freq, amplitude):
    """Property 6: Energy profile is non-empty with non-negative values and correct length.

    **Validates: Requirements 4.1, 4.2, 4.3, 5.7**
    """
    sr = 22050
    hop_length = 512
    frame_length = 2048
    duration = duration_ms / 1000.0
    num_samples = int(sr * duration)

    # Generate audio signal
    t = np.linspace(0, duration, num_samples, endpoint=False)
    samples = (amplitude * np.sin(2 * np.pi * freq * t) * 32767).astype(np.int16)

    # Write to a temporary WAV file
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        with wave.open(tmp_path, "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(samples.tobytes())

        energy = _compute_energy_profile(tmp_path, sr=sr, hop_length=hop_length)

        # Non-empty
        assert len(energy) > 0, "Energy profile is empty"

        # All values non-negative
        for val in energy:
            assert val >= 0.0, f"Negative energy value: {val}"

        # Correct length: approximately ceil(num_samples / hop_length) + some padding tolerance
        # The function uses center padding, so expected frames ≈ 1 + (num_samples + frame_length - frame_length) // hop_length
        # Simplified: approximately ceil(num_samples / hop_length) within ±2 frames
        expected_length = 1 + (num_samples + frame_length - frame_length) // hop_length
        # More accurate: with center padding of frame_length//2 on each side
        padded_length = num_samples + frame_length
        expected_frames = 1 + (padded_length - frame_length) // hop_length
        assert abs(len(energy) - expected_frames) <= 2, (
            f"Energy length {len(energy)} not within ±2 of expected {expected_frames}"
        )
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Property 7: Output contract structure
# Feature: beat-this-integration, Property 7: Output contract structure
# Validates: Requirements 5.1
# ---------------------------------------------------------------------------


@given(
    bpm=st.floats(min_value=0.0, max_value=300.0, allow_nan=False, allow_infinity=False),
    confidence=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    downbeat_offset=st.floats(min_value=0.0, max_value=300.0, allow_nan=False, allow_infinity=False),
    timestamps=st.lists(
        st.floats(min_value=0.0, max_value=600.0, allow_nan=False, allow_infinity=False),
        min_size=0,
        max_size=50,
    ),
    fps=fps_values,
    energy=energy_values,
)
@settings(max_examples=100)
def test_property_7_output_contract_structure(bpm, confidence, downbeat_offset, timestamps, fps, energy):
    """Property 7: Output contract structure.

    **Validates: Requirements 5.1**
    """
    beat_ts = np.array(timestamps, dtype=np.float64)

    result = _format_output(
        bpm=bpm,
        confidence=confidence,
        downbeat_offset=downbeat_offset,
        beat_timestamps=beat_ts,
        fps=fps,
        energy_profile=energy,
    )

    # Exactly 6 keys
    expected_keys = {
        "bpm", "bpm_confidence", "downbeat_offset_seconds",
        "beat_timestamps", "beat_frames", "energy_profile",
    }
    assert set(result.keys()) == expected_keys, (
        f"Keys mismatch: got {set(result.keys())}, expected {expected_keys}"
    )

    # Correct types
    assert isinstance(result["bpm"], float)
    assert isinstance(result["bpm_confidence"], float)
    assert isinstance(result["downbeat_offset_seconds"], float)
    assert isinstance(result["beat_timestamps"], list)
    assert isinstance(result["beat_frames"], list)
    assert isinstance(result["energy_profile"], list)

    # beat_timestamps contains floats
    for t in result["beat_timestamps"]:
        assert isinstance(t, float)

    # beat_frames contains ints
    for f in result["beat_frames"]:
        assert isinstance(f, int)

    # energy_profile contains floats
    for e in result["energy_profile"]:
        assert isinstance(e, float)


# ---------------------------------------------------------------------------
# Property 8: Inter-beat interval consistency
# Feature: beat-this-integration, Property 8: Inter-beat interval consistency
# Validates: Requirements 10.2
# ---------------------------------------------------------------------------


@given(
    bpm=st.floats(min_value=60.0, max_value=200.0, allow_nan=False, allow_infinity=False),
    num_beats=st.integers(min_value=10, max_value=100),
    jitter_scale=st.floats(min_value=0.0, max_value=0.05, allow_nan=False, allow_infinity=False),
    data=st.data(),
)
@settings(max_examples=100)
def test_property_8_ibi_consistency(bpm, num_beats, jitter_scale, data):
    """Property 8: Inter-beat interval consistency.

    **Validates: Requirements 10.2**
    """
    expected_ibi = 60.0 / bpm

    # Generate a regular beat grid with small jitter
    timestamps = []
    current = 0.5  # start at 0.5 seconds
    for i in range(num_beats):
        # Add small jitter (within jitter_scale * expected_ibi)
        jitter = data.draw(
            st.floats(
                min_value=-jitter_scale * expected_ibi,
                max_value=jitter_scale * expected_ibi,
                allow_nan=False,
                allow_infinity=False,
            )
        )
        timestamps.append(current)
        current += expected_ibi + jitter

    ts_array = np.array(timestamps, dtype=np.float64)

    computed_bpm, confidence = _compute_bpm(ts_array)

    # With small jitter, BPM should be > 0
    assert computed_bpm > 0, "BPM should be positive for regular beat grid"

    # Verify 85% of IBIs are within 15% of expected interval
    ibis = np.diff(ts_array)
    computed_expected_ibi = 60.0 / computed_bpm
    within_tolerance = np.abs(ibis - computed_expected_ibi) <= 0.15 * computed_expected_ibi
    fraction_within = np.sum(within_tolerance) / len(ibis)

    assert fraction_within >= 0.85, (
        f"Only {fraction_within * 100:.1f}% of IBIs within 15% tolerance "
        f"(expected >= 85%). BPM={computed_bpm:.2f}, expected IBI={computed_expected_ibi:.4f}"
    )
