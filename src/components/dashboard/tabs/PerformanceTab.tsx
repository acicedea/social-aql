'use client';

import React from 'react';
import { MiniChart } from '@/components/dashboard/MiniChart';
import { Eyebrow, Body, Mono } from '@/components/design-system/Typography';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { formatKpiPercent } from '@/lib/kpis/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerformanceData {
  erTimeline: Array<{ date: string; er: number | null; posts: number }>;
  reachTimeline: Array<{ date: string; reach: number }>;
  followerTimeline: Array<{ date: string; followers: number }>;
  kpiByDayOfWeek: Array<{
    day: string;
    postCount: number;
    avgEr: number | null;
    avgSaves: number | null;
    avgSends: number | null;
  }>;
  kpiByHour: Array<{ hour: number; postCount: number; avgEr: number | null }>;
  kpiByMediaType: Array<{
    mediaType: string;
    postCount: number;
    avgEr: number | null;
    avgSaves: number | null;
    avgSends: number | null;
    avgReach: number | null;
  }>;
}

interface PerformanceTabProps {
  data: PerformanceData;
  dateLabel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hourToBucket(h: number): string {
  if (h >= 6 && h < 12) return 'DIMINEAȚĂ';
  if (h >= 12 && h < 18) return 'DUPĂ-AMIAZĂ';
  if (h >= 18 && h < 22) return 'SEARĂ';
  return 'NOAPTE';
}

const BUCKET_LABELS: Record<string, string> = {
  'DIMINEAȚĂ': 'DIMINEAȚĂ 6–12',
  'DUPĂ-AMIAZĂ': 'DUPĂ-AMIAZĂ 12–18',
  'SEARĂ': 'SEARĂ 18–22',
  'NOAPTE': 'NOAPTE 22–6',
};

const TIME_BUCKETS = ['DIMINEAȚĂ', 'DUPĂ-AMIAZĂ', 'SEARĂ', 'NOAPTE'];

const sectionStyle: React.CSSProperties = {
  background: colors.bgCard,
  border: `1px solid ${colors.borderDefault}`,
  borderRadius: 6,
  padding: 16,
};

const monoStyle = (color: string = colors.textPrimary): React.CSSProperties => ({
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: 11,
  color,
});

// ─── MediaTypeCard ─────────────────────────────────────────────────────────────

interface MediaTypeCardProps {
  data: PerformanceData['kpiByMediaType'][number];
}

function MediaTypeCard({ data: mt }: MediaTypeCardProps) {
  return (
    <div
      style={{
        background: colors.bgCard,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: 6,
        padding: 12,
      }}
    >
      <Eyebrow tone="muted">{mt.mediaType.toUpperCase()}</Eyebrow>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={monoStyle(colors.textMuted)}>POSTĂRI</span>
          <span style={monoStyle()}>{mt.postCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={monoStyle(colors.textMuted)}>ER MEDIU</span>
          <span style={monoStyle(colors.accentLime)}>{formatKpiPercent(mt.avgEr)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={monoStyle(colors.textMuted)}>SAVE RATE</span>
          <span style={monoStyle()}>{formatKpiPercent(mt.avgSaves)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={monoStyle(colors.textMuted)}>SEND RATE</span>
          <span style={monoStyle()}>{formatKpiPercent(mt.avgSends)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={monoStyle(colors.textMuted)}>REACH MEDIU</span>
          <span style={monoStyle()}>
            {mt.avgReach != null ? Math.round(mt.avgReach).toLocaleString('ro-RO') : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── PerformanceTab ───────────────────────────────────────────────────────────

export function PerformanceTab({ data, dateLabel }: PerformanceTabProps) {
  // ── Section 2: Timing data ─────────────────────────────────────────────────

  const bucketData = TIME_BUCKETS.map(bucket => {
    const hours = data.kpiByHour.filter(h => hourToBucket(h.hour) === bucket);
    const totalPosts = hours.reduce((s, h) => s + h.postCount, 0);
    const allErs = hours.flatMap(h => h.avgEr != null ? [h.avgEr] : []);
    const avgEr = allErs.length > 0 ? allErs.reduce((a, b) => a + b, 0) / allErs.length : null;
    return { bucket, postCount: totalPosts, avgEr };
  });

  const maxDayEr = Math.max(
    ...data.kpiByDayOfWeek.map(d => d.avgEr ?? -Infinity)
  );
  const maxBucketEr = Math.max(
    ...bucketData.map(b => b.avgEr ?? -Infinity)
  );

  // ── Section 3: Media type comparison ──────────────────────────────────────

  const bestMediaType = data.kpiByMediaType.reduce<PerformanceData['kpiByMediaType'][number] | null>(
    (best, mt) => {
      if (mt.avgEr == null) return best;
      if (best == null || best.avgEr == null) return mt;
      return mt.avgEr > best.avgEr ? mt : best;
    },
    null
  );

  const worstMediaType = data.kpiByMediaType.reduce<PerformanceData['kpiByMediaType'][number] | null>(
    (worst, mt) => {
      if (mt.avgEr == null) return worst;
      if (worst == null || worst.avgEr == null) return mt;
      return mt.avgEr < worst.avgEr ? mt : worst;
    },
    null
  );

  const showMediaComparison =
    data.kpiByMediaType.length > 1 &&
    bestMediaType != null &&
    worstMediaType != null &&
    bestMediaType.mediaType !== worstMediaType.mediaType &&
    bestMediaType.avgEr != null &&
    worstMediaType.avgEr != null;

  const mediaComparisonPct =
    showMediaComparison && worstMediaType?.avgEr != null && worstMediaType.avgEr > 0 && bestMediaType?.avgEr != null
      ? (((bestMediaType.avgEr - worstMediaType.avgEr) / worstMediaType.avgEr) * 100).toFixed(0)
      : null;

  // ── Section 4: Growth velocity ─────────────────────────────────────────────

  const timelineLength = data.followerTimeline.length;
  const firstFollowers = data.followerTimeline[0]?.followers ?? null;
  const lastFollowers = data.followerTimeline[timelineLength - 1]?.followers ?? null;
  const gained =
    firstFollowers != null && lastFollowers != null ? lastFollowers - firstFollowers : null;
  const daysOfData = timelineLength > 0 ? timelineLength : 1;
  const perDay = gained != null ? gained / daysOfData : null;
  const proj90 = perDay != null ? Math.round(perDay * 90) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Section 1: Timeline Charts ────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Eyebrow tone="muted">EVOLUȚIE TEMPORALĂ · {dateLabel.toUpperCase()}</Eyebrow>

        {/* ER over time */}
        <div style={sectionStyle}>
          <Eyebrow tone="muted">ENGAGEMENT RATE · ZI</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <MiniChart
              data={data.erTimeline.map(d => ({ date: d.date, value: d.er }))}
              height={120}
              showAxes={true}
              showTooltip={true}
              color={colors.accentLime}
            />
          </div>
        </div>

        {/* Reach over time */}
        <div style={sectionStyle}>
          <Eyebrow tone="muted">REACH ZILNIC</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <MiniChart
              data={data.reachTimeline.map(d => ({ date: d.date, value: d.reach }))}
              height={100}
              showAxes={true}
              showTooltip={true}
              barChart={true}
              color={colors.accentLime}
            />
          </div>
        </div>

        {/* Follower growth */}
        <div style={sectionStyle}>
          <Eyebrow tone="muted">URMĂRITORI · EVOLUȚIE</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <MiniChart
              data={data.followerTimeline.map(d => ({ date: d.date, value: d.followers }))}
              height={80}
              showAxes={true}
              showTooltip={true}
              color={colors.accentLime}
            />
          </div>
        </div>
      </div>

      {/* ── Section 2: Timing ─────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <Eyebrow tone="muted">TIMING OPTIM</Eyebrow>
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          {/* By Day of Week */}
          <div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                paddingBottom: 6,
                borderBottom: `1px solid ${colors.borderDefault}`,
                marginBottom: 4,
              }}
            >
              {(['ZI', 'POSTĂRI', 'ER MEDIU'] as const).map(col => (
                <span
                  key={col}
                  style={{
                    ...monoStyle(colors.textMuted),
                    flex: col === 'ZI' ? 2 : 1,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>
            {data.kpiByDayOfWeek.map(row => {
              const isTop = row.avgEr != null && row.avgEr === maxDayEr && maxDayEr !== -Infinity;
              return (
                <div
                  key={row.day}
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '5px 0',
                    borderBottom: `1px solid ${colors.borderDefault}`,
                    borderLeft: isTop
                      ? `3px solid ${colors.accentLime}`
                      : '3px solid transparent',
                    paddingLeft: 8,
                  }}
                >
                  <span style={{ ...monoStyle(isTop ? colors.accentLime : colors.textSecondary), flex: 2 }}>
                    {row.day}
                  </span>
                  <span style={{ ...monoStyle(colors.textMuted), flex: 1 }}>
                    {row.postCount}
                  </span>
                  <span style={{ ...monoStyle(isTop ? colors.accentLime : colors.textPrimary), flex: 1 }}>
                    {formatKpiPercent(row.avgEr)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* By Time Bucket */}
          <div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                paddingBottom: 6,
                borderBottom: `1px solid ${colors.borderDefault}`,
                marginBottom: 4,
              }}
            >
              {(['INTERVAL', 'POSTĂRI', 'ER MEDIU'] as const).map(col => (
                <span
                  key={col}
                  style={{
                    ...monoStyle(colors.textMuted),
                    flex: col === 'INTERVAL' ? 2 : 1,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>
            {bucketData.map(row => {
              const isTop = row.avgEr != null && row.avgEr === maxBucketEr && maxBucketEr !== -Infinity;
              return (
                <div
                  key={row.bucket}
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '5px 0',
                    borderBottom: `1px solid ${colors.borderDefault}`,
                    borderLeft: isTop
                      ? `3px solid ${colors.accentLime}`
                      : '3px solid transparent',
                    paddingLeft: 8,
                  }}
                >
                  <span style={{ ...monoStyle(isTop ? colors.accentLime : colors.textSecondary), flex: 2 }}>
                    {BUCKET_LABELS[row.bucket]}
                  </span>
                  <span style={{ ...monoStyle(colors.textMuted), flex: 1 }}>
                    {row.postCount}
                  </span>
                  <span style={{ ...monoStyle(isTop ? colors.accentLime : colors.textPrimary), flex: 1 }}>
                    {formatKpiPercent(row.avgEr)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section 3: Format Performance ─────────────────────────────────── */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <Eyebrow tone="muted">PERFORMANȚĂ PE FORMAT</Eyebrow>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {data.kpiByMediaType.map(mt => (
            <MediaTypeCard key={mt.mediaType} data={mt} />
          ))}
        </div>
        {showMediaComparison && mediaComparisonPct != null && bestMediaType != null && (
          <div style={{ marginTop: 12 }}>
            <Body tone="secondary">
              {`${bestMediaType.mediaType.toUpperCase()} aduc ${mediaComparisonPct}% mai mult engagement față de ${worstMediaType?.mediaType.toUpperCase()}.`}
            </Body>
          </div>
        )}
      </div>

      {/* ── Section 4: Growth Velocity ────────────────────────────────────── */}
      <div style={sectionStyle}>
        <Eyebrow tone="muted">CREȘTERE URMĂRITORI</Eyebrow>
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          {/* Gained */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 10,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              CÂȘTIGAȚI ÎN PERIOADĂ
            </span>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 32,
                fontWeight: 600,
                color: gained != null && gained >= 0 ? colors.accentLime : colors.accentCoral,
                lineHeight: 1,
              }}
            >
              {gained != null
                ? gained >= 0
                  ? `+${gained}`
                  : String(gained)
                : '—'}
            </span>
          </div>

          {/* Per day */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 10,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              MEDIE / ZI
            </span>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 32,
                fontWeight: 600,
                color: perDay != null && perDay >= 0 ? colors.accentLime : colors.accentCoral,
                lineHeight: 1,
              }}
            >
              {perDay != null
                ? (perDay >= 0 ? `+${perDay.toFixed(1)}` : perDay.toFixed(1))
                : '—'}
              {perDay != null && (
                <span style={{ fontSize: 14, fontWeight: 400, color: colors.textMuted }}>
                  /zi
                </span>
              )}
            </span>
          </div>

          {/* 90-day projection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 10,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              PROIECȚIE 90 ZILE
            </span>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 32,
                fontWeight: 600,
                color: proj90 != null && proj90 >= 0 ? colors.accentLime : colors.accentCoral,
                lineHeight: 1,
              }}
            >
              {proj90 != null
                ? proj90 >= 0
                  ? `+${proj90}`
                  : String(proj90)
                : '—'}
            </span>
            {proj90 != null && (
              <Mono tone="muted">estimare liniară</Mono>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
