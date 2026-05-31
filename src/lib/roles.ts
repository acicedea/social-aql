import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type UserRole = 'admin' | 'viewer';

export interface UserProfile {
  userId: string;
  role: UserRole;
  displayName: string | null;
}

/**
 * Get role of currently authenticated user.
 * Cached per request via React cache().
 * Returns null if not authenticated.
 *
 * Uses service client for the profile lookup to avoid recursive RLS on user_profiles.
 */
export const getCurrentUserRole = cache(async (): Promise<UserProfile | null> => {
  // Auth check via anon client (uses user's session cookies)
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Profile lookup via service client — bypasses RLS (server-only, safe)
  const serviceClient = createSupabaseServiceClient();
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    // Profile missing (edge case) — treat as viewer
    return { userId: user.id, role: 'viewer', displayName: null };
  }

  return {
    userId: user.id,
    role: profile.role as UserRole,
    displayName: profile.display_name,
  };
});

/** Returns true if current user is admin. */
export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentUserRole();
  return profile?.role === 'admin';
}

/**
 * Require admin. Redirects if not admin.
 * Use in server components (can redirect).
 */
export async function requireAdmin(): Promise<UserProfile> {
  const profile = await getCurrentUserRole();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin') redirect('/dashboard?error=unauthorized');
  return profile;
}

/**
 * Check admin without redirecting.
 * Use in server actions (cannot redirect).
 */
export async function checkAdmin(): Promise<
  { ok: true; profile: UserProfile } |
  { ok: false; error: 'unauthenticated' | 'forbidden' }
> {
  const profile = await getCurrentUserRole();
  if (!profile) return { ok: false, error: 'unauthenticated' };
  if (profile.role !== 'admin') return { ok: false, error: 'forbidden' };
  return { ok: true, profile };
}
