'use client';

import { useState, useRef, KeyboardEvent } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    onSend(text);
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxRows = 5;
    const lineHeight = 20;
    el.style.height = Math.min(el.scrollHeight, maxRows * lineHeight + 24) + 'px';
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => { setValue(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Întreabă orice despre contul tău..."
          rows={1}
          style={{
            flex: 1,
            padding: '10px 14px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 8,
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-inter)',
            fontSize: 14,
            lineHeight: '20px',
            resize: 'none',
            outline: 'none',
            minHeight: 44,
          }}
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          style={{
            padding: '10px 18px',
            background: disabled || !value.trim() ? 'var(--color-border-default)' : 'var(--color-accent-lime)',
            color: disabled || !value.trim() ? 'var(--color-text-secondary)' : '#000',
            border: 'none',
            borderRadius: 8,
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            height: 44,
          }}
        >
          TRIMITE
        </button>
      </div>
      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, display: 'block' }}>
        Enter pentru trimite · Shift+Enter pentru rând nou
      </span>
    </div>
  );
}
