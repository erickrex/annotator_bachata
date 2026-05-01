// Data model interfaces for the Bachata Clip Slicer & Annotator.
// Matches Annotation Schema v2.0.

import type {
  AccentPattern,
  CameraAngle,
  ClipStatus,
  Difficulty,
  DistanceProfile,
  DominantMotion,
  EnergyLevel,
  EnumDefinitions,
  Facing,
  FootworkComplexity,
  Framing,
  FrameTension,
  HandConnection,
  Hold,
  MoveLabel,
  PhraseResolution,
  RelativePosition,
  RotationDirection,
  Style,
  TempoFeel,
  TravelAmount,
  TravelDirection,
  UpperBodyIsolation,
  WeightFoot,
} from './enums.js';

// Re-export all enum types and constants for convenience
export type {
  AccentPattern,
  CameraAngle,
  ClipStatus,
  Difficulty,
  DistanceProfile,
  DominantMotion,
  EnergyLevel,
  EnumDefinitions,
  Facing,
  FootworkComplexity,
  Framing,
  FrameTension,
  HandConnection,
  Hold,
  MoveLabel,
  PhraseResolution,
  RelativePosition,
  RotationDirection,
  Style,
  TempoFeel,
  TravelAmount,
  TravelDirection,
  UpperBodyIsolation,
  WeightFoot,
} from './enums.js';

// ---------------------------------------------------------------------------
// Project File (project.json) — Schema v2.0
// ---------------------------------------------------------------------------

export interface AnnotationProjectFile {
  schema_version: '2.0';
  project: {
    name: string;
    created_at: string; // ISO 8601
    updated_at: string; // ISO 8601
  };
  sources: SourceRecord[];
  enum_definitions: EnumDefinitions;
  clips: ClipAnnotation[];
}

// ---------------------------------------------------------------------------
// Source Record
// ---------------------------------------------------------------------------

export interface SourceRecord {
  source_id: string;
  youtube_url: string;
  title: string;
  channel: string;
  upload_date: string;
  duration_seconds: number;
  fps: number;
  width: number;
  height: number;
  total_frames: number;
  video_file: string; // relative path to MP4
  audio_file: string; // relative path to WAV
  detected_bpm: number;
  bpm_confidence: number;
  downbeat_offset_seconds: number;
  beat_grid: number[]; // timestamps in seconds
  beat_grid_frames: number[]; // frame numbers
  energy_profile: number[]; // RMS values
  downloaded_at: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Clip Annotation (Full Record)
// ---------------------------------------------------------------------------

export interface ClipAnnotation {
  clip_id: string;
  source_id: string;
  status: ClipStatus;

  remotion: {
    from_frame: number;
    duration_in_frames: number;
    fps: number;
  };

  // Required for completeness
  move_name: string;
  difficulty: Difficulty;
  style: Style;
  tags: string[];

  // Optional metadata (does not affect completeness)
  move_label?: MoveLabel;
  move_family?: string;
  move_variant?: string;
  energy_level?: EnergyLevel;
  estimated_tempo_bpm?: number;
  duration_seconds?: number;
  beats_total?: number;
  bars_total?: number;
  phrase_resolution?: PhraseResolution;
  song_position?: {
    start_time_seconds: number;
    end_time_seconds: number;
    cycle_number: number;
    beat_start: number;
    beat_end: number;
  };
  entry_state?: DancerState;
  exit_state?: DancerState;
  trim_profile?: TrimProfile;
  motion_profile?: MotionProfile;
  camera_profile?: CameraProfile;
  quality_profile?: QualityProfile;
}

// ---------------------------------------------------------------------------
// Dancer State (Entry / Exit)
// ---------------------------------------------------------------------------

export interface DancerState {
  hold: Hold;
  leader_weight_foot: WeightFoot;
  follower_weight_foot: WeightFoot;
  leader_facing?: Facing;
  follower_facing?: Facing;
  body_orientation_degrees?: number; // 0–360
  relative_position?: RelativePosition;
  travel_direction?: TravelDirection;
  rotation_direction?: RotationDirection;
  rotation_degrees?: number; // non-negative
  distance_profile?: DistanceProfile;
  frame_tension?: FrameTension;
  hand_connections?: HandConnection[];
}

// ---------------------------------------------------------------------------
// Sub-Profiles
// ---------------------------------------------------------------------------

export interface TrimProfile {
  trim_safe_start_seconds: number;
  trim_safe_end_seconds: number;
  trim_safe_windows?: Array<{ start: number; end: number }>;
  loopable?: boolean;
  preferred_entry_beats?: number[];
  preferred_exit_beats?: number[];
}

export interface MotionProfile {
  travel_amount?: TravelAmount;
  footwork_complexity?: FootworkComplexity;
  upper_body_isolation?: UpperBodyIsolation;
  spin_count?: number;
  dip?: boolean;
  headroll?: boolean;
  bodywave?: boolean;
  leader_dominant_motion?: DominantMotion;
  follower_dominant_motion?: DominantMotion;
}

export interface CameraProfile {
  camera_angle?: CameraAngle;
  framing?: Framing;
  visibility_score?: number; // 0.0–1.0
  occlusion_score?: number; // 0.0–1.0
}

export interface QualityProfile {
  visibility_score?: number; // 0.0–1.0
  boundary_cleanliness?: number; // 0.0–1.0
  teaching_clarity?: number; // 0.0–1.0
  stitchability?: number; // 0.0–1.0
}

// ---------------------------------------------------------------------------
// Virtual Clip Definition
// ---------------------------------------------------------------------------

export interface VirtualClipDef {
  clipId: string;
  sourceId: string;
  status: ClipStatus;
  remotion: {
    fromFrame: number;
    durationInFrames: number;
    fps: number;
  };
  beatMarkerFrames: number[]; // beat frame numbers relative to clip
  cycleNumber: number;
  beatCount: number;
  /** Path to the extracted clip MP4 (relative to project root). Set after extraction. */
  extractedFile?: string;
  /** Seconds of extra footage before the logical clip start. */
  handleBefore?: number;
  /** Seconds of extra footage after the logical clip end. */
  handleAfter?: number;
  /** In-point offset in seconds from the start of the extracted file (default = handleBefore). */
  inPoint?: number;
  /** Out-point offset in seconds from the start of the extracted file. */
  outPoint?: number;
}

// ---------------------------------------------------------------------------
// Cycle Hierarchy
// ---------------------------------------------------------------------------

export interface CycleHierarchy {
  cycles8: Cycle[]; // 8-count basic cycles
  phrases16: Phrase[]; // 16-count musical phrases
  phrases32: Phrase[]; // 32-count extended phrases
}

export interface Cycle {
  cycleNumber: number;
  startBeatIndex: number;
  endBeatIndex: number;
  startFrame: number;
  endFrame: number;
  startTimestamp: number;
  endTimestamp: number;
}

export interface Phrase {
  phraseNumber: number;
  cycles: Cycle[];
  startFrame: number;
  endFrame: number;
}

// ---------------------------------------------------------------------------
// Project Manifest (manifest.json)
// ---------------------------------------------------------------------------

export interface ProjectManifest {
  project_name: string;
  created_at: string;
  updated_at: string;
  sources_count: number;
  clips_total: number;
  clips_by_status: Record<ClipStatus, number>;
  annotation_completeness: number; // 0.0–1.0
  sources: string[]; // source_id list
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ImportResult {
  success: boolean;
  missingFiles: string[];
  clipsLoaded: number;
}

// ---------------------------------------------------------------------------
// Ingestion & Analysis
// ---------------------------------------------------------------------------

export interface DownloadProgress {
  percent: number;
  speed: string;
  eta: string;
}

export interface SourceMetadata {
  sourceId: string;
  youtubeUrl: string;
  title: string;
  channel: string;
  uploadDate: string;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  videoFile: string; // relative path
  audioFile: string; // relative path
  downloadedAt: string; // ISO 8601
}

export interface AudioAnalysisResult {
  detectedBpm: number;
  bpmConfidence: number;
  downbeatOffsetSeconds: number;
  beatGrid: number[]; // timestamps in seconds
  beatGridFrames: number[]; // frame numbers
  energyProfile: number[]; // RMS values per segment
}
