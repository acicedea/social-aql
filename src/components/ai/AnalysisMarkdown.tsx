'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  markdown: string;
}

export function AnalysisMarkdown({ markdown }: Props) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-inter), sans-serif',
        lineHeight: 1.6,
        color: colors.textPrimary,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2
              style={{
                fontFamily: 'var(--font-league-spartan), sans-serif',
                fontSize: 28,
                fontWeight: 700,
                color: colors.textPrimary,
                marginTop: 32,
                marginBottom: 12,
              }}
            >
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3
              style={{
                fontFamily: 'var(--font-league-spartan), sans-serif',
                fontSize: 22,
                fontWeight: 700,
                color: colors.textPrimary,
                marginTop: 24,
                marginBottom: 10,
              }}
            >
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4
              style={{
                fontFamily: 'var(--font-league-spartan), sans-serif',
                fontSize: 18,
                fontWeight: 600,
                color: colors.textPrimary,
                marginTop: 20,
                marginBottom: 8,
              }}
            >
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 12 }}>
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong style={{ color: colors.accentLime, fontWeight: 600 }}>{children}</strong>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.startsWith('language-');
            if (isBlock) {
              return (
                <pre
                  style={{
                    background: colors.bgCard,
                    border: `1px solid ${colors.borderDefault}`,
                    borderRadius: 4,
                    padding: '12px 16px',
                    overflowX: 'auto',
                    marginBottom: 12,
                  }}
                >
                  <code
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 13,
                      color: colors.accentLime,
                    }}
                  >
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 13,
                  color: colors.accentLime,
                  background: colors.bgCard,
                  padding: '1px 6px',
                  borderRadius: 3,
                }}
              >
                {children}
              </code>
            );
          },
          ul: ({ children }) => (
            <ul style={{ paddingLeft: 20, marginBottom: 12, color: colors.textSecondary }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ paddingLeft: 20, marginBottom: 12, color: colors.textSecondary }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: 6, fontSize: 15 }}>{children}</li>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 13,
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderBottom: `2px solid ${colors.borderDefault}`,
                color: colors.accentLime,
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${colors.borderDefault}`,
                color: colors.textSecondary,
              }}
            >
              {children}
            </td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
