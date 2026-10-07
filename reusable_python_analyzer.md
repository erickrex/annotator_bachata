# Reusable Python Analyzer for BachataCut

**Source:** `annotator_bachata/analyzer/` — Bachata audio analyzer CLI (Python 3.11+, `beat_this`, PyTorch, numpy, scipy)
**Target:** BachataCut — consumer app that turns a full dance recording into three share-ready Reels
**Companion document:** `reusable_ingest_clip_typescript.md` (the TypeScript side)

**Headline verdict: this is the single most reusable asset in the entire project. Keep ~95% of it.**

Unlike the TypeScript layer — where roughly 11–14% survives — the Python analyzer transfers almost intact. It is a pure function of an audio file, has no coupling to the annotator's domain model, singleton architecture, or persistence layer, and it directly powers BachataCut's **Best musicality** suggestion (requirement §6).

This document is self-contained. It records the full code, the two implementation attempts and why the first failed, the DSP constants that must stay synchronised with TypeScript, the known limitations, and what changes for a multi-tenant service.

---

## Table of contents

1. [Why this is the crown jewel](#1-why-this-is-the-crown-jewel)
2. [Implementation history: what was tried and why it changed](#2-implementation-history-what-was-tried-and-why-it-changed)
   - 2.1 [Attempt 1 — librosa + hand-rolled downbeat heuristic](#21-attempt-1--librosa--hand-rolled-downbeat-heuristic)
   - 2.2 [Why attempt 1 failed](#22-why-attempt-1-failed)
   - 2.3 [Attempt 2 — beat_this transformer](#23-attempt-2--beat_this-transformer-current)
   - 2.4 [Side-by-side comparison](#24-side-by-side-comparison)
   - 2.5 [What the migration cost](#25-what-the-migration-cost)
3. [The current implementation, annotated](#3-the-current-implementation-annotated)
4. [The output contract](#4-the-output-contract)
5. [DSP constants that must stay synchronised](#5-dsp-constants-that-must-stay-synchronised)
6. [Known issues in the current code](#6-known-issues-in-the-current-code)
7. [Adapting for BachataCut](#7-adapting-for-bachatacut)
8. [Extensions BachataCut needs](#8-extensions-bachatacut-needs)
9. [Test assets](#9-test-assets)
10. [Deployment and operational notes](#10-deployment-and-operational-notes)
11. [Migration checklist](#11-migration-checklist)

---

## 1. Why this is the crown jewel

BachataCut promises three suggestions (requirement §6):

| Suggestion | Needs | Status today |
|---|---|---|
| Most impressive | Computer vision | 0% — not written |
| **Best musicality** | **Beat/downbeat/energy analysis** | **~90% — this analyzer** |
| Best connection | Computer vision | 0% — not written |

The analyzer is the only piece of BachataCut's product intelligence that already exists and works. Combined with `cycle-builder.ts` (see the TypeScript companion doc, §5.2), it gives you phrase-aligned candidate selection with no ML work of your own.

**What it produces** from a WAV file:

```json
{
  "bpm": 129.2,
  "bpm_confidence": 0.7708,
  "downbeat_offset_seconds": 1.416417,
  "beat_timestamps": [0.09288, 0.534059, 0.975238, 1.416417, ...],
  "beat_frames": [3, 16, 29, 42, ...],
  "energy_profile": [0.008622, 0.100525, 0.13438, ...]
}
```

**Why each field matters to BachataCut:**

- `beat_timestamps` / `beat_frames` → feed `buildCycles` to get 8/16/32-count phrase boundaries, so cuts land on count 1 instead of mid-phrase
- `downbeat_offset_seconds` → anchors the cycle grid to the actual musical count 1. Without this you have a beat grid with no idea which beat is "one"
- `energy_profile` → the dynamics signal for ranking candidates (§10 of the companion doc)
- `bpm_confidence` → the honesty gate. Low confidence means tempo drift or a weak beat, so musicality suggestions should be de-prioritised (requirement §5: *"be honest about it"*)
- `bpm` → sanity check and UI display

**Size:** 267 lines of `analyze.py`, plus 647 lines of tests. Nine of every ten lines transfer.

---

## 2. Implementation history: what was tried and why it changed

Recovered from git history. Four commits touched `analyzer/analyze.py`:

| Commit | Date | Change |
|---|---|---|
| `cb787c9` | ~Apr 2026 | First prototype — librosa-based, 225 lines |
| `49a3a85` | Apr 28 2026 | `--fps` changed from `int` to `float` (fractional rate support) |
| `4427ad7` | **May 3 2026** | **librosa → `beat_this`. 340 lines changed, 201 insertions / 153 deletions** |
| `25eb83f` | later | Docs and comment clarification only |

The one that matters is `4427ad7`, *"feat: integrate beat_this instead of librosa"*. There is also a full written spec at `.kiro/specs/beat-this-integration/` (requirements + design, 575 lines) recording the reasoning.

### 2.1 Attempt 1 — librosa + hand-rolled downbeat heuristic

The original approach used classical DSP: librosa's dynamic-programming beat tracker, plus two custom heuristics.

**Beat and tempo detection:**

```python
# HISTORICAL (commit cb787c9..4427ad7~1) — the librosa approach. REPLACED.
import librosa

y, sr = librosa.load(wav_path, sr=22050)

# Detect BPM and beat frames
tempo, beat_frames_lib = librosa.beat.beat_track(y=y, sr=sr)

# librosa >= 0.10 returns tempo as an ndarray — defensive unwrapping required
if isinstance(tempo, np.ndarray):
    tempo = float(tempo[0]) if tempo.size > 0 else 0.0
else:
    tempo = float(tempo)

beat_timestamps = librosa.frames_to_time(beat_frames_lib, sr=sr).tolist()
```

**Downbeat detection — a hand-rolled RMS accent heuristic (the critical weak point):**

```python
# HISTORICAL — REMOVED in 4427ad7. Reproduced to document why it failed.
def _identify_downbeat(y, sr, beat_frames_lib) -> int:
    """Identify the downbeat (count 1) index by analyzing RMS accent patterns.

    In bachata, count 1 typically has stronger energy than count 5.
    We look at groups of 8 beats and find the offset where the accent
    pattern best matches the expected bachata pattern.
    """
    if len(beat_frames_lib) < 8:
        return 0

    # RMS energy at each beat position
    rms = librosa.feature.rms(y=y, hop_length=512)[0]
    beat_energies = []
    for bf in beat_frames_lib:
        beat_energies.append(float(rms[bf]) if bf < len(rms) else 0.0)

    beat_energies = np.array(beat_energies)
    if beat_energies.max() == 0:
        return 0

    # Try each possible offset (0-7) as the downbeat position
    best_offset = 0
    best_score = -float("inf")
    num_beats = len(beat_energies)

    for offset in range(min(8, num_beats)):
        score = 0.0
        count = 0
        for start in range(offset, num_beats - 7, 8):
            cycle = beat_energies[start : start + 8]
            if len(cycle) < 8:
                break
            # Score: count 1 energy minus count 5 energy
            score += cycle[0] - cycle[4]
            count += 1

        if count > 0:
            avg_score = score / count
            if avg_score > best_score:
                best_score = avg_score
                best_offset = offset

    return best_offset
```

**Confidence — onset-strength autocorrelation at the tempo lag:**

```python
# HISTORICAL — REMOVED in 4427ad7.
def _compute_bpm_confidence(y, sr, tempo) -> float:
    """Uses onset strength autocorrelation to measure how strong the
    detected tempo peak is relative to overall autocorrelation energy."""
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    ac = librosa.autocorrelate(onset_env, max_size=len(onset_env))
    if ac.max() == 0:
        return 0.0

    ac = ac / ac[0] if ac[0] > 0 else ac

    hop_length = 512
    period_seconds = 60.0 / tempo
    period_frames = period_seconds * sr / hop_length
    lag = int(round(period_frames))
    if lag <= 0 or lag >= len(ac):
        return 0.0

    return float(np.clip(float(ac[lag]), 0.0, 1.0))
```

Dependencies at the time:

```toml
# HISTORICAL pyproject.toml (version 0.1.0)
description = "Librosa-based audio analyzer for bachata BPM detection, beat tracking, and energy profiling"
dependencies = [
    "librosa>=0.10.0",
    "numpy>=1.24.0",
    "yt-dlp>=2024.1.0",
]
```

### 2.2 Why attempt 1 failed

Six distinct problems, in rough order of severity.

**1. The downbeat heuristic encoded a false musical assumption.**

`_identify_downbeat` scored candidate offsets by `cycle[0] - cycle[4]` — count 1's RMS energy minus count 5's — and picked the offset maximising that difference. This assumes **count 1 is always louder than count 5 in bachata.** That is not reliably true:

- In **sensual bachata**, the accent frequently sits on count 5 or on the "and" before it, because that is where the hip motion and the body-wave resolve. The heuristic then locks onto count 5 as count 1, producing a grid shifted by exactly half a cycle.
- In **Dominican bachata**, syncopation and the characteristic guitar *requinto* accents scatter energy across the cycle, so no clean 1-vs-5 contrast exists.
- Many bachata tracks are built on a steady bongo/güira pattern where per-beat RMS is nearly flat, making the score dominated by noise.

The failure mode is not subtle degradation. A half-cycle shift means every generated clip starts on count 5, which a dancer perceives immediately as "the clip starts in the wrong place." For the annotator this meant bad tiling; for BachataCut it would mean every suggested Reel feels off.

**2. Errors compounded because the heuristic operated on the beat grid.**

`_identify_downbeat` returns an **index into librosa's detected beat array**, not an independent time estimate. If beat tracking dropped or added a beat anywhere before the analysed region, the offset arithmetic (`range(offset, num_beats - 7, 8)`) silently mis-groups every subsequent cycle. Two error sources multiplied instead of being independent.

**3. librosa's beat tracker has known octave errors on Latin music.**

`librosa.beat.beat_track` is an onset-envelope + dynamic-programming tracker rooted in 2010s DSP. Its documented weakness is **tempo octave errors** — reporting half or double the true tempo. Bachata sits at 120–145 BPM with a strong eighth-note güira pattern, which is exactly the setup that induces double-tempo detection (~260 BPM). When that happens, "8 beats" spans four real beats and the cycle grid is half the intended length.

**4. Confidence was uninterpretable and library-coupled.**

Reading a single autocorrelation lag of the onset envelope gives a number that is noisy, sensitive to the onset-strength parameters, and has no clear meaning to a downstream consumer. It could not answer the question BachataCut actually needs answered: *should I trust this beat grid enough to show a musicality suggestion?*

**5. librosa's API was unstable in the relevant version range.**

The defensive `isinstance(tempo, np.ndarray)` unwrapping exists because librosa 0.10 changed `beat_track`'s return type from a scalar to an array. Code that needs runtime type-sniffing on a core dependency's return value is a maintenance liability.

**6. librosa is a heavy dependency for what was being used.**

It pulls in `numba`, `soxr`, `audioread`, `pooch`, `scikit-learn`, `joblib`, `decorator`, `lazy_loader`. Import time alone is significant, and the analyzer only used `load`, `beat_track`, `frames_to_time`, `feature.rms`, `onset.onset_strength`, and `autocorrelate`.

### 2.3 Attempt 2 — `beat_this` transformer (current)

The replacement swaps the inference backend for [`beat_this`](https://github.com/CPJKU/beat_this) (CPJKU, ISMIR 2024) — a transformer-based **joint beat and downbeat** tracker — and derives everything else from its output.

The spec's stated design decisions (`.kiro/specs/beat-this-integration/design.md`):

> - **Direct File2Beats usage**: handles audio loading, preprocessing, inference, and postprocessing in a single call, returning beat and downbeat timestamp arrays.
> - **BPM derived from beat timestamps**: instead of relying on librosa's tempo estimation, BPM is computed as `60 / median(inter-beat intervals)`.
> - **Native downbeat detection**: beat_this returns downbeats directly, eliminating the fragile RMS-based `_identify_downbeat` heuristic.
> - **Energy profile via numpy/scipy**: RMS energy computed with a simple numpy windowed computation.
> - **No changes to TypeScript layer.**

Three structural wins:

**A. The downbeat heuristic was deleted, not improved.** `beat_this` was trained on annotated music where downbeats are labelled ground truth. It learned what a downbeat sounds like across genres instead of being told "count 1 is louder than count 5." Requirement 2.3 of the spec is explicit: *"THE Analyzer SHALL remove the custom RMS-based `_identify_downbeat` function entirely."* Roughly 55 lines of fragile heuristic became one line:

```python
downbeat_offset = float(downbeats[0]) if len(downbeats) > 0 else 0.0
```

**B. BPM became self-consistent with the beat grid.** Previously librosa produced a tempo estimate *and* a beat list from partly separate machinery, so they could disagree — a reported 129 BPM alongside beats spaced for 65 BPM. Now BPM is *defined* as a function of the detected grid:

```python
ibis = np.diff(beat_timestamps)
bpm = 60.0 / float(np.median(ibis))
```

Using the **median** rather than the mean makes it robust to occasional missed or doubled beats. Disagreement between BPM and the beat grid is now structurally impossible.

**C. Confidence became interpretable.** The coefficient of variation of inter-beat intervals directly measures grid regularity, is naturally bounded after clamping, and answers the real question:

```python
std_ibi = float(np.std(ibis))
cv = std_ibi / median_ibi
confidence = float(np.clip(1.0 - cv, 0.0, 1.0))
```

Perfectly regular beats → CV ≈ 0 → confidence ≈ 1. Ragged grid → high CV → confidence → 0. No library coupling, and it is trivially unit-testable with synthetic input.

### 2.4 Side-by-side comparison

| Concern | Attempt 1 (librosa) | Attempt 2 (`beat_this`) — current |
|---|---|---|
| Beat detection | `librosa.beat.beat_track` (onset envelope + DP) | Transformer trained on annotated music |
| **Downbeat** | **~55-line RMS heuristic assuming count 1 > count 5** | **Native model output, `downbeats[0]`** |
| Downbeat failure mode | Half-cycle shift on sensual/Dominican styles | Model error, no systematic style bias |
| BPM source | librosa's own tempo estimate | `60 / median(IBI)` of the detected grid |
| BPM/grid consistency | Can disagree | Consistent by construction |
| Confidence | Onset autocorrelation at tempo lag | `1 − CV(IBI)`, clamped |
| Confidence interpretability | Low | High — measures grid regularity |
| Octave-error risk | Documented weakness on Latin rhythms | Reduced; model learned metrical structure |
| Energy profile | `librosa.feature.rms` | scipy WAV read + numpy windowed RMS |
| Heavy deps | librosa (numba, soxr, audioread, pooch, sklearn) | torch, torchaudio, scipy |
| Model weights | None | ~78 MB checkpoint, auto-downloaded and cached |
| Cold start | Fast import | Slow — checkpoint load dominates |
| API stability | Return type changed in 0.10 | Pinned via git dependency |
| `analyze.py` size | 226 lines | 267 lines |
| Property tests | 0 | 8 properties, 440 lines |

### 2.5 What the migration cost

Be honest about the trade — it matters for BachataCut's deployment budget.

**Given up:**

- **Dependency weight.** `torch` + `torchaudio` is a large install (CPU-only wheels are a few hundred MB; CUDA builds are multiple GB). librosa was smaller.
- **A network dependency on first run.** The `final0` checkpoint (~78 MB) is downloaded on first invocation and cached. Requirement 7.3 handles failure, but an air-gapped or cold-container deploy needs the cache pre-baked.
- **Cold-start latency.** Loading the checkpoint dominates runtime for short clips. The annotator's per-request CLI spawn pays this on **every single call** — the lazy singleton only caches within one process, and each `uv run` is a fresh process. This is the biggest thing to fix for BachataCut (§7).
- **A git-sourced dependency.** `beat-this @ git+https://github.com/CPJKU/beat_this.git` is not on PyPI, requiring `allow-direct-references = true` and a git client at install time.

**Gained:**

- Correct downbeats across bachata sub-styles — the thing that actually determines whether a Reel starts in the right place
- ~55 lines of fragile heuristic deleted
- Self-consistent BPM
- Interpretable, bounded confidence usable as a product gate
- GPU acceleration available when present, automatic CPU fallback
- librosa and its transitive tree removed

**Verdict for BachataCut: keep `beat_this`.** The correctness gain is directly load-bearing for the product promise, and the cost is a deployment concern with known mitigations (bake the checkpoint into the image, hold the model in a warm worker). Reverting to a DSP tracker to save install size would reintroduce exactly the failure mode — clips starting on count 5 — that users notice most.

---

## 3. The current implementation, annotated

Full source with commentary on what to keep and why. **Copy this file nearly verbatim.**

### 3.1 Module docstring and the self-documenting contract

```python
# SOURCE (verbatim) — analyzer/analyze.py
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
```

Keep the docstring. It is the only place the JSON contract is written in Python, and it is what stops the TypeScript and Python sides drifting.

### 3.2 Lazy model singleton

```python
# SOURCE (verbatim)
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
```

**Why each choice:**

- **Lazy init** — avoids loading ~78 MB at import time, which keeps test collection fast. The property tests import the module and mock the model; eager loading would make the suite slow and require network access.
- **`import torch` inside the function** — the torch import itself is expensive; deferring it keeps `python -c "import analyzer.analyze"` cheap.
- **Auto device detection** — satisfies requirement 1.5 (CPU fallback without error). Works unchanged on a GPU worker or a laptop.
- **`checkpoint_path="final0"`** — the general-purpose pretrained model. Requirement 10.1 chose it deliberately: trained on diverse genres, which is what gives robustness across traditional / Dominican / sensual / fusion bachata.
- **`dbn=False`** — the Dynamic Bayesian Network post-processor is disabled. DBN enforces a stricter global metrical grid; it is slower and can over-regularise music with genuine tempo variation. The model's own postprocessing is used instead.

**For BachataCut: keep the singleton, but hoist it into a long-lived worker (§7).**

### 3.3 Audio validation

```python
# SOURCE (verbatim)
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
```

The integer-dtype normalisation (`int16 / 32768.0`, `int32 / 2147483648.0`) is worth keeping — `scipy.io.wavfile` returns the file's native dtype, and skipping normalisation makes the silence threshold meaningless.

### 3.4 BPM and confidence

```python
# SOURCE (verbatim) — the heart of the improvement over attempt 1
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
```

Three guards to preserve: `< 2 beats` returns zeros rather than dividing by an empty diff; `median_ibi <= 0` catches duplicate or non-monotonic timestamps; `np.clip` guarantees the `[0, 1]` bound the TypeScript side relies on.

### 3.5 Energy profile — the librosa replacement

```python
# SOURCE (verbatim)
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
```

**Critically important:** the parameters `sr=22050`, `hop_length=512`, `frame_length=2048`, and reflect-mode centre padding were chosen to **reproduce librosa's RMS defaults**, so the migration did not silently change the energy profile's resolution or alignment. Any consumer computing an energy index from a timestamp depends on these exact values. See §5.

The reflect padding matters for alignment: without it the first energy frame would correspond to a half-window offset, shifting the whole profile against the beat grid.

### 3.6 Output formatting

```python
# SOURCE (verbatim)
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
```

The explicit `sorted(...)` before frame conversion guarantees both arrays are monotonic even if the model returns unordered output — a property the TypeScript `buildCycles` implicitly assumes when it indexes `beatGridFrames[startIdx]`.

Rounding is not cosmetic. It cuts JSON payload size substantially (a 3-minute track has ~390 beats and ~7,700 energy values) and makes output byte-stable, so tests can compare exactly.

### 3.7 CLI and orchestration

```python
# SOURCE (verbatim)
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze a WAV file for BPM, beat grid, and energy profile."
    )
    parser.add_argument("wav_path", type=str, help="Path to the WAV audio file to analyze.")
    parser.add_argument(
        "--fps",
        type=float,
        default=30.0,
        help="Video frame rate for timestamp-to-frame conversion (default: 30). "
        "Fractional rates (e.g. 29.97, 23.976) are supported.",
    )
    return parser.parse_args()


def analyze(wav_path: str, fps: float) -> dict:
    """Run beat_this analysis on the given WAV file."""
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
```

`--fps` is `type=float`, changed from `int` in commit `49a3a85` specifically to support 29.97 and 23.976. **Keep this** — phone footage is routinely 29.97 or 59.94, and an integer cast would accumulate frame drift across a 3-minute recording.

The `main()` boundary is the whole subprocess contract: JSON to stdout on success, `Error: {message}` to stderr with exit 1 on failure. Nothing else may ever write to stdout, or the JSON parse on the Node side breaks.

```python
# SOURCE (verbatim) — analyzer/__main__.py
"""Allow running analyzer as a module: python -m analyzer.analyze"""
from analyzer.analyze import main

main()
```

---

## 4. The output contract

The single most important artifact to preserve, because it is the seam between Python and TypeScript.

```python
# The contract, as produced by _format_output
{
  "bpm": float,                       # rounded 2dp; 0.0 if < 2 beats
  "bpm_confidence": float,            # [0,1], rounded 4dp; 0.0 if < 2 beats
  "downbeat_offset_seconds": float,   # rounded 6dp; 0.0 if no downbeats
  "beat_timestamps": list[float],     # ascending, seconds, rounded 6dp
  "beat_frames": list[int],           # ascending, round(ts * fps)
  "energy_profile": list[float],      # non-negative, rounded 6dp
}
```

```ts
// The TypeScript mirror (see the companion doc §6.4)
export interface PythonAnalyzerOutput {
  bpm: number;
  bpm_confidence: number;
  downbeat_offset_seconds: number;
  beat_timestamps: number[];
  beat_frames: number[];
  energy_profile: number[];
}
```

**Guaranteed invariants** (asserted by the property tests, §9):

1. Exactly these six keys — no more, no fewer
2. `beat_timestamps` sorted ascending
3. `beat_frames[i] == round(beat_timestamps[i] * fps)`
4. `beat_frames` sorted ascending
5. `bpm_confidence ∈ [0.0, 1.0]`
6. `energy_profile` values all `>= 0.0`
7. Zero beats yields the full contract with empty arrays and zeros — **never an exception**

Invariant 7 is a deliberate design choice worth keeping. A recording with no detectable beat is a legitimate outcome, not an error. It lets BachataCut degrade gracefully: skip the musicality suggestion, still offer the other two.

**A note on the `beat_frames` field.** It is a convenience denormalisation — `round(timestamp * fps)` computed in Python. It duplicates information already in `beat_timestamps` and hardcodes one fps. For BachataCut, consider whether to keep it: if you ever normalise uploads to a different fps, or need the grid at multiple frame rates, `beat_frames` becomes a trap. The TypeScript side can compute it trivially. Recommendation in §7.

---

## 5. DSP constants that must stay synchronised

**This is the highest-risk coupling in the whole analyzer, and it is currently implicit.**

`_compute_energy_profile` uses `sr=22050`, `hop_length=512`, `frame_length=2048`. Any consumer mapping a timestamp to an energy index must divide by the hop duration:

```
ENERGY_HOP_SECONDS = hop_length / sr = 512 / 22050 ≈ 0.0232199546...
```

In the annotator, no TypeScript code states this. The companion document adds it explicitly:

```ts
// From reusable_ingest_clip_typescript.md §6.4 — make the coupling explicit
export const ANALYZER_SAMPLE_RATE = 22050;
export const ANALYZER_HOP_LENGTH = 512;
export const ANALYZER_FRAME_LENGTH = 2048;
export const ENERGY_HOP_SECONDS = ANALYZER_HOP_LENGTH / ANALYZER_SAMPLE_RATE;

export function energyIndexForTime(seconds: number): number {
  return Math.max(0, Math.round(seconds / ENERGY_HOP_SECONDS));
}
```

**Make the Python side export them too, and emit them in the payload so drift is detectable at runtime:**

```python
# ADAPTED for BachataCut — analyzer/constants.py
"""DSP constants for the energy profile.

These define the time resolution of `energy_profile`. Any consumer converting a
timestamp into an energy index divides by ENERGY_HOP_SECONDS. Changing these
values silently invalidates every such lookup — change them in lockstep with
the TypeScript mirror in packages/dance-core/analyzer-contract.ts.
"""

ANALYZER_SAMPLE_RATE = 22050
ANALYZER_HOP_LENGTH = 512
ANALYZER_FRAME_LENGTH = 2048
ENERGY_HOP_SECONDS = ANALYZER_HOP_LENGTH / ANALYZER_SAMPLE_RATE  # ≈ 0.023220

# Bump when the output contract or DSP parameters change.
ANALYZER_CONTRACT_VERSION = "2.0"
```

```python
# ADAPTED for BachataCut — self-describing output kills the silent-drift failure mode
def _format_output(..., include_meta: bool = True) -> dict:
    out = {
        "bpm": round(bpm, 2),
        "bpm_confidence": round(confidence, 4),
        "downbeat_offset_seconds": round(downbeat_offset, 6),
        "beat_timestamps": [round(t, 6) for t in timestamps_list],
        "beat_frames": frames_list,
        "energy_profile": [round(e, 6) for e in energy_profile],
    }
    if include_meta:
        out["meta"] = {
            "contract_version": ANALYZER_CONTRACT_VERSION,
            "energy_hop_seconds": round(ENERGY_HOP_SECONDS, 9),
            "energy_sample_rate": ANALYZER_SAMPLE_RATE,
            "energy_hop_length": ANALYZER_HOP_LENGTH,
            "energy_frame_length": ANALYZER_FRAME_LENGTH,
            "model_checkpoint": "final0",
            "dbn": False,
        }
    return out
```

```ts
// ADAPTED for BachataCut — fail loudly instead of computing wrong indices forever
export function assertAnalyzerContract(meta: { energy_hop_seconds: number }): void {
  const drift = Math.abs(meta.energy_hop_seconds - ENERGY_HOP_SECONDS);
  if (drift > 1e-6) {
    throw new Error(
      `Analyzer DSP mismatch: Python reports energy_hop_seconds=${meta.energy_hop_seconds}, ` +
      `TypeScript expects ${ENERGY_HOP_SECONDS}. Energy lookups would be wrong.`,
    );
  }
}
```

Note this changes the key set, so relax the strict "exactly six keys" property test (§9) to "at least these six keys" or gate `meta` behind a flag.

---

## 6. Known issues in the current code

Four defects found while reading. None are severe, all are worth fixing during the port.

### 6.1 The WAV file is read three times per call

```python
_validate_audio(wav_path)          # scipy.io.wavfile.read  → read #1
beats, downbeats = f2b(wav_path)   # beat_this loads audio  → read #2
energy_profile = _compute_energy_profile(wav_path)  # read  → read #3
```

Three full decodes of the same file, with dtype normalisation and mono mixing duplicated between `_validate_audio` and `_compute_energy_profile`. On a 3-minute WAV that is wasted I/O and CPU on every job.

```python
# ADAPTED for BachataCut — load once, pass the array around
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample


def _load_mono_float32(wav_path: str) -> tuple[np.ndarray, int]:
    """Load a WAV as mono float32. Single point of decoding and normalisation."""
    if not os.path.isfile(wav_path):
        raise FileNotFoundError(f"WAV file not found: {wav_path}")

    file_sr, audio = wavfile.read(wav_path)

    if audio.dtype == np.int16:
        audio = audio.astype(np.float32) / 32768.0
    elif audio.dtype == np.int32:
        audio = audio.astype(np.float32) / 2147483648.0
    elif audio.dtype == np.uint8:
        audio = (audio.astype(np.float32) - 128.0) / 128.0
    elif audio.dtype != np.float32:
        audio = audio.astype(np.float32)

    if audio.ndim == 2:
        audio = audio.mean(axis=1)

    return audio, int(file_sr)


def _validate_audio_array(audio: np.ndarray, sr: int) -> None:
    duration = len(audio) / sr
    if duration < 1.0:
        raise ValueError(
            f"Audio too short for analysis ({duration:.2f}s). Need at least 1 second."
        )
    if np.max(np.abs(audio)) < 1e-6:
        raise ValueError("Audio appears to be silent — no signal detected.")


def _energy_from_array(audio: np.ndarray, file_sr: int) -> list[float]:
    """Windowed RMS. Same parameters as the original: sr=22050, hop=512, frame=2048."""
    if file_sr != ANALYZER_SAMPLE_RATE:
        num_samples = int(len(audio) * ANALYZER_SAMPLE_RATE / file_sr)
        audio = resample(audio, num_samples).astype(np.float32)

    frame_length = ANALYZER_FRAME_LENGTH
    hop_length = ANALYZER_HOP_LENGTH
    pad = frame_length // 2
    padded = np.pad(audio, (pad, pad), mode="reflect")

    num_frames = 1 + (len(padded) - frame_length) // hop_length
    # Vectorised: replaces the original Python loop (see §6.2)
    idx = np.arange(num_frames) * hop_length
    frames = padded[idx[:, None] + np.arange(frame_length)]
    energy = np.sqrt(np.mean(frames.astype(np.float32) ** 2, axis=1))
    return energy.tolist()
```

The `uint8` branch is new — 8-bit WAV is unsigned with a 128 offset, and the original would treat it as wildly loud.

### 6.2 The RMS loop is not vectorised

```python
# SOURCE — O(num_frames) Python loop
for i in range(num_frames):
    start = i * hop_length
    frame = audio_padded[start : start + frame_length]
    energy[i] = np.sqrt(np.mean(frame**2))
```

For a 3-minute track at 22050 Hz with hop 512 that is ~7,750 iterations of Python-level work. The vectorised version in §6.1 is substantially faster.

> **Memory caution.** The strided-index approach materialises a `num_frames × 2048` float32 array — roughly 63 MB for 3 minutes, fine for a worker but not for a 30-minute file. For long inputs, either chunk it or use `numpy.lib.stride_tricks.sliding_window_view` with a step, which avoids the copy.

### 6.3 `soundfile` is declared but never imported

```toml
# pyproject.toml declares it
dependencies = [
    "beat-this @ git+https://github.com/CPJKU/beat_this.git",
    "torch>=2.0.0",
    "torchaudio>=2.0.0",
    "numpy>=1.24.0",
    "scipy>=1.10.0",
    "soundfile>=0.12.0",   # ← never imported by analyzer/*
    "yt-dlp>=2024.1.0",
]
```

Verified: no `import soundfile` anywhere in `analyzer/`. It is likely a transitive requirement of `beat_this`, in which case it should not be a direct dependency. Drop it from the direct list and let the dependency resolver supply it, or keep it only if you switch to `soundfile` for broader format support (§8.1).

Also drop `yt-dlp` — BachataCut ingests uploads, not YouTube URLs.

### 6.4 Design/implementation drift on `_validate_audio`

The spec's design document says:

```python
def _validate_audio(wav_path: str) -> np.ndarray:
    """Load and validate audio, returning the signal array."""
```

The implementation returns `None` and discards the loaded array — which is precisely why the file gets read three times. The design's intent (return the array, reuse it) was the better one and is what §6.1 restores.

---

## 7. Adapting for BachataCut

### 7.1 The one change that matters: stop spawning a process per job

The annotator invokes the analyzer as a CLI per HTTP request:

```ts
// The annotator's approach — pays the model load EVERY call
spawn('uv', ['run', 'python', '-m', 'analyzer.analyze', wavPath, '--fps', String(fps)]);
```

The `_get_file2beats` singleton caches only within one process, and every `uv run` is a new process. So every analysis re-imports torch and re-loads the ~78 MB checkpoint. On top of that the annotator's timeout is 60 seconds, which CPU inference on a long recording will exceed.

**Two viable architectures.**

**Option A — queue worker holding the model (recommended).** The Python process starts once, loads the model once, then consumes jobs.

```python
# ADAPTED for BachataCut — analyzer/worker.py
"""Long-lived analysis worker. Loads the model once, then consumes jobs.

Run several replicas for throughput. Each holds one model instance in memory.
"""

import json
import logging
import os
import signal
import sys

from analyzer.analyze import analyze, _get_file2beats

log = logging.getLogger("analyzer.worker")
_shutting_down = False


def _handle_signal(signum, _frame):
    global _shutting_down
    log.info("signal %s received — finishing current job then exiting", signum)
    _shutting_down = True


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # Warm the model BEFORE accepting work, so the first real job is not slow
    # and a broken checkpoint fails fast at boot instead of mid-job.
    log.info("loading beat_this checkpoint…")
    _get_file2beats()
    log.info("model ready")

    queue = connect_queue(os.environ["QUEUE_URL"])  # your queue client

    while not _shutting_down:
        job = queue.reserve(timeout=5)
        if job is None:
            continue
        try:
            result = analyze(job.payload["wav_path"], job.payload["fps"])
            queue.complete(job, result)
        except Exception as exc:
            log.exception("analysis failed for job %s", job.id)
            queue.fail(job, {"error": str(exc), "kind": type(exc).__name__})

    log.info("drained — exiting")


if __name__ == "__main__":
    main()
```

**Option B — HTTP microservice.** Simpler to reason about, easy to scale behind a load balancer, but you must handle long request durations.

```python
# ADAPTED for BachataCut — analyzer/service.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from analyzer.analyze import analyze, _get_file2beats

app = FastAPI(title="BachataCut Analyzer")


class AnalyzeRequest(BaseModel):
    wav_path: str          # a path the service can read (shared volume or local temp)
    fps: float = 30.0


@app.on_event("startup")
def _warm_model() -> None:
    _get_file2beats()      # load once at boot, not on first request


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "model_loaded": True}


@app.post("/analyze")
def analyze_endpoint(req: AnalyzeRequest) -> dict:
    try:
        return analyze(req.wav_path, req.fps)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        # Too short / silent — a client-input problem, not a server fault.
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
```

> **Do not accept an arbitrary `wav_path` from an untrusted caller.** As written, both variants read any path the process can reach. Inside a private worker network that is acceptable; exposed publicly it is a file-disclosure primitive. Restrict to a known working directory, or accept an upload / object-storage key and resolve it server-side.

### 7.2 Keep the CLI as well

Keep `main()` and `__main__.py` even after adding a worker. The CLI is invaluable for debugging a specific problem file, for CI integration tests, and for one-off analysis:

```bash
uv run python -m analyzer.analyze path/to/audio.wav --fps 29.97
```

### 7.3 Reconsider `beat_frames`

`beat_frames` bakes one fps into the payload. If BachataCut normalises uploads to CFR (recommended, see the companion doc §6.1 on VFR), the fps used at analysis time may differ from the fps used at render time, and `beat_frames` becomes silently wrong.

```python
# ADAPTED for BachataCut — make fps optional; timestamps are the source of truth
def analyze(wav_path: str, fps: float | None = None) -> dict:
    ...
    out = {
        "bpm": round(bpm, 2),
        "bpm_confidence": round(confidence, 4),
        "downbeat_offset_seconds": round(downbeat_offset, 6),
        "beat_timestamps": [round(t, 6) for t in timestamps_list],
        "energy_profile": [round(e, 6) for e in energy_profile],
    }
    # Emit beat_frames only when an fps is supplied, and record which fps it used.
    if fps is not None:
        out["beat_frames"] = [round(t * fps) for t in timestamps_list]
        out["beat_frames_fps"] = fps
    return out
```

Then derive frames in TypeScript from the timestamps, where the render fps is known.

### 7.4 Trimmed dependency list

```toml
# ADAPTED for BachataCut — pyproject.toml
[project]
name = "bachatacut-audio-analyzer"
version = "1.0.0"
description = "Beat, downbeat and energy analysis for bachata recordings"
requires-python = ">=3.11"
dependencies = [
    "beat-this @ git+https://github.com/CPJKU/beat_this.git",
    "torch>=2.0.0",
    "torchaudio>=2.0.0",
    "numpy>=1.24.0",
    "scipy>=1.10.0",
]
# Removed vs the annotator:
#   soundfile — declared but never imported (§6.3)
#   yt-dlp    — BachataCut ingests uploads, not YouTube URLs

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.metadata]
allow-direct-references = true   # required for the git-sourced beat-this

[tool.hatch.build.targets.wheel]
packages = ["analyzer"]

[dependency-groups]
dev = [
    "hypothesis>=6.0.0",
    "pytest>=7.0.0",
]
# Add if you deploy Option B:
#   fastapi, uvicorn
```

> **Pin `beat-this` to a commit.** A bare `git+https://…` resolves to the default branch at install time, so two builds a month apart can embed different models and produce different beat grids. Use `beat-this @ git+https://github.com/CPJKU/beat_this.git@<commit-sha>` for reproducibility.

---

## 8. Extensions BachataCut needs

The analyzer covers beats, downbeats and energy. Four additions would materially improve *Best musicality*.

### 8.1 Extract audio from video directly

The annotator received a WAV because `yt-dlp` produced one. BachataCut receives an MP4/MOV. Keep the WAV interface — it is a clean seam — and do the extraction in the TypeScript worker with ffmpeg (companion doc §10.3):

```bash
ffmpeg -y -i upload.mp4 -vn -ac 1 -ar 22050 -c:a pcm_s16le audio.wav
```

Extracting at 22050 Hz mono matches the analyzer's internal target, so `_compute_energy_profile` skips resampling entirely — a free speedup. `beat_this` resamples internally to its own rate regardless.

If you later want to accept AAC/MP3 directly without a WAV step, that is where `soundfile` (or `torchaudio.load`) earns its place — but keeping ffmpeg as the single decoder is simpler and more predictable.

### 8.2 Per-beat and per-cycle energy — for finer musicality scoring

```python
# NEW — analyzer/musicality.py
"""Per-beat and per-cycle energy features.

The global energy_profile is hop-resolution and style-agnostic. These features
summarise energy against the MUSICAL grid, which is what candidate ranking needs.
"""

import numpy as np

from analyzer.constants import ENERGY_HOP_SECONDS


def energy_at_beats(
    energy_profile: list[float], beat_timestamps: list[float]
) -> list[float]:
    """Mean energy in the window from each beat to the next."""
    if len(beat_timestamps) < 2:
        return []

    energy = np.asarray(energy_profile, dtype=np.float32)
    out: list[float] = []
    for i in range(len(beat_timestamps) - 1):
        start = int(round(beat_timestamps[i] / ENERGY_HOP_SECONDS))
        end = int(round(beat_timestamps[i + 1] / ENERGY_HOP_SECONDS))
        start = max(0, min(start, len(energy)))
        end = max(start + 1, min(end, len(energy)))
        out.append(float(energy[start:end].mean()) if end > start else 0.0)
    return out


def accent_pattern(beat_energies: list[float], beats_per_cycle: int = 8) -> list[float]:
    """Average normalised energy at each position within a cycle.

    Returns a `beats_per_cycle`-length vector. For traditional bachata expect a
    peak at index 0; for sensual the accent often sits nearer index 4. This is a
    STYLE SIGNAL, not a downbeat detector — that lesson is the whole point of §2.2.
    """
    if len(beat_energies) < beats_per_cycle:
        return []

    arr = np.asarray(beat_energies, dtype=np.float32)
    usable = (len(arr) // beats_per_cycle) * beats_per_cycle
    cycles = arr[:usable].reshape(-1, beats_per_cycle)

    peak = float(cycles.max())
    if peak <= 0:
        return [0.0] * beats_per_cycle
    return (cycles.mean(axis=0) / peak).tolist()


def tempo_stability(beat_timestamps: list[float], window: int = 16) -> list[float]:
    """Local BPM over a sliding window of beats.

    Detects tempo drift, which the single global `bpm` hides. A track that speeds
    up through the song has a flat global BPM but a rising local curve — and the
    global cycle grid built from a single downbeat will progressively desync.
    """
    if len(beat_timestamps) < window + 1:
        return []

    ts = np.asarray(beat_timestamps, dtype=np.float64)
    out: list[float] = []
    for i in range(len(ts) - window):
        span = ts[i + window] - ts[i]
        out.append(60.0 * window / span if span > 0 else 0.0)
    return out
```

`tempo_stability` addresses a real limitation noted in the TypeScript companion doc: `buildCycles` assumes a uniform tempo from one downbeat and will drift on a recording that speeds up. Detecting that lets BachataCut either re-anchor per section or lower the musicality confidence.

### 8.3 Use all detected downbeats, not just the first

```python
# Current — discards all but one downbeat
downbeat_offset = float(downbeats[0]) if len(downbeats) > 0 else 0.0
```

`beat_this` returns **every** downbeat it detects. The annotator keeps one and lets `buildCycles` extrapolate a uniform grid from there. For BachataCut, emitting the full array enables re-anchoring and mid-song break detection:

```python
# ADAPTED for BachataCut — keep the full downbeat array
out["downbeat_offset_seconds"] = round(float(downbeats[0]), 6) if len(downbeats) else 0.0
out["downbeat_timestamps"] = [round(float(d), 6) for d in sorted(downbeats)]
```

This is backwards compatible — existing consumers keep reading `downbeat_offset_seconds` — and it is the cheapest meaningful accuracy improvement available, because it lets you snap each candidate window to the *nearest actual* downbeat rather than one extrapolated from the top of the track.

### 8.4 A musicality confidence gate

```python
# NEW — turn raw signals into a product decision (requirement §5: be honest)
from dataclasses import dataclass


@dataclass(frozen=True)
class MusicalityQuality:
    usable: bool
    confidence: float           # 0..1
    reason: str                 # internal diagnostic, not user-facing


def assess_musicality(result: dict) -> MusicalityQuality:
    """Decide whether the beat grid is trustworthy enough to drive suggestions."""
    bpm = result["bpm"]
    conf = result["bpm_confidence"]
    beats = result["beat_timestamps"]

    if len(beats) < 32:
        return MusicalityQuality(False, 0.0, "fewer than 32 beats detected")

    # Bachata is roughly 110–160 BPM. Outside that, suspect an octave error.
    if not (100.0 <= bpm <= 170.0):
        return MusicalityQuality(False, 0.0, f"bpm {bpm} outside plausible bachata range")

    if conf < 0.4:
        return MusicalityQuality(False, conf, f"beat regularity too low ({conf:.2f})")

    if conf < 0.6:
        return MusicalityQuality(True, conf, f"usable but irregular ({conf:.2f})")

    return MusicalityQuality(True, conf, "good")
```

The BPM range check catches the octave error that plagued the librosa approach. If `beat_this` ever reports ~260 BPM for a 130 BPM track, this rejects it rather than building a half-length cycle grid.

---

## 9. Test assets

The analyzer has **647 lines of tests** — proportionally better covered than the TypeScript. Almost all of it transfers, because it tests pure functions and the output contract, not the annotator's domain.

| File | Lines | Carries? |
|---|---:|---|
| `tests/test_properties.py` | 440 | **Yes — all 8 properties** |
| `tests/test_analyze.py` | 207 | **Mostly** — edge cases, contract, CLI |
| `tests/conftest.py` | 25 | **Yes** — extend it (see below) |

### The 8 property tests (hypothesis, ≥100 iterations each)

Added in the same commit as the migration, tagged `# Feature: beat-this-integration, Property N: …`:

| # | Property | Guards |
|---|---|---|
| 1 | Beat timestamps sorted and rounded to 6dp | Contract; `buildCycles` assumes monotonic input |
| 2 | `beat_frames[i] == round(ts[i] * fps)`, sorted | Frame conversion, fractional fps |
| 3 | `bpm == 60 / median(diff(timestamps))` | The BPM definition itself |
| 4 | `bpm_confidence ∈ [0, 1]` | The bound TypeScript relies on |
| 5 | `downbeat_offset` == first downbeat, 0.0 when empty | Downbeat selection |
| 6 | Energy profile non-empty, non-negative, length ≈ `ceil(n/hop) ± 2` | DSP correctness |
| 7 | Output has exactly the six contract keys | Contract stability |
| 8 | ≥85% of IBIs within 15% of `60/bpm` | Bachata robustness (req 10.2) |

**The model is mocked in property tests** — a deliberate and correct choice recorded in the design doc: *"we test our logic, not the neural network."* Tests stay fast, deterministic, offline, and do not need the 78 MB checkpoint. Preserve this.

If you add the `meta` block from §5, property 7 needs relaxing from "exactly six keys" to "contains at least the six contract keys."

### Fixtures worth extending

```python
# SOURCE (verbatim) — tests/conftest.py
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
        wf.writeframes(struct.pack(f"<{num_samples}h", *([0] * num_samples)))

    return str(wav_path)
```

```python
# ADAPTED for BachataCut — add a synthetic click track for end-to-end assertions
import numpy as np
import pytest
import wave
import struct


@pytest.fixture
def click_track_wav(tmp_path):
    """A 130 BPM click track with a louder accent every 8th beat.

    Ground truth is known exactly, so integration tests can assert that detected
    BPM ≈ 130 and that downbeats land on the accented clicks. This is the fixture
    that would have caught the count-5 downbeat bug described in §2.2.
    """
    def _make(bpm: float = 130.0, seconds: float = 30.0, sr: int = 22050) -> str:
        path = tmp_path / f"click_{int(bpm)}.wav"
        n = int(sr * seconds)
        audio = np.zeros(n, dtype=np.float32)

        beat_interval = 60.0 / bpm
        click_len = int(0.01 * sr)
        t = np.arange(click_len) / sr
        base = np.sin(2 * np.pi * 1000 * t) * np.exp(-t * 200)

        beat = 0
        pos = 0.0
        while pos < seconds:
            start = int(pos * sr)
            end = min(start + click_len, n)
            amp = 1.0 if beat % 8 == 0 else 0.5      # accent count 1
            audio[start:end] += base[: end - start] * amp
            beat += 1
            pos += beat_interval

        pcm = np.clip(audio, -1.0, 1.0)
        pcm = (pcm * 32767).astype(np.int16)
        with wave.open(str(path), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(struct.pack(f"<{len(pcm)}h", *pcm))
        return str(path)

    return _make
```

### New properties worth adding

```python
# NEW — the invariants that matter for BachataCut specifically
#
# 9.  Energy index round-trip: for any t in [0, duration],
#     energy_index_for_time(t) is a valid index into energy_profile.
#     Directly guards the §5 DSP coupling.
#
# 10. Contract version presence: `meta.energy_hop_seconds` always equals
#     ANALYZER_HOP_LENGTH / ANALYZER_SAMPLE_RATE. Fails loudly on drift.
#
# 11. dtype invariance: int16, int32, uint8 and float32 WAVs containing the same
#     logical signal produce energy profiles equal within tolerance.
#     Guards the normalisation branches, including the uint8 case (§6.1).
#
# 12. Resample invariance: the same signal written at 22050 Hz and 44100 Hz
#     yields energy profiles of the same length within ±2 frames.
#
# 13. Vectorisation equivalence: the vectorised RMS from §6.1 matches the
#     original loop within 1e-6 for arbitrary input. Run this once during the
#     port, then keep it as a regression test.
```

Property 13 is the safety net for the §6.2 optimisation — it lets you make the change with confidence rather than hope.

---

## 10. Deployment and operational notes

### 10.1 Bake the checkpoint into the image

The `final0` checkpoint (~78 MB) downloads on first use. In a container that means the first job after every deploy pays the download, and an outbound network failure breaks analysis entirely.

```dockerfile
# ADAPTED for BachataCut — pre-warm the model at build time
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY analyzer/ ./analyzer/

# Download and cache the checkpoint during BUILD, not at runtime.
RUN uv run python -c "from analyzer.analyze import _get_file2beats; _get_file2beats()"

CMD ["uv", "run", "python", "-m", "analyzer.worker"]
```

Verify where `beat_this` caches (typically under `~/.cache`) and make sure that path is inside the image layer rather than a volume that gets discarded.

### 10.2 CPU vs GPU

`device = "cuda" if torch.cuda.is_available() else "cpu"` needs no change. Practical guidance:

- **CPU** is adequate. A 3-minute recording analyses in seconds once the model is warm; the checkpoint load dominates, which is exactly why the warm worker matters.
- **GPU** helps only under sustained throughput. Given the model is loaded once per worker, CPU replicas are usually the better cost trade for launch.
- Install CPU-only torch wheels unless you specifically need CUDA — it is a large size saving.

### 10.3 Timeouts

The annotator uses 60 seconds, which is too tight when a cold process must load the checkpoint first. With a warm worker, analysis itself is fast. Recommended: **generous job-level timeout (5–10 minutes)**, and warm the model at boot so no individual job absorbs the load cost.

### 10.4 Never write to stdout

The subprocess contract is that stdout contains *only* JSON. Any stray `print()` breaks the Node-side parse. Route all logging to stderr:

```python
logging.basicConfig(level=logging.INFO, stream=sys.stderr)
```

The current code is correct on this point — `json.dump(result, sys.stdout)` for the payload, `print(..., file=sys.stderr)` for errors. Keep that discipline, and note the TypeScript side already validates the parsed shape (companion doc §6.4, `isPythonAnalyzerOutput`).

### 10.5 uv, not pip

Per the repository's `AGENTS.md`, Python is managed exclusively through `uv` with dependencies declared in `pyproject.toml` and locked in `uv.lock`. Carry that convention forward:

```bash
uv sync                 # install from the lockfile
uv run pytest           # run tests
uv run python -m analyzer.analyze audio.wav --fps 29.97
uv lock                 # refresh after editing pyproject.toml
```

Do not use bare `pip install`, and do not install into a global environment.

---

## 11. Migration checklist

### Phase 1 — lift it (half a day)

- [ ] Copy `analyzer/` wholesale: `analyze.py`, `__init__.py`, `__main__.py`, `tests/`
- [ ] Copy `pyproject.toml`; drop `soundfile` and `yt-dlp` (§7.4)
- [ ] **Pin `beat-this` to a commit SHA** for reproducible builds
- [ ] Run `uv sync && uv run pytest` — the whole suite should pass unchanged
- [ ] Confirm the CLI works: `uv run python -m analyzer.analyze <wav> --fps 29.97`

### Phase 2 — make the coupling explicit (half a day)

- [ ] Add `analyzer/constants.py` with the DSP constants and `ANALYZER_CONTRACT_VERSION` (§5)
- [ ] Emit the `meta` block from `_format_output`
- [ ] Mirror the constants in `packages/dance-core/analyzer-contract.ts`
- [ ] Add `assertAnalyzerContract` on the TypeScript side
- [ ] Relax property 7 to "contains at least the six keys"

### Phase 3 — fix the known issues (one day)

- [ ] Load the WAV once via `_load_mono_float32`; stop reading it three times (§6.1)
- [ ] Add the `uint8` dtype branch
- [ ] Vectorise the RMS loop; add property 13 to prove equivalence (§6.2)
- [ ] Add properties 9–12 (§9)
- [ ] Add the `click_track_wav` fixture with known ground truth

### Phase 4 — service-ify (two to three days)

- [ ] Build `analyzer/worker.py` (Option A) or `analyzer/service.py` (Option B) (§7.1)
- [ ] Warm the model at boot, before accepting work
- [ ] Keep the CLI for debugging and CI
- [ ] Raise the job timeout to 5–10 minutes
- [ ] Route all logging to stderr
- [ ] Bake the checkpoint into the container image (§10.1)
- [ ] Add a `/healthz` that reports model-loaded state
- [ ] Restrict which paths the service will read

### Phase 5 — extend for musicality (optional, high value)

- [ ] Emit the full `downbeat_timestamps` array (§8.3) — cheapest accuracy win
- [ ] Add `analyzer/musicality.py`: `energy_at_beats`, `accent_pattern`, `tempo_stability` (§8.2)
- [ ] Add `assess_musicality` as the honesty gate, including the BPM plausibility range (§8.4)
- [ ] Feed these into the TypeScript candidate scorer (companion doc §10)

### Do-not-do list

- [ ] Do **not** revert to librosa or any onset-envelope tracker — that reintroduces the count-5 downbeat failure (§2.2)
- [ ] Do **not** reinstate an RMS-based downbeat heuristic. `accent_pattern` (§8.2) is a *style signal*, never a downbeat detector
- [ ] Do **not** change `sr` / `hop_length` / `frame_length` without updating the TypeScript mirror in the same commit (§5)
- [ ] Do **not** spawn a process per analysis (§7.1)
- [ ] Do **not** print anything to stdout except the JSON payload (§10.4)
- [ ] Do **not** eagerly load the model at import — it would slow the test suite and force network access in CI
- [ ] Do **not** accept arbitrary filesystem paths from untrusted callers (§7.1)

---

## Appendix A — Reuse summary

| Artifact | Lines | Verdict |
|---|---:|---|
| `analyze.py` | 267 | **Keep ~95%.** Fix triple-read, vectorise RMS, add constants |
| `__main__.py`, `__init__.py` | 5 | Keep verbatim |
| `tests/test_properties.py` | 440 | Keep all 8 properties; relax #7 if adding `meta` |
| `tests/test_analyze.py` | 207 | Keep edge cases, contract, CLI tests |
| `tests/conftest.py` | 25 | Keep; add `click_track_wav` |
| `pyproject.toml` | 33 | Keep; drop `soundfile` + `yt-dlp`, pin `beat-this` |
| **Total** | **977** | **~95% reusable** |

**Compared with the TypeScript layer (11–14% reusable), the Python analyzer is the standout.** It is a pure function of an audio file, so none of the annotator's architectural problems — the global singleton, whole-file JSON persistence, single-tenancy, inline long-running work — touch it.

**The one architectural change required:** stop invoking it as a subprocess per request; run it as a warm worker holding the model in memory.

**The historical lesson worth carrying forward.** The first implementation tried to infer downbeats from a musical assumption — *count 1 is louder than count 5* — encoded as an RMS heuristic. It failed because bachata sub-styles violate that assumption, and sensual bachata in particular accents count 5, producing a beat grid shifted by half a cycle. Replacing the heuristic with a model trained on annotated downbeats deleted ~55 lines and removed a whole class of style-dependent error. When BachataCut is tempted to hand-roll a musical rule, that is the precedent to remember: prefer learned structure over an assumed accent pattern, and reserve hand-rolled features for *describing* music rather than *segmenting* it.

---

*Recovered from git history at `annotator_bachata`: 14 commits, of which 4 touched `analyzer/analyze.py`. The librosa implementation is quoted from `4427ad7~1` (226 lines); the current implementation from `HEAD` (267 lines). Migration rationale corroborated by `.kiro/specs/beat-this-integration/{requirements,design}.md` (575 lines). All `SOURCE (verbatim)` and `HISTORICAL` blocks are exact copies from the repository; `ADAPTED` and `NEW` blocks are proposals that have not been executed against a BachataCut codebase.*
