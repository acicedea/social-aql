'use client';

import { Tabs } from 'antd';
import { AccountSelector } from '@/components/dashboard/AccountSelector';
import { OverviewTab } from '@/components/dashboard/tabs/OverviewTab';
import { PerformanceTab } from '@/components/dashboard/tabs/PerformanceTab';
import { ContentTab } from '@/components/dashboard/tabs/ContentTab';
import { AiInsightsTab } from '@/components/dashboard/tabs/AiInsightsTab';
import { colors } from '@/themes/platform/tokens';
import { isEnabled } from '@/lib/modules';
import type {
  AccountOption,
  OverviewData,
  PerformanceData,
  ContentData,
  AiInsightsData,
} from '@/lib/dashboard/data';

interface DashboardShellProps {
  account: AccountOption;
  allAccounts: AccountOption[];
  dateRange: { from: string; to: string; label: string };
  overviewData: OverviewData;
  performanceData: PerformanceData;
  contentData: ContentData;
  aiInsightsData: AiInsightsData;
  defaultTab: string;
  isAdmin: boolean;
}

export function DashboardShell({
  account,
  allAccounts,
  dateRange,
  overviewData,
  performanceData,
  contentData,
  aiInsightsData,
  defaultTab,
  isAdmin,
}: DashboardShellProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            DASHBOARD
          </span>
          <div style={{ marginTop: 2 }}>
            <span
              style={{
                fontFamily: 'var(--font-league-spartan)',
                fontSize: 28,
                fontWeight: 700,
                color: colors.textPrimary,
                textTransform: 'uppercase',
              }}
            >
              {account.displayName}
            </span>
            {account.handle && (
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 12,
                  color: colors.textMuted,
                  marginLeft: 12,
                }}
              >
                @{account.handle}
              </span>
            )}
          </div>
        </div>
        <AccountSelector accounts={allAccounts} activeAccountId={account.id} />
      </div>

      {/* Tabs */}
      <Tabs
        defaultActiveKey={defaultTab}
        items={[
          {
            key: 'overview',
            label: 'OVERVIEW',
            children: <OverviewTab data={overviewData} dateLabel={dateRange.label} />,
          },
          ...(isEnabled('performanceTab') ? [{
            key: 'performance',
            label: 'PERFORMANȚĂ',
            children: <PerformanceTab data={performanceData} dateLabel={dateRange.label} />,
          }] : []),
          ...(isEnabled('contentTab') ? [{
            key: 'content',
            label: 'CONȚINUT',
            children: (
              <ContentTab
                data={contentData}
                diagnostics={overviewData.diagnostics}
                accountAvgEr={overviewData.current.avgErByReach}
              />
            ),
          }] : []),
          ...(isEnabled('aiInsightsTab') ? [{
            key: 'ai',
            label: 'ANALIZE AI',
            children: <AiInsightsTab data={aiInsightsData} accountId={account.id} isAdmin={isAdmin} />,
          }] : []),
        ]}
        tabBarStyle={{
          borderBottom: `1px solid ${colors.borderDefault}`,
          marginBottom: 24,
          fontFamily: 'var(--font-jetbrains-mono)',
        }}
      />
    </div>
  );
}
