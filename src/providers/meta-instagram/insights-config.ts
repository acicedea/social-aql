// Meta Graph API v22 metric names per media type.
// Reference: https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-media/insights

export const POST_METRICS_BY_TYPE: Record<string, string[]> = {
  IMAGE: [
    'reach',
    'likes',
    'comments',
    'shares',
    'saved',
    'total_interactions',
    'views',
  ],
  CAROUSEL: [
    'reach',
    'likes',
    'comments',
    'shares',
    'saved',
    'total_interactions',
    'views',
  ],
  VIDEO: [
    'reach',
    'likes',
    'comments',
    'shares',
    'saved',
    'total_interactions',
    'views',
    'ig_reels_video_view_total_time',
    'ig_reels_aggregated_all_plays_count',
  ],
  REEL: [
    'reach',
    'likes',
    'comments',
    'shares',
    'saved',
    'total_interactions',
    'views',
    'ig_reels_video_view_total_time',
    'ig_reels_avg_watch_time',
  ],
  STORY: [
    'reach',
    'replies',
    'shares',
    'total_interactions',
    'views',
    'navigation',
  ],
};

export const ACCOUNT_METRICS = [
  'reach',
  'follower_count',
  'profile_views',
  'website_clicks',
  'accounts_engaged',
];
