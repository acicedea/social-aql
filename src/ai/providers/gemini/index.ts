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
    return Boolean(env.GOOGLE_AI_API_KEY);
  },

  async generate(input: AiGenerateInput): Promise<AiGenerateOutput> {
    const genAI = new GoogleGenerativeAI(env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: input.systemPrompt,
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
      const result = await model.generateContent({
        contents,
        generationConfig: {
          maxOutputTokens: input.maxTokens ?? 2048,
          temperature: input.temperature ?? 0.6,
        },
      });
      const text = result.response.text();
      const usage = result.response.usageMetadata;
      const finishReason = result.response.candidates?.[0]?.finishReason;
      return {
        text,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        model: this.model,
        finishReason: finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
        raw: result,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRate = msg.includes('429') || msg.toLowerCase().includes('quota');
      throw new AiProviderError(`Gemini error: ${msg}`, { retryable: isRate, rateLimited: isRate });
    }
  },
};
