'use client';

import React from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { OverviewData, PostSummary } from '@/lib/dashboard/data';
import { BENCHMARKS, classifyKpi } from '@/lib/kpis/benchmarks';
import {
  formatKpiPercent,
  formatLargeNumber,
  formatDelta,
} from '@/lib/kpis/formatters';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { DiagnosticItem } from '@/components/dashboard/DiagnosticItem';
import { Eyebrow } from '@/components/design-system/Typography';
import { colors } from '@/themes/platform/tokens';
import { isEnabled } from '@/lib/modules';

interface OverviewTabProps {
  data: OverviewData;
  dateLabel: string;
}

// ─── TopPostsColumn ───────────────────────────────────────────────────────────

interface TopPostsColumnProps {
  title: string;
  posts: PostSummary[];
  metricKey: 'savesPerReach' | 'sendsPerReach';
}

function TopPostsColumn({ title, posts, metricKey }: TopPostsColumnProps) {
  return (
    <div
      style={{
        background: colors.bgCard,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: 6,
        padding: 16,
      }}
    >
      <Eyebrow tone="muted">{title}</Eyebrow>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {posts.length === 0 && (
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            — fără date
          </span>
        )}
        {posts.map((post) => {
          const metricValue = post[metricKey];
          const caption = post.caption ?? '(fără caption)';
          const truncated =
            caption.length > 60 ? caption.slice(0, 60) + '…' : caption;

          return (
            <Link
              key={post.id}
              href={`/dashboard/posts/${post.id}`}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: `1px solid ${colors.borderDefault}`,
                }}
              >
                {/* Media type tag */}
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 9,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.06em',
                    color: colors.accentLime,
                    border: `1px solid ${colors.accentLime}`,
                    borderRadius: 3,
                    padding: '1px 4px',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {post.mediaType}
                </span>

                {/* Caption */}
                <span
                  style={{
                    fontFamily: 'var(--font-inter), sans-serif',
                    fontSize: 12,
                    color: colors.textSecondary,
                    flex: 1,
                    lineHeight: 1.4,
                  }}
                >
                  {truncated}
                </span>

                {/* Metric value */}
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 12,
                    color: colors.accentLime,
                    flexShrink: 0,
                  }}
                >
                  {metricValue != null ? `${metricValue.toFixed(2)}%` : '—'}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── OverviewTab ──────────────────────────────────────────────────────────────

export function OverviewTab({ data, dateLabel }: OverviewTabProps) {
  const { current, previous, diagnostics, themeBreakdown, followerHistory } = data;
  const accountAvgEr = current.avgErByReach;

  // Follower sparkline from followerHistory
  const followerSparkline =
    followerHistory.length >= 2
      ? followerHistory.map((h) => h.followers)
      : undefined;

  // Follower delta: absolute count change
  const followerDelta: { text: string; tone: 'lime' | 'coral' | 'muted' } = (() => {
    if (current.followerEnd == null || current.followerStart == null) {
      return { text: '—', tone: 'muted' };
    }
    const diff = current.followerEnd - current.followerStart;
    const sign = diff >= 0 ? '+' : '';
    const tone = diff > 0 ? 'lime' : diff < 0 ? 'coral' : 'muted';
    return { text: `${sign}${diff}`, tone };
  })();

  // Theme bar chart: color bars lime if above account avg ER, coral if below
  const themeChartData = themeBreakdown.filter((t) => t.avgEr != null);

  // Find best ER theme for table highlight
  const bestErTheme = themeBreakdown.reduce<string | null>((best, t) => {
    if (t.avgEr == null) return best;
    if (best == null) return t.theme;
    const bestEr = themeBreakdown.find((x) => x.theme === best)?.avgEr ?? 0;
    return (t.avgEr ?? 0) > bestEr ? t.theme : best;
  }, null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* ── Section 1: KPI Cards ─────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {/* ER */}
        <KpiCard
          eyebrow="ER BY REACH"
          label="Engagement Rate"
          value={formatKpiPercent(current.avgErByReach)}
          delta={formatDelta(current.avgErByReach, previous.avgErByReach)}
          tier={classifyKpi(current.avgErByReach, BENCHMARKS.erByReach)}
          benchmark={BENCHMARKS.erByReach}
          sparklineData={undefined}
        />

        {/* Save Rate */}
        <KpiCard
          eyebrow="SAVE RATE"
          label="Saves / Reach"
          value={formatKpiPercent(current.avgSavesPerReach)}
          delta={formatDelta(current.avgSavesPerReach, previous.avgSavesPerReach)}
          tier={classifyKpi(current.avgSavesPerReach, BENCHMARKS.savesPerReach)}
          benchmark={BENCHMARKS.savesPerReach}
          sparklineData={undefined}
        />

        {/* Send Rate */}
        <KpiCard
          eyebrow="SEND RATE"
          label="Sends / Reach"
          value={formatKpiPercent(current.avgSendsPerReach)}
          delta={formatDelta(current.avgSendsPerReach, previous.avgSendsPerReach)}
          tier={classifyKpi(current.avgSendsPerReach, BENCHMARKS.sendsPerReach)}
          benchmark={BENCHMARKS.sendsPerReach}
          sparklineData={undefined}
        />

        {/* Followers */}
        <KpiCard
          eyebrow="URMĂRITORI"
          label="Followers"
          value={formatLargeNumber(current.followerEnd)}
          delta={followerDelta}
          tier={null}
          benchmark={undefined}
          sparklineData={followerSparkline}
        />
      </div>

      {/* ── Section 2: Diagnostics ───────────────────────────────────── */}
      {isEnabled('diagnosticFlags') && <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <Eyebrow tone="muted">
            DIAGNOSTIC · {dateLabel.toUpperCase()}
          </Eyebrow>

          {diagnostics.length === 0 ? (
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 11,
                color: colors.accentLime,
                letterSpacing: '0.06em',
              }}
            >
              TOTUL ÎN REGULĂ ✓
            </span>
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 11,
                color: colors.accentCoral,
                letterSpacing: '0.06em',
              }}
            >
              {diagnostics.length} PROBLEME DETECTATE
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {diagnostics.map((flag) => (
            <DiagnosticItem key={flag.id} flag={flag} />
          ))}
        </div>
      </div>}

      {/* ── Section 3: Top Performers ────────────────────────────────── */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <Eyebrow tone="muted">TOP PERFORMERS</Eyebrow>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          <TopPostsColumn
            title="TOP SAVES"
            posts={data.topPostsBySaveRate}
            metricKey="savesPerReach"
          />
          <TopPostsColumn
            title="TOP SENDS"
            posts={data.topPostsBySendRate}
            metricKey="sendsPerReach"
          />
        </div>
      </div>

      {/* ── Section 4: Video Retention Summary ───────────────────────── */}
      {data.videoRetentionSummary && (
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: 6,
            padding: 16,
          }}
        >
          <div style={{ marginBottom: 12 }}><Eyebrow tone="muted">VIDEO RETENȚIE · MEDIE PERIOADĂ</Eyebrow></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: colors.textMuted, marginBottom: 4 }}>AVG COMPLETION</div>
              <div style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 24,
                fontWeight: 700,
                color: (data.videoRetentionSummary.avgCompletionRate ?? 0) > 40 ? colors.accentLime : colors.accentCoral,
              }}>
                {data.videoRetentionSummary.avgCompletionRate}%
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: colors.textMuted, marginBottom: 4 }}>HOOK SLAB</div>
              <div style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 24,
                fontWeight: 700,
                color: data.videoRetentionSummary.reelsWithWeakHook > 0 ? colors.accentCoral : colors.accentLime,
              }}>
                {data.videoRetentionSummary.reelsWithWeakHook}
              </div>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: colors.textMuted }}>
                din {data.videoRetentionSummary.reelsWithData} Reels
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: colors.textMuted, marginBottom: 4 }}>RETENȚIE CRITICĂ</div>
              <div style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 24,
                fontWeight: 700,
                color: data.videoRetentionSummary.reelsWithCriticalDrop > 0 ? colors.accentCoral : colors.accentLime,
              }}>
                {data.videoRetentionSummary.reelsWithCriticalDrop}
              </div>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: colors.textMuted }}>
                necesită atenție
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 5: Theme Performance ─────────────────────────────── */}
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: 16,
        }}
      >
        <Eyebrow tone="muted">PERFORMANȚĂ PE TEME</Eyebrow>

        {/* 4a: Bar chart */}
        {themeChartData.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={themeChartData}
                margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
              >
                <XAxis
                  dataKey="theme"
                  tick={{
                    fill: colors.textMuted,
                    fontSize: 10,
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.bgCard,
                    border: `1px solid ${colors.borderDefault}`,
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    color: colors.textPrimary,
                    boxShadow: 'none',
                  }}
                  formatter={(value: unknown) => [
                    typeof value === 'number' ? `${value.toFixed(2)}%` : '—',
                    'ER',
                  ]}
                />
                <Bar dataKey="avgEr" radius={2}>
                  {themeChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        accountAvgEr != null && (entry.avgEr ?? 0) >= accountAvgEr
                          ? colors.accentLime
                          : colors.accentCoral
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 4b: Compact table */}
        {themeBreakdown.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {/* Header row */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                paddingBottom: 6,
                borderBottom: `1px solid ${colors.borderDefault}`,
                marginBottom: 4,
              }}
            >
              {(['Temă', 'Postări', 'ER Mediu', 'Save Rate', 'Send Rate'] as const).map(
                (col) => (
                  <span
                    key={col}
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 10,
                      color: colors.textMuted,
                      flex: col === 'Temă' ? 2 : 1,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {col}
                  </span>
                )
              )}
            </div>

            {/* Data rows */}
            {themeBreakdown.map((theme) => {
              const isWinner = theme.theme === bestErTheme;
              return (
                <div
                  key={theme.theme}
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: `1px solid ${colors.borderDefault}`,
                    borderLeft: isWinner
                      ? `3px solid ${colors.accentLime}`
                      : '3px solid transparent',
                    paddingLeft: isWinner ? 8 : 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 11,
                      color: isWinner ? colors.accentLime : colors.textSecondary,
                      flex: 2,
                    }}
                  >
                    {theme.theme}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 11,
                      color: colors.textMuted,
                      flex: 1,
                    }}
                  >
                    {theme.postCount}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 11,
                      color: colors.textPrimary,
                      flex: 1,
                    }}
                  >
                    {formatKpiPercent(theme.avgEr)}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 11,
                      color: colors.textPrimary,
                      flex: 1,
                    }}
                  >
                    {formatKpiPercent(theme.avgSaves)}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 11,
                      color: colors.textPrimary,
                      flex: 1,
                    }}
                  >
                    {formatKpiPercent(theme.avgSends)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
