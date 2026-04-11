import type { ClipAnnotation, EnumDefinitions, ValidationError } from '../../types/index.js';
import { FieldWrapper, inputStyle, selectStyle, sectionStyle, sectionTitleStyle } from './FieldWrapper.js';
import { useState } from 'react';

interface IdentitySectionProps {
  annotation: ClipAnnotation;
  enumDefinitions: EnumDefinitions;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
}

export function IdentitySection({ annotation, enumDefinitions, onFieldChange, validationErrors }: IdentitySectionProps) {
  const [tagInput, setTagInput] = useState('');

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTags = [...annotation.tags, tagInput.trim()];
      onFieldChange('tags', newTags);
      setTagInput('');
    }
  };

  const removeTag = (index: number) => {
    const newTags = annotation.tags.filter((_, i) => i !== index);
    onFieldChange('tags', newTags);
  };

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Identity &amp; Classification</div>

      <FieldWrapper label="Clip ID" fieldPath="clip_id" validationErrors={validationErrors}>
        <input
          style={inputStyle}
          value={annotation.clip_id}
          onChange={(e) => onFieldChange('clip_id', e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper label="Move Name" fieldPath="move_name" validationErrors={validationErrors}>
        <input
          style={inputStyle}
          value={annotation.move_name}
          onChange={(e) => onFieldChange('move_name', e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper label="Move Label" fieldPath="move_label" validationErrors={validationErrors}>
        <select
          style={selectStyle}
          value={annotation.move_label}
          onChange={(e) => onFieldChange('move_label', e.target.value)}
        >
          <option value="">-- select --</option>
          {enumDefinitions.move_label.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Move Family" fieldPath="move_family" validationErrors={validationErrors} optional>
        <input
          style={inputStyle}
          value={annotation.move_family ?? ''}
          onChange={(e) => onFieldChange('move_family', e.target.value || undefined)}
        />
      </FieldWrapper>

      <FieldWrapper label="Move Variant" fieldPath="move_variant" validationErrors={validationErrors} optional>
        <input
          style={inputStyle}
          value={annotation.move_variant ?? ''}
          onChange={(e) => onFieldChange('move_variant', e.target.value || undefined)}
        />
      </FieldWrapper>

      <FieldWrapper label="Tags" fieldPath="tags" validationErrors={validationErrors}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
          {annotation.tags.map((tag, i) => (
            <span
              key={i}
              style={{
                background: '#333',
                color: '#e0e0e0',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ff6b6b',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '0.8rem',
                  lineHeight: 1,
                }}
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          style={inputStyle}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Type and press Enter to add"
        />
      </FieldWrapper>

      <FieldWrapper label="Difficulty" fieldPath="difficulty" validationErrors={validationErrors}>
        <select
          style={selectStyle}
          value={annotation.difficulty}
          onChange={(e) => onFieldChange('difficulty', e.target.value)}
        >
          <option value="">-- select --</option>
          {enumDefinitions.difficulty.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Energy Level" fieldPath="energy_level" validationErrors={validationErrors}>
        <select
          style={selectStyle}
          value={annotation.energy_level}
          onChange={(e) => onFieldChange('energy_level', e.target.value)}
        >
          <option value="">-- select --</option>
          {enumDefinitions.energy_level.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </FieldWrapper>

      <FieldWrapper label="Style" fieldPath="style" validationErrors={validationErrors}>
        <select
          style={selectStyle}
          value={annotation.style}
          onChange={(e) => onFieldChange('style', e.target.value)}
        >
          <option value="">-- select --</option>
          {enumDefinitions.style.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </FieldWrapper>
    </div>
  );
}
