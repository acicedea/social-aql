'use client';

import { KpiSparkline } from '@/components/dashboard/KpiSparkline';
import { Eyebrow, Mono } from '@/components/design-system/Typography';
import { formatKpiPercent, formatLargeNumber } from '@/lib/kpis/formatters';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Snapshot {
  captured_at: string;
  reach: number | null;
  er_by_reach: number | null;
  saves_per_reach: number | null;
  sends_per_reach: number | null;
}

interface Props {
  snapshots: Snapshot[];
}

export function PostMetricsTimeline({ snapshots }: Props) {
  if (snapshots.length <= 1) {
    return (
      <div
        style={{
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '16px 20px',
        }}
      >
        <Mono tone="muted">Sincronizează din nou pentru a vedea evoluția.</Mono>
      </div>
    );
  }

  const erValues = snapshots.map((s) => s.er_by_reach ?? 0);
  const saveValues = snapshots.map((s) => s.saves_per_reach ?? 0);
  const sendValues = snapshots.map((s) => s.sends_per_reach ?? 0);
  const reachValues = snapshots.map((s) => s.reach ?? 0);

  const rows: Array<{ label: string; values: number[]; tone: 'lime' | 'primary' | 'muted'; format: (v: number) => string }> = [
    { label: 'ER%', values: erValues, tone: 'lime', format: (v) => formatKpiPercent(v) },
    { label: 'SAVE%', values: saveValues, tone: 'primary', format: (v) => formatKpiPercent(v) },
    { label: 'SEND%', values: sendValues, tone: 'muted', format: (v) => formatKpiPercent(v) },
    { label: 'REACH', values: reachValues, tone: 'muted', format: (v) => formatLargeNumber(v) },
  ];

  const last = snapshots[snapshots.length - 1];
  const first = snapshots[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Eyebrow>EVOLUȚIE · {snapshots.length} SNAPSHOT-URI</Eyebrow>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {rows.map(({ label, values, tone, format }) => (
          <div
            key={label}
            style={{
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 6,
              padding: '12px 16px',
              background: colors.bgCard,
            }}
          >
            <Mono tone="muted">{label}</Mono>
            <div style={{ marginTop: 4 }}>
              <KpiSparkline values={values} tone={tone} height={28} />
            </div>
            <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color: colors.textMuted }}>
                {new Date(first.captured_at).toLocaleDateString('ro-RO')}
              </span>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color: colors.accentLime }}>
                {format(values[values.length - 1])} · {new Date(last.captured_at).toLocaleDateString('ro-RO')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
