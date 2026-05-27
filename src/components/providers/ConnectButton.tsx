'use client';

import React, { useTransition } from 'react';
import { Button } from '@/components/design-system/Button';

interface ConnectButtonProps {
  onConnect: () => Promise<void>;
}

export function ConnectButton({ onConnect }: ConnectButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await onConnect();
    });
  }

  return (
    <Button variant="primary" onClick={handleClick} loading={isPending}>
      → CONECTEAZĂ
    </Button>
  );
}
