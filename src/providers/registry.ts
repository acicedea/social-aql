import 'server-only';

// Re-exports for server-side code.
// For client-safe manifest access, import from '@/config/providers.manifests' instead.
export {
  getProviderClient,
  listProviderClients,
} from '@/config/providers.config';
