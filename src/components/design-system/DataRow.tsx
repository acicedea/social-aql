'use client';

import React from 'react';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface DataRowProps {
  label: string;
  description: React.ReactNode;
  status: string;
  tone: 'positive' | 'negative' | 'neutral';
  action?: React.ReactNode;
}

export function DataRow({ label, description, status, tone, action }: DataRowProps) {
  const accentColor = tone === 'positive' ? colors.accentLime : tone === 'neutral' ? colors.textSecondary : colors.accentCoral;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: colors.bgCard,
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${colors.borderDefault}`,
        minHeight: 64,
      }}
    >
      {/* Left accent bar */}
      <div
        style={{
          width: 4,
          flexShrink: 0,
          background: accentColor,
        }}
      />
      {/* Content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 16px',
          flex: 1,
        }}
      >
        {/* Label */}
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: colors.textPrimary,
            minWidth: 100,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
        {/* Description */}
        <span
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 14,
            color: colors.textSecondary,
            flex: 1,
          }}
        >
          {description}
        </span>
        {/* Status */}
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: accentColor,
            flexShrink: 0,
          }}
        >
          {status}
        </span>
        {/* Action (optional) */}
        {action}
      </div>
    </div>
  );
}
