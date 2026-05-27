import type { RawPostMetrics, ComputedKpis } from './types';

const safePct = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(4));
};

export function calculatePostKpis(raw: RawPostMetrics): ComputedKpis {
  const { reach, likes, comments, saves, shares, videoViews, watchTimeSeconds, mediaType, followersAtPublish } = raw;

  const totalEngagement = (likes ?? 0) + (comments ?? 0) + (saves ?? 0) + (shares ?? 0);

  const erByReach = reach && reach > 0
    ? Number(((totalEngagement / reach) * 100).toFixed(4))
    : null;

  const isVideo = mediaType === 'video' || mediaType === 'reel';

  const avgWatchTimeSeconds = isVideo && videoViews && videoViews > 0 && watchTimeSeconds != null
    ? Number((watchTimeSeconds / videoViews).toFixed(2))
    : null;

  return {
    erByReach,
    savesPerReach: safePct(saves, reach),
    sendsPerReach: safePct(shares, reach),
    likesPerReach: safePct(likes, reach),
    saveToLikeRatio: likes && likes > 0 && saves != null
      ? Number((saves / likes).toFixed(4))
      : null,
    reachRate: safePct(reach, followersAtPublish),
    completionRate: null,
    avgWatchTimeSeconds,
  };
}
