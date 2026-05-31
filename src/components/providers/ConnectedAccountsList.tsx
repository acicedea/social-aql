'use client';

import React, { useState } from 'react';
import { DataRow } from '@/components/design-system/DataRow';
import { Mono } from '@/components/design-system/Typography';
import { DisconnectAccountDialog } from './DisconnectAccountDialog';
import { SyncAccountButton } from './SyncAccountButton';
import { colors } from '@/themes/platform/tokens';

interface Account {
  id: string;
  display_name: string;
  handle: string | null;
  provider_id: string;
  status: string;
  last_sync_at: string | null;
}

interface Props {
  accounts: Account[];
  isAdmin: boolean;
}

export function ConnectedAccountsList({ accounts, isAdmin }: Props) {
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
              isAdmin ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <SyncAccountButton accountId={account.id} />
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
                </span>
              ) : (
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 10,
                    color: colors.textMuted,
                  }}
                >
                  VIZUALIZARE
                </span>
              )
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
