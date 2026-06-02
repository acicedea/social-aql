import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/platform/tokens';
import { Eyebrow, H2, Body, Mono } from '@/components/design-system/Typography';
import { Card } from '@/components/design-system/Card';
import { Tag } from '@/components/design-system/Tag';
import { PostKpiGrid } from '@/components/posts/PostKpiGrid';
import { PostMetricsTimeline } from '@/components/posts/PostMetricsTimeline';
import { formatLargeNumber } from '@/lib/kpis/formatters';
import { extractHook, classifyHookType, classifyCaptionLength, countCaptionWords, detectSaveCta } from '@/lib/content-analysis/caption-utils';
import { runPostDiagnostics } from '@/lib/diagnostics/post-diagnostics';
import { PostDiagnosticChecklist } from '@/components/posts/PostDiagnosticChecklist';
import { TranscriptSection } from '@/components/posts/TranscriptSection';
import { isEnabled } from '@/lib/modules';
import { isAdmin } from '@/lib/roles';
import { computeTranscriptMetrics } from '@/lib/transcription/transcript-metrics';
import { PostCritiqueSection } from '@/components/posts/PostCritiqueSection';
import type { PostDiagnosticInput } from '@/lib/diagnostics/post-diagnostics';
import type { TranscriptionSegment } from '@/lib/transcription/types';
import type { TranscriptMetrics } from '@/lib/transcription/transcript-metrics-types';
import type { PostCritique } from '@/lib/transcription/post-critique';
import { analyzeRetention } from '@/lib/retention/retention-analyzer';
import { RetentionDiagnosticCard } from '@/components/posts/RetentionDiagnosticCard';

const THEME_LABELS: Record<string, string> = {
  fed: 'FED · Politică Monetară',
  crypto: 'Crypto · Digital Assets',
  stocks_us: 'Acțiuni SUA · Wall Street',
  gold: 'Aur · Metale Prețioase',
  forex: 'Forex · Valute',
  real_estate: 'Imobiliare · Locuințe',
  economy_eu: 'Economie UE · BCE',
  macro: 'Macro · Economia Globală',
  other: 'Other',
};

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  function safeAvg(values: Array<number | null | undefined>): number | null {
    const valid = values.filter((v): v is number => v != null && v > 0);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch post via the view (RLS enforced via underlying posts table)
  const { data: post, error } = await supabase
    .from('posts_with_latest_metrics')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !post) {
    redirect('/dashboard/posts?error=post_not_found');
  }

  // Fetch all metric snapshots for timeline
  const { data: snapshots } = await supabase
    .from('post_metrics_snapshots')
    .select('captured_at, reach, er_by_reach, saves_per_reach, sends_per_reach')
    .eq('post_id', id)
    .order('captured_at', { ascending: true });

  // Account averages for benchmarking
  const { data: accountPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('er_by_reach, saves_per_reach, sends_per_reach, caption')
    .eq('account_id', (post as Record<string, unknown>).account_id as string)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0)
    .limit(100);

  const avgEr = safeAvg((accountPosts ?? []).map(r => r.er_by_reach));
  const avgSaves = safeAvg((accountPosts ?? []).map(r => r.saves_per_reach));
  const avgSends = safeAvg((accountPosts ?? []).map(r => r.sends_per_reach));

  // Best hook type: most frequent among top 30% by ER
  let accountBestHookType: string | null = null;
  if (accountPosts && accountPosts.length >= 5) {
    const sorted = [...accountPosts]
      .filter(p => p.er_by_reach != null)
      .sort((a, b) => (b.er_by_reach ?? 0) - (a.er_by_reach ?? 0));
    const topN = sorted.slice(0, Math.max(3, Math.floor(sorted.length * 0.3)));
    const hookMap = new Map<string, number>();
    for (const p of topN) {
      const ht = classifyHookType(p.caption);
      hookMap.set(ht, (hookMap.get(ht) ?? 0) + 1);
    }
    accountBestHookType = [...hookMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  const p = post as Record<string, unknown>;
  const hashtags: string[] = Array.isArray(post.hashtags) ? (post.hashtags as string[]) : [];
  const wordCount = countCaptionWords(post.caption);
  const diagnosticInput: PostDiagnosticInput = {
    id: post.id,
    caption: post.caption,
    mediaType: post.media_type,
    theme: post.theme,
    themeSecondary: (p.theme_secondary as string | null) ?? null,
    themeConfidence: (p.theme_confidence as string | null) ?? null,
    hashtags,
    publishedAt: post.published_at,
    hook: extractHook(post.caption) || null,
    hookType: classifyHookType(post.caption),
    captionWordCount: wordCount,
    hasSaveCta: detectSaveCta(post.caption),
    hashtagCount: hashtags.length,
    captionLength: classifyCaptionLength(post.caption),
    erByReach: post.er_by_reach ?? null,
    savesPerReach: post.saves_per_reach ?? null,
    sendsPerReach: post.sends_per_reach ?? null,
    reach: post.reach ?? null,
    likes: (p.likes as number | null) ?? null,
    saves: (p.saves as number | null) ?? null,
    shares: (p.shares as number | null) ?? null,
    comments: (p.comments as number | null) ?? null,
    videoViews: (p.video_views as number | null) ?? null,
    watchTimeSeconds: (p.watch_time_seconds as number | null) ?? null,
    saveToLikeRatio: post.save_to_like_ratio ?? null,
    completionRate: (p.completion_rate as number | null) ?? null,
    reachRate: post.reach_rate ?? null,
    accountAvgErByReach: avgEr,
    accountAvgSavesPerReach: avgSaves,
    accountAvgSendsPerReach: avgSends,
    accountBestHookType,
  };

  const diagnosticResult = runPostDiagnostics(diagnosticInput);

  const { data: transcriptionJob } = await supabase
    .from('transcription_jobs')
    .select('status')
    .eq('post_id', post.id)
    .maybeSingle();

  // Compute transcript metrics if transcript available
  let transcriptMetrics: TranscriptMetrics | null = null;
  if (post.transcript && post.transcript_segments) {
    transcriptMetrics = computeTranscriptMetrics(
      post.transcript,
      post.transcript_segments as TranscriptionSegment[],
      (p.visual_description as string | null) ?? null,
    );
  }

  // Retention analysis (Reels/Video only)
  const isVideo = post.media_type === 'reel' || post.media_type === 'video';
  const avgWatchTimeSec = (p.avg_watch_time_seconds as number | null) ?? null;
  const watchTimeSec = (p.watch_time_seconds as number | null) ?? null;
  const retentionAnalysis = isVideo ? analyzeRetention({
    avgWatchTimeMs: avgWatchTimeSec != null ? avgWatchTimeSec * 1000 : null,
    totalWatchTimeMs: watchTimeSec != null ? watchTimeSec * 1000 : null,
    plays: (p.video_views as number | null) ?? (p.reach as number | null) ?? null,
    segments: post.transcript_segments as TranscriptionSegment[] ?? null,
    transcript: post.transcript ?? null,
    estimatedDurationSeconds: null,
  }) : null;

  // Fetch existing AI critique
  const { data: existingCritiqueRow } = await supabase
    .from('ai_analyses')
    .select('structured_output')
    .eq('analysis_type', 'post_critique')
    .contains('structured_output', { postId: post.id })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const critiqueData = existingCritiqueRow?.structured_output
    ? (existingCritiqueRow.structured_output as unknown as PostCritique)
    : null;

  const adminStatus = await isAdmin();

  const themeLabel = post.theme ? THEME_LABELS[post.theme] ?? post.theme.toUpperCase() : null;
  const themeTagVariant = post.theme_confidence === 'high' ? 'lime' : 'muted';

  const publishedDate = new Date(post.published_at).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const captionPreview = post.caption
    ? post.caption.slice(0, 60)
    : 'POSTARE FĂRĂ CAPTION';

  const eyebrowParts = [
    'POSTARE',
    post.theme?.toUpperCase(),
    post.media_type?.toUpperCase(),
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Header */}
      <div>
        <Eyebrow>{eyebrowParts}</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>{captionPreview.toUpperCase()}{post.caption && post.caption.length > 60 ? '…' : ''}</H2>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Mono tone="muted">{publishedDate}</Mono>
          {themeLabel && <Tag variant={themeTagVariant}>{themeLabel}</Tag>}
          <Mono tone="muted">REACH {formatLargeNumber(post.reach)}</Mono>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 11,
                color: colors.accentLime,
                textDecoration: 'none',
              }}
            >
              → VEZI PE INSTAGRAM
            </a>
          )}
        </div>
      </div>

      {/* Section 1: KPI Grid */}
      <div>
        <Eyebrow tone="lime">KPI · METRICI CHEIE</Eyebrow>
        <div style={{ marginTop: 16 }}>
          <PostKpiGrid
            kpis={{
              er_by_reach: post.er_by_reach,
              saves_per_reach: post.saves_per_reach,
              sends_per_reach: post.sends_per_reach,
              likes_per_reach: post.likes_per_reach,
              save_to_like_ratio: post.save_to_like_ratio,
              reach_rate: post.reach_rate,
            }}
          />
        </div>
      </div>

      {/* Section 2: Metrics timeline */}
      <div>
        <Eyebrow tone="muted">EVOLUȚIE ÎN TIMP</Eyebrow>
        <div style={{ marginTop: 16 }}>
          <PostMetricsTimeline snapshots={snapshots ?? []} />
        </div>
      </div>

      {/* Section 3: Caption + hashtags + mentions */}
      <Card>
        <Eyebrow tone="muted">CAPTION COMPLET</Eyebrow>
        <div style={{ marginTop: 12 }}>
          {post.caption ? (
            <Body>{post.caption}</Body>
          ) : (
            <Mono tone="muted">Niciun caption.</Mono>
          )}
        </div>
        {post.hashtags && post.hashtags.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {post.hashtags.map((tag: string) => (
              <Tag key={tag} variant="muted">{tag}</Tag>
            ))}
          </div>
        )}
        {post.mentions && post.mentions.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {post.mentions.map((mention: string) => (
              <Tag key={mention} variant="muted">{mention}</Tag>
            ))}
          </div>
        )}
      </Card>

      {/* Section 4: Diagnostic Checklist */}
      {isEnabled('postDiagnosticChecklist') && <PostDiagnosticChecklist result={diagnosticResult} />}

      {/* Section 5: Retention diagnostic */}
      {retentionAnalysis && (
        <RetentionDiagnosticCard analysis={retentionAnalysis} />
      )}

      {/* Section 7: Transcript */}
      <TranscriptSection
        transcript={(p.transcript as string | null) ?? null}
        segments={(p.transcript_segments as TranscriptionSegment[]) ?? null}
        visualDescription={(p.visual_description as string | null) ?? null}
        transcriptAt={(p.transcript_at as string | null) ?? null}
        model={(p.transcript_model as string | null) ?? null}
        jobStatus={transcriptionJob?.status ?? null}
      />

      {/* Section 8: AI Critique */}
      {(post.transcript || transcriptMetrics) && (
        <PostCritiqueSection
          postId={post.id}
          existingCritique={critiqueData}
          existingMetrics={transcriptMetrics}
          isAdmin={adminStatus}
        />
      )}

      {/* Footer nav */}
      <div>
        <Link
          href="/dashboard/posts"
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.accentLime,
            textDecoration: 'none',
          }}
        >
          ← ÎNAPOI LA POSTĂRI
        </Link>
      </div>
    </div>
  );
}
