'use client';

import React from 'react';
import type { KpiTier } from '@/lib/kpis/types';
import { kpiTierColor } from '@/lib/kpis/benchmarks';
import { Card } from '@/components/design-system/Card';
import { Eyebrow, Mono } from '@/components/design-system/Typography';
import { KpiSparkline } from './KpiSparkline';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface KpiCardProps {
  label: string;
  eyebrow: string;
  value: string;
  delta?: { text: string; tone: 'lime' | 'coral' | 'muted' };
  tier?: KpiTier | null;
  benchmark?: { excellent: number; good: number; average: number };
  sparklineData?: number[];
}

const toneToColor: Record<string, string> = {
  lime:    colors.accentLime,
  coral:   colors.accentCoral,
  muted:   colors.textMuted,
  primary: colors.textPrimary,
};

export function KpiCard({ label, eyebrow, value, delta, tier, benchmark, sparklineData }: KpiCardProps) {
  const tone = tier ? kpiTierColor(tier) : 'primary';
  const variant =
    tier === 'excellent' || tier === 'good' ? 'positive' :
    tier === 'low' ? 'negative' : 'default';

  const eyebrowTone = tone === 'coral' ? 'coral' : tone === 'lime' ? 'lime' : 'muted';

  return (
    <Card variant={variant}>
      <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>
      <div style={{ marginTop: 4 }}>
        <span
          style={{
            fontFamily: 'var(--font-league-spartan), sans-serif',
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.02em',
            color: colors.textPrimary,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 32,
            fontWeight: 700,
            color: toneToColor[tone] ?? colors.textPrimary,
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {delta && (
          <Mono tone={delta.tone}>
            {delta.text}
          </Mono>
        )}
      </div>
      {sparklineData && sparklineData.length >= 2 && (
        <div style={{ marginTop: 12 }}>
          <KpiSparkline values={sparklineData} tone={tone} />
        </div>
      )}
      {tier && benchmark && (
        <div style={{ marginTop: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: colors.textMuted,
            }}
          >
            BENCHMARK · BUN &gt; {benchmark.good}% · EXCELENT &gt; {benchmark.excellent}%
          </span>
        </div>
      )}
    </Card>
  );
}
