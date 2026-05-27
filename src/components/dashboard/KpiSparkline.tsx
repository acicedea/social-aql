'use client';

interface KpiSparklineProps {
  values: number[];
  tone?: 'lime' | 'coral' | 'muted' | 'primary';
  height?: number;
}

export function KpiSparkline({ values, tone = 'primary', height = 32 }: KpiSparklineProps) {
  const finite = values.filter((v) => isFinite(v));
  if (finite.length < 2) return null;

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;
  const width = 200;

  const points = finite
    .map((v, i) => {
      const x = (i / (finite.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const strokeColor =
    tone === 'lime'  ? 'var(--color-accent-lime, #C7F84C)' :
    tone === 'coral' ? 'var(--color-accent-coral, #FF5A4E)' :
    tone === 'muted' ? 'var(--color-text-muted, #5A5A5A)' :
                       'var(--color-text-primary, #F2EFE4)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <polyline fill="none" stroke={strokeColor} strokeWidth={1.5} points={points} />
    </svg>
  );
}
