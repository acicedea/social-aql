import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildAccountPulse } from './account-pulse';
import { runIndustryScout } from './industry-scout';
import { detectOpportunities } from './opportunity-detector';
import { buildAgentEmailHtml } from './email-composer';
import { sendEmail } from '@/lib/email/resend-client';
import { env } from '@/lib/env';
import type { RunType, AgentRunResult } from './types';

export async function runAgent(
  userId: string,
  runType: RunType,
): Promise<AgentRunResult> {
  const startTime = Date.now();
  const supabase = createSupabaseServiceClient();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, display_name, handle')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);

  if (!accounts || accounts.length === 0) {
    throw new Error('No active Meta accounts for user');
  }

  const account = accounts[0];
  const sinceHours = runType === 'monday' ? 72 : 48;

  console.log('[agent] building account pulse...');
  const pulse = await buildAccountPulse(userId, account.id, sinceHours, supabase);

  console.log('[agent] running industry scout...');
  const { news, upcomingEvents } = await runIndustryScout(runType);

  console.log('[agent] detecting opportunities...');
  const opportunities = await detectOpportunities({
    accountId: account.id,
    userId,
    pulse,
    news,
    events: upcomingEvents,
    supabaseClient: supabase,
  });

  const { data: insight } = await supabase
    .from('agent_insights')
    .insert({
      user_id: userId,
      run_type: runType,
      account_pulse: pulse,
      industry_news: news,
      upcoming_events: upcomingEvents,
      opportunities,
      model: 'gemini-2.5-flash',
      generation_ms: Date.now() - startTime,
    })
    .select('id')
    .single();

  const insightId = insight?.id ?? '';

  let emailSent = false;
  const adminEmail = env.ADMIN_EMAIL;

  if (adminEmail) {
    const { subject, html, text } = buildAgentEmailHtml({
      runType,
      pulse,
      news,
      events: upcomingEvents,
      opportunities,
      appUrl: env.NEXT_PUBLIC_APP_URL,
    });

    const emailResult = await sendEmail({ to: adminEmail, subject, html, text });
    emailSent = emailResult.success;

    await supabase
      .from('agent_insights')
      .update({ email_sent: emailSent, email_sent_to: adminEmail })
      .eq('id', insightId);
  }

  console.log(`[agent] ${runType} run completed in ${Date.now() - startTime}ms`);

  return {
    insightId,
    accountPulse: pulse,
    industryNews: news,
    upcomingEvents,
    opportunities,
    emailSent,
    generationMs: Date.now() - startTime,
  };
}
