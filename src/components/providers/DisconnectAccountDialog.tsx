'use client';

import React, { useState, useTransition } from 'react';
import { Modal, Input } from 'antd';
import { disconnectAccountAction } from '@/app/dashboard/accounts/actions';
import { Eyebrow, H3, Body, Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  open: boolean;
  onClose: () => void;
  account: {
    id: string;
    display_name: string;
    handle: string | null;
    provider_id: string;
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: 'Sesiune expirată. Re-loghează-te.',
  not_found: 'Contul nu mai există.',
  confirmation_mismatch: 'Handle-ul introdus nu corespunde.',
  delete_failed: 'Eroare la ștergere. Încearcă din nou.',
};

export function DisconnectAccountDialog({ open, onClose, account }: Props) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const expectedConfirmation = account.handle ?? account.display_name;
  const isConfirmed = typed.trim() === expectedConfirmation.trim();

  const handleClose = () => {
    setTyped('');
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await disconnectAccountAction(account.id, typed);
      if (result.success) {
        handleClose();
      } else {
        setError(ERROR_MESSAGES[result.error] ?? 'Eroare neașteptată.');
      }
    });
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      destroyOnClose
      styles={{
        content: { backgroundColor: colors.bgCard, borderRadius: 6, boxShadow: 'none' },
        header: { backgroundColor: 'transparent' },
        mask: { backgroundColor: 'rgba(0,0,0,0.7)' },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Eyebrow tone="coral">ACȚIUNE · DEZCONECTARE</Eyebrow>

        <H3>Dezconectează contul</H3>

        <Body tone="secondary">
          Această acțiune va șterge contul{' '}
          <Mono tone="coral">{account.display_name}</Mono>, toate postările
          sincronizate și toate analizele AI asociate. Nu poate fi anulată.
        </Body>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Body tone="secondary">
            Pentru confirmare, tastează handle-ul contului:
          </Body>
          <Mono tone="lime">{expectedConfirmation}</Mono>
        </div>

        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={expectedConfirmation}
          onPressEnter={isConfirmed && !isPending ? handleConfirm : undefined}
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 13,
            backgroundColor: colors.bg,
            borderColor: isConfirmed ? colors.accentLime : colors.borderDefault,
            color: colors.textPrimary,
          }}
        />

        {error && <Mono tone="coral">{error}</Mono>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            ANULEAZĂ
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!isConfirmed || isPending}
            loading={isPending}
          >
            DEZCONECTEAZĂ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
