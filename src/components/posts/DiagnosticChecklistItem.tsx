import React from 'react';
import type { DiagnosticCheck } from '@/lib/diagnostics/types';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  check: DiagnosticCheck;
}

export function DiagnosticChecklistItem({ check }: Props) {
  const borderColor = check.passed
    ? colors.accentLimeDim
    : check.severity === 'critical'
      ? colors.accentCoral
      : check.severity === 'warning'
        ? colors.accentAmber
        : colors.borderDefault;

  const icon = check.passed ? '✓' : check.severity === 'critical' ? '✗' : '⚠';
  const iconColor = check.passed
    ? colors.accentLime
    : check.severity === 'critical' || check.severity === 'warning'
      ? colors.accentCoral
      : colors.textMuted;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 16px',
        borderLeft: `4px solid ${borderColor}`,
        background: colors.bgCard,
        marginBottom: 4,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          color: iconColor,
          fontSize: 14,
          minWidth: 16,
          marginTop: 2,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: colors.textMuted,
            }}
          >
            {check.category.replace(/_/g, ' ')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontWeight: 700,
              fontSize: 13,
              color: check.passed ? colors.textSecondary : colors.textPrimary,
            }}
          >
            {check.title}
          </span>
        </div>

        <p
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 13,
            color: colors.textSecondary,
            margin: 0,
            marginBottom: !check.passed && check.action ? 6 : 0,
          }}
        >
          {check.detail}
        </p>

        {!check.passed && check.action && (
          <p
            style={{
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 12,
              color: colors.accentLime,
              margin: 0,
              marginBottom: 4,
            }}
          >
            → {check.action}
          </p>
        )}

        {check.benchmark && (
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: colors.textMuted,
            }}
          >
            BENCHMARK: {check.benchmark}
          </span>
        )}
      </div>
    </div>
  );
}
