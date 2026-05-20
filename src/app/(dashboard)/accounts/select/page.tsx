import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildTokenForPage } from '@/providers/meta-instagram/oauth';
import { encryptJson } from '@/lib/crypto';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface AccountOption {
  externalId: string;
  displayName: string;
  handle: string | null;
  pageId: string;
}

async function selectAccount(formData: FormData) {
  'use server';
  const externalId = formData.get('externalId') as string;
  const cookieStore = await cookies();
  const accountsRaw = cookieStore.get('meta_pending_accounts')?.value;
  const userToken = cookieStore.get('meta_pending_user_token')?.value;
  const expiresAt = cookieStore.get('meta_pending_expires')?.value;

  if (!accountsRaw || !userToken || !externalId)
    redirect('/accounts?error=meta_select_failed');

  const accounts: AccountOption[] = JSON.parse(accountsRaw);
  const chosen = accounts.find((a) => a.externalId === externalId);
  if (!chosen) redirect('/accounts?error=meta_select_invalid');

  const token = await buildTokenForPage(
    userToken,
    chosen.pageId,
    expiresAt ?? new Date(Date.now() + 5_184_000_000).toISOString()
  );

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await supabase.from('accounts').upsert(
    {
      user_id: user.id,
      provider_id: 'meta-instagram',
      external_account_id: chosen.externalId,
      display_name: chosen.displayName,
      handle: chosen.handle,
      avatar_url: null,
      encrypted_tokens: encryptJson(token),
      status: 'active',
    },
    { onConflict: 'user_id,provider_id,external_account_id' }
  );

  cookieStore.delete('meta_pending_accounts');
  cookieStore.delete('meta_pending_user_token');
  cookieStore.delete('meta_pending_expires');

  redirect('/accounts');
}

export default async function AccountSelectPage() {
  const cookieStore = await cookies();
  const accountsRaw = cookieStore.get('meta_pending_accounts')?.value;
  if (!accountsRaw) redirect('/accounts');

  const accounts: AccountOption[] = JSON.parse(accountsRaw);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 500 }}>
      <div>
        <Eyebrow>META · SELECTEAZĂ CONT</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>SELECTEAZĂ CONTUL INSTAGRAM</H2>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.map((a) => (
          <form key={a.externalId} action={selectAccount}>
            <input type="hidden" name="externalId" value={a.externalId} />
            <button
              type="submit"
              style={{
                width: '100%',
                background: colors.bgCard,
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 6,
                padding: '16px 20px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <Mono>{a.displayName}</Mono>
                {a.handle && (
                  <div style={{ marginTop: 4 }}>
                    <Mono tone="muted">@{a.handle}</Mono>
                  </div>
                )}
              </div>
              <Mono tone="lime">SELECTEAZĂ →</Mono>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
