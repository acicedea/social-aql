import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/platform/tokens';
import { Eyebrow, H1, Body, Mono } from '@/components/design-system';
import type { ContentOpportunity } from '@/lib/agent/types';
import { Button } from '@/components/design-system/Button';
import { DataRow } from '@/components/design-system/DataRow';
import {
  fetchOverviewData,
  fetchPerformanceData,
  fetchContentData,
  fetchAiInsightsData,
  fetchUserAccounts,
  buildDashboardParams,
  type AccountOption,
} from '@/lib/dashboard/data';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

interface Props {
  searchParams: Promise<{
    account?: string;
    range?: string;
    from?: string;
    to?: string;
    tab?: string;
  }>;
}

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

function EmptyStateNoAccounts() {
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

function EmptyStateNoPosts({ account }: { account: AccountOption }) {
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
        <DataRow
          label={account.displayName}
          description={
            <span>
              {account.handle ?? account.platform}
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 11,
                  color: colors.textMuted,
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                }}
              >
                {relativeTime(account.lastSyncAt)}
              </span>
            </span>
          }
          status={account.status.toUpperCase()}
          tone={account.status === 'active' ? 'positive' : 'neutral'}
        />
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

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const accounts = await fetchUserAccounts(user.id);

  if (accounts.length === 0) {
    return <EmptyStateNoAccounts />;
  }

  const activeAccountId = params.account ?? accounts[0].id;
  const activeAccount = accounts.find(a => a.id === activeAccountId) ?? accounts[0];

  const isAllTime = params.range === 'all';
  let rangeDays = parseInt(params.range ?? '30', 10);
  if (isNaN(rangeDays) || rangeDays <= 0) rangeDays = 30;

  let dashParams = buildDashboardParams(user.id, activeAccount.id, rangeDays);

  if (isAllTime) {
    const from = '2010-01-01';
    const to = new Date().toISOString().slice(0, 10);
    dashParams = { userId: user.id, accountId: activeAccount.id, from, to, prevFrom: from, prevTo: from };
  } else if (params.from && params.to) {
    const rangeMs = new Date(params.to).getTime() - new Date(params.from).getTime();
    const prevTo = new Date(new Date(params.from).getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - rangeMs);
    dashParams = {
      userId: user.id,
      accountId: activeAccount.id,
      from: params.from,
      to: params.to,
      prevFrom: prevFrom.toISOString().slice(0, 10),
      prevTo: prevTo.toISOString().slice(0, 10),
    };
  }

  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', activeAccount.id);

  if (!count || count === 0) {
    return <EmptyStateNoPosts account={activeAccount} />;
  }

  const [overviewData, performanceData, contentData, aiInsightsData, agentResult] = await Promise.all([
    fetchOverviewData(dashParams),
    fetchPerformanceData(dashParams),
    fetchContentData(dashParams),
    fetchAiInsightsData(dashParams),
    supabase
      .from('agent_insights')
      .select('run_type, run_at, opportunities')
      .eq('user_id', user.id)
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestInsight = agentResult.data;

  const dateLabel = isAllTime
    ? 'Toate'
    : params.from && params.to
      ? `${params.from} → ${params.to}`
      : `Ultimele ${rangeDays} zile`;

  return (
    <>
      {latestInsight && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: colors.bgElevated,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <Eyebrow tone="muted">AGENT · ULTIMUL BRIEFING</Eyebrow>
            <div style={{ marginTop: 4 }}>
              <Body>
                {(latestInsight.opportunities as ContentOpportunity[])?.[0]?.title ?? 'Nicio oportunitate detectată'}
              </Body>
            </div>
            <div style={{ marginTop: 2 }}>
              <Mono tone="muted">
                {new Date(latestInsight.run_at).toLocaleDateString('ro-RO', {
                  weekday: 'short', day: 'numeric', month: 'short'
                })}
              </Mono>
            </div>
          </div>
          <Link
            href="/dashboard/agent"
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 6,
              color: colors.textSecondary,
              textDecoration: 'none',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            → TOATE BRIEFING-URILE
          </Link>
        </div>
      )}
      <DashboardShell
        account={activeAccount}
        allAccounts={accounts}
        dateRange={{ from: dashParams.from, to: dashParams.to, label: dateLabel }}
        overviewData={overviewData}
        performanceData={performanceData}
        contentData={contentData}
        aiInsightsData={aiInsightsData}
        defaultTab={params.tab ?? 'overview'}
      />
    </>
  );
}
