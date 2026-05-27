import type {
  NormalizedAccount,
  NormalizedPost,
  NormalizedPostMetrics,
  NormalizedAccountMetrics,
} from '@/lib/normalized-types';
import type { GraphIgAccount, GraphMedia, GraphInsight } from './types';

const HASHTAG_RE = /#[\p{L}0-9_]+/gu;
const MENTION_RE = /@[\p{L}0-9_.]+/gu;

function mediaType(item: GraphMedia): NormalizedPost['mediaType'] {
  if (item.media_product_type === 'STORY') return 'story';
  if (item.media_product_type === 'REELS') return 'reel';
  if (item.media_type === 'VIDEO') return 'reel';
  if (item.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  return 'image';
}

export function mapAccount(
  ig: GraphIgAccount,
  providerId = 'meta-instagram'
): NormalizedAccount {
  return {
    externalId: ig.id,
    providerId,
    platform: 'meta',
    displayName: ig.name,
    handle: ig.username,
    avatarUrl: ig.profile_picture_url,
    followerCount: ig.followers_count,
    followingCount: ig.follows_count,
    postCount: ig.media_count,
    raw: ig as unknown as Record<string, unknown>,
  };
}

export function mapPost(item: GraphMedia, accountExternalId: string): NormalizedPost {
  const caption = item.caption ?? null;
  return {
    externalId: item.id,
    accountExternalId,
    publishedAt: item.timestamp,
    mediaType: mediaType(item),
    caption,
    mediaUrl: item.media_url ?? null,
    thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
    permalink: item.permalink,
    hashtags: caption ? (caption.match(HASHTAG_RE) ?? []) : [],
    mentions: caption ? (caption.match(MENTION_RE) ?? []) : [],
    raw: item as unknown as Record<string, unknown>,
  };
}

export function mapPostMetrics(
  postExternalId: string,
  insightValues: Record<string, number | null>,
  _mediaType: string
): NormalizedPostMetrics {
  const likes = insightValues['likes'] ?? null;
  const comments = insightValues['comments'] ?? null;
  const shares = insightValues['shares'] ?? null;
  // Meta uses 'saved' in most endpoints
  const saves = insightValues['saved'] ?? insightValues['saves'] ?? null;
  const reach = insightValues['reach'] ?? null;

  // 'impressions' deprecated in v22; use 'views' instead
  const impressions = insightValues['views'] ?? insightValues['impressions'] ?? null;

  // Watch time from Meta is in milliseconds; convert to seconds
  const watchTimeMs = insightValues['ig_reels_video_view_total_time'] ?? null;
  const watchTimeSeconds = watchTimeMs != null ? Math.round(watchTimeMs / 1000) : null;

  const videoViews =
    insightValues['ig_reels_aggregated_all_plays_count'] ??
    insightValues['video_views'] ??
    insightValues['views'] ??
    null;

  let engagementRate: number | null = null;
  if (reach && reach > 0) {
    const eng = (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0);
    engagementRate = (eng / reach) * 100;
  }

  return {
    postExternalId,
    capturedAt: new Date().toISOString(),
    impressions,
    reach,
    likes,
    comments,
    shares,
    saves,
    videoViews,
    watchTimeSeconds,
    engagementRate,
    raw: insightValues as unknown as Record<string, unknown>,
  };
}

export function mapAccountMetrics(
  accountExternalId: string,
  insights: GraphInsight[],
  currentFollowers: number | null
): NormalizedAccountMetrics {
  const latest = (name: string): number | null => {
    const insight = insights.find((i) => i.name === name);
    const vals = insight?.values ?? [];
    return vals.length > 0 ? vals[vals.length - 1].value : null;
  };

  return {
    accountExternalId,
    capturedAt: new Date().toISOString(),
    followers: currentFollowers,
    reach: latest('reach'),
    impressions: latest('impressions'),
    profileViews: latest('profile_views'),
    websiteClicks: null,
    raw: { insights },
  };
}
