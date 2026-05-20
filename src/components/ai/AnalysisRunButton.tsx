'use client';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/design-system/Button';

interface Props {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}

export function AnalysisRunButton({ onClick, loading, disabled }: Props) {
  const [cursor, setCursor] = useState('_');
  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setCursor((c) => (c === '_' ? ' ' : '_')), 500);
    return () => clearInterval(iv);
  }, [loading]);

  return (
    <Button variant="primary" onClick={onClick} disabled={disabled || loading}>
      {loading ? `ANALIZEZ${cursor}` : 'RULEAZĂ'}
    </Button>
  );
}
