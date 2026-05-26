import type { ProviderToken } from '@/lib/normalized-types';
import type { MetaTokenBundle } from './types';
import { graphRequest } from './graph-client';

const APP_ID = () => process.env.META_APP_ID!;
const APP_SECRET = () => process.env.META_APP_SECRET!;
const GRAPH_VERSION = () => process.env.META_GRAPH_API_VERSION ?? 'v21.0';
const BASE = () => `https://graph.facebook.com/${GRAPH_VERSION()}`;

const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

export function buildAuthUrl(params: { state: string; redirectUri: string }): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION()}/dialog/oauth`);
  url.searchParams.set('client_id', APP_ID());
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', params.state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

async function exchangeShortToLong(
  shortToken: string
): Promise<{ token: string; expiresIn: number }> {
  const url = new URL(`${BASE()}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', APP_ID());
  url.searchParams.set('client_secret', APP_SECRET());
  url.searchParams.set('fb_exchange_token', shortToken);

  const res = await fetch(url.toString());
  const json = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    error?: unknown;
  };
  if (json.error) throw new Error(`Token exchange failed: ${JSON.stringify(json.error)}`);
  return { token: json.access_token, expiresIn: json.expires_in ?? 5184000 };
}

async function getPageToken(userToken: string, pageId: string): Promise<string> {
  const pages = await graphRequest<{ data: Array<{ id: string; access_token: string }> }>(
    '/me/accounts',
    { fields: 'id,access_token' },
    userToken
  );
  const page = pages.data.find((p) => p.id === pageId);
  if (!page) throw new Error(`Page ${pageId} not found in user accounts`);
  return page.access_token;
}

export async function exchangeCodeForToken(params: {
  code: string;
  redirectUri: string;
}): Promise<{ userToken: string; expiresAt: string }> {
  // Step 1: short-lived token
  const shortUrl = new URL(`${BASE()}/oauth/access_token`);
  shortUrl.searchParams.set('client_id', APP_ID());
  shortUrl.searchParams.set('client_secret', APP_SECRET());
  shortUrl.searchParams.set('redirect_uri', params.redirectUri);
  shortUrl.searchParams.set('code', params.code);

  const shortRes = await fetch(shortUrl.toString());
  const shortJson = (await shortRes.json()) as {
    access_token: string;
    error?: unknown;
  };
  if (shortJson.error)
    throw new Error(`Code exchange failed: ${JSON.stringify(shortJson.error)}`);

  // Step 2: long-lived
  const { token: userToken, expiresIn } = await exchangeShortToLong(shortJson.access_token);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return { userToken, expiresAt };
}

export async function buildTokenForPage(
  userToken: string,
  pageId: string,
  expiresAt: string
): Promise<ProviderToken> {
  const pageToken = await getPageToken(userToken, pageId);
  const bundle: MetaTokenBundle = {
    userAccessToken: userToken,
    pageAccessToken: pageToken,
    pageId,
    expiresAt,
  };
  return {
    accessToken: pageToken,
    refreshToken: userToken,
    expiresAt,
    raw: bundle as unknown as Record<string, unknown>,
  };
}

export async function refreshUserToken(
  userToken: string
): Promise<{ token: string; expiresAt: string }> {
  const { token, expiresIn } = await exchangeShortToLong(userToken);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { token, expiresAt };
}
