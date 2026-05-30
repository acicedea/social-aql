'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { colors } from '@/themes/platform/tokens';
import { Eyebrow, H2, H3, Body, Mono } from '@/components/design-system/Typography';
import { Card } from '@/components/design-system/Card';
import { exportAnalysisPdf } from '@/lib/pdf/exportAnalysisPdf';
import type {
  AnalysisType,
  WeeklySummaryOutput,
  ContentPatternsOutput,
  ContentIdeationOutput,
  KeyFinding,
  Recommendation,
  PostRef,
} from '@/ai/analyses/types';

function PostRefLinks({ evidence }: { evidence: PostRef[] | string | undefined }) {
  if (!evidence) return null;
  const refs: PostRef[] = Array.isArray(evidence)
    ? evidence
    : [];
  if (refs.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {refs.map((r) => (
        <Link
          key={r.post_id}
          href={`/dashboard/posts/${r.post_id}`}
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 11,
            color: colors.accentLime,
            background: 'rgba(163,230,53,0.08)',
            border: `1px solid rgba(163,230,53,0.25)`,
            borderRadius: 4,
            padding: '2px 8px',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 240,
            display: 'inline-block',
          }}
          title={r.caption}
        >
          ↗ {r.caption.length > 50 ? r.caption.slice(0, 50) + '…' : r.caption}
        </Link>
      ))}
    </div>
  );
}

const TYPE_LABELS: Record<AnalysisType, string> = {
  weekly_summary: 'SUMAR SĂPTĂMÂNAL',
  content_patterns: 'TIPARE CONȚINUT',
  content_ideation: 'IDEI CONȚINUT',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: colors.accentCoral,
  medium: colors.accentLime,
  low: colors.textMuted,
};

const TONE_BORDER: Record<string, string> = {
  positive: colors.borderPositive,
  negative: colors.borderNegative,
  neutral: colors.borderDefault,
};

const TONE_BG: Record<string, string> = {
  positive: colors.bgCardPositive,
  negative: colors.bgCardNegative,
  neutral: colors.bgCard,
};

function NarrativeMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => (
          <p style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 15, lineHeight: 1.7, color: colors.textSecondary, margin: '0 0 12px' }}>
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong style={{ color: colors.textPrimary, fontWeight: 600 }}>{children}</strong>
        ),
        h2: ({ children }) => (
          <h2 style={{ fontFamily: 'var(--font-league-spartan), sans-serif', fontSize: 20, fontWeight: 700, color: colors.textPrimary, margin: '20px 0 8px', textTransform: 'uppercase' }}>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ fontFamily: 'var(--font-league-spartan), sans-serif', fontSize: 16, fontWeight: 700, color: colors.textPrimary, margin: '16px 0 6px', textTransform: 'uppercase' }}>
            {children}
          </h3>
        ),
        ul: ({ children }) => (
          <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ul>
        ),
        li: ({ children }) => (
          <li style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 15, lineHeight: 1.7, color: colors.textSecondary, marginBottom: 4 }}>
            {children}
          </li>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function FindingsGrid({ findings }: { findings: KeyFinding[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {findings.map((f, i) => (
        <div
          key={i}
          style={{
            background: TONE_BG[f.tone] ?? colors.bgCard,
            border: `1px solid ${TONE_BORDER[f.tone] ?? colors.borderDefault}`,
            borderRadius: 6,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, fontWeight: 600, color: colors.textPrimary, textTransform: 'uppercase' }}>
            {f.title}
          </span>
          {f.metric && (
            <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, color: colors.accentLime }}>
              {f.metric}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
            {f.detail}
          </span>
          <PostRefLinks evidence={f.evidence} />
        </div>
      ))}
    </div>
  );
}

function normalizeRec(r: unknown): Recommendation {
  const o = r as Record<string, unknown>;
  return {
    action: (o.action ?? o.recommendation ?? o.text ?? o.descriere ?? '') as string,
    rationale: (o.rationale ?? o.reason ?? o.justification ?? o.justificare ?? o.motivatie ?? '') as string,
    priority: (['high', 'medium', 'low'].includes(o.priority as string) ? o.priority : o.level ?? 'medium') as 'high' | 'medium' | 'low',
  };
}

function RecommendationsList({ recs }: { recs: Recommendation[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {recs.map((r, i) => {
        const rec = normalizeRec(r);
        return (
          <div
            key={i}
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 6,
              padding: '14px 16px',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 18,
                fontWeight: 700,
                color: colors.accentLime,
                lineHeight: 1,
                minWidth: 20,
              }}
            >
              {i + 1}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, fontWeight: 600, color: colors.textPrimary, textTransform: 'uppercase' }}>
                  {rec.action}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 10,
                    color: PRIORITY_COLOR[rec.priority] ?? colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rec.priority}
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
                {rec.rationale}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== Weekly Summary =====

function WeeklySummaryDetail({ output }: { output: WeeklySummaryOutput }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Period comparison */}
      <div>
        <Eyebrow tone="muted">COMPARAȚIE PERIOADĂ</Eyebrow>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'ENGAGEMENT RATE', value: output.period_comparison.er_change },
            { label: 'REACH', value: output.period_comparison.reach_change },
            { label: 'URMĂRITORI', value: output.period_comparison.follower_change },
          ].map((stat) => {
            const val = stat.value ?? 'N/A';
            const isShort = val.length <= 12;
            const tone = val.startsWith('+') ? colors.accentLime : val.startsWith('-') ? colors.accentCoral : colors.textPrimary;
            return (
              <div
                key={stat.label}
                style={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}
              >
                <Eyebrow tone="muted">{stat.label}</Eyebrow>
                {isShort ? (
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 20, fontWeight: 700, color: tone, marginLeft: 'auto' }}>
                    {val}
                  </span>
                ) : (
                  <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 13, color: colors.textSecondary, lineHeight: 1.5, flex: 1, textAlign: 'right' }}>
                    {val}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>
          <Body tone="secondary">{output.period_comparison.summary}</Body>
        </div>
      </div>

      {/* Top performers */}
      {output.top_performers.length > 0 && (
        <div>
          <Eyebrow tone="muted">TOP POSTĂRI</Eyebrow>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {output.top_performers.map((p) => (
              <Link key={p.post_id} href={`/dashboard/posts/${p.post_id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: colors.bgCard,
                    border: `1px solid ${colors.borderDefault}`,
                    borderRadius: 6,
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = colors.borderPositive; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = colors.borderDefault; }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 13, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.caption}
                    </span>
                    {p.theme && <Mono tone="muted">{p.theme.toUpperCase()}</Mono>}
                  </div>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, color: colors.accentLime, whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {p.metric}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Key findings */}
      {output.key_findings.length > 0 && (
        <div>
          <Eyebrow tone="muted">OBSERVAȚII CHEIE</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <FindingsGrid findings={output.key_findings} />
          </div>
        </div>
      )}

      {/* Recommendations */}
      {output.recommendations.length > 0 && (
        <div>
          <Eyebrow tone="muted">RECOMANDĂRI</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <RecommendationsList recs={output.recommendations} />
          </div>
        </div>
      )}

      {/* Narrative */}
      {output.narrative_markdown && (
        <div>
          <Eyebrow tone="muted">ANALIZĂ DETALIATĂ</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <NarrativeMarkdown text={output.narrative_markdown} />
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Content Patterns =====

function ContentPatternsDetail({ output }: { output: ContentPatternsOutput }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Patterns */}
      {output.patterns.length > 0 && (
        <div>
          <Eyebrow tone="muted">PATTERN-URI IDENTIFICATE</Eyebrow>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {output.patterns.map((p, i) => (
              <div
                key={i}
                style={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, fontWeight: 600, color: colors.textPrimary, textTransform: 'uppercase' }}>
                    {p.pattern}
                  </span>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 10, color: PRIORITY_COLOR[p.impact] ?? colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {p.impact} impact
                  </span>
                </div>
                <PostRefLinks evidence={p.evidence} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Theme performance */}
      {output.theme_performance.length > 0 && (
        <div>
          <Eyebrow tone="muted">PERFORMANȚĂ PE TEME</Eyebrow>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {output.theme_performance.map((t, i) => (
              <div
                key={i}
                style={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderRadius: i === 0 ? '6px 6px 0 0' : i === output.theme_performance.length - 1 ? '0 0 6px 6px' : 0, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 16 }}
              >
                <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, fontWeight: 600, color: colors.accentLime, minWidth: 120, textTransform: 'uppercase' }}>
                  {t.theme}
                </span>
                <Mono tone="muted">ER {t.avg_er}</Mono>
                <Mono tone="muted">SAVES {t.avg_saves}</Mono>
                <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 13, color: colors.textSecondary, flex: 1 }}>
                  {t.verdict}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Format insights */}
      {output.format_insights.length > 0 && (
        <div>
          <Eyebrow tone="muted">INSIGHTS FORMAT</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <FindingsGrid findings={output.format_insights} />
          </div>
        </div>
      )}

      {/* Recommendations */}
      {output.recommendations.length > 0 && (
        <div>
          <Eyebrow tone="muted">RECOMANDĂRI</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <RecommendationsList recs={output.recommendations} />
          </div>
        </div>
      )}

      {output.narrative_markdown && (
        <div>
          <Eyebrow tone="muted">ANALIZĂ DETALIATĂ</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <NarrativeMarkdown text={output.narrative_markdown} />
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Content Ideation =====

function ContentIdeationDetail({ output }: { output: ContentIdeationOutput }) {
  const FORMAT_COLOR: Record<string, string> = {
    Reel: colors.accentCoral,
    Carousel: colors.accentLime,
    Image: colors.textSecondary,
    Story: colors.accentLimeDim,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {output.ideas.map((idea, i) => (
          <div
            key={i}
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 6,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-league-spartan), sans-serif', fontSize: 18, fontWeight: 700, color: colors.textPrimary, textTransform: 'uppercase', lineHeight: 1.2 }}>
                {i + 1}. {idea.title}
              </span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 10, color: FORMAT_COLOR[idea.format] ?? colors.textMuted, border: `1px solid ${FORMAT_COLOR[idea.format] ?? colors.borderDefault}`, borderRadius: 3, padding: '2px 6px', textTransform: 'uppercase' }}>
                  {idea.format}
                </span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 10, color: colors.accentLime, border: `1px solid ${colors.borderPositive}`, borderRadius: 3, padding: '2px 6px', textTransform: 'uppercase' }}>
                  {idea.theme}
                </span>
              </div>
            </div>

            <div style={{ background: colors.bgElevated, borderRadius: 4, padding: '10px 14px', borderLeft: `3px solid ${colors.accentLime}` }}>
              <Eyebrow tone="muted">HOOK</Eyebrow>
              <p style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 15, color: colors.textPrimary, margin: '4px 0 0', fontStyle: 'italic', lineHeight: 1.5 }}>
                &ldquo;{idea.hook}&rdquo;
              </p>
            </div>

            <div>
              <Eyebrow tone="muted">STRUCTURĂ</Eyebrow>
              <p style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, color: colors.textSecondary, margin: '4px 0 0', lineHeight: 1.6 }}>
                {typeof idea.structure === 'string'
                  ? idea.structure
                  : Object.entries(idea.structure as Record<string, string>)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' | ')}
              </p>
            </div>

            <div>
              <Eyebrow tone="muted">DE CE VA FUNCȚIONA</Eyebrow>
              <p style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 13, color: colors.textSecondary, margin: '4px 0 0', lineHeight: 1.5 }}>
                {idea.rationale}
              </p>
              <PostRefLinks evidence={idea.post_references} />
            </div>
          </div>
        ))}
      </div>

      {output.narrative_markdown && (
        <div>
          <Eyebrow tone="muted">CONTEXT STRATEGIC</Eyebrow>
          <div style={{ marginTop: 12 }}>
            <NarrativeMarkdown text={output.narrative_markdown} />
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Main export =====

interface Props {
  analysisType: AnalysisType;
  structuredOutput: unknown;
  createdAt: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  model: string;
  durationMs: number | null;
}

export function AnalysisDetail({ analysisType, structuredOutput, createdAt, rangeFrom, rangeTo, model, durationMs }: Props) {
  const output = structuredOutput as WeeklySummaryOutput & ContentPatternsOutput & ContentIdeationOutput;

  const [exporting, setExporting] = useState(false);

  function handleExport() {
    setExporting(true);
    setTimeout(() => {
      exportAnalysisPdf({ analysisType, structuredOutput, createdAt, rangeFrom, rangeTo, model, durationMs });
      setExporting(false);
    }, 0);
  }

  const relTime = (() => {
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'acum';
    if (mins < 60) return `acum ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `acum ${hrs}h`;
    return `acum ${Math.floor(hrs / 24)} zile`;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 860 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Eyebrow>
            {TYPE_LABELS[analysisType] ?? analysisType} · {model} · {relTime}
            {durationMs && ` · ${(durationMs / 1000).toFixed(1)}s`}
          </Eyebrow>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: exporting ? colors.textMuted : colors.accentLime,
              background: 'transparent',
              border: `1px solid ${exporting ? colors.borderDefault : colors.borderPositive}`,
              borderRadius: 4,
              padding: '4px 10px',
              cursor: exporting ? 'default' : 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {exporting ? 'EXPORT...' : '↓ PDF'}
          </button>
        </div>
        {rangeFrom && rangeTo && (
          <div style={{ marginTop: 4 }}>
            <Mono tone="muted">{rangeFrom} → {rangeTo}</Mono>
          </div>
        )}
        {output.headline && (
          <div style={{ marginTop: 12 }}>
            <h1
              style={{
                fontFamily: 'var(--font-league-spartan), sans-serif',
                fontSize: 'clamp(28px, 4vw, 48px)',
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
                color: colors.textPrimary,
                margin: 0,
              }}
            >
              {output.headline}
            </h1>
          </div>
        )}
      </div>

      {/* Content by type */}
      {analysisType === 'weekly_summary' && (
        <WeeklySummaryDetail output={output as WeeklySummaryOutput} />
      )}
      {analysisType === 'content_patterns' && (
        <ContentPatternsDetail output={output as ContentPatternsOutput} />
      )}
      {analysisType === 'content_ideation' && (
        <ContentIdeationDetail output={output as ContentIdeationOutput} />
      )}
    </div>
  );
}
