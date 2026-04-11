import type { ClipAnnotation, EnumDefinitions, ValidationError, VirtualClipDef } from '../types/index.js';
import { IdentitySection } from './annotation/IdentitySection.js';
import { PhrasingSection } from './annotation/PhrasingSection.js';
import { EntryExitSection } from './annotation/EntryExitSection.js';
import { TrimSection } from './annotation/TrimSection.js';
import { MotionSection } from './annotation/MotionSection.js';
import { CameraQualitySection } from './annotation/CameraQualitySection.js';

interface AnnotationFormProps {
  clip: VirtualClipDef;
  annotation: ClipAnnotation;
  enumDefinitions: EnumDefinitions;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  validationErrors: ValidationError[];
  completeness: number;
}

export function AnnotationForm({
  annotation,
  enumDefinitions,
  onFieldChange,
  validationErrors,
  completeness,
}: AnnotationFormProps) {
  const pct = Math.round(completeness * 100);
  const barColor = pct < 40 ? '#ff6b6b' : pct < 75 ? '#ffa94d' : '#51cf66';

  return (
    <div style={{ maxHeight: '100vh', overflowY: 'auto', padding: '8px' }}>
      {/* Completeness bar */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#ccc', marginBottom: '4px' }}>
          <span>Annotation Completeness</span>
          <span>{pct}%</span>
        </div>
        <div style={{ background: '#222', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.3s ease' }} />
        </div>
        {validationErrors.length > 0 && (
          <div style={{ fontSize: '0.75rem', color: '#ff6b6b', marginTop: '4px' }}>
            {validationErrors.length} validation error{validationErrors.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <IdentitySection annotation={annotation} enumDefinitions={enumDefinitions} onFieldChange={onFieldChange} validationErrors={validationErrors} />
      <PhrasingSection annotation={annotation} enumDefinitions={enumDefinitions} onFieldChange={onFieldChange} validationErrors={validationErrors} />
      <EntryExitSection entryState={annotation.entry_state} exitState={annotation.exit_state} enumDefinitions={enumDefinitions} onFieldChange={onFieldChange} validationErrors={validationErrors} />
      <TrimSection annotation={annotation} onFieldChange={onFieldChange} validationErrors={validationErrors} />
      <MotionSection annotation={annotation} enumDefinitions={enumDefinitions} onFieldChange={onFieldChange} validationErrors={validationErrors} />
      <CameraQualitySection annotation={annotation} enumDefinitions={enumDefinitions} onFieldChange={onFieldChange} validationErrors={validationErrors} />
    </div>
  );
}
