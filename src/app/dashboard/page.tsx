import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H1, Body, Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { Card } from '@/components/design-system/Card';
import { DataRow } from '@/components/design-system/DataRow';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TopPostsWidget } from '@/components/dashboard/TopPostsWidget';
import { BENCHMARKS, classifyKpi } from '@/lib/kpis/benchmarks';
import { formatKpiPercent, formatLargeNumber, formatDelta } from '@/lib/kpis/formatters';
import type { TopPost } from '@/components/dashboard/TopPostsWidget';

function relativeTime(isoString: string | null): string {
  if (!isoString) return 'Nicio sincronizare încă';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Acum';
  if (mins < 60) return `Acum ${mins} minut${mins === 1 ? '' : 'e'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Acum ${hrs} or${hrs === 1 ? 'ă' : 'e'}`;
  const days = Math.floor(hrs / 24);
  return `Acum ${days} zi${days === 1 ? '' : 'le'}`;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function dayKey(isoDate: string): string {
  return isoDate.slice(0, 10);
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id, status, last_sync_at, last_sync_error')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const hasAccounts = (accounts?.length ?? 0) > 0;

  let postCount = 0;
  if (hasAccounts) {
    const accountIds = (accounts ?? []).map((a) => a.id);
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .in('account_id', accountIds.length > 0 ? accountIds : ['00000000-0000-0000-0000-000000000000']);
    postCount = count ?? 0;
  }

  const hasPosts = postCount > 0;

  // State A: no accounts
  if (!hasAccounts) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 24,
          textAlign: 'center',
        }}
      >
        <Eyebrow>DASHBOARD · STARE</Eyebrow>
        <H1 accent={{ text: 'NICIUN CONT', tone: 'coral' }}>
          NICIUN CONT CONECTAT.
        </H1>
        <Body tone="secondary">
          Conectează primul tău cont pentru a începe analiza.
        </Body>
        <Link href="/dashboard/accounts" style={{ textDecoration: 'none', marginTop: 8 }}>
          <Button variant="ghost">→ CONECTEAZĂ UN CONT</Button>
        </Link>
      </div>
    );
  }

  // State B: accounts but no posts yet
  if (!hasPosts) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          <Eyebrow>DASHBOARD · SINCRONIZARE</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H1 accent={{ text: 'ÎN CURS', tone: 'lime' }}>
              SINCRONIZARE ÎN CURS.
            </H1>
          </div>
          <div style={{ marginTop: 12 }}>
            <Body tone="secondary">
              Conturile tale sunt conectate. Datele se sincronizează în background.
              Reîmprospătează pagina în câteva minute.
            </Body>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(accounts ?? []).map((account) => (
            <DataRow
              key={account.id}
              label={account.display_name}
              description={
                <span>
                  {account.handle ?? account.provider_id}
                  <span
                    style={{
                      marginLeft: 12,
                      fontSize: 11,
                      color: colors.textMuted,
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                    }}
                  >
                    {relativeTime(account.last_sync_at)}
                  </span>
                </span>
              }
              status={account.status.toUpperCase()}
              tone={account.status === 'active' ? 'positive' : 'neutral'}
            />
          ))}
        </div>

        <Link
          href="/dashboard/accounts"
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.accentLime,
            textDecoration: 'none',
          }}
        >
          → VEZI CONTURILE
        </Link>
      </div>
    );
  }

  // State C: accounts + posts — fetch KPI data
  const accountIds = (accounts ?? []).map((a) => a.id);
  const safeAccountIds = accountIds.length > 0 ? accountIds : ['00000000-0000-0000-0000-000000000000'];

  const now30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch posts with latest metrics for last 30 days
  const { data: recentPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('*')
    .in('account_id', safeAccountIds)
    .gte('published_at', now30)
    .order('published_at', { ascending: false })
    .limit(200);

  // Fetch posts for previous 30 days (for delta)
  const { data: prevPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('er_by_reach, saves_per_reach, sends_per_reach')
    .in('account_id', safeAccountIds)
    .gte('published_at', now60)
    .lt('published_at', now30)
    .limit(200);

  const posts30 = recentPosts ?? [];
  const posts60 = prevPosts ?? [];

  // Aggregate KPIs
  const avgEr30 = avg(posts30.map((p) => p.er_by_reach));
  const avgSaves30 = avg(posts30.map((p) => p.saves_per_reach));
  const avgSends30 = avg(posts30.map((p) => p.sends_per_reach));
  const avgEr60 = avg(posts60.map((p: { er_by_reach: number | null }) => p.er_by_reach));
  const avgSaves60 = avg(posts60.map((p: { saves_per_reach: number | null }) => p.saves_per_reach));
  const avgSends60 = avg(posts60.map((p: { sends_per_reach: number | null }) => p.sends_per_reach));

  // Follower data
  const { data: followerSnap } = await supabase
    .from('account_metrics_snapshots')
    .select('followers, captured_at')
    .in('account_id', safeAccountIds)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: prevFollowerSnap } = await supabase
    .from('account_metrics_snapshots')
    .select('followers')
    .in('account_id', safeAccountIds)
    .lte('captured_at', now30)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentFollowers = followerSnap?.followers ?? null;
  const prevFollowers = prevFollowerSnap?.followers ?? null;

  // Sparkline: daily avg er_by_reach for last 30 days
  const dailyEr: Record<string, number[]> = {};
  for (const p of posts30) {
    if (p.er_by_reach == null || !p.published_at) continue;
    const key = dayKey(p.published_at);
    if (!dailyEr[key]) dailyEr[key] = [];
    dailyEr[key].push(p.er_by_reach);
  }
  const sparklineEr = Object.values(dailyEr).map((vals) => avg(vals) ?? 0);

  const dailySaves: Record<string, number[]> = {};
  for (const p of posts30) {
    if (p.saves_per_reach == null || !p.published_at) continue;
    const key = dayKey(p.published_at);
    if (!dailySaves[key]) dailySaves[key] = [];
    dailySaves[key].push(p.saves_per_reach);
  }
  const sparklineSaves = Object.values(dailySaves).map((vals) => avg(vals) ?? 0);

  // Top posts by saves_per_reach and sends_per_reach
  const topBySaves: TopPost[] = [...posts30]
    .filter((p) => p.saves_per_reach != null)
    .sort((a, b) => (b.saves_per_reach ?? 0) - (a.saves_per_reach ?? 0))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      caption: p.caption,
      media_type: p.media_type,
      published_at: p.published_at,
      theme: p.theme,
      saves_per_reach: p.saves_per_reach,
      sends_per_reach: p.sends_per_reach,
      er_by_reach: p.er_by_reach,
      reach: p.reach,
    }));

  const topBySends: TopPost[] = [...posts30]
    .filter((p) => p.sends_per_reach != null)
    .sort((a, b) => (b.sends_per_reach ?? 0) - (a.sends_per_reach ?? 0))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      caption: p.caption,
      media_type: p.media_type,
      published_at: p.published_at,
      theme: p.theme,
      saves_per_reach: p.saves_per_reach,
      sends_per_reach: p.sends_per_reach,
      er_by_reach: p.er_by_reach,
      reach: p.reach,
    }));

  // Theme distribution
  const themeCounts: Record<string, number> = {};
  for (const p of posts30) {
    const t = p.theme ?? 'other';
    themeCounts[t] = (themeCounts[t] ?? 0) + 1;
  }
  const themeEntries = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <Eyebrow>DASHBOARD · OVERVIEW · ULTIMELE 30 ZILE</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H1>OVERVIEW.</H1>
        </div>
      </div>

      {/* Row 1: 4 KPI cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <KpiCard
          eyebrow="BY REACH · ULTIMELE 30 ZILE"
          label="ENGAGEMENT RATE"
          value={formatKpiPercent(avgEr30)}
          delta={formatDelta(avgEr30, avgEr60)}
          tier={classifyKpi(avgEr30, BENCHMARKS.erByReach)}
          benchmark={BENCHMARKS.erByReach}
          sparklineData={sparklineEr}
        />
        <KpiCard
          eyebrow="SAVES / REACH · ULTIMELE 30 ZILE"
          label="SAVE RATE"
          value={formatKpiPercent(avgSaves30)}
          delta={formatDelta(avgSaves30, avgSaves60)}
          tier={classifyKpi(avgSaves30, BENCHMARKS.savesPerReach)}
          benchmark={BENCHMARKS.savesPerReach}
          sparklineData={sparklineSaves}
        />
        <KpiCard
          eyebrow="SHARES / REACH · ULTIMELE 30 ZILE"
          label="SEND RATE"
          value={formatKpiPercent(avgSends30)}
          delta={formatDelta(avgSends30, avgSends60)}
          tier={classifyKpi(avgSends30, BENCHMARKS.sendsPerReach)}
          benchmark={BENCHMARKS.sendsPerReach}
        />
        <KpiCard
          eyebrow="URMĂRITORI ACTUALI"
          label="URMĂRITORI"
          value={formatLargeNumber(currentFollowers)}
          delta={formatDelta(currentFollowers, prevFollowers)}
        />
      </div>

      {/* Row 2: Top posts widgets */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        <TopPostsWidget posts={topBySaves} metricLabel="DUPĂ SAVE RATE" metricKey="saves_per_reach" />
        <TopPostsWidget posts={topBySends} metricLabel="DUPĂ SEND RATE" metricKey="sends_per_reach" />
      </div>

      {/* Row 3: Theme distribution */}
      {themeEntries.length > 0 && (
        <Card>
          <Eyebrow tone="muted">TEME DETECTATE · ULTIMELE 30 ZILE</Eyebrow>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {themeEntries.map(([theme, count]) => (
              <div
                key={theme}
                style={{
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    color: colors.accentLime,
                  }}
                >
                  {theme.toUpperCase()}
                </span>
                <Mono tone="muted">{count} postări</Mono>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
