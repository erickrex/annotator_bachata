import type { ValidationError } from '../../types/index.js';

interface FieldWrapperProps {
  label: string;
  fieldPath: string;
  validationErrors: ValidationError[];
  children: React.ReactNode;
  optional?: boolean;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  marginBottom: '2px',
  color: '#ccc',
};

const errorStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#ff6b6b',
  marginTop: '2px',
};

const wrapperStyle: React.CSSProperties = {
  marginBottom: '10px',
};

export function FieldWrapper({ label, fieldPath, validationErrors, children, optional }: FieldWrapperProps) {
  const errors = validationErrors.filter((e) => e.field === fieldPath);
  return (
    <div style={wrapperStyle}>
      <label style={labelStyle}>
        {label}
        {optional && <span style={{ color: '#888', fontWeight: 400 }}> (optional)</span>}
      </label>
      {children}
      {errors.map((err, i) => (
        <div key={i} style={errorStyle}>
          {err.message}
        </div>
      ))}
    </div>
  );
}

/* Shared input styles */
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  fontSize: '0.85rem',
  background: '#1e1e2e',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: '4px',
  boxSizing: 'border-box',
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
};

export const sectionStyle: React.CSSProperties = {
  marginBottom: '16px',
  padding: '12px',
  background: '#16161e',
  borderRadius: '6px',
  border: '1px solid #333',
};

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#e0e0e0',
  marginBottom: '10px',
  borderBottom: '1px solid #333',
  paddingBottom: '6px',
};
