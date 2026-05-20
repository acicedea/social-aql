import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { AiProviderError } from '../types';
import type { AiProvider, AiGenerateInput, AiGenerateOutput, AiMessage } from '../types';

const PREFERRED = 'claude-opus-4-7';
const FALLBACK = 'claude-opus-4-6';
let resolvedModel: string | null = null;

function toAnthropicMessages(messages: AiMessage[]): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      if (typeof m.content === 'string') return { role, content: m.content } as Anthropic.MessageParam;
      const content: Anthropic.ContentBlockParam[] = [];
      for (const b of m.content) {
        if (b.type === 'text' && b.text) {
          content.push({ type: 'text' as const, text: b.text });
        } else if (b.type === 'image' && b.imageBase64) {
          content.push({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: 'image/jpeg' as const,
              data: b.imageBase64,
            },
          });
        }
      }
      return { role, content } as Anthropic.MessageParam;
    });
}

export const claudeProvider: AiProvider = {
  id: 'claude',
  displayName: 'Claude Opus 4.7',
  tier: 'deep',
  model: PREFERRED,
  supportsImages: true,
  costPerMillionInputTokens: 15,
  costPerMillionOutputTokens: 75,
  rateLimit: { requestsPerMinute: 5 },

  isAvailable(): boolean {
    return Boolean(env.ANTHROPIC_API_KEY);
  },

  async generate(input: AiGenerateInput): Promise<AiGenerateOutput> {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msgs = toAnthropicMessages(input.messages);

    const call = (model: string) =>
      client.messages.create({
        model,
        max_tokens: input.maxTokens ?? 4096,
        temperature: input.temperature ?? 0.6,
        system: input.systemPrompt,
        messages: msgs,
      });

    const normalize = (r: Anthropic.Message, model: string): AiGenerateOutput => ({
      text: r.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join(''),
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      model,
      finishReason: r.stop_reason === 'max_tokens' ? 'length' : 'stop',
      raw: r,
    });

    try {
      if (!resolvedModel) {
        try {
          const r = await call(PREFERRED);
          resolvedModel = PREFERRED;
          return normalize(r, PREFERRED);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('model') || msg.includes('404') || msg.includes('not_found')) {
            console.warn(`[claude] ${PREFERRED} unavailable, falling back to ${FALLBACK}`);
            resolvedModel = FALLBACK;
          } else {
            throw e;
          }
        }
      }
      const model = resolvedModel ?? FALLBACK;
      const r = await call(model);
      return normalize(r, model);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRate = msg.includes('429') || msg.toLowerCase().includes('rate_limit');
      throw new AiProviderError(`Claude error: ${msg}`, { retryable: isRate, rateLimited: isRate });
    }
  },
};
