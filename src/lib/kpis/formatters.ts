export function formatKpiPercent(value: number | null, decimals = 2): string {
  if (value == null) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function formatKpiNumber(value: number | null, decimals = 2): string {
  if (value == null) return '—';
  return value.toFixed(decimals);
}

export function formatLargeNumber(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export function formatDelta(
  current: number | null,
  previous: number | null
): { text: string; tone: 'lime' | 'coral' | 'muted' } {
  if (current == null || previous == null || previous === 0) {
    return { text: '—', tone: 'muted' };
  }
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? '+' : '';
  const tone = delta > 1 ? 'lime' : delta < -1 ? 'coral' : 'muted';
  return { text: `${sign}${delta.toFixed(1)}%`, tone };
}

export function formatRelativeTime(isoDate: string | null, locale: 'ro' | 'en' = 'ro'): string {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (locale === 'ro') {
    if (minutes < 1) return 'acum';
    if (minutes < 60) return `acum ${minutes} min`;
    if (hours < 24) return `acum ${hours}h`;
    if (days < 7) return `acum ${days} zile`;
    return date.toLocaleDateString('ro-RO');
  }
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US');
}
