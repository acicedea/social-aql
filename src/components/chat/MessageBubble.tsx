'use client';

import type { ChatMessage } from '@/ai/chat/types';

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.9em">$1</code>')
    .replace(/^[*-] (.+)/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0 0">')
    .replace(/\n/g, '<br/>');
}

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  const bubbleStyle: React.CSSProperties = {
    maxWidth: '75%',
    padding: '10px 14px',
    borderRadius: 12,
    fontSize: 14,
    lineHeight: 1.55,
    wordBreak: 'break-word',
  };

  if (isUser) {
    Object.assign(bubbleStyle, {
      background: 'var(--color-accent-lime)',
      color: '#000',
      borderBottomRightRadius: 4,
    });
  } else {
    Object.assign(bubbleStyle, {
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border-default)',
      color: 'var(--color-text-primary)',
      borderBottomLeftRadius: 4,
    });
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
    }}>
      <div style={bubbleStyle}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
        ) : (
          <>
            <p
              style={{ margin: 0 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
            {message.webSources && message.webSources.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border-default)', paddingTop: 8 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
                  SURSE WEB
                </span>
                {message.webSources.map((source, i) => (
                  <a
                    key={i}
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      fontSize: 11,
                      color: 'var(--color-text-muted)',
                      textDecoration: 'none',
                      marginBottom: 4,
                      fontFamily: 'var(--font-jetbrains-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    → {source.title || source.uri}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--color-text-muted)', marginTop: 3, display: 'block' }}>
        {new Date(message.createdAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

interface StreamingProps {
  text: string;
}

export function MessageBubbleStreaming({ text }: StreamingProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      marginBottom: 12,
    }}>
      <div style={{
        maxWidth: '75%',
        padding: '10px 14px',
        borderRadius: 12,
        borderBottomLeftRadius: 4,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-default)',
        color: 'var(--color-text-primary)',
        fontSize: 14,
        lineHeight: 1.55,
        wordBreak: 'break-word',
      }}>
        <p
          style={{ margin: 0 }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) + '<span style="display:inline-block;width:2px;height:14px;background:var(--color-accent-lime);margin-left:2px;animation:blink 1s step-end infinite;vertical-align:text-bottom">▊</span>' }}
        />
        <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
      </div>
    </div>
  );
}
