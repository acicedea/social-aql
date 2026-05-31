import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  const { token, password } = await request.json() as { token: string; password: string };

  if (!token || !password) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  let serviceSupabase: ReturnType<typeof getServiceClient>;
  try {
    serviceSupabase = getServiceClient();
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  // 1. Validate token
  const { data: invite } = await serviceSupabase
    .from('invitations')
    .select('id, email, accepted_at, expires_at, invited_by')
    .eq('token', token)
    .maybeSingle();

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  // 2. Create user account
  const { data: newUser, error: createError } = await serviceSupabase
    .auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true, // skip email verification for invited users
    });

  if (createError) {
    // User might already exist
    if (createError.message.includes('already')) {
      // Find existing user and proceed — their profile will already exist
      const { data: existingUsers } = await serviceSupabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u) => u.email === invite.email);
      if (!existingUser) {
        return NextResponse.json({ error: createError.message }, { status: 400 });
      }

      // Ensure profile exists
      const { data: profile } = await serviceSupabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', existingUser.id)
        .maybeSingle();

      if (!profile) {
        await serviceSupabase.from('user_profiles').insert({
          user_id: existingUser.id,
          role: 'viewer',
          invited_by: invite.invited_by,
        });
      }
    } else {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }
  } else if (newUser.user) {
    // Trigger handle_new_user will create the profile automatically.
    // But update invited_by to track who invited them.
    await serviceSupabase
      .from('user_profiles')
      .update({ invited_by: invite.invited_by })
      .eq('user_id', newUser.user.id);
  }

  // 3. Mark invitation as accepted
  await serviceSupabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  return NextResponse.json({ success: true, email: invite.email });
}

// GET: handles redirect for already-logged-in users
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/dashboard', request.url));

  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Mark invite as accepted
    await supabase
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('token', token)
      .is('accepted_at', null);
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
