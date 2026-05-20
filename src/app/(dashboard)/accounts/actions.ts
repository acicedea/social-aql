'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mockProvider } from '@/providers/mock';
import { encryptJson } from '@/lib/crypto';
import { syncAccount } from '@/lib/sync/sync-account';
import { metaInstagramProvider } from '@/providers/meta-instagram';

export async function connectMockProvider() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get fake token (no OAuth roundtrip for mock)
  const token = await mockProvider.exchangeCodeForToken({ code: 'mock', redirectUri: '' });
  const accounts = await mockProvider.listAccounts(token);
  const account = accounts[0];

  // Upsert account row
  const { data: inserted, error } = await supabase
    .from('accounts')
    .upsert(
      {
        user_id: user.id,
        provider_id: mockProvider.id,
        external_account_id: account.externalId,
        display_name: account.displayName,
        handle: account.handle,
        avatar_url: account.avatarUrl,
        encrypted_tokens: encryptJson(token),
        status: 'active',
      },
      { onConflict: 'user_id,provider_id,external_account_id' }
    )
    .select()
    .single();

  if (error || !inserted) {
    console.error('Failed to connect mock provider:', error);
    redirect('/accounts?error=connect_failed');
  }

  // Trigger immediate sync
  try {
    await syncAccount(inserted.id, user.id);
  } catch (err) {
    console.error('Initial sync failed (non-fatal):', err);
  }

  redirect('/accounts');
}

export async function getMetaAuthUrl(): Promise<string> {
  const { cookies } = await import('next/headers');
  const { randomBytes } = await import('crypto');
  const state = randomBytes(16).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('meta_oauth_state', state, { httpOnly: true, maxAge: 600 });
  return metaInstagramProvider.buildAuthUrl({
    state,
    redirectUri:
      process.env.META_REDIRECT_URI ??
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback/meta`,
  });
}
