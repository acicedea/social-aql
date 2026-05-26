'use client';

import React, { useState } from 'react';
import { DataRow } from '@/components/design-system/DataRow';
import { Mono } from '@/components/design-system/Typography';
import { DisconnectAccountDialog } from './DisconnectAccountDialog';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Account {
  id: string;
  display_name: string;
  handle: string | null;
  provider_id: string;
  status: string;
}

interface Props {
  accounts: Account[];
}

export function ConnectedAccountsList({ accounts }: Props) {
  const [disconnectingAccount, setDisconnectingAccount] = useState<Account | null>(null);

  if (accounts.length === 0) {
    return (
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '24px 20px',
          textAlign: 'center',
        }}
      >
        <Mono tone="muted">NICIUN CONT CONECTAT. ADAUGĂ UN CONT MAI JOS.</Mono>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.map((account) => (
          <DataRow
            key={account.id}
            label={account.display_name}
            description={account.handle ?? account.provider_id}
            status={account.status.toUpperCase()}
            tone={account.status === 'active' ? 'positive' : 'negative'}
            action={
              <button
                onClick={() => setDisconnectingAccount(account)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: colors.accentCoral,
                  padding: '0 4px',
                  marginLeft: 16,
                  flexShrink: 0,
                }}
              >
                DEZCONECTEAZĂ
              </button>
            }
          />
        ))}
      </div>

      {disconnectingAccount && (
        <DisconnectAccountDialog
          open
          onClose={() => setDisconnectingAccount(null)}
          account={disconnectingAccount}
        />
      )}
    </>
  );
}
