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

      <div style={{ paddingLeft: '8px', borderLeft: '2px solid #444', marginTop: '8px' }}>
        <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '6px', fontWeight: 600 }}>Completion Profile</div>

        <FieldWrapper label="Basico Completion Counts" fieldPath="completion_profile.basico_completion_counts" validationErrors={validationErrors}>
          <input
            type="number"
            style={inputStyle}
            value={annotation.completion_profile.basico_completion_counts}
            onChange={(e) => onFieldChange('completion_profile.basico_completion_counts', parseInt(e.target.value, 10) || 0)}
            step={1}
            min={0}
          />
        </FieldWrapper>

        <FieldWrapper label="Tempo Feel" fieldPath="completion_profile.tempo_feel" validationErrors={validationErrors}>
          <select
            style={selectStyle}
            value={annotation.completion_profile.tempo_feel}
            onChange={(e) => onFieldChange('completion_profile.tempo_feel', e.target.value)}
          >
            <option value="">-- select --</option>
            {enumDefinitions.tempo_feel.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </FieldWrapper>

        <FieldWrapper label="Accent Pattern" fieldPath="completion_profile.accent_pattern" validationErrors={validationErrors}>
          <select
            style={selectStyle}
            value={annotation.completion_profile.accent_pattern}
            onChange={(e) => onFieldChange('completion_profile.accent_pattern', e.target.value)}
          >
            <option value="">-- select --</option>
            {enumDefinitions.accent_pattern.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </FieldWrapper>

        <FieldWrapper label={`Syncopation Level (${annotation.completion_profile.syncopation_level.toFixed(2)})`} fieldPath="completion_profile.syncopation_level" validationErrors={validationErrors}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            style={{ width: '100%' }}
            value={annotation.completion_profile.syncopation_level}
            onChange={(e) => onFieldChange('completion_profile.syncopation_level', parseFloat(e.target.value))}
          />
        </FieldWrapper>
      </div>
    </div>
  );
}
