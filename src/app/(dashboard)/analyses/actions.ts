'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runAnalysis } from '@/lib/ai/run-analysis';
import type { AiTier } from '@/ai/providers/types';

export async function runAnalysisAction(params: {
  accountId: string;
  analysisType: string;
  rangeFrom: string;
  rangeTo: string;
  overrideTier?: AiTier;
}): Promise<{ analysisId: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const result = await runAnalysis({
    analysisType: params.analysisType,
    accountId: params.accountId,
    userId: user.id,
    range: { from: params.rangeFrom, to: params.rangeTo },
    overrideTier: params.overrideTier,
    supabase,
  });

  return { analysisId: result.analysisId };
}
