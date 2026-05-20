import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';
import { metaInstagramProvider } from '@/providers/meta-instagram';
import { buildTokenForPage } from '@/providers/meta-instagram/oauth';
import { encryptJson } from '@/lib/crypto';

const REDIRECT_URI = () =>
  process.env.META_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback/meta`;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(`${origin}/accounts?error=meta_denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/accounts?error=meta_no_code`);
  }

  // CSRF: verify state
  const cookieStore = await cookies();
  const storedState = cookieStore.get('meta_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${origin}/accounts?error=meta_csrf`);
  }

  try {
    const supabase = await createSupabaseRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${origin}/login`);

    // Exchange code → user access token
    const partialToken = await metaInstagramProvider.exchangeCodeForToken({
      code,
      redirectUri: REDIRECT_URI(),
    });
    const userToken = (partialToken.raw as { userToken: string }).userToken;

    // List IG accounts
    const igAccounts = await metaInstagramProvider.listAccounts(partialToken);

    if (igAccounts.length === 0) {
      return NextResponse.redirect(`${origin}/accounts?error=meta_no_ig_account`);
    }

    if (igAccounts.length === 1) {
      const ig = igAccounts[0];
      const pageId = (ig.raw as { pageId: string }).pageId;
      const token = await buildTokenForPage(
        userToken,
        pageId,
        partialToken.expiresAt ??
          new Date(Date.now() + 5_184_000_000).toISOString()
      );

      await supabase.from('accounts').upsert(
        {
          user_id: user.id,
          provider_id: 'meta-instagram',
          external_account_id: ig.externalId,
          display_name: ig.displayName,
          handle: ig.handle,
          avatar_url: ig.avatarUrl,
          encrypted_tokens: encryptJson(token),
          status: 'active',
        },
        { onConflict: 'user_id,provider_id,external_account_id' }
      );

      const response = NextResponse.redirect(`${origin}/accounts`);
      response.cookies.delete('meta_oauth_state');
      return response;
    }

    // Multiple accounts — store options in cookie and redirect to select page
    const selectData = igAccounts.map((a) => ({
      externalId: a.externalId,
      displayName: a.displayName,
      handle: a.handle,
      pageId: (a.raw as { pageId: string }).pageId,
    }));

    const response = NextResponse.redirect(`${origin}/accounts/select`);
    response.cookies.set('meta_pending_accounts', JSON.stringify(selectData), {
      httpOnly: true,
      maxAge: 600,
    });
    response.cookies.set('meta_pending_user_token', userToken, {
      httpOnly: true,
      maxAge: 600,
    });
    response.cookies.set(
      'meta_pending_expires',
      partialToken.expiresAt ?? '',
      { httpOnly: true, maxAge: 600 }
    );
    response.cookies.delete('meta_oauth_state');
    return response;
  } catch (err) {
    console.error('[meta callback]', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${origin}/accounts?error=meta_callback_failed`);
  }
}
