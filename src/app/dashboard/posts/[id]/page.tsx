import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H2, Body, Mono } from '@/components/design-system/Typography';
import { Card } from '@/components/design-system/Card';
import { Tag } from '@/components/design-system/Tag';
import { PostKpiGrid } from '@/components/posts/PostKpiGrid';
import { PostMetricsTimeline } from '@/components/posts/PostMetricsTimeline';
import { formatLargeNumber } from '@/lib/kpis/formatters';

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

      {/* Section 4: AI placeholder */}
      <Card variant="default">
        <Eyebrow tone="muted">ANALIZĂ AI · DISPONIBIL ÎN CURÂND</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <Mono tone="muted">Analiza AI per postare va fi disponibilă după integrarea cu Prompt 03b.</Mono>
        </div>
      </Card>

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
