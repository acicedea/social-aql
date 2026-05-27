'use client';

import React, { useState, useTransition } from 'react';
import { Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { backfillThemesAction } from '@/app/dashboard/settings/actions';

interface Props {
  totalPosts: number;
  classifiedPosts: number;
}

type BackfillResult =
  | {
      success: true;
      stats: {
        processed: number;
        aiClassified: number;
        keywordClassified: number;
        aiErrors: number;
        errorSamples: string[];
        errors: number;
      };
    }
  | { success: false; error: string }
  | null;

export function BackfillThemesSection({ totalPosts, classifiedPosts }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BackfillResult>(null);

  function handleClick() {
    startTransition(async () => {
      const res = await backfillThemesAction();
      setResult(res);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Mono tone="muted">POSTĂRI CLASIFICATE</Mono>
          <Mono>{classifiedPosts} / {totalPosts}</Mono>
        </div>

        <span style={{ fontSize: 12, lineHeight: '1.6' }}>
          <Mono tone="muted">
            Postările existente sunt clasificate cu detecție de cuvinte cheie. Rulează re-clasificarea cu AI (Gemini) pentru rezultate mai precise. Poate dura câteva minute.
          </Mono>
        </span>

        <Button
          variant="primary"
          onClick={handleClick}
          loading={isPending}
          disabled={isPending}
          style={{ alignSelf: 'flex-start' }}
        >
          {isPending ? 'RE-CLASIFICARE ÎN CURS...' : '→ RE-CLASIFICĂ TOATE CU AI'}
        </Button>

        {result && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 4,
              background: result.success ? `${colors.accentLime}18` : `${colors.accentCoral}18`,
              border: `1px solid ${result.success ? colors.accentLime : colors.accentCoral}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {result.success ? (
              <>
                <Mono tone="lime">
                  Re-clasificate: {result.stats.processed} postări.
                </Mono>
                <Mono tone="lime">
                  AI: {result.stats.aiClassified} · Cuvinte cheie: {result.stats.keywordClassified}
                  {result.stats.errors > 0 ? ` · Erori DB: ${result.stats.errors}` : ''}
                </Mono>
                {result.stats.aiErrors > 0 && (
                  <>
                    <Mono tone="coral">Erori AI: {result.stats.aiErrors}</Mono>
                    {result.stats.errorSamples.map((sample, i) => (
                      <span key={i} style={{ fontSize: 10, opacity: 0.8 }}>
                        <Mono tone="coral">– {sample.slice(0, 120)}</Mono>
                      </span>
                    ))}
                  </>
                )}
              </>
            ) : (
              <Mono tone="coral">Eroare: {result.error}</Mono>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
