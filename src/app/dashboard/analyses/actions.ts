'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runAnalysis } from '@/ai/analyses/runner';
import type { AnalysisType } from '@/ai/analyses/types';

export async function runAnalysisAction(
  analysisType: AnalysisType,
  accountId: string
): Promise<{ success: true; analysisId: string } | { success: false; error: string }> {
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
  if (!account) return { success: false, error: 'account_not_found' };

  const result = await runAnalysis({
    userId: user.id,
    accountId,
    analysisType,
    triggerSource: 'manual',
  });

  if (result.status === 'failed') {
    return { success: false, error: result.error ?? 'analysis_failed' };
  }

  revalidatePath('/dashboard/analyses');
  revalidatePath('/dashboard');
  return { success: true, analysisId: result.analysisId };
}
