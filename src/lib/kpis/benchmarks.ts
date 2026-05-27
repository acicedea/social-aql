import type { KpiBenchmark, KpiTier } from './types';

export const BENCHMARKS = {
  erByReach:      { excellent: 6,    good: 4,    average: 2    } satisfies KpiBenchmark,
  savesPerReach:  { excellent: 3,    good: 1.5,  average: 0.5  } satisfies KpiBenchmark,
  sendsPerReach:  { excellent: 1.5,  good: 0.5,  average: 0.1  } satisfies KpiBenchmark,
  likesPerReach:  { excellent: 8,    good: 4,    average: 2    } satisfies KpiBenchmark,
  reachRate:      { excellent: 30,   good: 15,   average: 8    } satisfies KpiBenchmark,
  saveToLikeRatio:{ excellent: 0.3,  good: 0.15, average: 0.05 } satisfies KpiBenchmark,
} as const;

export function classifyKpi(value: number | null, benchmark: KpiBenchmark): KpiTier | null {
  if (value == null) return null;
  if (value >= benchmark.excellent) return 'excellent';
  if (value >= benchmark.good) return 'good';
  if (value >= benchmark.average) return 'average';
  return 'low';
}

export function kpiTierColor(tier: KpiTier | null): 'lime' | 'coral' | 'muted' | 'primary' {
  switch (tier) {
    case 'excellent': return 'lime';
    case 'good':      return 'lime';
    case 'average':   return 'primary';
    case 'low':       return 'coral';
    default:          return 'muted';
  }
}
