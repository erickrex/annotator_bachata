import type { ClipAnnotation, EnumDefinitions, ValidationError } from '../../types/index.js';
import { FieldWrapper, inputStyle, selectStyle, sectionStyle, sectionTitleStyle } from './FieldWrapper.js';

interface PhrasingSectionProps {
  annotation: ClipAnnotation;
  enumDefinitions: EnumDefinitions;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
}

export function PhrasingSection({ annotation, enumDefinitions, onFieldChange, validationErrors }: PhrasingSectionProps) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Musical Phrasing</div>

      <FieldWrapper label="Estimated Tempo (BPM)" fieldPath="estimated_tempo_bpm" validationErrors={validationErrors}>
        <input
          type="number"
          style={inputStyle}
          value={annotation.estimated_tempo_bpm}
          onChange={(e) => onFieldChange('estimated_tempo_bpm', parseFloat(e.target.value) || 0)}
        />
      </FieldWrapper>

      <FieldWrapper label="Duration (seconds)" fieldPath="duration_seconds" validationErrors={validationErrors}>
        <input
          type="number"
          style={{ ...inputStyle, opacity: 0.7 }}
          value={annotation.duration_seconds}
          readOnly
        />
      </FieldWrapper>

      <FieldWrapper label="Beats Total" fieldPath="beats_total" validationErrors={validationErrors}>
        <input
          type="number"
          style={{ ...inputStyle, opacity: 0.7 }}
          value={annotation.beats_total}
          readOnly
        />
      </FieldWrapper>

      <FieldWrapper label="Bars Total" fieldPath="bars_total" validationErrors={validationErrors}>
        <input
          type="number"
          style={{ ...inputStyle, opacity: 0.7 }}
          value={annotation.bars_total}
          readOnly
        />
      </FieldWrapper>

      <FieldWrapper label="Phrase Resolution" fieldPath="phrase_resolution" validationErrors={validationErrors}>
        <select
          style={selectStyle}
          value={annotation.phrase_resolution}
          onChange={(e) => onFieldChange('phrase_resolution', e.target.value)}
        >
          <option value="">-- select --</option>
          {enumDefinitions.phrase_resolution.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </FieldWrapper>
    </div>
  );
}
