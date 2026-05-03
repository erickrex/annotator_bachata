import React from 'react';

export interface VideoGroupProps {
  sourceId: string;
  folderName: string;
  clipCount: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const VideoGroup: React.FC<VideoGroupProps> = ({
  sourceId,
  folderName,
  clipCount,
  collapsed,
  onToggle,
  children,
}) => {
  return (
    <div style={{ marginBottom: 8 }} data-source-id={sourceId}>
      <div
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 4,
          cursor: 'pointer',
          background: '#1a1a1a',
          border: '1px solid #333',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 16,
            textAlign: 'center',
            fontSize: 12,
            color: '#888',
            transition: 'transform 0.15s ease',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
          aria-hidden="true"
        >
          ▼
        </span>
        <span style={{ flex: 1, fontSize: 13, color: '#ddd', fontFamily: 'monospace' }}>
          {folderName}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: '1px 7px',
            borderRadius: 8,
            background: '#333',
            color: '#aaa',
          }}
        >
          {clipCount}
        </span>
      </div>
      {!collapsed && (
        <div style={{ paddingLeft: 8, paddingTop: 4 }}>
          {children}
        </div>
      )}
    </div>
  );
};
