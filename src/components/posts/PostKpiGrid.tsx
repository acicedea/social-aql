'use client';

import { KpiCard } from '@/components/dashboard/KpiCard';
import { BENCHMARKS, classifyKpi } from '@/lib/kpis/benchmarks';
import { formatKpiPercent, formatKpiNumber } from '@/lib/kpis/formatters';

interface PostKpis {
  er_by_reach: number | null;
  saves_per_reach: number | null;
  sends_per_reach: number | null;
  likes_per_reach: number | null;
  save_to_like_ratio: number | null;
  reach_rate: number | null;
}

interface Props {
  kpis: PostKpis;
}

export function PostKpiGrid({ kpis }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12,
      }}
    >
      <KpiCard
        eyebrow="ER · ULTIMUL SNAPSHOT"
        label="ENGAGEMENT RATE"
        value={formatKpiPercent(kpis.er_by_reach)}
        tier={classifyKpi(kpis.er_by_reach, BENCHMARKS.erByReach)}
        benchmark={BENCHMARKS.erByReach}
      />
      <KpiCard
        eyebrow="SAVES / REACH"
        label="SAVE RATE"
        value={formatKpiPercent(kpis.saves_per_reach)}
        tier={classifyKpi(kpis.saves_per_reach, BENCHMARKS.savesPerReach)}
        benchmark={BENCHMARKS.savesPerReach}
      />
      <KpiCard
        eyebrow="SHARES / REACH"
        label="SEND RATE"
        value={formatKpiPercent(kpis.sends_per_reach)}
        tier={classifyKpi(kpis.sends_per_reach, BENCHMARKS.sendsPerReach)}
        benchmark={BENCHMARKS.sendsPerReach}
      />
      <KpiCard
        eyebrow="LIKES / REACH"
        label="LIKE RATE"
        value={formatKpiPercent(kpis.likes_per_reach)}
        tier={classifyKpi(kpis.likes_per_reach, BENCHMARKS.likesPerReach)}
        benchmark={BENCHMARKS.likesPerReach}
      />
      <KpiCard
        eyebrow="SAVES / LIKES"
        label="SAVE-TO-LIKE"
        value={formatKpiNumber(kpis.save_to_like_ratio)}
        tier={classifyKpi(kpis.save_to_like_ratio, BENCHMARKS.saveToLikeRatio)}
        benchmark={BENCHMARKS.saveToLikeRatio}
      />
      <KpiCard
        eyebrow="REACH / URMĂRITORI"
        label="REACH RATE"
        value={formatKpiPercent(kpis.reach_rate)}
        tier={classifyKpi(kpis.reach_rate, BENCHMARKS.reachRate)}
        benchmark={BENCHMARKS.reachRate}
      />
    </div>
  );
}
