import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@/lib/env';
import { AiProviderError } from '../types';
import type { AiProvider, AiGenerateInput, AiGenerateOutput } from '../types';

export const geminiProvider: AiProvider = {
  id: 'gemini',
  displayName: 'Gemini 2.5 Flash',
  tier: 'batch',
  model: 'gemini-2.5-flash',
  supportsImages: true,
  costPerMillionInputTokens: 0,
  costPerMillionOutputTokens: 0,
  rateLimit: { requestsPerMinute: 15, requestsPerDay: 1500 },

  isAvailable(): boolean {
    return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
  },

  async generate(input: AiGenerateInput): Promise<AiGenerateOutput> {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error('[gemini] GOOGLE_GENERATIVE_AI_API_KEY not configured');
      throw new AiProviderError('GOOGLE_GENERATIVE_AI_API_KEY is not configured', { retryable: false, rateLimited: false });
    }

    console.log('[gemini] calling model:', this.model);
    console.log('[gemini] prompt length:', input.messages.map(m => typeof m.content === 'string' ? m.content.length : 0).reduce((a, b) => a + b, 0), 'chars');
    console.log('[gemini] json mode:', input.jsonMode ?? false);

    const genAI = new GoogleGenerativeAI(env.GOOGLE_GENERATIVE_AI_API_KEY);
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: input.maxTokens ?? 2048,
      temperature: input.temperature ?? 0.6,
    };
    if (input.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }
    if (input.responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = input.responseSchema;
      console.log('[gemini] using responseSchema:', JSON.stringify(input.responseSchema).slice(0, 300));
    }

    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: input.systemPrompt,
      generationConfig: generationConfig as Parameters<typeof genAI.getGenerativeModel>[0]['generationConfig'],
    });

    const contents = input.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        if (typeof m.content === 'string') {
          return { role, parts: [{ text: m.content }] };
        }
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
        for (const block of m.content) {
          if (block.type === 'text' && block.text) {
            parts.push({ text: block.text });
          } else if (block.type === 'image' && block.imageBase64) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: block.imageBase64 } });
          }
        }
        return { role, parts };
      });

    try {
      const result = await model.generateContent({ contents });
      const text = result.response.text();
      const usage = result.response.usageMetadata;
      const finishReason = result.response.candidates?.[0]?.finishReason;
      const candidatesCount = result.response.candidates?.length ?? 0;

      console.log('[gemini] response candidates:', candidatesCount);
      console.log('[gemini] text length:', text.length, '· output tokens:', usage?.candidatesTokenCount ?? 0);

      if (!text) {
        console.error('[gemini] empty response, candidates:', JSON.stringify(result.response.candidates).slice(0, 500));
        throw new AiProviderError('Gemini returned empty response', { retryable: true, rateLimited: false });
      }

      let parsed: unknown;
      if (input.jsonMode) {
        try {
          parsed = JSON.parse(text);
        } catch {
          console.error('[gemini] JSON parse failed. Response preview:', text.slice(0, 300));
          throw new AiProviderError(`Gemini returned invalid JSON: ${text.slice(0, 200)}`, { retryable: false, rateLimited: false });
        }
      }

      return {
        text,
        parsed,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        model: this.model,
        finishReason: finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
        raw: result,
      };
    } catch (err: unknown) {
      if (err instanceof AiProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRate = msg.includes('429') || msg.toLowerCase().includes('quota');
      const isAuth = msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('api key');
      if (isAuth) {
        console.error('[gemini] auth error:', msg);
        throw new AiProviderError(`Gemini auth failed (check API key): ${msg}`, { retryable: false, rateLimited: false });
      }
      if (isRate) {
        console.warn('[gemini] rate limit hit:', msg);
        throw new AiProviderError(`Gemini rate limit: ${msg}`, { retryable: true, rateLimited: true });
      }
      console.error('[gemini] error:', msg);
      throw new AiProviderError(`Gemini error: ${msg}`, { retryable: false, rateLimited: false });
    }
  },
};
