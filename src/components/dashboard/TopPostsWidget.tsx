'use client';

import Link from 'next/link';
import { Card } from '@/components/design-system/Card';
import { Eyebrow, Mono } from '@/components/design-system/Typography';
import { formatKpiPercent, formatLargeNumber } from '@/lib/kpis/formatters';
import { colors } from '@/themes/ai-lichiditate/tokens';

export interface TopPost {
  id: string;
  caption: string | null;
  media_type: string;
  published_at: string;
  theme: string | null;
  saves_per_reach: number | null;
  sends_per_reach: number | null;
  er_by_reach: number | null;
  reach: number | null;
}

type MetricKey = 'saves_per_reach' | 'sends_per_reach' | 'er_by_reach';

interface Props {
  posts: TopPost[];
  metricLabel: string;
  metricKey: MetricKey;
}

export function TopPostsWidget({ posts, metricLabel, metricKey }: Props) {
  return (
    <Card>
      <Eyebrow tone="lime">TOP POSTĂRI · {metricLabel}</Eyebrow>
      <div style={{ marginTop: 4, marginBottom: 16 }}>
        <span
          style={{
            fontFamily: 'var(--font-league-spartan), sans-serif',
            fontSize: 18,
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            color: colors.textPrimary,
          }}
        >
          CELE MAI PERFORMANTE
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {posts.length === 0 ? (
          <Mono tone="muted">Niciun post disponibil în această perioadă.</Mono>
        ) : (
          posts.map((p, idx) => (
            <Link key={p.id} href={`/dashboard/posts/${p.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 12,
                    color: colors.textMuted,
                    width: 24,
                    flexShrink: 0,
                    paddingTop: 2,
                  }}
                >
                  0{idx + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-inter), sans-serif',
                      fontSize: 14,
                      color: colors.textPrimary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.caption?.slice(0, 80) ?? '(fără caption)'}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 11,
                        color: colors.textMuted,
                      }}
                    >
                      {p.media_type.toUpperCase()} · {p.theme?.toUpperCase() ?? 'OTHER'} · REACH {formatLargeNumber(p.reach)}
                    </span>
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 13,
                    color: colors.accentLime,
                    flexShrink: 0,
                  }}
                >
                  {formatKpiPercent(p[metricKey])}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
