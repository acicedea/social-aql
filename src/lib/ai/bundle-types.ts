export interface NormalizedAnalysisBundle {
  account: {
    displayName: string;
    handle: string | null;
    platform: string;
    currentFollowers: number | null;
  };
  dateRange: { from: string; to: string };
  accountTimeline: Array<{
    date: string;
    followers: number | null;
    reach: number | null;
    impressions: number | null;
  }>;
  posts: Array<{
    externalId: string;
    publishedAt: string;
    mediaType: string;
    captionPreview: string;
    hashtags: string[];
    thumbnailUrl: string | null;
    metrics: {
      impressions: number | null;
      reach: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
      videoViews: number | null;
      engagementRate: number | null;
    };
  }>;
  aggregates: {
    totalPosts: number;
    avgEngagementRate: number | null;
    bestPostId: string | null;
    worstPostId: string | null;
    medianImpressions: number | null;
  };
}
