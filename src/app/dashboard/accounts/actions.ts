'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProviderClient } from '@/config/providers.config';
import { syncAccount } from '@/lib/sync/sync-account';
import { env } from '@/lib/env';
import { checkAdmin } from '@/lib/roles';
import crypto from 'crypto';

export async function connectProviderAction(providerId: string): Promise<void> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    throw new Error(
      roleCheck.error === 'forbidden'
        ? 'Doar adminul poate conecta conturi.'
        : 'Autentificare necesară.'
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const client = getProviderClient(providerId);
  if (!client) throw new Error(`Unknown provider: ${providerId}`);

  // Build OAuth URL, persist state in cookie, redirect.
  // Cookie key must match the provider's callback route expectation.
  const state = crypto.randomBytes(32).toString('base64url');
  const cookieKey = `${providerId.replace(/-/g, '_')}_oauth_state`;
  const cookieStore = await cookies();
  cookieStore.set(cookieKey, state, { httpOnly: true, maxAge: 600 });

  const redirectUri =
    env.META_REDIRECT_URI ??
    `${env.NEXT_PUBLIC_APP_URL}${client.manifest.oauthConfig.redirectPath}`;
  const authUrl = client.buildAuthUrl({ state, redirectUri });
  redirect(authUrl);
}

export async function disconnectAccountAction(
  accountId: string,
  confirmationHandle: string
): Promise<{ success: true } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    return { success: false, error: roleCheck.error };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'unauthenticated' };
  }

  const { data: account, error: fetchErr } = await supabase
    .from('accounts')
    .select('id, handle, display_name, provider_id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !account) {
    return { success: false, error: 'not_found' };
  }

  const expected = account.handle ?? account.display_name;
  if (confirmationHandle.trim() !== expected.trim()) {
    return { success: false, error: 'confirmation_mismatch' };
  }

  const { error: deleteErr } = await supabase
    .from('accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id);

  if (deleteErr) {
    return { success: false, error: 'delete_failed' };
  }

  revalidatePath('/dashboard/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/posts');
  revalidatePath('/dashboard/analyses');

  return { success: true };
}

export async function syncAccountAction(
  accountId: string
): Promise<{ success: true; postsCount: number } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    return { success: false, error: roleCheck.error };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'unauthenticated' };

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();
  if (!account) return { success: false, error: 'not_found' };

  try {
    const result = await syncAccount(accountId, user.id);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/accounts');
    revalidatePath('/dashboard/posts');
    return { success: true, postsCount: result.postsInserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_sync_error';
    await supabase
      .from('accounts')
      .update({ last_sync_error: message })
      .eq('id', accountId);
    return { success: false, error: message };
  }
}
