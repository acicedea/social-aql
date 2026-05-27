import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { aiConfig } from '@/config/ai.config';
import { Eyebrow, Mono } from '@/components/design-system/Typography';
import { AnalysisMarkdown } from '@/components/ai/AnalysisMarkdown';
import { colors } from '@/themes/ai-lichiditate/tokens';

export default async function AnalysisDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: analysis } = await supabase
    .from('ai_analyses')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user!.id)
    .single();

  if (!analysis) notFound();

  const def = aiConfig.analyses[analysis.analysis_type];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800 }}>
      <div>
        <Link
          href="/dashboard/analyses"
          style={{
            color: colors.textMuted,
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 12,
            textDecoration: 'none',
          }}
        >
          ← ÎNAPOI LA ANALIZE
        </Link>
        <div style={{ marginTop: 12 }}>
          <Eyebrow tone="lime">{def?.displayName ?? analysis.analysis_type}</Eyebrow>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
          <Mono tone="muted">
            {analysis.input_range_from?.slice(0, 10)} →{' '}
            {analysis.input_range_to?.slice(0, 10)}
          </Mono>
          <Mono tone={analysis.model?.includes('claude') ? 'lime' : 'muted'}>
            {analysis.model}
          </Mono>
          <Mono tone="muted">
            {new Date(analysis.created_at).toLocaleString('ro-RO')}
          </Mono>
        </div>
      </div>

      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '24px 28px',
        }}
      >
        <AnalysisMarkdown markdown={analysis.output_markdown} />
      </div>
    </div>
  );
}
