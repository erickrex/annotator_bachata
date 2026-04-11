// Controlled vocabulary constants and string literal union types
// for the Bachata Clip Slicer & Annotator annotation schema.

export const HOLD_VALUES = [
  'open',
  'closed',
  'shadow',
  'hammerlock',
  'cross_hand',
  'side_by_side',
  'single_hand',
  'transitioning',
] as const;
export type Hold = (typeof HOLD_VALUES)[number];

export const WEIGHT_FOOT_VALUES = ['left', 'right', 'split', 'unknown'] as const;
export type WeightFoot = (typeof WEIGHT_FOOT_VALUES)[number];

export const FACING_VALUES = ['up_slot', 'down_slot', 'left', 'right', 'diagonal'] as const;
export type Facing = (typeof FACING_VALUES)[number];

export const RELATIVE_POSITION_VALUES = [
  'facing_each_other',
  'side_by_side',
  'offset_same_direction',
  'back_to_back',
] as const;
export type RelativePosition = (typeof RELATIVE_POSITION_VALUES)[number];

export const TRAVEL_DIRECTION_VALUES = [
  'stationary',
  'forward',
  'backward',
  'left',
  'right',
  'diagonal_left',
  'diagonal_right',
] as const;
export type TravelDirection = (typeof TRAVEL_DIRECTION_VALUES)[number];

export const ROTATION_DIRECTION_VALUES = ['none', 'clockwise', 'counterclockwise'] as const;
export type RotationDirection = (typeof ROTATION_DIRECTION_VALUES)[number];

export const DISTANCE_PROFILE_VALUES = ['close', 'medium', 'far'] as const;
export type DistanceProfile = (typeof DISTANCE_PROFILE_VALUES)[number];

export const FRAME_TENSION_VALUES = ['low', 'medium', 'high'] as const;
export type FrameTension = (typeof FRAME_TENSION_VALUES)[number];

export const TEMPO_FEEL_VALUES = [
  'slow_finish',
  'even_finish',
  'fast_finish',
  'syncopated_finish',
] as const;
export type TempoFeel = (typeof TEMPO_FEEL_VALUES)[number];

export const PHRASE_RESOLUTION_VALUES = ['4_count', '8_count', '16_count', 'irregular'] as const;
export type PhraseResolution = (typeof PHRASE_RESOLUTION_VALUES)[number];

export const ACCENT_PATTERN_VALUES = ['even', 'front_loaded', 'back_loaded'] as const;
export type AccentPattern = (typeof ACCENT_PATTERN_VALUES)[number];

export const DIFFICULTY_VALUES = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = (typeof DIFFICULTY_VALUES)[number];

export const ENERGY_LEVEL_VALUES = ['low', 'medium', 'high'] as const;
export type EnergyLevel = (typeof ENERGY_LEVEL_VALUES)[number];

export const STYLE_VALUES = ['traditional', 'sensual', 'moderna', 'fusion'] as const;
export type Style = (typeof STYLE_VALUES)[number];

export const MOVE_LABEL_VALUES = [
  'arm_styling',
  'basic',
  'bodywaves',
  'bolero',
  'cross_body_lead',
  'footwork',
  'golpes',
  'hammerlock',
  'headrolls',
  'hiprolls',
  'intros',
  'ladyturn',
  'outro',
  'shadow',
  'spin',
  'style',
] as const;
export type MoveLabel = (typeof MOVE_LABEL_VALUES)[number];

export const TRAVEL_AMOUNT_VALUES = ['none', 'low', 'medium', 'high'] as const;
export type TravelAmount = (typeof TRAVEL_AMOUNT_VALUES)[number];

export const FOOTWORK_COMPLEXITY_VALUES = ['low', 'medium', 'high'] as const;
export type FootworkComplexity = (typeof FOOTWORK_COMPLEXITY_VALUES)[number];

export const UPPER_BODY_ISOLATION_VALUES = ['none', 'low', 'medium', 'high'] as const;
export type UpperBodyIsolation = (typeof UPPER_BODY_ISOLATION_VALUES)[number];

export const DOMINANT_MOTION_VALUES = [
  'lower_body',
  'upper_body',
  'torso',
  'full_body',
  'stationary',
] as const;
export type DominantMotion = (typeof DOMINANT_MOTION_VALUES)[number];

export const CAMERA_ANGLE_VALUES = ['front', 'side', 'back', 'overhead', 'mixed'] as const;
export type CameraAngle = (typeof CAMERA_ANGLE_VALUES)[number];

export const FRAMING_VALUES = [
  'full_body',
  'upper_body',
  'lower_body',
  'close_up',
  'wide',
] as const;
export type Framing = (typeof FRAMING_VALUES)[number];

export const HAND_CONNECTION_VALUES = [
  'leader_left_to_follower_left',
  'leader_left_to_follower_right',
  'leader_right_to_follower_left',
  'leader_right_to_follower_right',
  'no_hand_connection',
] as const;
export type HandConnection = (typeof HAND_CONNECTION_VALUES)[number];

export const CLIP_STATUS_VALUES = [
  'pending',
  'discarded',
  'reviewed',
  'in_progress',
  'annotated',
] as const;
export type ClipStatus = (typeof CLIP_STATUS_VALUES)[number];

/** All controlled vocabulary arrays keyed by field name. */
export type EnumDefinitions = {
  hold: string[];
  weight_foot: string[];
  facing: string[];
  relative_position: string[];
  travel_direction: string[];
  rotation_direction: string[];
  distance_profile: string[];
  frame_tension: string[];
  tempo_feel: string[];
  phrase_resolution: string[];
  accent_pattern: string[];
  difficulty: string[];
  energy_level: string[];
  style: string[];
  move_label: string[];
  travel_amount: string[];
  footwork_complexity: string[];
  upper_body_isolation: string[];
  dominant_motion: string[];
  camera_angle: string[];
  framing: string[];
  hand_connections: string[];
};

/** Default enum definitions object included in every project JSON export. */
export const DEFAULT_ENUM_DEFINITIONS: EnumDefinitions = {
  hold: [...HOLD_VALUES],
  weight_foot: [...WEIGHT_FOOT_VALUES],
  facing: [...FACING_VALUES],
  relative_position: [...RELATIVE_POSITION_VALUES],
  travel_direction: [...TRAVEL_DIRECTION_VALUES],
  rotation_direction: [...ROTATION_DIRECTION_VALUES],
  distance_profile: [...DISTANCE_PROFILE_VALUES],
  frame_tension: [...FRAME_TENSION_VALUES],
  tempo_feel: [...TEMPO_FEEL_VALUES],
  phrase_resolution: [...PHRASE_RESOLUTION_VALUES],
  accent_pattern: [...ACCENT_PATTERN_VALUES],
  difficulty: [...DIFFICULTY_VALUES],
  energy_level: [...ENERGY_LEVEL_VALUES],
  style: [...STYLE_VALUES],
  move_label: [...MOVE_LABEL_VALUES],
  travel_amount: [...TRAVEL_AMOUNT_VALUES],
  footwork_complexity: [...FOOTWORK_COMPLEXITY_VALUES],
  upper_body_isolation: [...UPPER_BODY_ISOLATION_VALUES],
  dominant_motion: [...DOMINANT_MOTION_VALUES],
  camera_angle: [...CAMERA_ANGLE_VALUES],
  framing: [...FRAMING_VALUES],
  hand_connections: [...HAND_CONNECTION_VALUES],
};
