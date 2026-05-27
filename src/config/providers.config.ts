import 'server-only';
import { metaInstagramProvider } from '@/providers/meta-instagram';
import type { ProviderClient } from '@/providers/types';

const providers: ProviderClient[] = [metaInstagramProvider];

const clientById = new Map<string, ProviderClient>(
  providers.map((p) => [p.manifest.id, p])
);

export function getProviderClient(id: string): ProviderClient | undefined {
  return clientById.get(id);
}

export function listProviderClients(): ProviderClient[] {
  return providers;
}
