// Intentionally NO 'server-only' — safe to import from Client Components,
// Server Components, and Server Actions.
import type { ProviderManifest } from '@/providers/types';
import { META_INSTAGRAM_PROVIDER_MANIFEST } from '@/providers/meta-instagram/manifest';

export const PROVIDER_MANIFESTS: readonly ProviderManifest[] = [META_INSTAGRAM_PROVIDER_MANIFEST];

export function getProviderManifest(id: string): ProviderManifest | undefined {
  return PROVIDER_MANIFESTS.find((m) => m.id === id);
}

export function listProviderManifests(): readonly ProviderManifest[] {
  return PROVIDER_MANIFESTS;
}
