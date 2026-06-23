# Implementation Plan: beat-this-integration

## Overview

Replace the librosa-based beat detection pipeline in `analyzer/analyze.py` with beat_this (CPJKU/beat_this). This is a clean swap: update dependencies, rewrite the analyzer internals, update tests, add property-based tests, then remove librosa. The CLI interface and output JSON contract remain unchanged.

## Tasks

- [ ] 1. Update pyproject.toml dependencies
  - [x] 1.1 Replace librosa with beat_this and add new dependencies
    - Remove `librosa>=0.10.0` from dependencies
    - Add `beat-this @ git+https://github.com/CPJKU/beat_this.git`
    - Add `torch>=2.0.0`
    - Add `torchaudio>=2.0.0`
    - Add `scipy>=1.10.0`
    - Keep `numpy>=1.24.0` and `yt-dlp>=2024.1.0`
    - Update project description to reference beat_this instead of librosa
    - Bump version to `0.2.0`
    - Add `hypothesis>=6.0.0` to the `[dependency-groups] dev` section
    - Run `uv lock` and `uv sync` to install new dependencies
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 2. Rewrite analyzer/analyze.py with beat_this
  - [x] 2.1 Implement the lazy File2Beats singleton and audio validation
    - Remove all `import librosa` references
    - Add imports for `beat_this.inference.File2Beats`, `torch`, `scipy.io.wavfile`, `scipy.signal`
    - Implement `_get_file2beats()` with lazy initialization, auto-detecting CPU/GPU
    - Implement `_validate_audio(wav_path)` using `scipy.io.wavfile` — raise FileNotFoundError if missing, ValueError if < 1s or silent
    - Use `final0` checkpoint and `dbn=False`
    - _Requirements: 1.1, 1.4, 1.5, 7.1, 7.2, 7.3, 9.1, 9.2, 9.3, 9.4_

  - [x] 2.2 Implement BPM computation from beat timestamps
    - Implement `_compute_bpm(beat_timestamps)` returning `(bpm, confidence)`
    - BPM = `60.0 / median(diff(timestamps))` for 2+ beats, else 0.0
    - Confidence = `1.0 - clamp(coefficient_of_variation, 0, 1)`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.3 Implement energy profile computation without librosa
    - Implement `_compute_energy_profile(wav_path, sr=22050, hop_length=512)`
    - Load audio via `scipy.io.wavfile`, convert to float32 mono, resample if needed
    - Compute windowed RMS with `frame_length=2048`, `hop_length=512`, center-padded with reflect mode
    - Return list of non-negative floats
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.4 Implement output formatter and main analyze() function
    - Implement `_format_output()` assembling the JSON-compatible dict with correct rounding
    - Rewrite `analyze(wav_path, fps)` to orchestrate: validate → File2Beats → BPM → energy → format
    - Downbeat offset = first element of downbeats array, or 0.0 if empty
    - Handle zero-beats case: return contract with empty arrays and bpm=0.0
    - Remove `_identify_downbeat` and `_compute_bpm_confidence` functions entirely
    - Keep `parse_args()` and `main()` CLI wrapper unchanged
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 9.5_

- [x] 3. Checkpoint - Verify core implementation
  - Ensure the rewritten analyzer module imports cleanly and the CLI runs without import errors. Run `uv run python -m analyzer.analyze --help` to verify. Ask the user if questions arise.

- [ ] 4. Update existing tests
  - [x] 4.1 Update test_analyze.py for the new implementation
    - Remove import of `_identify_downbeat` (function no longer exists)
    - Remove import of `_compute_bpm_confidence` (replaced by `_compute_bpm`)
    - Update `TestEdgeCases.test_very_short_audio_raises` threshold from 0.1s to match new 1.0s minimum
    - Keep all `TestAnalyzeOutputContract` tests unchanged (output contract is the same)
    - Keep all `TestCLI` tests unchanged (CLI interface is the same)
    - Verify all existing tests pass with `uv run pytest analyzer/tests/test_analyze.py`
    - _Requirements: 5.1, 6.1, 6.2, 9.1, 9.2, 9.3_

- [ ] 5. Add property-based tests
  - [x] 5.1 Write property test for sorted and rounded beat timestamps
    - **Property 1: Beat timestamps are sorted and correctly rounded**
    - **Validates: Requirements 1.2, 5.5**
    - Use hypothesis to generate random float arrays, pass through `_format_output`, verify sorted + rounded to 6dp

  - [x] 5.2 Write property test for frame conversion correctness
    - **Property 2: Frame conversion correctness**
    - **Validates: Requirements 1.3, 5.6**
    - Use hypothesis to generate random (timestamp, fps) pairs, verify `frame == round(ts * fps)` and frames are sorted

  - [x] 5.3 Write property test for BPM formula
    - **Property 3: BPM equals 60 divided by median inter-beat interval**
    - **Validates: Requirements 3.1, 5.2**
    - Use hypothesis to generate sorted timestamp arrays (2+ elements), verify BPM = 60/median(diff)

  - [x] 5.4 Write property test for BPM confidence bounds
    - **Property 4: BPM confidence is bounded in [0, 1]**
    - **Validates: Requirements 3.3, 5.3**
    - Use hypothesis to generate random timestamp arrays, verify confidence ∈ [0.0, 1.0]

  - [x] 5.5 Write property test for downbeat offset
    - **Property 5: Downbeat offset equals first downbeat timestamp**
    - **Validates: Requirements 2.1, 2.2, 5.4**
    - Use hypothesis to generate random downbeat arrays, verify first-element selection or 0.0 for empty

  - [x] 5.6 Write property test for energy profile invariants
    - **Property 6: Energy profile is non-empty with non-negative values and correct length**
    - **Validates: Requirements 4.1, 4.2, 4.3, 5.7**
    - Use hypothesis to generate random audio arrays, verify non-negative values + approximate expected length

  - [x] 5.7 Write property test for output contract structure
    - **Property 7: Output contract structure**
    - **Validates: Requirements 5.1**
    - Use hypothesis to generate random valid inputs, verify exactly 6 keys present with correct types

  - [x] 5.8 Write property test for inter-beat interval consistency
    - **Property 8: Inter-beat interval consistency**
    - **Validates: Requirements 10.2**
    - Use hypothesis to generate regular beat grids with small jitter, verify 85% of IBIs within 15% of expected

- [x] 6. Final checkpoint - Verify everything works end-to-end
  - Run full test suite with `uv run pytest analyzer/tests/` and ensure all tests pass. Verify the CLI produces valid JSON output with a real WAV file. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The TypeScript layer needs NO changes — only the Python analyzer module is modified
- Model weights (~78 MB) auto-download on first `File2Beats` invocation
- Property tests mock the beat_this model to test our logic (BPM computation, formatting, energy) not the neural network
- All property tests go in a new file `analyzer/tests/test_properties.py`
