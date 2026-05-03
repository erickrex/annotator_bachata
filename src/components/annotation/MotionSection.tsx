import type { ClipAnnotation, EnumDefinitions, ValidationError } from '../../types/index.js';
import { FieldWrapper, inputStyle, selectStyle, sectionStyle, sectionTitleStyle } from './FieldWrapper.js';

interface MotionSectionProps {
  annotation: ClipAnnotation;
  enumDefinitions: EnumDefinitions;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
}

export function MotionSection({ annotation, enumDefinitions, onFieldChange, validationErrors }: MotionSectionProps) {
  const motion = annotation.motion_profile ?? {};

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Motion Profile</div>

      <FieldWrapper label="Travel Amount" fieldPath="motion_profile.travel_amount" validationErrors={validationErrors} optional>
        <select style={selectStyle} value={motion.travel_amount ?? ''} onChange={(e) => onFieldChange('motion_profile.travel_amount', e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.travel_amount.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Footwork Complexity" fieldPath="motion_profile.footwork_complexity" validationErrors={validationErrors} optional>
        <select style={selectStyle} value={motion.footwork_complexity ?? ''} onChange={(e) => onFieldChange('motion_profile.footwork_complexity', e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.footwork_complexity.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Upper Body Isolation" fieldPath="motion_profile.upper_body_isolation" validationErrors={validationErrors} optional>
        <select style={selectStyle} value={motion.upper_body_isolation ?? ''} onChange={(e) => onFieldChange('motion_profile.upper_body_isolation', e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.upper_body_isolation.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Spin Count (≥0)" fieldPath="motion_profile.spin_count" validationErrors={validationErrors} optional>
        <input
          type="number"
          style={inputStyle}
          min={0}
          step={1}
          value={motion.spin_count ?? ''}
          onChange={(e) => onFieldChange('motion_profile.spin_count', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
        />
      </FieldWrapper>

      <FieldWrapper label="Dip" fieldPath="motion_profile.dip" validationErrors={validationErrors} optional>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#ccc', cursor: 'pointer' }}>
          <input type="checkbox" checked={motion.dip ?? false} onChange={(e) => onFieldChange('motion_profile.dip', e.target.checked)} />
          Dip
        </label>
      </FieldWrapper>

      <FieldWrapper label="Headroll" fieldPath="motion_profile.headroll" validationErrors={validationErrors} optional>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#ccc', cursor: 'pointer' }}>
          <input type="checkbox" checked={motion.headroll ?? false} onChange={(e) => onFieldChange('motion_profile.headroll', e.target.checked)} />
          Headroll
        </label>
      </FieldWrapper>

      <FieldWrapper label="Bodywave" fieldPath="motion_profile.bodywave" validationErrors={validationErrors} optional>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#ccc', cursor: 'pointer' }}>
          <input type="checkbox" checked={motion.bodywave ?? false} onChange={(e) => onFieldChange('motion_profile.bodywave', e.target.checked)} />
          Bodywave
        </label>
      </FieldWrapper>

      <FieldWrapper label="Leader Dominant Motion" fieldPath="motion_profile.leader_dominant_motion" validationErrors={validationErrors} optional>
        <select style={selectStyle} value={motion.leader_dominant_motion ?? ''} onChange={(e) => onFieldChange('motion_profile.leader_dominant_motion', e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.dominant_motion.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Follower Dominant Motion" fieldPath="motion_profile.follower_dominant_motion" validationErrors={validationErrors} optional>
        <select style={selectStyle} value={motion.follower_dominant_motion ?? ''} onChange={(e) => onFieldChange('motion_profile.follower_dominant_motion', e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.dominant_motion.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>
    </div>
  );
}
