'use server';

import { redirect } from 'next/navigation';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';

export async function signOut() {
  const supabase = await createSupabaseRouteHandlerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
