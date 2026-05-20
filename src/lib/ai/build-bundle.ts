import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedAnalysisBundle } from './bundle-types';

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export async function buildAnalysisBundle(params: {
  accountId: string;
  userId: string;
  range: { from: string; to: string };
  supabase: SupabaseClient;
}): Promise<NormalizedAnalysisBundle> {
  const { accountId, userId, range, supabase } = params;

  // 1. Account
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .select('external_account_id, display_name, handle, provider_id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();
  if (accErr || !account) throw new Error(`Account not found: ${accErr?.message}`);

  // 2. Account snapshots for range
  const { data: snapshots } = await supabase
    .from('account_metrics_snapshots')
    .select('captured_at, followers, reach, impressions')
    .eq('account_id', accountId)
    .gte('captured_at', range.from)
    .lte('captured_at', range.to)
    .order('captured_at', { ascending: false });

  type Snapshot = { captured_at: string; followers: number | null; reach: number | null; impressions: number | null };
  // Dedupe: one per day (latest captured_at per day)
  const dailyMap = new Map<string, Snapshot>();
  for (const s of snapshots ?? []) {
    const day = s.captured_at.slice(0, 10);
    if (!dailyMap.has(day)) dailyMap.set(day, s);
  }
  const accountTimeline = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({
      date,
      followers: s.followers,
      reach: s.reach,
      impressions: s.impressions,
    }));

  const currentFollowers = snapshots?.[0]?.followers ?? null;

  // 3. Posts in range
  const { data: posts } = await supabase
    .from('posts')
    .select('id, external_post_id, published_at, media_type, caption, hashtags, thumbnail_url')
    .eq('account_id', accountId)
    .gte('published_at', range.from)
    .lte('published_at', range.to)
    .order('published_at', { ascending: false });

  const postList = posts ?? [];
  const postIds = postList.map((p) => p.id);

  // 4. Latest metrics per post
  const latestMetrics = new Map<
    string,
    {
      impressions: number | null;
      reach: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
      video_views: number | null;
      engagement_rate: number | null;
    }
  >();

  if (postIds.length > 0) {
    const { data: allMetrics } = await supabase
      .from('post_metrics_snapshots')
      .select(
        'post_id, impressions, reach, likes, comments, shares, saves, video_views, engagement_rate'
      )
      .in('post_id', postIds)
      .order('captured_at', { ascending: false });

    for (const m of allMetrics ?? []) {
      if (!latestMetrics.has(m.post_id)) latestMetrics.set(m.post_id, m);
    }
  }

  // 5. Assemble posts
  const normalizedPosts = postList.map((p) => {
    const m = latestMetrics.get(p.id);
    return {
      externalId: p.external_post_id,
      publishedAt: p.published_at,
      mediaType: p.media_type,
      captionPreview: (p.caption ?? '').slice(0, 200),
      hashtags: p.hashtags ?? [],
      thumbnailUrl: p.thumbnail_url,
      metrics: {
        impressions: m?.impressions ?? null,
        reach: m?.reach ?? null,
        likes: m?.likes ?? null,
        comments: m?.comments ?? null,
        shares: m?.shares ?? null,
        saves: m?.saves ?? null,
        videoViews: m?.video_views ?? null,
        engagementRate: m?.engagement_rate ?? null,
      },
    };
  });

  // 6. Aggregates
  const erValues = normalizedPosts
    .map((p) => p.metrics.engagementRate)
    .filter((v): v is number => v !== null);
  const impValues = normalizedPosts
    .map((p) => p.metrics.impressions)
    .filter((v): v is number => v !== null);
  const sortedByER = [...normalizedPosts].sort(
    (a, b) => (b.metrics.engagementRate ?? -1) - (a.metrics.engagementRate ?? -1)
  );

  return {
    account: {
      displayName: account.display_name,
      handle: account.handle,
      platform: account.provider_id,
      currentFollowers,
    },
    dateRange: range,
    accountTimeline,
    posts: normalizedPosts,
    aggregates: {
      totalPosts: normalizedPosts.length,
      avgEngagementRate:
        erValues.length > 0
          ? erValues.reduce((a, b) => a + b, 0) / erValues.length
          : null,
      bestPostId: sortedByER[0]?.externalId ?? null,
      worstPostId: sortedByER[sortedByER.length - 1]?.externalId ?? null,
      medianImpressions: median(impValues),
    },
  };
}
