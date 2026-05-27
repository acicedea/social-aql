export interface RawPostMetrics {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  videoViews: number | null;
  watchTimeSeconds: number | null;
  mediaType: 'image' | 'video' | 'carousel' | 'story' | 'reel' | 'text';
  followersAtPublish: number | null;
}

export interface ComputedKpis {
  erByReach: number | null;
  savesPerReach: number | null;
  sendsPerReach: number | null;
  likesPerReach: number | null;
  saveToLikeRatio: number | null;
  reachRate: number | null;
  completionRate: number | null;
  avgWatchTimeSeconds: number | null;
}

export type KpiTier = 'excellent' | 'good' | 'average' | 'low';

export interface KpiBenchmark {
  excellent: number;
  good: number;
  average: number;
}
