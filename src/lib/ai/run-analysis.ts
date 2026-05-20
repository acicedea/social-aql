import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiTier, AiGenerateInput } from '@/ai/providers/types';
import { AiProviderError } from '@/ai/providers/types';
import { getProviderForTier } from '@/ai/registry';
import { aiConfig } from '@/config/ai.config';
import { buildAnalysisBundle } from './build-bundle';
import { acquireRateLimit } from './rate-limiter';

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```markdown\s*\n?/i, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
}

export async function runAnalysis(params: {
  analysisType: string;
  accountId: string;
  userId: string;
  range: { from: string; to: string };
  overrideTier?: AiTier;
  supabase: SupabaseClient;
}): Promise<{ analysisId: string; outputMarkdown: string }> {
  const { analysisType, accountId, userId, range, overrideTier, supabase } = params;

  const definition = aiConfig.analyses[analysisType];
  if (!definition) throw new Error(`Unknown analysis type: ${analysisType}`);

  const effectiveTier = overrideTier ?? definition.tier;
  const provider = getProviderForTier(effectiveTier);

  const bundle = await buildAnalysisBundle({ accountId, userId, range, supabase });

  const userMessage = definition.userTemplate(bundle);

  const imageBlocks: Array<{ type: 'image'; imageBase64: string }> = [];
  if (definition.includeImages) {
    const topPosts = bundle.posts
      .filter((p) => p.thumbnailUrl !== null)
      .sort((a, b) => (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0))
      .slice(0, 10);

    const results = await Promise.allSettled(
      topPosts.map(async (p) => {
        const res = await fetch(p.thumbnailUrl!);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return {
          type: 'image' as const,
          imageBase64: Buffer.from(buf).toString('base64'),
        };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) imageBlocks.push(r.value);
    }
  }

  const generateInput: AiGenerateInput = {
    systemPrompt: definition.systemPrompt,
    messages: [
      {
        role: 'user',
        content:
          imageBlocks.length > 0
            ? [{ type: 'text', text: userMessage }, ...imageBlocks]
            : userMessage,
      },
    ],
    maxTokens: aiConfig.maxTokens[effectiveTier],
    temperature: aiConfig.temperature,
  };

  const persist = async (
    outputText: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    finishReason: string
  ) => {
    const clean = stripMarkdownFences(outputText);
    const { data: row } = await supabase
      .from('ai_analyses')
      .insert({
        user_id: userId,
        account_id: accountId,
        analysis_type: analysisType,
        input_range_from: range.from,
        input_range_to: range.to,
        model,
        output_markdown: clean,
        input_summary: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          finish_reason: finishReason,
        },
      })
      .select('id')
      .single();
    return { analysisId: row!.id, outputMarkdown: clean };
  };

  if (effectiveTier === 'batch') {
    let lastError: Error | null = null;
    let delay = 2000;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        acquireRateLimit(provider);
        const output = await provider.generate(generateInput);
        return await persist(
          output.text,
          output.model,
          output.inputTokens,
          output.outputTokens,
          output.finishReason
        );
      } catch (err) {
        if (err instanceof AiProviderError && err.rateLimited && attempt < 2) {
          lastError = err;
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
          continue;
        }
        throw err;
      }
    }
    throw lastError ?? new Error('Analysis failed after 3 attempts');
  } else {
    // Deep tier: fail fast
    acquireRateLimit(provider);
    const output = await provider.generate(generateInput);
    return await persist(
      output.text,
      output.model,
      output.inputTokens,
      output.outputTokens,
      output.finishReason
    );
  }
}
