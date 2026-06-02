'use client';

import type { RetentionAnalysis, RetentionZoneAnalysis } from '@/lib/retention/retention-types';
import { Card } from '@/components/design-system/Card';
import { Eyebrow, H3, Body, Mono } from '@/components/design-system/Typography';

interface Props {
  analysis: RetentionAnalysis;
}

function ZoneBar({ zone }: { zone: RetentionZoneAnalysis }) {
  const bgColor = zone.severity === 'critical' ? 'var(--color-accent-coral)'
    : zone.severity === 'warning' ? 'var(--color-accent-amber)'
    : 'var(--color-accent-lime)';

  const opacity = zone.severity === 'ok' ? 0.4 : 1;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <Mono style={{ fontSize: 11, fontWeight: 700 }}>{zone.zoneLabel}</Mono>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Mono tone="muted" style={{ fontSize: 10 }}>
            ~{zone.estimatedViewerLoss}% viewers pierduți
          </Mono>
          <Mono style={{
            fontSize: 10,
            color: zone.severity === 'critical' ? 'var(--color-accent-coral)'
              : zone.severity === 'warning' ? 'var(--color-accent-amber)'
              : 'var(--color-accent-lime)',
          }}>
            {zone.severity === 'critical' ? '✗ CRITIC'
              : zone.severity === 'warning' ? '⚠ ATENȚIE'
              : '✓ OK'}
          </Mono>
        </div>
      </div>

      <div style={{
        height: 8,
        background: 'var(--color-border-default)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 6,
      }}>
        <div style={{
          height: '100%',
          width: `${100 - zone.estimatedViewerLoss}%`,
          background: bgColor,
          opacity,
          borderRadius: 4,
          transition: 'width 0.4s ease',
        }} />
      </div>

      <Body style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: zone.fix ? 6 : 0 }}>
        {zone.diagnosis}
      </Body>

      {zone.fix && (
        <Body style={{ fontSize: 12, color: 'var(--color-accent-lime)' }}>
          → {zone.fix}
        </Body>
      )}

      {zone.transcriptText && zone.severity !== 'ok' && (
        <div style={{
          marginTop: 6,
          padding: '6px 10px',
          background: 'var(--color-bg-elevated)',
          borderLeft: '2px solid var(--color-border-default)',
          borderRadius: '0 4px 4px 0',
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 2 }}>CE S-A SPUS ÎN ACEASTĂ ZONĂ:</Mono>
          <Body style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
            &ldquo;{zone.transcriptText.slice(0, 120)}{zone.transcriptText.length > 120 ? '...' : ''}&rdquo;
          </Body>
        </div>
      )}
    </div>
  );
}

export function RetentionDiagnosticCard({ analysis }: Props) {
  const healthColors: Record<string, string> = {
    excellent: 'var(--color-accent-lime)',
    good: 'var(--color-accent-lime)',
    average: 'var(--color-text-primary)',
    poor: 'var(--color-accent-coral)',
    critical: 'var(--color-accent-coral)',
  };

  const healthLabels: Record<string, string> = {
    excellent: 'EXCELENT',
    good: 'BUN',
    average: 'MEDIU',
    poor: 'SLAB',
    critical: 'CRITIC',
  };

  const hookStrengthLabels: Record<string, string> = {
    strong: '✓ SOLID',
    average: '~ MEDIOCRU',
    weak: '✗ SLAB',
    unknown: '— N/A',
  };

  const hookStrengthColors: Record<string, string> = {
    strong: 'var(--color-accent-lime)',
    average: 'var(--color-text-primary)',
    weak: 'var(--color-accent-coral)',
    unknown: 'var(--color-text-muted)',
  };

  const markerLeft = Math.min(analysis.completionRate, 95);

  return (
    <section style={{ marginTop: 40 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 16,
      }}>
        <div>
          <Eyebrow tone="muted">RETENȚIE VIDEO · DIAGNOSTIC</Eyebrow>
          <H3>Analiză Comportament Audiență</H3>
        </div>
        <Mono tone="muted" style={{ fontSize: 10 }}>
          CONFIDENȚĂ DATE: {analysis.dataConfidence.toUpperCase()}
          {!analysis.hasTranscript && ' (fără transcript)'}
        </Mono>
      </div>

      {/* KPI row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{
          padding: '16px 18px',
          background: 'var(--color-bg-card)',
          borderRadius: 6,
          borderTop: `3px solid ${healthColors[analysis.retentionHealth]}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>COMPLETION</Mono>
          <Mono style={{
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1,
            color: healthColors[analysis.retentionHealth],
          }}>
            {analysis.completionRate}%
          </Mono>
          <Mono style={{ fontSize: 10, color: healthColors[analysis.retentionHealth], lineHeight: 1.2 }}>
            {healthLabels[analysis.retentionHealth]}
          </Mono>
        </div>

        <div style={{
          padding: '16px 18px',
          background: 'var(--color-bg-card)',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>AVG WATCH</Mono>
          <Mono style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
            {Math.round(analysis.avgWatchTimeSeconds)}s
          </Mono>
          <Mono tone="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>
            din {Math.round(analysis.durationSeconds)}s total
          </Mono>
        </div>

        <div style={{
          padding: '16px 18px',
          background: 'var(--color-bg-card)',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>HOOK</Mono>
          <Mono style={{
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.2,
            color: hookStrengthColors[analysis.hookStrength],
          }}>
            {hookStrengthLabels[analysis.hookStrength]}
          </Mono>
          <Mono tone="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>
            ~{analysis.hookDropEstimate}%
          </Mono>
        </div>

        <div style={{
          padding: '16px 18px',
          background: 'var(--color-bg-card)',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>SKIP RATE</Mono>
          <Mono style={{
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1,
            color: analysis.estimatedSkipRate > 50
              ? 'var(--color-accent-coral)'
              : analysis.estimatedSkipRate > 35
              ? 'var(--color-text-primary)'
              : 'var(--color-accent-lime)',
          }}>
            ~{analysis.estimatedSkipRate}%
          </Mono>
          <Mono tone="muted" style={{ fontSize: 9, lineHeight: 1.2 }}>
            30-40% normal
          </Mono>
        </div>
      </div>

      {/* Primary diagnosis */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}><Eyebrow tone="muted">DIAGNOSTIC PRINCIPAL</Eyebrow></div>
        <Body style={{ fontSize: 14, fontWeight: 500 }}>{analysis.primaryDiagnosis}</Body>
      </Card>

      {/* Viewer journey */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 24 }}><Eyebrow tone="muted">CĂLĂTORIA AUDIENȚEI · DROP-OFF PE ZONE</Eyebrow></div>

        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{
            position: 'relative',
            display: 'flex',
            height: 12,
            borderRadius: 6,
            overflow: 'visible',
            marginBottom: 12,
          }}>
            {analysis.zones.map(zone => (
              <div
                key={zone.zone}
                style={{
                  width: `${zone.endPercent - zone.startPercent}%`,
                  background: zone.severity === 'critical' ? 'var(--color-accent-coral)'
                    : zone.severity === 'warning' ? 'var(--color-accent-amber)'
                    : 'var(--color-accent-lime)',
                  opacity: zone.severity === 'ok' ? 0.3 : 0.8,
                }}
              />
            ))}

            <div style={{
              position: 'absolute',
              top: -28,
              left: `${markerLeft}%`,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <Mono style={{
                fontSize: 9,
                color: 'var(--color-accent-coral)',
                whiteSpace: 'nowrap',
                marginBottom: 4,
              }}>
                ↑ DROP-OFF MEDIAN
              </Mono>
              <div style={{
                width: 2,
                height: 28,
                background: 'var(--color-accent-coral)',
                borderRadius: 1,
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', marginTop: 0 }}>
            {analysis.zones.map(zone => {
              const zoneLabel = zone.zone.replace('_', ' ').toUpperCase();
              // Shorten long labels
              const shortLabel = zoneLabel === 'BODY EARLY' ? 'BODY\nEARLY'
                : zoneLabel === 'BODY MID' ? 'BODY\nMID'
                : zoneLabel === 'BODY LATE' ? 'BODY\nLATE'
                : zoneLabel;
              return (
                <Mono
                  key={zone.zone}
                  tone="muted"
                  style={{
                    fontSize: 7,
                    width: `${zone.endPercent - zone.startPercent}%`,
                    textAlign: 'center',
                    letterSpacing: 0,
                    lineHeight: 1.2,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {shortLabel}
                </Mono>
              );
            })}
          </div>
        </div>

        <div>
          {analysis.zones.map(zone => (
            <ZoneBar key={zone.zone} zone={zone} />
          ))}
        </div>
      </Card>

      {/* Top fixes */}
      {analysis.topFixes.length > 0 && (
        <Card variant="positive">
          <div style={{ marginBottom: 12 }}><Eyebrow tone="lime">CE TREBUIE SCHIMBAT</Eyebrow></div>
          {analysis.topFixes.map((fix, i) => (
            <div key={i} style={{ marginBottom: i < analysis.topFixes.length - 1 ? 12 : 0 }}>
              <Body style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--color-accent-lime)', marginRight: 8 }}>
                  {i + 1}.
                </span>
                {fix}
              </Body>
            </div>
          ))}
        </Card>
      )}

      <div style={{ marginTop: 12 }}>
        <Mono tone="muted" style={{ fontSize: 10 }}>
          BENCHMARKS (creatori financiari 2026): Completion &gt;{analysis.benchmarks.completionRateGood}% = bun,
          &gt;{analysis.benchmarks.completionRateExcellent}% = excelent.
          Skip rate 30-40% = normal, &gt;&gt;50% = pierde distribuție.
          {!analysis.hasTranscript && ' Activează transcrierea pentru diagnostic complet cu citate din video.'}
          {analysis.dataConfidence === 'medium' && ' Diagrama e estimativă — bazată pe avg watch time fără curbă per-secundă (indisponibilă în API).'}
        </Mono>
      </div>
    </section>
  );
}
