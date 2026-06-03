import React from 'react';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { getCurrentUserRole } from '@/lib/roles';
import { Eyebrow, H1, Body, Mono } from '@/components/design-system/Typography';
import { RunAnalysisButton } from '@/components/analyses/RunAnalysisButton';
import { AnalysisCard } from '@/components/analyses/AnalysisCard';
import { colors } from '@/themes/platform/tokens';
import { isEnabled } from '@/lib/modules';
import type { AnalysisType } from '@/ai/analyses/types';

const ALL_ANALYSIS_TYPES: Array<{
  id: AnalysisType;
  moduleKey: 'weeklySummary' | 'contentPatterns' | 'contentIdeation';
  displayName: string;
  description: string;
}> = [
  {
    id: 'weekly_summary',
    moduleKey: 'weeklySummary',
    displayName: 'SUMAR SĂPTĂMÂNAL',
    description: 'Ce a funcționat această săptămână, comparație cu săptămâna precedentă, 3 recomandări concrete.',
  },
  {
    id: 'content_patterns',
    moduleKey: 'contentPatterns',
    displayName: 'TIPARE DE CONȚINUT',
    description: 'Ce caracteristici au postările de top: timing, format, temă, lungime caption, hashtag-uri.',
  },
  {
    id: 'content_ideation',
    moduleKey: 'contentIdeation',
    displayName: 'IDEI DE CONȚINUT',
    description: 'Sugestii noi de postări cu hook-uri în română, bazate pe ce a performat cel mai bine.',
  },
];

const ANALYSIS_TYPES = ALL_ANALYSIS_TYPES.filter((t) => isEnabled(t.moduleKey));

export default async function AnalysesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseServiceClient();
  const [userProfile, { data: accounts }, { data: analyses }] = await Promise.all([
    getCurrentUserRole(),
    db
      .from('accounts')
      .select('id, display_name, handle')
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    db
      .from('ai_analyses')
      .select('id, analysis_type, status, created_at, structured_output, error_message')
      .neq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const adminUser = userProfile?.role === 'admin';
  const defaultAccount = accounts?.[0];
  const hasAccounts = (accounts?.length ?? 0) > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div>
        <Eyebrow>ANALIZE · AI</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H1>ANALIZE.</H1>
        </div>
      </div>

      {/* Generate section — admin only */}
      {adminUser && <div>
        <Eyebrow tone="muted">GENEREAZĂ ANALIZĂ NOUĂ</Eyebrow>
        {!hasAccounts ? (
          <div style={{ marginTop: 12 }}>
            <Mono tone="muted">
              NICIUN CONT CONECTAT.{' '}
              <a href="/dashboard/accounts" style={{ color: colors.accentLime }}>
                CONECTEAZĂ UN CONT →
              </a>
            </Mono>
          </div>
        ) : (
          <>
            {(accounts?.length ?? 0) > 1 && (
              <div style={{ marginTop: 8, marginBottom: 16 }}>
                <Mono tone="muted">
                  CONT: {defaultAccount?.display_name}
                  {defaultAccount?.handle ? ` (@${defaultAccount.handle})` : ''}
                </Mono>
              </div>
            )}
            <div
              style={{
                marginTop: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              {ANALYSIS_TYPES.map((type) => (
                <div
                  key={type.id}
                  style={{
                    background: colors.bgCard,
                    border: `1px solid ${colors.borderDefault}`,
                    borderRadius: 6,
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <Eyebrow tone="lime">{type.displayName}</Eyebrow>
                  <Body tone="secondary">{type.description}</Body>
                  <RunAnalysisButton
                    analysisType={type.id}
                    accountId={defaultAccount!.id}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>}

      {/* History */}
      <div>
        <Eyebrow tone="muted">ISTORIC ANALIZE</Eyebrow>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!analyses || analyses.length === 0 ? (
            <Mono tone="muted">NICIO ANALIZĂ RULATĂ ÎNCĂ.</Mono>
          ) : (
            analyses.map((a) => (
              <AnalysisCard
                key={a.id}
                id={a.id}
                analysisType={a.analysis_type as AnalysisType}
                status={a.status as 'pending' | 'running' | 'completed' | 'failed'}
                createdAt={a.created_at}
                structuredOutput={a.structured_output}
                errorMessage={a.error_message}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
