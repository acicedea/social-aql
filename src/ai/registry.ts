import { geminiProvider } from './providers/gemini';
import { claudeProvider } from './providers/claude';
import type { AiProvider, AiTier } from './providers/types';
import { AiProviderError } from './providers/types';

export const aiProviders: AiProvider[] = [geminiProvider, claudeProvider];

export function getAiProvider(id: string): AiProvider | undefined {
  return aiProviders.find((p) => p.id === id);
}

export function getProviderForTier(tier: AiTier): AiProvider {
  const provider = aiProviders.find((p) => p.tier === tier && p.isAvailable());
  if (!provider) {
    throw new AiProviderError(
      `No available AI provider for tier "${tier}". Check that the required API key is set.`,
      { retryable: false, rateLimited: false }
    );
  }
  return provider;
}

export function getDefaultAiProvider(): AiProvider {
  return getProviderForTier('batch');
}
