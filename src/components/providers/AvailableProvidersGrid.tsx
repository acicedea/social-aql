'use client';

import React from 'react';
import type { ProviderManifest } from '@/providers/types';
import { ProviderCard } from './ProviderCard';

interface AvailableProvidersGridProps {
  providers: readonly ProviderManifest[];
  onConnectAction: (providerId: string) => Promise<void>;
}

export function AvailableProvidersGrid({ providers, onConnectAction }: AvailableProvidersGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      {providers.map((p) => (
        <ProviderCard key={p.id} provider={p} onConnect={() => onConnectAction(p.id)} />
      ))}
    </div>
  );
}
