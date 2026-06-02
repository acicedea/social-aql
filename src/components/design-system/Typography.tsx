'use client';

import React from 'react';
import { colors } from '@/themes/platform/tokens';

interface EyebrowProps {
  children: React.ReactNode;
  tone?: 'lime' | 'coral' | 'muted';
}

const toneColor = {
  lime: colors.accentLime,
  coral: colors.accentCoral,
  muted: colors.textMuted,
};

export function Eyebrow({ children, tone }: EyebrowProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: tone ? toneColor[tone] : colors.textSecondary,
        display: 'block',
      }}
    >
      {children}
    </span>
  );
}

interface H1Props {
  children: string;
  accent?: { text: string; tone: 'lime' | 'coral' };
}

export function H1({ children, accent }: H1Props) {
  let content: React.ReactNode = children;

  if (accent) {
    const upper = children.toUpperCase();
    const accentUpper = accent.text.toUpperCase();
    const idx = upper.indexOf(accentUpper);
    if (idx !== -1) {
      const before = children.slice(0, idx);
      const match = children.slice(idx, idx + accent.text.length);
      const after = children.slice(idx + accent.text.length);
      content = (
        <>
          {before}
          <span style={{ color: accent.tone === 'lime' ? colors.accentLime : colors.accentCoral }}>
            {match}
          </span>
          {after}
        </>
      );
    }
  }

  return (
    <h1
      style={{
        fontFamily: 'var(--font-league-spartan), sans-serif',
        fontSize: 'clamp(56px, 8vw, 96px)',
        fontWeight: 800,
        lineHeight: 0.95,
        letterSpacing: '-0.02em',
        textTransform: 'uppercase',
        color: colors.textPrimary,
        margin: 0,
      }}
    >
      {content}
    </h1>
  );
}

interface H2Props {
  children: React.ReactNode;
  accent?: { text: string; tone: 'lime' | 'coral' };
}

export function H2({ children, accent }: H2Props) {
  let content: React.ReactNode = children;

  if (accent && typeof children === 'string') {
    const upper = children.toUpperCase();
    const accentUpper = accent.text.toUpperCase();
    const idx = upper.indexOf(accentUpper);
    if (idx !== -1) {
      const before = children.slice(0, idx);
      const match = children.slice(idx, idx + accent.text.length);
      const after = children.slice(idx + accent.text.length);
      content = (
        <>
          {before}
          <span style={{ color: accent.tone === 'lime' ? colors.accentLime : colors.accentCoral }}>
            {match}
          </span>
          {after}
        </>
      );
    }
  }

  return (
    <h2
      style={{
        fontFamily: 'var(--font-league-spartan), sans-serif',
        fontSize: 'clamp(32px, 4vw, 48px)',
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        textTransform: 'uppercase',
        color: colors.textPrimary,
        margin: 0,
      }}
    >
      {content}
    </h2>
  );
}

interface H3Props {
  children: React.ReactNode;
}

export function H3({ children }: H3Props) {
  return (
    <h3
      style={{
        fontFamily: 'var(--font-league-spartan), sans-serif',
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1.2,
        color: colors.textPrimary,
        margin: 0,
      }}
    >
      {children}
    </h3>
  );
}

interface BodyProps {
  children: React.ReactNode;
  tone?: 'primary' | 'secondary' | 'muted';
  style?: React.CSSProperties;
}

const bodyToneColor = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
};

export function Body({ children, tone = 'primary', style }: BodyProps) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-inter), sans-serif',
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 1.5,
        color: bodyToneColor[tone],
        margin: 0,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

interface MonoProps {
  children: React.ReactNode;
  tone?: 'lime' | 'coral' | 'muted' | 'primary';
  style?: React.CSSProperties;
}

const monoToneColor = {
  lime: colors.accentLime,
  coral: colors.accentCoral,
  muted: colors.textMuted,
  primary: colors.textPrimary,
};

export function Mono({ children, tone = 'primary', style }: MonoProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 13,
        fontWeight: 400,
        color: monoToneColor[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
