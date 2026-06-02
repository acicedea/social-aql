// Benchmarks based on Instagram 2026 research
// Sources: Metricool, inro.social, getphyllo.com

export const RETENTION_BENCHMARKS = {
  completionRate: {
    excellent: 60,
    good: 40,
    average: 25,
    poor: 15,
  },

  skipRate: {
    excellent: 20,
    good: 30,
    average: 40,
    poor: 50,
  },

  hookDrop: {
    normal: 35,
    warning: 50,
    critical: 60,
  },

  healthyRetentionCurve: {
    afterHook: 65,
    afterBodyEarly: 50,
    afterBodyMid: 40,
    atCta: 35,
  },

  hookDurationSeconds: {
    min: 3,
    optimal: 8,
    max: 12,
  },
} as const;

export function getCompletionRateHealth(
  completionRate: number,
): 'excellent' | 'good' | 'average' | 'poor' | 'critical' {
  if (completionRate >= RETENTION_BENCHMARKS.completionRate.excellent) return 'excellent';
  if (completionRate >= RETENTION_BENCHMARKS.completionRate.good) return 'good';
  if (completionRate >= RETENTION_BENCHMARKS.completionRate.average) return 'average';
  if (completionRate >= RETENTION_BENCHMARKS.completionRate.poor) return 'poor';
  return 'critical';
}

export function getHookStrength(
  hookDropPercent: number,
): 'strong' | 'average' | 'weak' {
  if (hookDropPercent <= RETENTION_BENCHMARKS.hookDrop.normal) return 'strong';
  if (hookDropPercent <= RETENTION_BENCHMARKS.hookDrop.warning) return 'average';
  return 'weak';
}
