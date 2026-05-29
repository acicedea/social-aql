'use client';

import React from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line,
} from 'recharts';
import { Collapse } from 'antd';
import { DiagnosticItem } from '@/components/dashboard/DiagnosticItem';
import { Eyebrow, Body, Mono } from '@/components/design-system/Typography';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { formatKpiPercent } from '@/lib/kpis/formatters';
import type { ContentData, DiagnosticFlag, PostSummary } from '@/lib/dashboard/data';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ContentTabProps {
  data: ContentData;
  diagnostics: DiagnosticFlag[];
  accountAvgEr: number | null;
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: colors.bgCard,
  border: `1px solid ${colors.borderDefault}`,
  borderRadius: 6,
  padding: 16,
};

const monoSm = (color: string = colors.textPrimary): React.CSSProperties => ({
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: 11,
  color,
});

function erColor(value: number | null, accountAvgEr: number | null): string {
  if (value == null || accountAvgEr == null) return colors.textPrimary;
  if (value >= accountAvgEr) return colors.accentLime;
  if (value < accountAvgEr * 0.7) return colors.accentCoral;
  return colors.textPrimary;
}

// ─── Section 1: Hook Type Analysis ────────────────────────────────────────────

function HookTypeSection({ data }: { data: ContentData }) {
  const chartData = data.hookTypeStats.filter(h => h.avgEr != null);
  const maxEr = Math.max(...chartData.map(h => h.avgEr ?? 0));
  const winner = data.hookTypeStats[0];

  const HOOK_LABELS: Record<string, string> = {
    question: 'Întrebare',
    statement: 'Afirmație',
    number: 'Număr',
    quote: 'Citat',
    command: 'Comandă',
    other: 'Altele',
  };

  return (
    <div style={sectionStyle}>
      <Eyebrow tone="muted">ANALIZA HOOK-URILOR</Eyebrow>
      <div style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="hookType"
              tick={{ fill: colors.textMuted, fontSize: 10, fontFamily: 'var(--font-jetbrains-mono)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) => HOOK_LABELS[v] ?? v}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderRadius: 4 }}
              labelStyle={{ color: colors.textMuted, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11 }}
              itemStyle={{ color: colors.textPrimary, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11 }}
              formatter={(value: unknown) => [value != null ? `${Number(value).toFixed(2)}%` : '—', 'ER Mediu'] as [string, string]}
            />
            <Bar dataKey="avgEr" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.avgEr === maxEr ? colors.accentLime : colors.borderDefault}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div style={{ marginTop: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 8, paddingBottom: 6, borderBottom: `1px solid ${colors.borderDefault}` }}>
          {['Tip Hook', 'Postări', 'ER Mediu', 'Save Rate', 'Send Rate'].map((col, i) => (
            <div key={col} style={{ flex: i === 0 ? 2 : 1, ...monoSm(colors.textMuted) }}>{col}</div>
          ))}
        </div>
        {data.hookTypeStats.map((row, idx) => {
          const isWinner = idx === 0 && row.avgEr != null;
          return (
            <div
              key={row.hookType}
              style={{
                display: 'flex',
                gap: 8,
                padding: '8px 0',
                borderBottom: `1px solid ${colors.borderDefault}`,
                borderLeft: isWinner ? `3px solid ${colors.accentLime}` : '3px solid transparent',
                paddingLeft: isWinner ? 6 : 0,
              }}
            >
              <div style={{ flex: 2, ...monoSm(colors.textPrimary) }}>
                {HOOK_LABELS[row.hookType] ?? row.hookType}
              </div>
              <div style={{ flex: 1, ...monoSm(colors.textSecondary) }}>{row.postCount}</div>
              <div style={{ flex: 1, ...monoSm(isWinner ? colors.accentLime : colors.textPrimary) }}>
                {formatKpiPercent(row.avgEr)}
              </div>
              <div style={{ flex: 1, ...monoSm(colors.textSecondary) }}>
                {formatKpiPercent(row.avgSaves)}
              </div>
              <div style={{ flex: 1, ...monoSm(colors.textSecondary) }}>
                {formatKpiPercent(row.avgSends)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interpretation */}
      {winner && (
        <div style={{ marginTop: 12 }}>
          <Body tone="secondary">
            Hook-urile tip <span style={{ color: colors.accentLime }}>{HOOK_LABELS[winner.hookType] ?? winner.hookType}</span> performează cel mai bine pe audiența ta.
          </Body>
        </div>
      )}
    </div>
  );
}

// ─── Section 2: Caption Length Analysis ───────────────────────────────────────

function CaptionLengthSection({ data }: { data: ContentData }) {
  const bestEr = Math.max(...data.captionLengthStats.map(s => s.avgEr ?? 0));

  const LENGTH_LABELS: Record<string, string> = {
    short: 'SCURT',
    medium: 'MEDIU',
    long: 'LUNG',
  };

  const LENGTH_VERDICTS: Record<string, string> = {
    short: 'rapid de consumat',
    medium: 'echilibru optim',
    long: 'detaliat, expert',
  };

  return (
    <div style={sectionStyle}>
      <Eyebrow tone="muted">LUNGIMEA CAPTION-ULUI</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
        {data.captionLengthStats.map(stat => {
          const isBest = stat.avgEr === bestEr && stat.avgEr != null;
          return (
            <div
              key={stat.length}
              style={{
                background: colors.bgElevated,
                border: `1px solid ${isBest ? colors.accentLime : colors.borderDefault}`,
                borderRadius: 6,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={monoSm(colors.textMuted)}>{LENGTH_LABELS[stat.length]}</span>
              <Mono tone="primary">{stat.postCount} postări</Mono>
              <div>
                <span style={monoSm(colors.textMuted)}>ER Mediu </span>
                <span style={monoSm(isBest ? colors.accentLime : colors.textPrimary)}>
                  {formatKpiPercent(stat.avgEr)}
                </span>
              </div>
              <div>
                <span style={monoSm(colors.textMuted)}>Save Rate </span>
                <span style={monoSm(colors.textSecondary)}>{formatKpiPercent(stat.avgSaves)}</span>
              </div>
              <Body tone="muted">{LENGTH_VERDICTS[stat.length]}</Body>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section 3: Hashtag Strategy ──────────────────────────────────────────────

function HashtagSection({ data }: { data: ContentData }) {
  const hashData = data.hashtagCountStats.map(h => ({
    bucket: h.bucket,
    postCount: h.postCount,
    avgEr: h.avgEr,
  }));

  const bestBucket = [...data.hashtagCountStats].sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0))[0];

  return (
    <div style={sectionStyle}>
      <Eyebrow tone="muted">STRATEGIA DE HASHTAG-URI</Eyebrow>
      <div style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={hashData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="bucket"
              tick={{ fill: colors.textMuted, fontSize: 10, fontFamily: 'var(--font-jetbrains-mono)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="count"
              orientation="left"
              tick={{ fill: colors.textMuted, fontSize: 10, fontFamily: 'var(--font-jetbrains-mono)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="er"
              orientation="right"
              tick={{ fill: colors.textMuted, fontSize: 10, fontFamily: 'var(--font-jetbrains-mono)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderRadius: 4 }}
              labelStyle={{ color: colors.textMuted, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11 }}
              itemStyle={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11 }}
            />
            <Bar yAxisId="count" dataKey="postCount" name="Postări" radius={[2, 2, 0, 0]}>
              {hashData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={bestBucket && entry.bucket === bestBucket.bucket ? colors.accentLime : colors.borderDefault}
                />
              ))}
            </Bar>
            <Line
              yAxisId="er"
              type="monotone"
              dataKey="avgEr"
              name="ER Mediu %"
              stroke={colors.accentLimeDim}
              strokeWidth={2}
              dot={{ fill: colors.accentLimeDim, r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {bestBucket && (
        <div style={{ marginTop: 12 }}>
          <Body tone="secondary">
            Postările tale cu{' '}
            <span style={{ color: colors.accentLime }}>{bestBucket.bucket}</span>{' '}
            hashtag-uri au cel mai bun engagement.
          </Body>
        </div>
      )}
    </div>
  );
}

// ─── Section 4: Theme Performance Matrix ──────────────────────────────────────

function ThemeMatrixSection({ data, accountAvgEr }: { data: ContentData; accountAvgEr: number | null }) {
  const verdicts = data.themePerformanceMatrix.slice(0, 3).map(t => {
    const tier =
      t.avgEr != null && accountAvgEr != null
        ? t.avgEr >= accountAvgEr
          ? 'peste medie'
          : 'sub medie'
        : '—';
    return `${t.theme.toUpperCase()} — ER ${t.avgEr?.toFixed(1) ?? '—'}% (${tier}), ${t.postCount} postări`;
  });

  const cols = ['Temă', 'Postări', 'ER Mediu', 'Save Rate', 'Send Rate', 'Save/Like', 'Top Post'];

  return (
    <div style={sectionStyle}>
      <Eyebrow tone="muted">MATRICEA PERFORMANȚEI PE TEME</Eyebrow>
      <div style={{ marginTop: 16, overflowX: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 8, paddingBottom: 6, borderBottom: `1px solid ${colors.borderDefault}`, minWidth: 680 }}>
          {cols.map((col, i) => (
            <div key={col} style={{ flex: i === 0 || i === 6 ? 2 : 1, ...monoSm(colors.textMuted) }}>{col}</div>
          ))}
        </div>
        {/* Rows */}
        {data.themePerformanceMatrix.map(row => (
          <div
            key={row.theme}
            style={{
              display: 'flex',
              gap: 8,
              padding: '8px 0',
              borderBottom: `1px solid ${colors.borderDefault}`,
              minWidth: 680,
            }}
          >
            <div style={{ flex: 2, ...monoSm(colors.textPrimary) }}>{row.theme}</div>
            <div style={{ flex: 1, ...monoSm(colors.textSecondary) }}>{row.postCount}</div>
            <div style={{ flex: 1, ...monoSm(erColor(row.avgEr, accountAvgEr)) }}>
              {formatKpiPercent(row.avgEr)}
            </div>
            <div style={{ flex: 1, ...monoSm(erColor(row.avgSaves, accountAvgEr)) }}>
              {formatKpiPercent(row.avgSaves)}
            </div>
            <div style={{ flex: 1, ...monoSm(erColor(row.avgSends, accountAvgEr)) }}>
              {formatKpiPercent(row.avgSends)}
            </div>
            <div style={{ flex: 1, ...monoSm(colors.textSecondary) }}>
              {row.avgSaveToLike != null ? row.avgSaveToLike.toFixed(3) : '—'}
            </div>
            <div style={{ flex: 2, overflow: 'hidden' }}>
              {row.bestPost ? (
                <Link
                  href={`/dashboard/posts/${row.bestPost.id}`}
                  style={{ ...monoSm(colors.accentLime), textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {(row.bestPost.caption ?? '').slice(0, 40) || '—'}
                </Link>
              ) : (
                <span style={monoSm(colors.textMuted)}>—</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* Verdicts */}
      {verdicts.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {verdicts.map((v, i) => (
            <Body key={i} tone="secondary">{v}</Body>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 5: Content Health Checklist ──────────────────────────────────────

const categories = ['hook', 'caption_seo', 'hashtags', 'engagement', 'strategy', 'financial_creator'] as const;

const categoryLabels: Record<string, string> = {
  hook: 'HOOK',
  caption_seo: 'CAPTION & SEO',
  hashtags: 'HASHTAG-URI',
  engagement: 'ENGAGEMENT',
  strategy: 'STRATEGIE',
  financial_creator: 'CREATOR FINANCIAR',
};

function HealthChecklist({ diagnostics }: { diagnostics: DiagnosticFlag[] }) {
  const collapseItems = categories
    .map(cat => {
      const catFlags = diagnostics.filter(f => f.category === cat);
      if (catFlags.length === 0) return null;
      return {
        key: cat,
        label: (
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 12,
              textTransform: 'uppercase' as const,
              color: colors.textPrimary,
            }}
          >
            {categoryLabels[cat]} ({catFlags.length})
          </span>
        ),
        children: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {catFlags.map(f => (
              <DiagnosticItem key={f.id} flag={f} />
            ))}
          </div>
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (collapseItems.length === 0) {
    return (
      <div style={sectionStyle}>
        <Eyebrow tone="muted">CONTENT HEALTH CHECKLIST</Eyebrow>
        <div style={{ marginTop: 12 }}>
          <Body tone="muted">Nicio problemă detectată în această perioadă.</Body>
        </div>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <Eyebrow tone="muted">CONTENT HEALTH CHECKLIST</Eyebrow>
      <div style={{ marginTop: 12 }}>
        <Collapse
          items={collapseItems}
          ghost
          style={{ background: 'transparent' }}
        />
      </div>
    </div>
  );
}

// ─── ContentTab ────────────────────────────────────────────────────────────────

export function ContentTab({ data, diagnostics, accountAvgEr }: ContentTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <HookTypeSection data={data} />
      <CaptionLengthSection data={data} />
      <HashtagSection data={data} />
      <ThemeMatrixSection data={data} accountAvgEr={accountAvgEr} />
      <HealthChecklist diagnostics={diagnostics} />
    </div>
  );
}
