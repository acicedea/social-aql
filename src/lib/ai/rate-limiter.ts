import type { AiProvider } from '@/ai/providers/types';
import { AiProviderError } from '@/ai/providers/types';

interface ProviderState {
  minuteRequests: number;
  minuteResetAt: number;
  dayRequests: number;
  dayResetAt: number;
}

const state = new Map<string, ProviderState>();

function getState(id: string): ProviderState {
  if (!state.has(id)) {
    const now = Date.now();
    state.set(id, {
      minuteRequests: 0,
      minuteResetAt: now + 60_000,
      dayRequests: 0,
      dayResetAt: now + 86_400_000,
    });
  }
  return state.get(id)!;
}

export function acquireRateLimit(provider: AiProvider): void {
  const s = getState(provider.id);
  const now = Date.now();

  if (now >= s.minuteResetAt) {
    s.minuteRequests = 0;
    s.minuteResetAt = now + 60_000;
  }
  if (now >= s.dayResetAt) {
    s.dayRequests = 0;
    s.dayResetAt = now + 86_400_000;
  }

  const { requestsPerMinute, requestsPerDay } = provider.rateLimit;

  if (s.minuteRequests >= requestsPerMinute) {
    const waitSec = Math.ceil((s.minuteResetAt - now) / 1000);
    throw new AiProviderError(
      `Rate limit: ${provider.id} hit ${requestsPerMinute} RPM. Wait ${waitSec}s.`,
      { retryable: true, rateLimited: true }
    );
  }
  if (requestsPerDay !== undefined && s.dayRequests >= requestsPerDay) {
    throw new AiProviderError(
      `Daily limit: ${provider.id} hit ${requestsPerDay} req/day.`,
      { retryable: false, rateLimited: true }
    );
  }

  s.minuteRequests++;
  s.dayRequests++;
}
