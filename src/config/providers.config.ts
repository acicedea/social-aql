import { mockProvider } from '@/providers/mock';
import { metaInstagramProvider } from '@/providers/meta-instagram';
import type { SocialProvider } from '@/providers/types';

const providers: SocialProvider[] = [metaInstagramProvider];

if (process.env.NEXT_PUBLIC_ENABLE_MOCK_PROVIDER !== 'false') {
  providers.push(mockProvider);
}

export const registeredProviders = providers;

const registry = new Map(providers.map((p) => [p.id, p]));

export function getProvider(id: string): SocialProvider | undefined {
  return registry.get(id);
}

export function listProviders(): SocialProvider[] {
  return providers;
}
