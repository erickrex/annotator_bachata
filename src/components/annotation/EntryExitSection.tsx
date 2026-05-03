import type { DancerState, EnumDefinitions, ValidationError } from '../../types/index.js';
import { FieldWrapper, inputStyle, selectStyle, sectionStyle, sectionTitleStyle } from './FieldWrapper.js';

interface EntryExitSectionProps {
  entryState: DancerState | undefined;
  exitState: DancerState | undefined;
  enumDefinitions: EnumDefinitions;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
}

const EMPTY_DANCER_STATE: DancerState = {
  hold: '' as any,
  leader_weight_foot: '' as any,
  follower_weight_foot: '' as any,
};

interface DancerStateFormProps {
  prefix: string;
  title: string;
  state: DancerState;
  enumDefinitions: EnumDefinitions;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
}

function DancerStateForm({ prefix, title, state, enumDefinitions, onFieldChange, validationErrors }: DancerStateFormProps) {
  const fp = (field: string) => `${prefix}.${field}`;

  const handleMultiSelect = (field: string, value: string) => {
    const current = (state.hand_connections ?? []) as string[];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFieldChange(fp(field), updated);
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#bbb', marginBottom: '6px' }}>{title}</div>

      <FieldWrapper label="Hold" fieldPath={fp('hold')} validationErrors={validationErrors}>
        <select style={selectStyle} value={state.hold} onChange={(e) => onFieldChange(fp('hold'), e.target.value)}>
          <option value="">-- select --</option>
          {enumDefinitions.hold.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Leader Weight Foot" fieldPath={fp('leader_weight_foot')} validationErrors={validationErrors}>
        <select style={selectStyle} value={state.leader_weight_foot} onChange={(e) => onFieldChange(fp('leader_weight_foot'), e.target.value)}>
          <option value="">-- select --</option>
          {enumDefinitions.weight_foot.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Follower Weight Foot" fieldPath={fp('follower_weight_foot')} validationErrors={validationErrors}>
        <select style={selectStyle} value={state.follower_weight_foot} onChange={(e) => onFieldChange(fp('follower_weight_foot'), e.target.value)}>
          <option value="">-- select --</option>
          {enumDefinitions.weight_foot.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Leader Facing" fieldPath={fp('leader_facing')} validationErrors={validationErrors} optional>
        <select style={selectStyle} value={state.leader_facing ?? ''} onChange={(e) => onFieldChange(fp('leader_facing'), e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.facing.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Follower Facing" fieldPath={fp('follower_facing')} validationErrors={validationErrors} optional>
        <select style={selectStyle} value={state.follower_facing ?? ''} onChange={(e) => onFieldChange(fp('follower_facing'), e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.facing.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Body Orientation (degrees, 0–360)" fieldPath={fp('body_orientation_degrees')} validationErrors={validationErrors} optional>
        <input
          type="number"
          style={inputStyle}
          min={0}
          max={360}
          value={state.body_orientation_degrees ?? ''}
          onChange={(e) => onFieldChange(fp('body_orientation_degrees'), e.target.value === '' ? undefined : parseFloat(e.target.value))}
        />
      </FieldWrapper>

      <FieldWrapper label="Relative Position" fieldPath={fp('relative_position')} validationErrors={validationErrors} optional>
        <select style={selectStyle} value={state.relative_position ?? ''} onChange={(e) => onFieldChange(fp('relative_position'), e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.relative_position.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Travel Direction" fieldPath={fp('travel_direction')} validationErrors={validationErrors} optional>
        <select style={selectStyle} value={state.travel_direction ?? ''} onChange={(e) => onFieldChange(fp('travel_direction'), e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.travel_direction.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Rotation Direction" fieldPath={fp('rotation_direction')} validationErrors={validationErrors} optional>
        <select style={selectStyle} value={state.rotation_direction ?? ''} onChange={(e) => onFieldChange(fp('rotation_direction'), e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.rotation_direction.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Rotation Degrees (≥0)" fieldPath={fp('rotation_degrees')} validationErrors={validationErrors} optional>
        <input
          type="number"
          style={inputStyle}
          min={0}
          value={state.rotation_degrees ?? ''}
          onChange={(e) => onFieldChange(fp('rotation_degrees'), e.target.value === '' ? undefined : parseFloat(e.target.value))}
        />
      </FieldWrapper>

      <FieldWrapper label="Distance Profile" fieldPath={fp('distance_profile')} validationErrors={validationErrors} optional>
        <select style={selectStyle} value={state.distance_profile ?? ''} onChange={(e) => onFieldChange(fp('distance_profile'), e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.distance_profile.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Frame Tension" fieldPath={fp('frame_tension')} validationErrors={validationErrors} optional>
        <select style={selectStyle} value={state.frame_tension ?? ''} onChange={(e) => onFieldChange(fp('frame_tension'), e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.frame_tension.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Hand Connections" fieldPath={fp('hand_connections')} validationErrors={validationErrors} optional>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {enumDefinitions.hand_connections.map((v) => (
            <label key={v} style={{ fontSize: '0.8rem', color: '#ccc', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={(state.hand_connections ?? []).includes(v as any)}
                onChange={() => handleMultiSelect('hand_connections', v)}
              />
              {v}
            </label>
          ))}
        </div>
      </FieldWrapper>
    </div>
  );
}

export function EntryExitSection({ entryState, exitState, enumDefinitions, onFieldChange, validationErrors }: EntryExitSectionProps) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Entry &amp; Exit State</div>
      <DancerStateForm
        prefix="entry_state"
        title="Entry State"
        state={entryState ?? EMPTY_DANCER_STATE}
        enumDefinitions={enumDefinitions}
        onFieldChange={onFieldChange}
        validationErrors={validationErrors}
      />
      <DancerStateForm
        prefix="exit_state"
        title="Exit State"
        state={exitState ?? EMPTY_DANCER_STATE}
        enumDefinitions={enumDefinitions}
        onFieldChange={onFieldChange}
        validationErrors={validationErrors}
      />
    </div>
  );
}
