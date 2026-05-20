import type { GraphErrorResponse } from './types';

const BASE = (version: string) => `https://graph.facebook.com/${version}`;

export class GraphApiError extends Error {
  code: number;
  retryable: boolean;
  tokenInvalid: boolean;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'GraphApiError';
    this.code = code;
    this.retryable = code === 4 || code === 17;
    this.tokenInvalid = code === 190;
  }
}

async function request<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  version = process.env.META_GRAPH_API_VERSION ?? 'v21.0'
): Promise<T> {
  const url = new URL(`${BASE(version)}${path}`);
  url.searchParams.set('access_token', accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const json = (await res.json()) as T | GraphErrorResponse;

  if ('error' in (json as object)) {
    const err = (json as GraphErrorResponse).error;
    throw new GraphApiError(
      `Meta Graph API error: ${err.message} (code ${err.code})`,
      err.code
    );
  }

  return json as T;
}

interface PaginatedResponse<T> {
  data: T[];
  paging?: { next?: string; cursors?: { after?: string } };
}

export async function requestPaginated<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  maxItems = 500
): Promise<T[]> {
  const items: T[] = [];
  const version = process.env.META_GRAPH_API_VERSION ?? 'v21.0';
  let nextUrl: string | null = null;

  const first = await request<PaginatedResponse<T>>(path, params, accessToken, version);
  items.push(...first.data);
  nextUrl = first.paging?.next ?? null;

  while (nextUrl && items.length < maxItems) {
    const res = await fetch(nextUrl);
    const page = (await res.json()) as PaginatedResponse<T>;
    if ('error' in (page as object)) break;
    items.push(...page.data);
    nextUrl = page.paging?.next ?? null;
  }

  return items.slice(0, maxItems);
}

export { request as graphRequest };
