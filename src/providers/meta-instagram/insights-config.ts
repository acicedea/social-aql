export const POST_METRICS_BY_TYPE: Record<string, string[]> = {
  IMAGE:    ['impressions', 'reach', 'saved', 'likes', 'comments', 'shares'],
  VIDEO:    ['impressions', 'reach', 'saved', 'likes', 'comments', 'shares', 'video_views'],
  REEL:     ['reach', 'saved', 'likes', 'comments', 'shares', 'plays', 'total_interactions'],
  CAROUSEL: ['impressions', 'reach', 'saved', 'likes', 'comments', 'shares'],
  STORY:    ['impressions', 'reach', 'replies', 'taps_forward', 'taps_back', 'exits'],
};

export const ACCOUNT_METRICS = ['impressions', 'reach', 'profile_views'];
