import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { runAnalysis } from '@/lib/ai/run-analysis';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, user_id')
    .eq('status', 'active');

  const now = new Date().toISOString();
  const from7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const from30d = new Date(Date.now() - 30 * 86400_000).toISOString();

  const results: Array<{
    accountId: string;
    type: string;
    status: string;
    error?: string;
  }> = [];

  for (const account of accounts ?? []) {
    for (const [type, from] of [
      ['weekly_summary', from7d],
      ['top_performers', from30d],
    ] as const) {
      try {
        await runAnalysis({
          analysisType: type,
          accountId: account.id,
          userId: account.user_id,
          range: { from, to: now },
          supabase,
        });
        results.push({ accountId: account.id, type, status: 'ok' });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        results.push({ accountId: account.id, type, status: 'error', error });
      }
    }
  }

  return NextResponse.json({ results, ranAt: now });
}
