# Requirements Document

## Introduction

Replace the current librosa-based beat detection system with beat_this (CPJKU/beat_this), a state-of-the-art deep learning beat and downbeat tracker from ISMIR 2024. This is a clean replacement — the analyzer module will use beat_this's `File2Beats` Python API for beat and downbeat detection, eliminating the custom RMS-based downbeat heuristic. The output JSON contract and CLI interface remain unchanged so downstream TypeScript services continue working without modification. The librosa dependency is removed entirely after migration.

## Glossary

- **Analyzer**: The Python CLI module at `analyzer/analyze.py` that processes WAV files and outputs beat analysis JSON to stdout.
- **Beat_This**: The CPJKU/beat_this deep learning beat tracker (PyTorch-based) that provides beat and downbeat timestamps from audio.
- **File2Beats**: The primary Python inference class from `beat_this.inference` that encapsulates model loading, preprocessing, and postprocessing for audio files.
- **Downbeat**: The first beat of a musical measure (count 1 in an 8-count bachata cycle); beat_this detects these natively.
- **Output_Contract**: The JSON shape `{ bpm, bpm_confidence, downbeat_offset_seconds, beat_timestamps, beat_frames, energy_profile }` consumed by the TypeScript audio-analysis-service.
- **Energy_Profile**: A per-frame RMS energy array used for visualization overlays in the UI.
- **Model_Weights**: Pretrained PyTorch checkpoint files (~78 MB each) that beat_this downloads automatically on first use and caches locally.
- **FPS**: Video frame rate used to convert beat timestamps (seconds) into frame indices for Remotion clip rendering.

## Requirements

### Requirement 1: Beat Detection via beat_this

**User Story:** As a developer, I want the analyzer to use beat_this for beat detection, so that I get more accurate beat timestamps from a state-of-the-art model trained on diverse music.

#### Acceptance Criteria

1. WHEN a valid WAV file is provided, THE Analyzer SHALL invoke beat_this's File2Beats class to detect beat timestamps.
2. WHEN beat_this returns beat timestamps, THE Analyzer SHALL include them in the output as `beat_timestamps` (sorted list of floats in seconds).
3. WHEN beat_this returns beat timestamps, THE Analyzer SHALL convert them to video frame indices using the provided FPS value and include them as `beat_frames`.
4. THE Analyzer SHALL use the `final0` checkpoint as the default model for inference.
5. WHEN no GPU is available, THE Analyzer SHALL fall back to CPU inference without error.

### Requirement 2: Native Downbeat Detection

**User Story:** As a developer, I want the analyzer to use beat_this's native downbeat detection, so that I get accurate downbeat positions without relying on a fragile RMS heuristic.

#### Acceptance Criteria

1. WHEN beat_this returns downbeat timestamps, THE Analyzer SHALL identify the first downbeat timestamp as `downbeat_offset_seconds`.
2. WHEN beat_this returns no downbeats, THE Analyzer SHALL set `downbeat_offset_seconds` to 0.0.
3. THE Analyzer SHALL remove the custom RMS-based `_identify_downbeat` function entirely.

### Requirement 3: BPM Computation from Beat Timestamps

**User Story:** As a developer, I want the analyzer to derive BPM from the detected beat timestamps, so that the output includes a reliable tempo estimate consistent with the beat grid.

#### Acceptance Criteria

1. WHEN beat_this returns two or more beat timestamps, THE Analyzer SHALL compute BPM as 60 divided by the median inter-beat interval.
2. WHEN beat_this returns fewer than two beat timestamps, THE Analyzer SHALL set `bpm` to 0.0.
3. THE Analyzer SHALL report `bpm_confidence` as a value between 0.0 and 1.0 derived from the consistency of inter-beat intervals (low variance = high confidence).

### Requirement 4: Energy Profile Computation

**User Story:** As a developer, I want the analyzer to compute an RMS energy profile without librosa, so that the energy visualization overlay continues to work.

#### Acceptance Criteria

1. WHEN a valid WAV file is loaded, THE Analyzer SHALL compute a per-frame RMS energy profile using numpy or the audio loading mechanism already available via beat_this dependencies (torchaudio/scipy).
2. THE Analyzer SHALL output `energy_profile` as a list of non-negative floats.
3. THE Analyzer SHALL produce an energy profile with frame resolution comparable to the previous librosa-based output (hop size of 512 samples at 22050 Hz sample rate).

### Requirement 5: Output Contract Preservation

**User Story:** As a developer, I want the output JSON shape to remain identical, so that the TypeScript audio-analysis-service and cycle-builder continue working without changes.

#### Acceptance Criteria

1. THE Analyzer SHALL output JSON with exactly these keys: `bpm`, `bpm_confidence`, `downbeat_offset_seconds`, `beat_timestamps`, `beat_frames`, `energy_profile`.
2. THE Analyzer SHALL output `bpm` as a float rounded to 2 decimal places.
3. THE Analyzer SHALL output `bpm_confidence` as a float rounded to 4 decimal places in the range [0.0, 1.0].
4. THE Analyzer SHALL output `downbeat_offset_seconds` as a float rounded to 6 decimal places.
5. THE Analyzer SHALL output `beat_timestamps` as a list of floats rounded to 6 decimal places, sorted in ascending order.
6. THE Analyzer SHALL output `beat_frames` as a list of integers (frame indices), sorted in ascending order, where each frame equals `round(timestamp * fps)`.
7. THE Analyzer SHALL output `energy_profile` as a list of floats rounded to 6 decimal places.

### Requirement 6: CLI Interface Preservation

**User Story:** As a developer, I want the CLI interface to remain unchanged, so that the TypeScript service can invoke the analyzer with the same command.

#### Acceptance Criteria

1. THE Analyzer SHALL accept a positional `wav_path` argument and an optional `--fps` argument (default 30.0).
2. THE Analyzer SHALL be invocable via `uv run python -m analyzer.analyze <wav_path> --fps <fps>`.
3. WHEN analysis succeeds, THE Analyzer SHALL write JSON to stdout and exit with code 0.
4. WHEN analysis fails, THE Analyzer SHALL write an error message to stderr and exit with a non-zero code.
5. THE Analyzer SHALL support fractional FPS values (e.g., 29.97, 23.976).

### Requirement 7: Model Weight Management

**User Story:** As a developer, I want model weights to be downloaded and cached automatically, so that setup requires no manual model download steps.

#### Acceptance Criteria

1. WHEN the model weights are not present locally, THE Analyzer SHALL download them automatically on first invocation.
2. WHEN the model weights are already cached, THE Analyzer SHALL load them from the local cache without network access.
3. IF the model download fails, THEN THE Analyzer SHALL report a clear error message to stderr and exit with a non-zero code.

### Requirement 8: Dependency Management

**User Story:** As a developer, I want the Python dependencies updated cleanly in pyproject.toml, so that the project uses beat_this via uv without leftover librosa references.

#### Acceptance Criteria

1. THE Analyzer SHALL declare `beat_this` (installed from the GitHub repository) as a dependency in `pyproject.toml`.
2. THE Analyzer SHALL declare `torch` and `torchaudio` as dependencies in `pyproject.toml`.
3. THE Analyzer SHALL remove `librosa` from the dependencies in `pyproject.toml`.
4. THE Analyzer SHALL retain `numpy` and `yt-dlp` as dependencies.
5. THE Analyzer SHALL be installable and runnable via `uv sync` followed by `uv run python -m analyzer.analyze`.

### Requirement 9: Error Handling

**User Story:** As a developer, I want clear error messages for common failure modes, so that debugging is straightforward.

#### Acceptance Criteria

1. IF the WAV file does not exist, THEN THE Analyzer SHALL raise a FileNotFoundError with the file path.
2. IF the audio is shorter than 1 second, THEN THE Analyzer SHALL raise a ValueError indicating the audio is too short.
3. IF the audio is silent (max amplitude below threshold), THEN THE Analyzer SHALL raise a ValueError indicating silent audio.
4. IF beat_this fails to load the model, THEN THE Analyzer SHALL raise a RuntimeError with a descriptive message.
5. IF beat_this detects zero beats, THEN THE Analyzer SHALL return the output contract with empty `beat_timestamps`, empty `beat_frames`, `bpm` of 0.0, `bpm_confidence` of 0.0, and `downbeat_offset_seconds` of 0.0.

### Requirement 10: Bachata Style Robustness

**User Story:** As a user working with diverse bachata music, I want the beat tracker to perform well across traditional, Dominican, sensual, and mixed/fusion styles, so that the cycle builder produces correct 8-count cycles regardless of sub-genre.

#### Acceptance Criteria

1. THE Analyzer SHALL use beat_this's general-purpose pretrained model (final0) which is trained on diverse musical genres and styles.
2. WHEN processing bachata audio in the 120–145 BPM range, THE Analyzer SHALL detect beats that produce inter-beat intervals consistent with the detected BPM (within 15% tolerance for individual intervals).
3. WHEN processing audio with syncopation or rhythmic variation (common in Dominican and fusion styles), THE Analyzer SHALL still detect the underlying pulse rather than following syncopated accents.
