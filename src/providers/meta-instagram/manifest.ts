// No 'server-only' — manifests are safe to import anywhere.
import type { ProviderManifest } from '@/providers/types';

export const META_INSTAGRAM_PROVIDER_MANIFEST: ProviderManifest = {
  id: 'meta-instagram',
  platform: 'meta',
  displayName: 'Instagram',
  description: 'Conectează contul tău Instagram Business sau Creator via Meta Graph API.',
  iconUrl: null,
  oauthConfig: {
    scopes: [
      'instagram_basic',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ],
    redirectPath: '/auth/callback/meta',
    requiresPkce: false,
  },
};
