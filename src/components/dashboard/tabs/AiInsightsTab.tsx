'use client';

import React from 'react';
import Link from 'next/link';
import { RunAnalysisButton } from '@/components/analyses/RunAnalysisButton';
import { colors } from '@/themes/platform/tokens';
import { formatRelativeTime } from '@/lib/kpis/formatters';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AnalysisSummary {
  id: string;
  analysisType: string;
  status: string;
  createdAt: string;
  headline: string | null;
  recommendations: Array<{ action: string; priority: string }> | null;
  keyFindings: Array<{ title: string; tone: string }> | null;
  durationMs: number | null;
}

interface AiInsightsData {
  latestWeeklySummary: AnalysisSummary | null;
  latestContentPatterns: AnalysisSummary | null;
  latestContentIdeation: AnalysisSummary | null;
  recentAnalyses: AnalysisSummary[];
}

interface AiInsightsTabProps {
  data: AiInsightsData;
  accountId: string;
  isAdmin: boolean;
}

// ─── Shared card styles ────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: colors.bgCard,
  border: `1px solid ${colors.borderDefault}`,
  borderRadius: 6,
  padding: 16,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: 11,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: colors.textSecondary,
  display: 'block',
};

// ─── AnalysisCard ──────────────────────────────────────────────────────────────

function AnalysisCard({
  eyebrow,
  analysis,
  analysisType,
  accountId,
  isAdmin,
}: {
  eyebrow: string;
  analysis: AnalysisSummary | null;
  analysisType: 'weekly_summary' | 'content_patterns' | 'content_ideation';
  accountId: string;
  isAdmin: boolean;
}) {
  if (!analysis) {
    return (
      <div style={cardStyle}>
        <span style={eyebrowStyle}>{eyebrow}</span>
        <div style={{ marginTop: 8 }}>
          <span style={{ color: colors.textMuted, fontSize: 13, fontFamily: 'var(--font-inter)' }}>
            Nicio analiză generată încă.
          </span>
        </div>
        {isAdmin && (
          <div style={{ marginTop: 16 }}>
            <RunAnalysisButton analysisType={analysisType} accountId={accountId} />
          </div>
        )}
      </div>
    );
  }

  const timeAgo = formatRelativeTime(analysis.createdAt, 'ro');
  const ideas =
    analysis.analysisType === 'content_ideation' && Array.isArray(analysis.keyFindings)
      ? (analysis.keyFindings?.length ?? 0)
      : null;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={eyebrowStyle}>{eyebrow}</span>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 10, color: colors.textMuted }}>
          {timeAgo}
        </span>
      </div>

      {analysis.headline && (
        <div style={{ marginTop: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-league-spartan), sans-serif',
              fontSize: 18,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: colors.textPrimary,
              lineHeight: 1.2,
              display: 'block',
            }}
          >
            {analysis.headline}
          </span>
        </div>
      )}

      {analysis.analysisType === 'content_ideation' && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, color: colors.accentLime }}>
            {ideas != null && ideas > 0 ? `${ideas} idei disponibile` : '—'}
          </span>
        </div>
      )}

      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {analysis.recommendations.slice(0, 2).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 11,
                  color: colors.accentLime,
                  minWidth: 14,
                  fontWeight: 700,
                }}
              >
                {i + 1}.
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-inter), sans-serif',
                  fontSize: 12,
                  color: colors.textSecondary,
                  lineHeight: 1.5,
                }}
              >
                {r.action}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Link
          href={`/dashboard/analyses/${analysis.id}`}
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 12,
            color: colors.accentLime,
            textDecoration: 'none',
          }}
        >
          → CITEȘTE COMPLET
        </Link>
      </div>
    </div>
  );
}

// ─── AiInsightsTab ─────────────────────────────────────────────────────────────

export function AiInsightsTab({ data, accountId, isAdmin }: AiInsightsTabProps) {
  const completed = data.recentAnalyses.filter((a) => a.status === 'completed').length;
  const failed = data.recentAnalyses.filter((a) => a.status === 'failed').length;
  const avgDuration = (() => {
    const durations = data.recentAnalyses
      .filter((a) => a.durationMs != null)
      .map((a) => a.durationMs!);
    if (durations.length === 0) return null;
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000);
  })();

  const cardConfigs = [
    {
      key: 'weekly',
      eyebrow: 'ANALIZĂ SĂPTĂMÂNALĂ',
      analysis: data.latestWeeklySummary,
      analysisType: 'weekly_summary' as const,
    },
    {
      key: 'patterns',
      eyebrow: 'TIPARE DE CONȚINUT',
      analysis: data.latestContentPatterns,
      analysisType: 'content_patterns' as const,
    },
    {
      key: 'ideation',
      eyebrow: 'IDEI DE CONȚINUT',
      analysis: data.latestContentIdeation,
      analysisType: 'content_ideation' as const,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Section 1: Latest Analysis Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {cardConfigs.map((cfg) => (
          <AnalysisCard
            key={cfg.key}
            eyebrow={cfg.eyebrow}
            analysis={cfg.analysis}
            analysisType={cfg.analysisType}
            accountId={accountId}
            isAdmin={isAdmin}
          />
        ))}
      </div>

      {/* Section 2: Analysis History Timeline */}
      <div style={cardStyle}>
        <span style={{ ...eyebrowStyle, marginBottom: 8, display: 'block' }}>ISTORIC ANALIZE</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {data.recentAnalyses.map((a) => (
            <Link key={a.id} href={`/dashboard/analyses/${a.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 0',
                  borderBottom: `1px solid ${colors.borderDefault}`,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 11,
                    color: colors.accentLime,
                    textTransform: 'uppercase',
                    minWidth: 120,
                    fontWeight: 700,
                  }}
                >
                  {a.analysisType.replace(/_/g, ' ')}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-inter), sans-serif',
                    fontSize: 13,
                    color: colors.textSecondary,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.headline ?? '—'}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 10,
                    color:
                      a.status === 'completed'
                        ? colors.accentLime
                        : a.status === 'failed'
                        ? colors.accentCoral
                        : colors.textMuted,
                    textTransform: 'uppercase',
                  }}
                >
                  {a.status}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 10,
                    color: colors.textMuted,
                    flexShrink: 0,
                  }}
                >
                  {formatRelativeTime(a.createdAt, 'ro')}
                </span>
              </div>
            </Link>
          ))}
          {data.recentAnalyses.length === 0 && (
            <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 13, color: colors.textMuted }}>
              Nicio analiză efectuată.
            </span>
          )}
        </div>
      </div>

      {/* Section 3: Meta Stats */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Ultimele 10 */}
        <div style={{ ...cardStyle, flex: '1 1 160px' }}>
          <span style={eyebrowStyle}>ULTIMELE 10</span>
          <div style={{ marginTop: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 32,
                fontWeight: 700,
                color: colors.textPrimary,
                lineHeight: 1,
              }}
            >
              {data.recentAnalyses.length}
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 12, color: colors.textMuted }}>
              analize recente
            </span>
          </div>
        </div>

        {/* Completate */}
        <div style={{ ...cardStyle, flex: '1 1 160px' }}>
          <span style={eyebrowStyle}>COMPLETATE</span>
          <div style={{ marginTop: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 32,
                fontWeight: 700,
                color: colors.accentLime,
                lineHeight: 1,
              }}
            >
              {completed}
            </span>
          </div>
          {failed > 0 && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 12, color: colors.accentCoral }}>
                {failed} eșuate
              </span>
            </div>
          )}
        </div>

        {/* Timp mediu */}
        <div style={{ ...cardStyle, flex: '1 1 160px' }}>
          <span style={eyebrowStyle}>TIMP MEDIU</span>
          <div style={{ marginTop: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 32,
                fontWeight: 700,
                color: colors.textPrimary,
                lineHeight: 1,
              }}
            >
              {avgDuration != null ? `${avgDuration}s` : '—'}
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: 12, color: colors.textMuted }}>
              generare analiză
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
