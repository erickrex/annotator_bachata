import type { ClipAnnotation, ValidationError } from '../../types/index.js';
import { FieldWrapper, inputStyle, sectionStyle, sectionTitleStyle } from './FieldWrapper.js';
import { useState } from 'react';

interface TrimSectionProps {
  annotation: ClipAnnotation;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
}

export function TrimSection({ annotation, onFieldChange, validationErrors }: TrimSectionProps) {
  const trim = annotation.trim_profile ?? { trim_safe_start_seconds: 0, trim_safe_end_seconds: 0 };
  const [entryBeatInput, setEntryBeatInput] = useState('');
  const [exitBeatInput, setExitBeatInput] = useState('');

  const addWindow = () => {
    const windows = [...(trim.trim_safe_windows ?? []), { start: 0, end: annotation.duration_seconds }];
    onFieldChange('trim_profile.trim_safe_windows', windows);
  };

  const removeWindow = (index: number) => {
    const windows = (trim.trim_safe_windows ?? []).filter((_, i) => i !== index);
    onFieldChange('trim_profile.trim_safe_windows', windows);
  };

  const updateWindow = (index: number, field: 'start' | 'end', value: number) => {
    const windows = [...(trim.trim_safe_windows ?? [])];
    windows[index] = { ...windows[index], [field]: value };
    onFieldChange('trim_profile.trim_safe_windows', windows);
  };

  const addBeat = (type: 'preferred_entry_beats' | 'preferred_exit_beats', value: string, setter: (v: string) => void) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const current = trim[type] ?? [];
    onFieldChange(`trim_profile.${type}`, [...current, num]);
    setter('');
  };

  const removeBeat = (type: 'preferred_entry_beats' | 'preferred_exit_beats', index: number) => {
    const current = trim[type] ?? [];
    onFieldChange(`trim_profile.${type}`, current.filter((_, i) => i !== index));
  };

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Trim Profile</div>

      <FieldWrapper label="Trim Safe Start (seconds)" fieldPath="trim_profile.trim_safe_start_seconds" validationErrors={validationErrors}>
        <input
          type="number"
          style={inputStyle}
          min={0}
          step={0.01}
          value={trim.trim_safe_start_seconds}
          onChange={(e) => onFieldChange('trim_profile.trim_safe_start_seconds', parseFloat(e.target.value) || 0)}
        />
      </FieldWrapper>

      <FieldWrapper label="Trim Safe End (seconds)" fieldPath="trim_profile.trim_safe_end_seconds" validationErrors={validationErrors}>
        <input
          type="number"
          style={inputStyle}
          min={0}
          step={0.01}
          value={trim.trim_safe_end_seconds}
          onChange={(e) => onFieldChange('trim_profile.trim_safe_end_seconds', parseFloat(e.target.value) || 0)}
        />
      </FieldWrapper>

      <FieldWrapper label="Trim Safe Windows" fieldPath="trim_profile.trim_safe_windows" validationErrors={validationErrors} optional>
        {(trim.trim_safe_windows ?? []).map((w, i) => (
          <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
            <input
              type="number"
              style={{ ...inputStyle, width: '40%' }}
              placeholder="start"
              value={w.start}
              min={0}
              step={0.01}
              onChange={(e) => updateWindow(i, 'start', parseFloat(e.target.value) || 0)}
            />
            <span style={{ color: '#888', fontSize: '0.8rem' }}>–</span>
            <input
              type="number"
              style={{ ...inputStyle, width: '40%' }}
              placeholder="end"
              value={w.end}
              min={0}
              step={0.01}
              onChange={(e) => updateWindow(i, 'end', parseFloat(e.target.value) || 0)}
            />
            <button
              type="button"
              onClick={() => removeWindow(i)}
              style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '1rem' }}
              aria-label="Remove window"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addWindow}
          style={{ background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          + Add Window
        </button>
      </FieldWrapper>

      <FieldWrapper label="Loopable" fieldPath="trim_profile.loopable" validationErrors={validationErrors} optional>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#ccc', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={trim.loopable ?? false}
            onChange={(e) => onFieldChange('trim_profile.loopable', e.target.checked)}
          />
          Loopable
        </label>
      </FieldWrapper>

      <FieldWrapper label="Preferred Entry Beats" fieldPath="trim_profile.preferred_entry_beats" validationErrors={validationErrors} optional>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
          {(trim.preferred_entry_beats ?? []).map((b, i) => (
            <span key={i} style={{ background: '#333', color: '#e0e0e0', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {b}
              <button type="button" onClick={() => removeBeat('preferred_entry_beats', i)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }} aria-label={`Remove beat ${b}`}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input type="number" style={inputStyle} value={entryBeatInput} onChange={(e) => setEntryBeatInput(e.target.value)} placeholder="Beat #" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBeat('preferred_entry_beats', entryBeatInput, setEntryBeatInput); } }} />
        </div>
      </FieldWrapper>

      <FieldWrapper label="Preferred Exit Beats" fieldPath="trim_profile.preferred_exit_beats" validationErrors={validationErrors} optional>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
          {(trim.preferred_exit_beats ?? []).map((b, i) => (
            <span key={i} style={{ background: '#333', color: '#e0e0e0', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {b}
              <button type="button" onClick={() => removeBeat('preferred_exit_beats', i)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }} aria-label={`Remove beat ${b}`}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input type="number" style={inputStyle} value={exitBeatInput} onChange={(e) => setExitBeatInput(e.target.value)} placeholder="Beat #" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBeat('preferred_exit_beats', exitBeatInput, setExitBeatInput); } }} />
        </div>
      </FieldWrapper>
    </div>
  );
}
