'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { MessageBubbleStreaming } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { Eyebrow } from '@/components/design-system';
import type { ChatMessage } from '@/ai/chat/types';

interface Account {
  id: string;
  display_name: string;
  handle: string | null;
  provider_id: string;
  status?: string;
}

interface Props {
  accounts: Account[];
  activeAccount: Account;
  initialConversationId: string | null;
  initialMessages: Array<{ id: string; role: string; content: string; created_at: string }>;
}

export function ChatInterface({ accounts, activeAccount, initialConversationId, initialMessages }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map(m => ({
      id: m.id,
      conversationId: initialConversationId ?? '',
      role: m.role as ChatMessage['role'],
      content: m.content,
      createdAt: m.created_at,
    }))
  );
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolNames, setActiveToolNames] = useState<string[]>([]);
  const [currentSources, setCurrentSources] = useState<Array<{ title: string; uri: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: conversationId ?? '',
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setStreamingText('');
    setActiveToolNames([]);
    setError(null);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId,
          accountId: activeAccount.id,
        }),
      });

      if (!res.ok) throw new Error('Request failed');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'chunk') {
              accumulated += data.text;
              setStreamingText(accumulated);
            } else if (data.type === 'tool_start') {
              setActiveToolNames(data.tools);
            } else if (data.type === 'sources') {
              setCurrentSources(data.sources);
            } else if (data.type === 'done') {
              if (data.conversationId && !conversationId) {
                setConversationId(data.conversationId);
                router.replace(
                  `/dashboard/chat?conversation=${data.conversationId}&account=${activeAccount.id}`,
                  { scroll: false }
                );
              }
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                conversationId: data.conversationId ?? conversationId ?? '',
                role: 'assistant' as const,
                content: accumulated,
                createdAt: new Date().toISOString(),
                webSources: currentSources.length > 0 ? currentSources : undefined,
              }]);
              setCurrentSources([]);
              setStreamingText('');
              setActiveToolNames([]);
            } else if (data.type === 'error') {
              setError(data.message);
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      setError('Eroare de conexiune. Încearcă din nou.');
      console.error('[chat]', err);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setActiveToolNames([]);
      setCurrentSources([]);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setStreamingText('');
    setError(null);
    router.replace(`/dashboard/chat?account=${activeAccount.id}`, { scroll: false });
  };

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 64px)',
      overflow: 'hidden',
    }}>
      {/* Left sidebar */}
      <div style={{
        width: 260,
        borderRight: '1px solid var(--color-border-default)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{ padding: '16px 16px 8px' }}>
          <Eyebrow tone="muted">CONVERSAȚII</Eyebrow>
          <button
            onClick={startNewConversation}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 8,
              padding: '8px 12px',
              background: 'var(--color-accent-lime)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            + CONVERSAȚIE NOUĂ
          </button>
        </div>
        <ConversationList
          accountId={activeAccount.id}
          activeConversationId={conversationId}
          onSelect={(id) => {
            router.push(`/dashboard/chat?conversation=${id}&account=${activeAccount.id}`);
          }}
        />
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
              EXPERT AI · {activeAccount.handle ?? activeAccount.display_name}
            </span>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-league-spartan)', fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>Chat Analytics</h3>
          </div>
          {activeToolNames.length > 0 && (
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              ⚡ {activeToolNames.join(', ')}
            </span>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {messages.length === 0 && !isStreaming && (
            <WelcomeScreen
              handle={activeAccount.handle ?? activeAccount.display_name}
              onSuggestion={sendMessage}
            />
          )}
          <MessageList messages={messages} />
          {isStreaming && streamingText && (
            <MessageBubbleStreaming text={streamingText} />
          )}
          {isStreaming && !streamingText && (
            <TypingIndicator toolNames={activeToolNames} />
          )}
          {error && (
            <div style={{ color: 'var(--color-accent-coral)', padding: '8px 0', fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          borderTop: '1px solid var(--color-border-default)',
          padding: '16px 24px',
        }}>
          <MessageInput onSend={sendMessage} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen({ handle, onSuggestion }: { handle: string; onSuggestion: (s: string) => void }) {
  const suggestions = [
    'Care e cel mai bun moment să postez?',
    'Cum merge contul în ultimele 30 de zile?',
    'Ce temă funcționează cel mai bine?',
    'Compară săptămâna asta cu cea trecută',
    'Ce trebuie să îmbunătățesc urgent?',
    'Care sunt cele mai bune postări ale mele?',
  ];

  return (
    <div style={{ textAlign: 'center', padding: '40px 0 32px' }}>
      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 32, display: 'block', marginBottom: 8 }}>💬</span>
      <h3 style={{ fontFamily: 'var(--font-league-spartan)', fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>Bun venit în Chat Analytics</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Întreabă orice despre contul @{handle}. Am acces la toate datele tale.
      </p>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        maxWidth: 600,
        margin: '0 auto',
      }}>
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            style={{
              padding: '8px 14px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 6,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-inter)',
              textAlign: 'left',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
