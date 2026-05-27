'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { backfillThemesForUser } from '@/lib/themes/backfill-themes';

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
