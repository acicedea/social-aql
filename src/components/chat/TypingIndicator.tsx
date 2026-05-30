'use client';


interface Props {
  toolNames: string[];
}

export function TypingIndicator({ toolNames }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 0',
    }}>
      <div style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 12,
        borderBottomLeftRadius: 4,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {toolNames.length > 0 ? (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>
            ⚡ Caut date: {toolNames.join(', ')}...
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--color-text-secondary)',
                  display: 'inline-block',
                  animation: 'typingBounce 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
            <style>{`
              @keyframes typingBounce {
                0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                30% { transform: translateY(-4px); opacity: 1; }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}
