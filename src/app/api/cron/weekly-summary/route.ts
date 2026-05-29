import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { runAnalysis } from '@/ai/analyses/runner';
import { env } from '@/lib/env';

// Vercel Cron: Wednesday 16:00 UTC = 19:00 EEST (summer) / 18:00 EET (winter)
// Schedule: "0 16 * * 3"
// Authorization: Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let supabase: ReturnType<typeof createSupabaseServiceClient>;
  try {
    supabase = createSupabaseServiceClient();
  } catch {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, user_id')
    .eq('status', 'active');

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: 'no accounts to process', processed: 0 });
  }

  const results: Array<{ accountId: string; status: string; error?: string }> = [];

  // Sequential to avoid rate limits. At POC scale (1-5 accounts) this is fine.
  // For many accounts, move to a queue-based approach.
  for (const account of accounts) {
    try {
      const result = await runAnalysis({
        userId: account.user_id,
        accountId: account.id,
        analysisType: 'weekly_summary',
        triggerSource: 'cron',
      });
      results.push({ accountId: account.id, status: result.status, error: result.error });
    } catch (err) {
      results.push({ accountId: account.id, status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
