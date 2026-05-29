import 'server-only';
import { getDefaultAiProvider } from '@/ai/registry';
import { AiProviderError } from '@/ai/providers/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildWeeklyData, buildPatternsData, buildIdeationData } from './data-builders';
import { WEEKLY_SUMMARY_SYSTEM_PROMPT, buildWeeklySummaryPrompt } from './weekly-summary';
import { CONTENT_PATTERNS_SYSTEM_PROMPT, buildContentPatternsPrompt } from './content-patterns';
import { CONTENT_IDEATION_SYSTEM_PROMPT, buildContentIdeationPrompt } from './content-ideation';
import { WEEKLY_SUMMARY_SCHEMA, CONTENT_PATTERNS_SCHEMA, CONTENT_IDEATION_SCHEMA } from './schemas';
import type { AnalysisType } from './types';

export interface RunResult {
  analysisId: string;
  status: 'completed' | 'failed';
  error?: string;
}

export async function runAnalysis(params: {
  userId: string;
  accountId: string;
  analysisType: AnalysisType;
  triggerSource: 'manual' | 'cron';
}): Promise<RunResult> {
  const { userId, accountId, analysisType, triggerSource } = params;
  const supabase = await createSupabaseServerClient();
  const provider = getDefaultAiProvider();
  const startTime = Date.now();

  const { data: record, error: insertErr } = await supabase
    .from('ai_analyses')
    .insert({
      user_id: userId,
      account_id: accountId,
      analysis_type: analysisType,
      status: 'running',
      trigger_source: triggerSource,
      model: provider.model,
      output_markdown: '',
    })
    .select('id')
    .single();

  if (insertErr || !record) {
    return { analysisId: '', status: 'failed', error: 'Failed to create analysis record' };
  }

  try {
    let systemPrompt: string;
    let userPrompt: string;
    let schema: object;
    let rangeFrom: string | null = null;
    let rangeTo: string | null = null;

    if (analysisType === 'weekly_summary') {
      const data = await buildWeeklyData(userId, accountId);
      systemPrompt = WEEKLY_SUMMARY_SYSTEM_PROMPT;
      userPrompt = buildWeeklySummaryPrompt(data);
      schema = WEEKLY_SUMMARY_SCHEMA;
      rangeFrom = data.currentPeriod.from;
      rangeTo = data.currentPeriod.to;
    } else if (analysisType === 'content_patterns') {
      const data = await buildPatternsData(userId, accountId, 60);
      systemPrompt = CONTENT_PATTERNS_SYSTEM_PROMPT;
      userPrompt = buildContentPatternsPrompt(data);
      schema = CONTENT_PATTERNS_SCHEMA;
      rangeFrom = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
      rangeTo = new Date().toISOString().slice(0, 10);
    } else {
      const data = await buildIdeationData(userId, accountId);
      systemPrompt = CONTENT_IDEATION_SYSTEM_PROMPT;
      userPrompt = buildContentIdeationPrompt(data);
      schema = CONTENT_IDEATION_SCHEMA;
      rangeFrom = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      rangeTo = new Date().toISOString().slice(0, 10);
    }

    // Retry up to 3 times with exponential backoff for transient rate limits
    let result;
    let delay = 3000;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await provider.generate({
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.4,
          maxTokens: 65536,
          jsonMode: true,
        });
        break;
      } catch (err) {
        if (err instanceof AiProviderError && err.rateLimited && attempt < 2) {
          console.warn(`[analysis runner] rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`);
          await new Promise((r) => setTimeout(r, delay));
          delay *= 3;
          continue;
        }
        throw err;
      }
    }
    if (!result) throw new Error('Analysis failed after retries');

    const structured = result.parsed;
    const narrativeMarkdown =
      (structured as { narrative_markdown?: string }).narrative_markdown ?? '';

    await supabase
      .from('ai_analyses')
      .update({
        status: 'completed',
        structured_output: structured,
        output_markdown: narrativeMarkdown,
        input_range_from: rangeFrom,
        input_range_to: rangeTo,
        tokens_used: result.inputTokens + result.outputTokens,
        duration_ms: Date.now() - startTime,
      })
      .eq('id', record.id);

    return { analysisId: record.id, status: 'completed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analysis runner] failed:', message);
    // Delete the record so failed attempts don't accumulate in history
    await supabase.from('ai_analyses').delete().eq('id', record.id);
    return { analysisId: record.id, status: 'failed', error: message };
  }
}
