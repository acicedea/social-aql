'use client';

import React from 'react';
import Link from 'next/link';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Mono, Eyebrow } from '@/components/design-system/Typography';
import type { AnalysisType, WeeklySummaryOutput, ContentPatternsOutput, ContentIdeationOutput } from '@/ai/analyses/types';

const TYPE_LABELS: Record<AnalysisType, string> = {
  weekly_summary: 'SUMAR SĂPTĂMÂNAL',
  content_patterns: 'TIPARE CONȚINUT',
  content_ideation: 'IDEI CONȚINUT',
};

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Acum';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}z`;
}

function extractHeadline(analysisType: string, structured: unknown): string | null {
  if (!structured || typeof structured !== 'object') return null;
  const s = structured as Record<string, unknown>;
  return typeof s.headline === 'string' ? s.headline : null;
}

interface Props {
  id: string;
  analysisType: AnalysisType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  structuredOutput: unknown;
  errorMessage: string | null;
}

export function AnalysisCard({ id, analysisType, status, createdAt, structuredOutput, errorMessage }: Props) {
  const headline = extractHeadline(analysisType, structuredOutput);

  const statusColor =
    status === 'completed'
      ? colors.accentLime
      : status === 'failed'
      ? colors.accentCoral
      : colors.textMuted;

  return (
    <Link href={`/dashboard/analyses/${id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = colors.borderPositive;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = colors.borderDefault;
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Eyebrow tone="lime">{TYPE_LABELS[analysisType] ?? analysisType}</Eyebrow>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 10,
                color: statusColor,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {status === 'running' ? '⬤ ÎN CURS...' : status.toUpperCase()}
            </span>
            <span suppressHydrationWarning><Mono tone="muted">{relativeDate(createdAt)}</Mono></span>
          </div>
        </div>

        {headline ? (
          <span
            style={{
              fontFamily: 'var(--font-league-spartan), sans-serif',
              fontSize: 16,
              fontWeight: 700,
              color: colors.textPrimary,
              lineHeight: 1.3,
              textTransform: 'uppercase',
            }}
          >
            {headline}
          </span>
        ) : status === 'failed' ? (
          <Mono tone="coral">{errorMessage ?? 'Analiză eșuată'}</Mono>
        ) : null}
      </div>
    </Link>
  );
}
