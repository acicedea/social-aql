import type { SocialProvider, OAuthConfig } from '@/providers/types';
import type {
  ProviderToken,
  NormalizedAccount,
  NormalizedAccountMetrics,
  NormalizedPost,
  NormalizedPostMetrics,
  DateRange,
} from '@/lib/normalized-types';
import type { MetaTokenBundle } from './types';
import {
  buildAuthUrl,
  exchangeCodeForToken,
  buildTokenForPage,
  refreshUserToken,
} from './oauth';
import { graphRequest, requestPaginated } from './graph-client';
import { mapAccount, mapPost, mapPostMetrics, mapAccountMetrics } from './mappers';
import { POST_METRICS_BY_TYPE, ACCOUNT_METRICS } from './insights-config';
import type { GraphPage, GraphIgAccount, GraphMedia, GraphInsight } from './types';

const oauth: OAuthConfig = {
  authUrl: 'https://www.facebook.com/dialog/oauth',
  tokenUrl: 'https://graph.facebook.com/oauth/access_token',
  scopes: [
    'instagram_basic',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
  ],
  redirectPath: '/auth/callback/meta',
  requiresPkce: false,
};

function getBundle(token: ProviderToken): MetaTokenBundle {
  return token.raw as unknown as MetaTokenBundle;
}

export const metaInstagramProvider: SocialProvider = {
  id: 'meta-instagram',
  platform: 'meta',
  displayName: 'Instagram',
  description:
    'Conectează contul tău Instagram Business sau Creator via Meta Graph API.',
  iconUrl: null,
  oauth,

  buildAuthUrl(params: { state: string; redirectUri: string }): string {
    return buildAuthUrl(params);
  },

  async exchangeCodeForToken(params: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderToken> {
    // Returns partial token — caller calls listAccounts then buildTokenForPage
    const { userToken, expiresAt } = await exchangeCodeForToken(params);
    return {
      accessToken: userToken,
      expiresAt,
      raw: { userToken, pendingPageSelection: true },
    };
  },

  async refreshToken(token: ProviderToken): Promise<ProviderToken> {
    const bundle = getBundle(token);
    const { token: newUserToken, expiresAt } = await refreshUserToken(bundle.userAccessToken);
    return buildTokenForPage(newUserToken, bundle.pageId, expiresAt);
  },

  isTokenExpired(token: ProviderToken): boolean {
    if (!token.expiresAt) return false;
    const expiresAt = new Date(token.expiresAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() >= expiresAt - sevenDays;
  },

  async listAccounts(token: ProviderToken): Promise<NormalizedAccount[]> {
    const userToken = (token.raw as { userToken: string }).userToken ?? token.accessToken;
    const pages = await graphRequest<{ data: GraphPage[] }>(
      '/me/accounts',
      { fields: 'id,name,access_token,instagram_business_account' },
      userToken
    );

    const accounts: NormalizedAccount[] = [];
    for (const page of pages.data) {
      if (!page.instagram_business_account?.id) continue;
      const igId = page.instagram_business_account.id;
      const ig = await graphRequest<GraphIgAccount>(
        `/${igId}`,
        {
          fields:
            'id,name,username,profile_picture_url,followers_count,follows_count,media_count',
        },
        page.access_token
      );
      accounts.push({
        ...mapAccount(ig),
        raw: { ...ig, pageId: page.id } as unknown as Record<string, unknown>,
      });
    }
    return accounts;
  },

  async fetchAccountMetrics(
    token: ProviderToken,
    accountExternalId: string,
    range: DateRange
  ): Promise<NormalizedAccountMetrics> {
    const bundle = getBundle(token);
    const since = Math.floor(new Date(range.from).getTime() / 1000).toString();
    const until = Math.floor(new Date(range.to).getTime() / 1000).toString();

    const [insightsRes, accountRes] = await Promise.all([
      graphRequest<{ data: GraphInsight[] }>(
        `/${accountExternalId}/insights`,
        { metric: ACCOUNT_METRICS.join(','), period: 'day', since, until },
        bundle.pageAccessToken
      ).catch(() => ({ data: [] })),
      graphRequest<{ followers_count: number }>(
        `/${accountExternalId}`,
        { fields: 'followers_count' },
        bundle.pageAccessToken
      ).catch(() => ({ followers_count: null })),
    ]);

    return mapAccountMetrics(
      accountExternalId,
      insightsRes.data,
      (accountRes as { followers_count: number | null }).followers_count ?? null
    );
  },

  async listPosts(
    token: ProviderToken,
    accountExternalId: string,
    range: DateRange
  ): Promise<NormalizedPost[]> {
    const bundle = getBundle(token);
    const all = await requestPaginated<GraphMedia>(
      `/${accountExternalId}/media`,
      {
        fields:
          'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp',
      },
      bundle.pageAccessToken
    );

    const from = new Date(range.from).getTime();
    const to = new Date(range.to).getTime();
    return all
      .filter((m) => {
        const t = new Date(m.timestamp).getTime();
        return t >= from && t <= to;
      })
      .map((m) => mapPost(m, accountExternalId));
  },

  async fetchPostMetrics(
    token: ProviderToken,
    postExternalId: string
  ): Promise<NormalizedPostMetrics> {
    const bundle = getBundle(token);

    // Determine media type first
    const mediaInfo = await graphRequest<{
      media_type: string;
      media_product_type?: string;
    }>(
      `/${postExternalId}`,
      { fields: 'media_type,media_product_type' },
      bundle.pageAccessToken
    );

    const typeKey =
      mediaInfo.media_product_type === 'REELS'
        ? 'REEL'
        : mediaInfo.media_product_type === 'STORY'
        ? 'STORY'
        : mediaInfo.media_type === 'CAROUSEL_ALBUM'
        ? 'CAROUSEL'
        : mediaInfo.media_type === 'VIDEO'
        ? 'VIDEO'
        : 'IMAGE';

    const metricsList = POST_METRICS_BY_TYPE[typeKey] ?? POST_METRICS_BY_TYPE['IMAGE'];

    // Fetch metrics — try bulk first, fall back to individual
    const values: Record<string, number | null> = {};
    try {
      const res = await graphRequest<{
        data: Array<{ name: string; values: Array<{ value: number }> }>;
      }>(
        `/${postExternalId}/insights`,
        { metric: metricsList.join(',') },
        bundle.pageAccessToken
      );
      for (const insight of res.data) {
        values[insight.name] = insight.values[0]?.value ?? null;
      }
    } catch {
      // Partial failure — try metrics individually
      for (const metric of metricsList) {
        try {
          const res = await graphRequest<{
            data: Array<{ name: string; values: Array<{ value: number }> }>;
          }>(
            `/${postExternalId}/insights`,
            { metric },
            bundle.pageAccessToken
          );
          values[metric] = res.data[0]?.values[0]?.value ?? null;
        } catch {
          values[metric] = null;
        }
      }
    }

    return mapPostMetrics(postExternalId, values, typeKey);
  },
};
