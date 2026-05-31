'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { backfillThemesForUser } from '@/lib/themes/backfill-themes';
import { checkAdmin } from '@/lib/roles';
import { env } from '@/lib/env';
import { createClient } from '@supabase/supabase-js';

export async function backfillThemesAction(): Promise<
  | {
      success: true;
      stats: {
        processed: number;
        aiClassified: number;
        keywordClassified: number;
        aiErrors: number;
        errorSamples: string[];
        errors: number;
      };
    }
  | { success: false; error: string }
> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return { success: false, error: roleCheck.error };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'unauthenticated' };

  try {
    const stats = await backfillThemesForUser(user.id);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/posts');
    revalidatePath('/dashboard/settings');
    return { success: true, stats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return { success: false, error: msg };
  }
}

// ============================================================
// Invite actions
// ============================================================

export async function inviteUserAction(
  email: string
): Promise<{ success: true; inviteUrl: string } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return { success: false, error: 'forbidden' };

  const supabase = await createSupabaseServerClient();

  // Check if pending invitation already exists for this email
  const { data: existingInvite } = await supabase
    .from('invitations')
    .select('token, expires_at')
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existingInvite) {
    const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${existingInvite.token}`;
    return { success: true, inviteUrl };
  }

  // Create new invitation
  const { data: invite, error } = await supabase
    .from('invitations')
    .insert({ email, invited_by: roleCheck.profile.userId })
    .select('token')
    .single();

  if (error || !invite) {
    return { success: false, error: 'Failed to create invitation' };
  }

  const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${invite.token}`;
  return { success: true, inviteUrl };
}

export async function revokeInviteAction(
  inviteId: string
): Promise<{ success: boolean }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return { success: false };

  const supabase = await createSupabaseServerClient();
  await supabase
    .from('invitations')
    .delete()
    .eq('id', inviteId)
    .eq('invited_by', roleCheck.profile.userId);

  return { success: true };
}

export async function removeViewerAction(
  viewerUserId: string
): Promise<{ success: boolean }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return { success: false };

  const supabase = await createSupabaseServerClient();

  const { data: targetProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', viewerUserId)
    .single();

  if (!targetProfile || targetProfile.role !== 'viewer') {
    return { success: false };
  }

  await supabase
    .from('user_profiles')
    .delete()
    .eq('user_id', viewerUserId)
    .eq('role', 'viewer');

  return { success: true };
}

export async function fetchViewersAction(): Promise<
  Array<{ userId: string; displayName: string | null; createdAt: string }>
> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, created_at')
    .eq('role', 'viewer')
    .order('created_at', { ascending: true });

  return (data ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    createdAt: r.created_at,
  }));
}

export async function fetchPendingInvitesAction(): Promise<
  Array<{ id: string; email: string; expiresAt: string; createdAt: string }>
> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('invitations')
    .select('id, email, expires_at, created_at')
    .eq('invited_by', roleCheck.profile.userId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}
