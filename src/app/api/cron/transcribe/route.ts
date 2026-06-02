import { NextRequest, NextResponse } from 'next/server';
import { runTranscriptionWorker } from '@/lib/transcription/worker';
import { env } from '@/lib/env';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  console.log('[cron/transcribe] starting worker');
  const startTime = Date.now();

  try {
    const result = await runTranscriptionWorker();
    const duration = Date.now() - startTime;
    console.log(`[cron/transcribe] done in ${duration}ms:`, result);
    return NextResponse.json({
      success: true,
      result,
      budget: {
        used: result.budgetUsed,
        remaining: result.budgetRemaining,
        daily: 20,
      },
      durationMs: duration,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/transcribe] worker error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
