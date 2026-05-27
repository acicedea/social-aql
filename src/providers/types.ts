/**
 * Provider type system — two-layer split:
 *
 * ProviderManifest  — pure data, safe to pass to Client Components, serialize, log.
 * ProviderClient    — contains functions, SERVER-ONLY. Never pass to a Client Component.
 *
 * File layout convention for every provider:
 *   src/providers/{name}/manifest.ts  — exports MANIFEST constant, no 'server-only', importable anywhere
 *   src/providers/{name}/index.ts     — exports ProviderClient, first line: import 'server-only'
 */

import type {
  DateRange,
  NormalizedAccount,
  NormalizedAccountMetrics,
  NormalizedPost,
  NormalizedPostMetrics,
  Platform,
  ProviderToken,
} from '@/lib/normalized-types';

// =====================================================================
// SERIALIZABLE — Safe to pass to Client Components, store in URL state,
// log, serialize to JSON, etc. Pure data only.
// =====================================================================
export interface ProviderManifest {
  readonly id: string;
  readonly platform: Platform;
  readonly displayName: string;
  readonly description: string;
  readonly iconUrl: string | null;
  readonly oauthConfig: {
    readonly scopes: string[];
    readonly redirectPath: string;
    readonly requiresPkce: boolean;
  };
}

/**
 * ⚠️ SERVER-ONLY TYPE. Do not import this into Client Components.
 *
 * For provider display info in a Client Component, use ProviderManifest
 * and listProviderManifests() from '@/config/providers.manifests'.
 *
 * The 'server-only' guard in src/config/providers.config.ts will cause
 * a build error if a ProviderClient leaks into a client bundle.
 */
export interface ProviderClient {
  readonly manifest: ProviderManifest;

  buildAuthUrl(params: { state: string; redirectUri: string }): string;
  exchangeCodeForToken(params: { code: string; redirectUri: string }): Promise<ProviderToken>;
  refreshToken(token: ProviderToken): Promise<ProviderToken>;
  isTokenExpired(token: ProviderToken): boolean;

  listAccounts(token: ProviderToken): Promise<NormalizedAccount[]>;
  fetchAccountMetrics(
    token: ProviderToken,
    accountExternalId: string,
    range: DateRange
  ): Promise<NormalizedAccountMetrics>;
  listPosts(
    token: ProviderToken,
    accountExternalId: string,
    range: DateRange
  ): Promise<NormalizedPost[]>;
  fetchPostMetrics(token: ProviderToken, postExternalId: string): Promise<NormalizedPostMetrics>;
}
