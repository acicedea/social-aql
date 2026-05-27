import { z } from 'zod';

export const platformSchema = z.enum(['meta', 'tiktok', 'x', 'youtube', 'linkedin']);

export const mediaTypeSchema = z.enum(['image', 'video', 'carousel', 'story', 'reel', 'text']);

export const dateRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const providerTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  scope: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const normalizedAccountSchema = z.object({
  externalId: z.string(),
  providerId: z.string(),
  platform: platformSchema,
  displayName: z.string(),
  handle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  followerCount: z.number().nullable(),
  followingCount: z.number().nullable(),
  postCount: z.number().nullable(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const normalizedAccountMetricsSchema = z.object({
  accountExternalId: z.string(),
  capturedAt: z.string(),
  followers: z.number().nullable(),
  reach: z.number().nullable(),
  impressions: z.number().nullable(),
  profileViews: z.number().nullable(),
  websiteClicks: z.number().nullable(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const normalizedPostSchema = z.object({
  externalId: z.string(),
  accountExternalId: z.string(),
  publishedAt: z.string(),
  mediaType: mediaTypeSchema,
  caption: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  permalink: z.string().nullable(),
  hashtags: z.array(z.string()),
  mentions: z.array(z.string()),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const normalizedPostMetricsSchema = z.object({
  postExternalId: z.string(),
  capturedAt: z.string(),
  impressions: z.number().nullable(),
  reach: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  saves: z.number().nullable(),
  videoViews: z.number().nullable(),
  watchTimeSeconds: z.number().nullable(),
  engagementRate: z.number().nullable(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
