import React from 'react';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { aiConfig } from '@/config/ai.config';
import { claudeProvider } from '@/ai/providers/claude';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { DataRow } from '@/components/design-system/DataRow';
import { AnalysisForm } from './AnalysisForm';

export default async function AnalysesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: accounts }, { data: analyses }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, display_name, handle')
      .eq('user_id', user!.id)
      .eq('status', 'active'),
    supabase
      .from('ai_analyses')
      .select(
        'id, analysis_type, model, created_at, account_id, input_range_from, input_range_to'
      )
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const analysisOptions = Object.values(aiConfig.analyses).map((a) => ({
    id: a.id,
    displayName: a.displayName,
    description: a.description,
    tier: a.tier,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div>
        <Eyebrow>ANALIZE · AI</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>ANALIZE AI</H2>
        </div>
      </div>

      <AnalysisForm
        accounts={accounts ?? []}
        analyses={analysisOptions}
        claudeAvailable={claudeProvider.isAvailable()}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Eyebrow>ANALIZE ANTERIOARE</Eyebrow>
        {!analyses || analyses.length === 0 ? (
          <Mono tone="muted">NICIO ANALIZĂ RULATĂ ÎNCĂ.</Mono>
        ) : (
          analyses.map((a: any) => (
            <Link key={a.id} href={`/analyses/${a.id}`} style={{ textDecoration: 'none' }}>
              <DataRow
                label={aiConfig.analyses[a.analysis_type]?.displayName ?? a.analysis_type}
                description={`${a.input_range_from?.slice(0, 10) ?? '?'} → ${a.input_range_to?.slice(0, 10) ?? '?'}`}
                status={a.model}
                tone={a.model?.includes('claude') ? 'positive' : 'neutral'}
              />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
