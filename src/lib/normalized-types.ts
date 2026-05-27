export type Platform = 'meta' | 'tiktok' | 'x' | 'youtube' | 'linkedin';

export type MediaType = 'image' | 'video' | 'carousel' | 'story' | 'reel' | 'text';

export interface DateRange {
  from: string;
  to: string;
}

export interface ProviderToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  raw?: Record<string, unknown>;
}

export interface NormalizedAccount {
  externalId: string;
  providerId: string;
  platform: Platform;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  raw?: Record<string, unknown>;
}

export interface NormalizedAccountMetrics {
  accountExternalId: string;
  capturedAt: string;
  followers: number | null;
  reach: number | null;
  impressions: number | null;
  profileViews: number | null;
  websiteClicks: number | null;
  raw?: Record<string, unknown>;
}

export interface NormalizedPost {
  externalId: string;
  accountExternalId: string;
  publishedAt: string;
  mediaType: MediaType;
  caption: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  hashtags: string[];
  mentions: string[];
  raw?: Record<string, unknown>;
}

export interface NormalizedPostMetrics {
  postExternalId: string;
  capturedAt: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  videoViews: number | null;
  watchTimeSeconds: number | null;
  engagementRate: number | null;
  raw?: Record<string, unknown>;
}
