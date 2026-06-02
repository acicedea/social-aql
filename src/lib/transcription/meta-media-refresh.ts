import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { decryptJson } from '@/lib/crypto';
import { graphRequest } from '@/providers/meta-instagram/graph-client';
import type { ProviderToken } from '@/lib/normalized-types';

export async function fetchFreshMediaUrl(
  accountId: string,
  externalPostId: string
): Promise<string | null> {
  const supabase = createSupabaseServiceClient();

  try {
    console.log(`[meta-refresh] fetching fresh URL for post ${externalPostId}`);

    // Fetch account with encrypted token
    const { data: account, error } = await supabase
      .from('accounts')
      .select('encrypted_tokens')
      .eq('id', accountId)
      .single();

    if (error || !account) {
      console.error('[meta-refresh] account not found:', accountId);
      return null;
    }

    console.log(`[meta-refresh] account found, decrypting token`);
    // Decrypt token
    const token = decryptJson<ProviderToken>(account.encrypted_tokens);

    console.log(`[meta-refresh] calling Meta API to get fresh media_url`);
    // Fetch fresh media_url from Meta API
    const media = await graphRequest<{ media_url?: string }>(
      `/${externalPostId}`,
      { fields: 'media_url' },
      token.accessToken
    );

    const result = media.media_url ?? null;
    console.log(`[meta-refresh] got fresh URL:`, result ? 'success' : 'no url returned');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[meta-refresh] failed to fetch fresh URL:', message);
    return null;
  }
}
