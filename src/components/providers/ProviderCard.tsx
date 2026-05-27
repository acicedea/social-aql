import React from 'react';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, Body } from '@/components/design-system/Typography';
import type { ProviderManifest } from '@/providers/types';
import { ConnectButton } from './ConnectButton';

interface ProviderCardProps {
  provider: ProviderManifest;
  onConnect: () => Promise<void>;
}

export function ProviderCard({ provider, onConnect }: ProviderCardProps) {
  const eyebrowText = provider.platform.toUpperCase();

  return (
    <div
      style={{
        background: colors.bgCard,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: 6,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Eyebrow>{eyebrowText}</Eyebrow>
        <span
          style={{
            fontFamily: 'var(--font-league-spartan), sans-serif',
            fontSize: 22,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: colors.textPrimary,
          }}
        >
          {provider.displayName}
        </span>
        <Body tone="secondary">{provider.description}</Body>
      </div>
      <ConnectButton onConnect={onConnect} />
    </div>
  );
}
