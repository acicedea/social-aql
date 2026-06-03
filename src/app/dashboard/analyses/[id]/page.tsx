import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { AnalysisDetail } from '@/components/analyses/AnalysisDetail';
import { colors } from '@/themes/platform/tokens';
import { Mono } from '@/components/design-system/Typography';
import type { AnalysisType } from '@/ai/analyses/types';

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseServiceClient();
  const { data: analysis } = await db
    .from('ai_analyses')
    .select('id, analysis_type, status, structured_output, output_markdown, created_at, input_range_from, input_range_to, model, tokens_used, duration_ms, error_message')
    .eq('id', id)
    .single();

  if (!analysis) notFound();

  // For post_critique, fetch post data for context
  let postData: { id: string; caption: string | null; permalink: string | null } | null = null;
  if (analysis.analysis_type === 'post_critique' && analysis.structured_output) {
    const postId = (analysis.structured_output as Record<string, unknown>).postId as string | undefined;
    if (postId) {
      const { data: post } = await db
        .from('posts_with_latest_metrics')
        .select('id, caption, permalink')
        .eq('id', postId)
        .maybeSingle();
      postData = post ?? null;
    }
  }

  if (analysis.status === 'failed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Link href="/dashboard/analyses" style={{ color: colors.textMuted, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, textDecoration: 'none' }}>
          ← ÎNAPOI LA ANALIZE
        </Link>
        <Mono tone="coral">ANALIZĂ EȘUATĂ: {analysis.error_message ?? 'Eroare necunoscută'}</Mono>
      </div>
    );
  }

  if (!analysis.structured_output) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Link href="/dashboard/analyses" style={{ color: colors.textMuted, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, textDecoration: 'none' }}>
          ← ÎNAPOI LA ANALIZE
        </Link>
        <Mono tone="muted">ÎN CURS DE PROCESARE...</Mono>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Link
        href="/dashboard/analyses"
        style={{ color: colors.textMuted, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, textDecoration: 'none' }}
      >
        ← ÎNAPOI LA ANALIZE
      </Link>

      <AnalysisDetail
        analysisType={analysis.analysis_type as AnalysisType}
        structuredOutput={analysis.structured_output}
        createdAt={analysis.created_at}
        rangeFrom={analysis.input_range_from?.slice(0, 10) ?? null}
        rangeTo={analysis.input_range_to?.slice(0, 10) ?? null}
        model={analysis.model}
        durationMs={analysis.duration_ms}
        postData={postData}
      />
    </div>
  );
}
