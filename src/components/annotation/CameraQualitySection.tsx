import type { ClipAnnotation, EnumDefinitions, ValidationError } from '../../types/index.js';
import { FieldWrapper, selectStyle, sectionStyle, sectionTitleStyle } from './FieldWrapper.js';

interface CameraQualitySectionProps {
  annotation: ClipAnnotation;
  enumDefinitions: EnumDefinitions;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
}

function FloatSlider({
  label,
  fieldPath,
  value,
  onFieldChange,
  validationErrors,
}: {
  label: string;
  fieldPath: string;
  value: number | undefined;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
}) {
  const current = value ?? 0;
  return (
    <FieldWrapper label={`${label} (${current.toFixed(2)})`} fieldPath={fieldPath} validationErrors={validationErrors} optional>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        style={{ width: '100%' }}
        value={current}
        onChange={(e) => onFieldChange(fieldPath, parseFloat(e.target.value))}
      />
    </FieldWrapper>
  );
}

export function CameraQualitySection({ annotation, enumDefinitions, onFieldChange, validationErrors }: CameraQualitySectionProps) {
  const cam = annotation.camera_profile ?? {};
  const qual = annotation.quality_profile ?? {};

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Camera &amp; Quality</div>

      <FieldWrapper label="Camera Angle" fieldPath="camera_profile.camera_angle" validationErrors={validationErrors} optional>
        <select style={selectStyle} value={cam.camera_angle ?? ''} onChange={(e) => onFieldChange('camera_profile.camera_angle', e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.camera_angle.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Framing" fieldPath="camera_profile.framing" validationErrors={validationErrors} optional>
        <select style={selectStyle} value={cam.framing ?? ''} onChange={(e) => onFieldChange('camera_profile.framing', e.target.value || undefined)}>
          <option value="">-- select --</option>
          {enumDefinitions.framing.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FieldWrapper>

      <div style={{ paddingLeft: '8px', borderLeft: '2px solid #444', marginTop: '8px', marginBottom: '12px' }}>
        <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '6px', fontWeight: 600 }}>Camera Profile Scores</div>
        <FloatSlider label="Visibility Score" fieldPath="camera_profile.visibility_score" value={cam.visibility_score} onFieldChange={onFieldChange} validationErrors={validationErrors} />
        <FloatSlider label="Occlusion Score" fieldPath="camera_profile.occlusion_score" value={cam.occlusion_score} onFieldChange={onFieldChange} validationErrors={validationErrors} />
      </div>

      <div style={{ paddingLeft: '8px', borderLeft: '2px solid #444' }}>
        <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '6px', fontWeight: 600 }}>Quality Profile Scores</div>
        <FloatSlider label="Visibility Score" fieldPath="quality_profile.visibility_score" value={qual.visibility_score} onFieldChange={onFieldChange} validationErrors={validationErrors} />
        <FloatSlider label="Boundary Cleanliness" fieldPath="quality_profile.boundary_cleanliness" value={qual.boundary_cleanliness} onFieldChange={onFieldChange} validationErrors={validationErrors} />
        <FloatSlider label="Teaching Clarity" fieldPath="quality_profile.teaching_clarity" value={qual.teaching_clarity} onFieldChange={onFieldChange} validationErrors={validationErrors} />
        <FloatSlider label="Stitchability" fieldPath="quality_profile.stitchability" value={qual.stitchability} onFieldChange={onFieldChange} validationErrors={validationErrors} />
      </div>
    </div>
  );
}
