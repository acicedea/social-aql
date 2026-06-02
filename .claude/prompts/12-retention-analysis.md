# AI LICHIDITATE — Prompt 12: Video Retention Analysis

## Context

Meta Graph API nu expune curba de retenție per-secundă. Dar avem:
- `ig_reels_avg_watch_time` (ms) — când a plecat "omul mediu"
- `ig_reels_video_view_total_time` (ms) — total watch time cumulat
- `completion_rate` — calculat din cele de mai sus
- Transcript cu timestamps exacte per segment
- Duration exactă din ultimul segment al transcriptului

Din aceste date putem deduce în ce zonă a Reel-ului s-au pierdut oamenii
și, cross-referencing cu transcriptul, EXPLICĂM DE CE și propunem fix-uri.

## SCOPE BOUNDARY

Acest prompt face CINCI lucruri:
1. `src/lib/retention/retention-analyzer.ts` — engine determinist (TypeScript pur)
2. `src/lib/retention/retention-types.ts` — tipuri
3. `src/components/posts/RetentionDiagnosticCard.tsx` — UI în post detail
4. Wire în post detail page
5. Coloană nouă în `posts_with_latest_metrics` view (nu migration nouă —
   folosim câmpuri existente calculate diferit)

Nu se adaugă tabele noi. Nu se modifică sync. Nu se modifică alte pagini.

## Carry-over (LOCKED)

- Transcript section existentă — neatinsă
- PostDiagnosticChecklist — neatins
- PostCritiqueSection — neatins
- KPI engine — neatins
- Design system tokens

## Files allowed to change

New:
- `src/lib/retention/retention-types.ts`
- `src/lib/retention/retention-analyzer.ts`
- `src/lib/retention/benchmarks.ts`
- `src/components/posts/RetentionDiagnosticCard.tsx`

Modified:
- `src/app/dashboard/posts/[id]/page.tsx` — adaugă RetentionDiagnosticCard
- `src/providers/meta-instagram/insights-config.ts` — asigură că fetch-uim
  avg_watch_time și total_watch_time la sync

## DO NOT TOUCH

- Sync flow core
- KPI engine
- Toate celelalte pagini
- Analyses runner
- Chat

---

## Deliverable 1: Retention types

Create `src/lib/retention/retention-types.ts`:

```ts
// Zona din Reel unde s-au pierdut cei mai mulți oameni
export type DropOffZone =
  | 'hook'           // 0 - 20% din durată (primele ~10s pt un Reel de 45s)
  | 'body_early'     // 20 - 45% din durată
  | 'body_mid'       // 45 - 70% din durată
  | 'body_late'      // 70 - 90% din durată
  | 'cta'            // ultimele 10% din durată
  | 'unknown';       // date insuficiente

export type RetentionHealth =
  | 'excellent'   // completion > 60%
  | 'good'        // completion 40-60%
  | 'average'     // completion 25-40%
  | 'poor'        // completion 15-25%
  | 'critical';   // completion < 15%

export type HookStrength =
  | 'strong'      // drop în primele 20% < 30%
  | 'average'     // drop în primele 20% 30-50%
  | 'weak'        // drop în primele 20% > 50%
  | 'unknown';

export interface RetentionZoneAnalysis {
  zone: DropOffZone;
  zoneLabel: string;              // "HOOK (0-9s)"
  startSecond: number;
  endSecond: number;
  startPercent: number;           // % din durată
  endPercent: number;
  transcriptText: string | null;  // ce s-a spus în această zonă
  estimatedViewerLoss: number;    // % estimat de viewers pierduți în această zonă
  diagnosis: string;              // ce înseamnă
  fix: string | null;             // ce să faci concret
  severity: 'critical' | 'warning' | 'ok';
}

export interface RetentionAnalysis {
  // Date brute
  durationSeconds: number;
  avgWatchTimeSeconds: number;
  totalWatchTimeSeconds: number;
  plays: number;

  // Metrici calculate
  completionRate: number;         // 0-100%
  estimatedSkipRate: number;      // 0-100% (aproximat)
  retentionHealth: RetentionHealth;
  primaryDropOffZone: DropOffZone;
  primaryDropOffSecond: number;   // ~avg_watch_time

  // Hook analysis
  hookStrength: HookStrength;
  hookDurationSeconds: number;    // primele 20% din durată
  hookTranscript: string | null;
  hookDropEstimate: number;       // % pierduți în hook

  // Zone breakdown
  zones: RetentionZoneAnalysis[];

  // Verdict final
  overallScore: number;           // 0-100
  primaryDiagnosis: string;       // fraza principală
  topIssues: string[];            // max 3 probleme concrete
  topFixes: string[];             // max 3 fix-uri concrete

  // Benchmarks folosite
  benchmarks: {
    completionRateGood: number;
    completionRateExcellent: number;
    hookDropNormal: number;
    hookDropCritical: number;
  };

  // Calitate date
  hasTranscript: boolean;
  dataConfidence: 'high' | 'medium' | 'low';
  // low = lipsă transcript sau avg_watch_time indisponibil
}
```

---

## Deliverable 2: Benchmarks

Create `src/lib/retention/benchmarks.ts`:

```ts
// Benchmarks bazate pe research Instagram 2026
// Surse: Metricool, inro.social, getphyllo.com

export const RETENTION_BENCHMARKS = {
  // Completion rate (avg_watch_time / duration)
  completionRate: {
    excellent: 60,    // >60% = excelent
    good: 40,         // 40-60% = bun
    average: 25,      // 25-40% = mediu
    poor: 15,         // 15-25% = slab
    // <15% = critic
  },

  // Skip rate (procentul care pleacă fără să urmărească)
  skipRate: {
    excellent: 20,    // <20% skip = excelent
    good: 30,         // 20-30% = bun
    average: 40,      // 30-40% = normal (Instagram confirmă 30-40% e sănătos)
    poor: 50,         // 40-50% = slab
    // >50% = critic, pierde distribuție
  },

  // Drop în hook (primele 20% din durată)
  // Normal: o scădere de 20-35% în primele secunde e NORMALĂ (scroll-by behavior)
  hookDrop: {
    normal: 35,       // <35% pleacă în hook = ok
    warning: 50,      // 35-50% = hook slab
    critical: 60,     // >50% pleacă în hook = hook critic
  },

  // Viewing zones — ce procent din viewers rămâne la fiecare zonă
  // Bazat pe o curbă de retenție "sănătoasă" pentru financial content
  healthyRetentionCurve: {
    afterHook: 65,        // după primele 20% din durată, ~65% din viewers rămân
    afterBodyEarly: 50,   // după 45% din durată, ~50% rămân
    afterBodyMid: 40,     // după 70% din durată, ~40% rămân
    atCta: 35,            // la CTA (ultimele 10%), ~35% rămân
  },

  // Durata minimă a hook-ului recomandat
  hookDurationSeconds: {
    min: 3,    // minimum 3 secunde de hook
    optimal: 8, // optimal 5-8 secunde
    max: 12,   // maxim 12 secunde înainte de a intra în body
  },
} as const;

export function getCompletionRateHealth(
  completionRate: number,
): 'excellent' | 'good' | 'average' | 'poor' | 'critical' {
  if (completionRate >= RETENTION_BENCHMARKS.completionRate.excellent) return 'excellent';
  if (completionRate >= RETENTION_BENCHMARKS.completionRate.good) return 'good';
  if (completionRate >= RETENTION_BENCHMARKS.completionRate.average) return 'average';
  if (completionRate >= RETENTION_BENCHMARKS.completionRate.poor) return 'poor';
  return 'critical';
}

export function getHookStrength(
  hookDropPercent: number,
): 'strong' | 'average' | 'weak' {
  if (hookDropPercent <= RETENTION_BENCHMARKS.hookDrop.normal) return 'strong';
  if (hookDropPercent <= RETENTION_BENCHMARKS.hookDrop.warning) return 'average';
  return 'weak';
}
```

---

## Deliverable 3: Retention Analyzer Engine

Create `src/lib/retention/retention-analyzer.ts`:

```ts
import type { TranscriptionSegment } from '@/lib/transcription/types';
import type {
  RetentionAnalysis,
  RetentionZoneAnalysis,
  DropOffZone,
  HookStrength,
} from './retention-types';
import {
  RETENTION_BENCHMARKS,
  getCompletionRateHealth,
  getHookStrength,
} from './benchmarks';

interface RetentionInput {
  // Din Meta API (deja în DB)
  avgWatchTimeMs: number | null;           // ig_reels_avg_watch_time (ms)
  totalWatchTimeMs: number | null;         // ig_reels_video_view_total_time (ms)
  plays: number | null;                    // views/plays

  // Din transcript
  segments: TranscriptionSegment[] | null;
  transcript: string | null;

  // Fallback dacă transcript lipsește
  estimatedDurationSeconds?: number | null;
}

// ── Time helpers ──────────────────────────────────────────────────────

function parseTimeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return 0;
}

function getTranscriptDuration(segments: TranscriptionSegment[]): number {
  if (segments.length === 0) return 0;
  return parseTimeToSeconds(segments[segments.length - 1].end);
}

function getTranscriptTextInRange(
  segments: TranscriptionSegment[],
  startSec: number,
  endSec: number,
): string {
  return segments
    .filter(s => {
      const sStart = parseTimeToSeconds(s.start);
      const sEnd = parseTimeToSeconds(s.end);
      // Segment overlap cu range-ul cerut
      return sStart < endSec && sEnd > startSec;
    })
    .map(s => s.text)
    .join(' ')
    .trim();
}

// ── Zone definitions ──────────────────────────────────────────────────

function defineZones(durationSeconds: number): Array<{
  zone: DropOffZone;
  label: string;
  startPercent: number;
  endPercent: number;
}> {
  return [
    { zone: 'hook', label: 'HOOK', startPercent: 0, endPercent: 20 },
    { zone: 'body_early', label: 'BODY DEVREME', startPercent: 20, endPercent: 45 },
    { zone: 'body_mid', label: 'BODY MIJLOC', startPercent: 45, endPercent: 70 },
    { zone: 'body_late', label: 'BODY TÂRZIU', startPercent: 70, endPercent: 90 },
    { zone: 'cta', label: 'CTA / FINAL', startPercent: 90, endPercent: 100 },
  ];
}

// ── Zone viewer loss estimation ────────────────────────────────────────
// Folosim un model simplificat de curbă de retenție.
// Știm completion_rate și estimăm distribuția drop-off-ului.
// Modelul: decădere exponențială cu "accelerare" în zona hook.

function estimateZoneViewerLoss(
  zone: DropOffZone,
  completionRate: number, // 0-100
  primaryDropOffPercent: number, // unde e avg_watch_time (% din durată)
): number {
  // Ce procent din total viewers au plecat în fiecare zonă
  // Bazat pe: avg_watch_time e aproape de "mode" al distribuției de drop-off

  const totalLoss = 100 - completionRate; // % din viewers care NU au ajuns la final

  // Distribuție estimată a pierderii pe zone (sume la ~totalLoss)
  // Dacă avg_watch_time e în HOOK: hook pierde ~60% din totalLoss
  // Dacă avg_watch_time e în BODY_MID: loss e mai distribuit

  const zoneWeights: Record<DropOffZone, number> = {
    hook: 0,
    body_early: 0,
    body_mid: 0,
    body_late: 0,
    cta: 0,
    unknown: 0,
  };

  if (primaryDropOffPercent <= 20) {
    // Drop masiv în hook
    zoneWeights.hook = 0.60;
    zoneWeights.body_early = 0.20;
    zoneWeights.body_mid = 0.12;
    zoneWeights.body_late = 0.06;
    zoneWeights.cta = 0.02;
  } else if (primaryDropOffPercent <= 45) {
    // Drop în body devreme
    zoneWeights.hook = 0.30;
    zoneWeights.body_early = 0.40;
    zoneWeights.body_mid = 0.18;
    zoneWeights.body_late = 0.09;
    zoneWeights.cta = 0.03;
  } else if (primaryDropOffPercent <= 70) {
    // Drop la mijloc
    zoneWeights.hook = 0.25;
    zoneWeights.body_early = 0.25;
    zoneWeights.body_mid = 0.30;
    zoneWeights.body_late = 0.15;
    zoneWeights.cta = 0.05;
  } else {
    // Drop târziu — content bun
    zoneWeights.hook = 0.20;
    zoneWeights.body_early = 0.20;
    zoneWeights.body_mid = 0.20;
    zoneWeights.body_late = 0.25;
    zoneWeights.cta = 0.15;
  }

  return Math.round((zoneWeights[zone] ?? 0) * totalLoss);
}

// ── Zone diagnosis ────────────────────────────────────────────────────

function diagnoseZone(
  zone: DropOffZone,
  estimatedLoss: number,
  transcriptText: string | null,
  completionRate: number,
): { diagnosis: string; fix: string | null; severity: 'critical' | 'warning' | 'ok' } {
  const isCritical = estimatedLoss > 20;
  const isWarning = estimatedLoss > 10;

  switch (zone) {
    case 'hook':
      if (isCritical) return {
        diagnosis: `Hook critic — aproximativ ${estimatedLoss}% din viewers au plecat în primele secunde.${
          transcriptText ? ` Ce s-a spus: "${transcriptText.slice(0, 80)}..."` : ''
        } Aceasta e zona cu cel mai mare impact asupra distribuției algoritmice.`,
        fix: 'Rescrie primele 3-5 secunde cu o cifră surpriză, o contradicție sau o problemă directă. Evită afirmațiile evidente sau introducerile generice.',
        severity: 'critical',
      };
      if (isWarning) return {
        diagnosis: `Hook slab — ~${estimatedLoss}% viewers pierduți în introducere. Normal e sub 35%.`,
        fix: 'Testează un hook tip "Nu, X nu înseamnă Y" sau deschide direct cu implicația pentru portofoliu.',
        severity: 'warning',
      };
      return {
        diagnosis: `Hook solid — pierdere normală în primele secunde (scroll-by behavior).`,
        fix: null,
        severity: 'ok',
      };

    case 'body_early':
      if (isCritical) return {
        diagnosis: `Body devreme slab — ~${estimatedLoss}% viewers pierduți după hook.${
          transcriptText ? ` Zona: "${transcriptText.slice(0, 80)}..."` : ''
        } Hook-ul a promis ceva ce conținutul nu a livrat rapid.`,
        fix: 'Livrează promisiunea hook-ului imediat după. Nu există "warmare" la Reels — treci direct la informație.',
        severity: 'critical',
      };
      if (isWarning) return {
        diagnosis: `Tranziție hook→body slabă — ritmul scade după introducere.`,
        fix: 'Adaugă un "mini-conflict" imediat după hook — o statistică sau un exemplu concret înainte de explicație.',
        severity: 'warning',
      };
      return {
        diagnosis: 'Tranziție hook→body solidă.',
        fix: null,
        severity: 'ok',
      };

    case 'body_mid':
      if (isCritical) return {
        diagnosis: `Body mijloc slab — ~${estimatedLoss}% viewers pierduți la mijlocul video-ului.${
          transcriptText ? ` Zona: "${transcriptText.slice(0, 80)}..."` : ''
        } Posibil: explicație prea lungă, lipsă de ritm, sau conținut repetitiv.`,
        fix: 'Adaugă un "re-hook" la mijloc — o nouă întrebare sau un reveal parțial care menține tensiunea.',
        severity: 'critical',
      };
      if (isWarning) return {
        diagnosis: `Ritm slab la mijloc — atenția scade mai repede decât normal.`,
        fix: 'Tăia 20% din conținutul din zona de mijloc. Fiecare secundă trebuie să aducă informație nouă.',
        severity: 'warning',
      };
      return {
        diagnosis: 'Body mijloc solid — audiența rămâne angajată.',
        fix: null,
        severity: 'ok',
      };

    case 'body_late':
      if (isCritical) return {
        diagnosis: `Final slab — ~${estimatedLoss}% viewers pierduți înainte de CTA.${
          transcriptText ? ` Zona: "${transcriptText.slice(0, 80)}..."` : ''
        }`,
        fix: 'Adaugă un "bonus tip" sau o revelație suplimentară la 80% din durată pentru a menține viewers până la CTA.',
        severity: 'warning',
      };
      return {
        diagnosis: 'Retenție bună spre final.',
        fix: null,
        severity: 'ok',
      };

    case 'cta':
      if (isCritical) return {
        diagnosis: `CTA ratat — puțini viewers ajung la final. Salvarea și trimiterea sunt minimale.`,
        fix: 'Dacă completion rate-ul e sub 25%, CTA verbal nu e auzit. Adaugă text grafic "SALVEAZĂ" din secunda 80% din durată.',
        severity: 'warning',
      };
      return {
        diagnosis: 'CTA zona accesibilă pentru viewers care rămân.',
        fix: null,
        severity: 'ok',
      };

    default:
      return { diagnosis: 'Date insuficiente.', fix: null, severity: 'ok' };
  }
}

// ── Primary drop-off zone ─────────────────────────────────────────────

function determinePrimaryDropOffZone(dropOffPercent: number): DropOffZone {
  if (dropOffPercent <= 20) return 'hook';
  if (dropOffPercent <= 45) return 'body_early';
  if (dropOffPercent <= 70) return 'body_mid';
  if (dropOffPercent <= 90) return 'body_late';
  return 'cta';
}

// ── Main function ─────────────────────────────────────────────────────

export function analyzeRetention(input: RetentionInput): RetentionAnalysis | null {
  const avgWatchTimeSec = input.avgWatchTimeMs != null
    ? input.avgWatchTimeMs / 1000
    : null;

  const segments = input.segments ?? [];
  const hasTranscript = segments.length > 0 && !!input.transcript;

  // Duration din transcript sau fallback
  let durationSeconds = hasTranscript
    ? getTranscriptDuration(segments)
    : (input.estimatedDurationSeconds ?? null);

  if (!durationSeconds || durationSeconds === 0) return null;
  if (!avgWatchTimeSec || avgWatchTimeSec === 0) {
    // Nu avem avg watch time — returnăm analiză minimă
    return null;
  }

  // Completion rate
  const completionRate = Math.min(100,
    Math.round((avgWatchTimeSec / durationSeconds) * 100)
  );

  // Estimated skip rate
  // Skip rate = % care pleacă în primele 3 secunde
  // Dacă avg_watch_time e mic → skip rate mare
  const estimatedSkipRate = avgWatchTimeSec < 3
    ? 80
    : avgWatchTimeSec < 5
    ? Math.round(70 - (avgWatchTimeSec - 3) * 10)
    : Math.max(0, Math.round(50 - completionRate * 0.3));

  // Unde e primary drop-off (% din durată)
  const dropOffPercent = Math.round((avgWatchTimeSec / durationSeconds) * 100);
  const primaryDropOffZone = determinePrimaryDropOffZone(dropOffPercent);

  // Hook analysis
  const hookEndSeconds = Math.round(durationSeconds * 0.20);
  const hookTranscript = hasTranscript
    ? getTranscriptTextInRange(segments, 0, hookEndSeconds)
    : null;
  const hookDropEstimate = estimateZoneViewerLoss('hook', completionRate, dropOffPercent);
  const hookStrength = getHookStrength(hookDropEstimate);

  // Zone analysis
  const zoneDefs = defineZones(durationSeconds);
  const zones: RetentionZoneAnalysis[] = zoneDefs.map(z => {
    const startSec = Math.round((z.startPercent / 100) * durationSeconds!);
    const endSec = Math.round((z.endPercent / 100) * durationSeconds!);
    const transcriptText = hasTranscript
      ? getTranscriptTextInRange(segments, startSec, endSec) || null
      : null;
    const estimatedLoss = estimateZoneViewerLoss(z.zone, completionRate, dropOffPercent);
    const { diagnosis, fix, severity } = diagnoseZone(
      z.zone, estimatedLoss, transcriptText, completionRate
    );

    return {
      zone: z.zone,
      zoneLabel: `${z.label} (${startSec}s–${endSec}s)`,
      startSecond: startSec,
      endSecond: endSec,
      startPercent: z.startPercent,
      endPercent: z.endPercent,
      transcriptText,
      estimatedViewerLoss: estimatedLoss,
      diagnosis,
      fix,
      severity,
    };
  });

  // Overall score
  const retentionHealth = getCompletionRateHealth(completionRate);
  const healthScore: Record<string, number> = {
    excellent: 95, good: 75, average: 50, poor: 30, critical: 10,
  };
  const overallScore = healthScore[retentionHealth] ?? 50;

  // Top issues and fixes
  const problematicZones = zones
    .filter(z => z.severity !== 'ok' && z.fix)
    .sort((a, b) => b.estimatedViewerLoss - a.estimatedViewerLoss);

  const topIssues = problematicZones.slice(0, 3).map(z => z.diagnosis);
  const topFixes = problematicZones.slice(0, 3).map(z => z.fix!);

  // Primary diagnosis
  const primaryDiagnosis = buildPrimaryDiagnosis(
    completionRate, primaryDropOffZone, avgWatchTimeSec, durationSeconds, hookStrength
  );

  // Data confidence
  const dataConfidence: RetentionAnalysis['dataConfidence'] =
    hasTranscript && input.avgWatchTimeMs != null ? 'high'
    : !hasTranscript && input.avgWatchTimeMs != null ? 'medium'
    : 'low';

  return {
    durationSeconds,
    avgWatchTimeSeconds: avgWatchTimeSec,
    totalWatchTimeSeconds: input.totalWatchTimeMs != null ? input.totalWatchTimeMs / 1000 : 0,
    plays: input.plays ?? 0,
    completionRate,
    estimatedSkipRate,
    retentionHealth,
    primaryDropOffZone,
    primaryDropOffSecond: Math.round(avgWatchTimeSec),
    hookStrength,
    hookDurationSeconds: hookEndSeconds,
    hookTranscript,
    hookDropEstimate,
    zones,
    overallScore,
    primaryDiagnosis,
    topIssues,
    topFixes,
    hasTranscript,
    dataConfidence,
    benchmarks: {
      completionRateGood: RETENTION_BENCHMARKS.completionRate.good,
      completionRateExcellent: RETENTION_BENCHMARKS.completionRate.excellent,
      hookDropNormal: RETENTION_BENCHMARKS.hookDrop.normal,
      hookDropCritical: RETENTION_BENCHMARKS.hookDrop.critical,
    },
  };
}

function buildPrimaryDiagnosis(
  completionRate: number,
  primaryDropOffZone: DropOffZone,
  avgWatchSec: number,
  durationSec: number,
  hookStrength: HookStrength,
): string {
  const zoneLabels: Record<DropOffZone, string> = {
    hook: 'în hook (primele secunde)',
    body_early: 'imediat după hook',
    body_mid: 'la mijlocul video-ului',
    body_late: 'spre final, înainte de CTA',
    cta: 'chiar înainte de CTA',
    unknown: 'nedeterminat',
  };

  const healthLabels: Record<string, string> = {
    excellent: 'Retenție excelentă',
    good: 'Retenție bună',
    average: 'Retenție medie',
    poor: 'Retenție slabă',
    critical: 'Retenție critică',
  };

  const health = getCompletionRateHealth(completionRate);
  const healthLabel = healthLabels[health];

  return `${healthLabel}: ${Math.round(avgWatchSec)}s din ${Math.round(durationSec)}s (${completionRate}% completion). ` +
    `Cei mai mulți viewers au plecat ${zoneLabels[primaryDropOffZone]}. ` +
    `Hook: ${hookStrength === 'strong' ? 'solid' : hookStrength === 'average' ? 'mediocru' : 'slab'}.`;
}
```

---

## Deliverable 4: RetentionDiagnosticCard component

Create `src/components/posts/RetentionDiagnosticCard.tsx`:

```tsx
import type { RetentionAnalysis, RetentionZoneAnalysis } from '@/lib/retention/retention-types';
import { Card, Eyebrow, H3, Body, Mono } from '@/components/design-system';

interface Props {
  analysis: RetentionAnalysis;
}

function ZoneBar({ zone, totalDuration }: {
  zone: RetentionZoneAnalysis;
  totalDuration: number;
}) {
  const widthPercent = zone.endPercent - zone.startPercent;
  const bgColor = zone.severity === 'critical' ? 'var(--color-accent-coral)'
    : zone.severity === 'warning' ? '#FF8C44'
    : 'var(--color-accent-lime)';

  const opacity = zone.severity === 'ok' ? 0.4 : 1;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Zone header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <Mono style={{ fontSize: 11, fontWeight: 700 }}>{zone.zoneLabel}</Mono>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Mono tone="muted" style={{ fontSize: 10 }}>
            ~{zone.estimatedViewerLoss}% viewers pierduți
          </Mono>
          <Mono style={{
            fontSize: 10,
            color: zone.severity === 'critical' ? 'var(--color-accent-coral)'
              : zone.severity === 'warning' ? '#FF8C44'
              : 'var(--color-accent-lime)',
          }}>
            {zone.severity === 'critical' ? '✗ CRITIC'
              : zone.severity === 'warning' ? '⚠ ATENȚIE'
              : '✓ OK'}
          </Mono>
        </div>
      </div>

      {/* Visual bar */}
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

      {/* Diagnosis */}
      <Body style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: zone.fix ? 6 : 0 }}>
        {zone.diagnosis}
      </Body>

      {/* Fix */}
      {zone.fix && (
        <Body style={{ fontSize: 12, color: 'var(--color-accent-lime)' }}>
          → {zone.fix}
        </Body>
      )}

      {/* Transcript for this zone */}
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
            "{zone.transcriptText.slice(0, 120)}{zone.transcriptText.length > 120 ? '...' : ''}"
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
        {/* Confidence badge */}
        <Mono tone="muted" style={{ fontSize: 10 }}>
          CONFIDENȚĂ DATE: {analysis.dataConfidence.toUpperCase()}
          {!analysis.hasTranscript && ' (fără transcript)'}
        </Mono>
      </div>

      {/* Top KPI row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
        marginBottom: 20,
      }}>
        {/* Completion rate */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--color-bg-card)',
          borderRadius: 6,
          borderTop: `3px solid ${healthColors[analysis.retentionHealth]}`,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>COMPLETION</Mono>
          <Mono style={{
            fontSize: 22,
            fontWeight: 700,
            color: healthColors[analysis.retentionHealth],
          }}>
            {analysis.completionRate}%
          </Mono>
          <Mono style={{ fontSize: 9, color: healthColors[analysis.retentionHealth] }}>
            {healthLabels[analysis.retentionHealth]}
          </Mono>
        </div>

        {/* Avg watch time */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--color-bg-card)',
          borderRadius: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>AVG WATCH</Mono>
          <Mono style={{ fontSize: 22, fontWeight: 700 }}>
            {Math.round(analysis.avgWatchTimeSeconds)}s
          </Mono>
          <Mono tone="muted" style={{ fontSize: 9 }}>
            din {Math.round(analysis.durationSeconds)}s total
          </Mono>
        </div>

        {/* Hook strength */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--color-bg-card)',
          borderRadius: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>HOOK</Mono>
          <Mono style={{
            fontSize: 15,
            fontWeight: 700,
            color: hookStrengthColors[analysis.hookStrength],
          }}>
            {hookStrengthLabels[analysis.hookStrength]}
          </Mono>
          <Mono tone="muted" style={{ fontSize: 9 }}>
            ~{analysis.hookDropEstimate}% pierduți în hook
          </Mono>
        </div>

        {/* Skip rate */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--color-bg-card)',
          borderRadius: 6,
        }}>
          <Mono tone="muted" style={{ fontSize: 10, marginBottom: 4 }}>SKIP RATE EST.</Mono>
          <Mono style={{
            fontSize: 22,
            fontWeight: 700,
            color: analysis.estimatedSkipRate > 50
              ? 'var(--color-accent-coral)'
              : analysis.estimatedSkipRate > 35
              ? 'var(--color-text-primary)'
              : 'var(--color-accent-lime)',
          }}>
            ~{analysis.estimatedSkipRate}%
          </Mono>
          <Mono tone="muted" style={{ fontSize: 9 }}>
            benchmark: 30-40% = normal
          </Mono>
        </div>
      </div>

      {/* Primary diagnosis */}
      <Card style={{ marginBottom: 16 }}>
        <Eyebrow tone="muted" style={{ marginBottom: 8 }}>DIAGNOSTIC PRINCIPAL</Eyebrow>
        <Body style={{ fontSize: 14, fontWeight: 500 }}>{analysis.primaryDiagnosis}</Body>
      </Card>

      {/* Viewer journey visualization */}
      <Card style={{ marginBottom: 16 }}>
        <Eyebrow tone="muted" style={{ marginBottom: 16 }}>
          CĂLĂTORIA AUDIENȚEI · DROP-OFF PE ZONE
        </Eyebrow>

        {/* Visual timeline at top */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          {/* Background bar */}
          <div style={{
            display: 'flex',
            height: 12,
            borderRadius: 6,
            overflow: 'hidden',
            marginBottom: 4,
          }}>
            {analysis.zones.map(zone => (
              <div
                key={zone.zone}
                style={{
                  width: `${zone.endPercent - zone.startPercent}%`,
                  background: zone.severity === 'critical' ? 'var(--color-accent-coral)'
                    : zone.severity === 'warning' ? '#FF8C44'
                    : 'var(--color-accent-lime)',
                  opacity: zone.severity === 'ok' ? 0.3 : 0.8,
                }}
              />
            ))}
          </div>

          {/* Drop-off marker */}
          <div style={{
            position: 'absolute',
            top: -4,
            left: `${analysis.completionRate}%`,
            transform: 'translateX(-50%)',
          }}>
            <div style={{
              width: 3,
              height: 20,
              background: 'var(--color-accent-coral)',
              borderRadius: 2,
            }} />
            <Mono style={{
              fontSize: 9,
              color: 'var(--color-accent-coral)',
              whiteSpace: 'nowrap',
              marginTop: 2,
            }}>
              ↑ DROP-OFF MEDIAN
            </Mono>
          </div>

          {/* Zone labels */}
          <div style={{ display: 'flex', marginTop: 8 }}>
            {analysis.zones.map(zone => (
              <Mono
                key={zone.zone}
                tone="muted"
                style={{
                  fontSize: 8,
                  width: `${zone.endPercent - zone.startPercent}%`,
                  textAlign: 'center',
                  letterSpacing: 0,
                }}
              >
                {zone.zone.replace('_', ' ').toUpperCase()}
              </Mono>
            ))}
          </div>
        </div>

        {/* Zone breakdown */}
        <div>
          {analysis.zones.map(zone => (
            <ZoneBar
              key={zone.zone}
              zone={zone}
              totalDuration={analysis.durationSeconds}
            />
          ))}
        </div>
      </Card>

      {/* Top fixes */}
      {analysis.topFixes.length > 0 && (
        <Card variant="positive">
          <Eyebrow tone="lime" style={{ marginBottom: 12 }}>
            CE TREBUIE SCHIMBAT
          </Eyebrow>
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

      {/* Benchmark note */}
      <div style={{ marginTop: 12 }}>
        <Mono tone="muted" style={{ fontSize: 10 }}>
          BENCHMARKS (creatori financiari 2026): Completion {'>'}{analysis.benchmarks.completionRateGood}% = bun,
          {'>'}{analysis.benchmarks.completionRateExcellent}% = excelent.
          Skip rate 30-40% = normal, {'>'}{'>'}50% = pierde distribuție.
          {!analysis.hasTranscript && ' Activează transcrierea pentru diagnostic complet cu citate din video.'}
          {analysis.dataConfidence === 'medium' && ' Diagrama e estimativă — bazată pe avg watch time fără curbă per-secundă (indisponibilă în API).'}
        </Mono>
      </div>
    </section>
  );
}
```

---

## Deliverable 5: Wire în sync — asigură fetch avg_watch_time

In `src/providers/meta-instagram/insights-config.ts`, asigură că
`ig_reels_avg_watch_time` și `ig_reels_video_view_total_time` sunt în lista
de metrici fetched la sync pentru Reels:

```ts
// Asigură că există în REELS_METRICS array:
export const REELS_METRICS = [
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saved',
  'ig_reels_avg_watch_time',           // ← OBLIGATORIU pentru retention
  'ig_reels_video_view_total_time',    // ← OBLIGATORIU pentru retention
] as const;

// Asigură maparea în mapper:
// avgWatchTimeMs → ig_reels_avg_watch_time (deja în ms de la Meta)
// totalWatchTimeMs → ig_reels_video_view_total_time (deja în ms)
```

Dacă aceste coloane nu există în `post_metrics_snapshots`, adaugă migrare simplă:

```sql
-- Adaugă dacă lipsesc (safe cu IF NOT EXISTS)
ALTER TABLE public.post_metrics_snapshots
  ADD COLUMN IF NOT EXISTS avg_watch_time_ms bigint,
  ADD COLUMN IF NOT EXISTS total_watch_time_ms bigint;
```

Actualizează `posts_with_latest_metrics` view să le includă dacă lipsesc.

---

## Deliverable 6: Wire în post detail page

In `src/app/dashboard/posts/[id]/page.tsx`:

```tsx
import { analyzeRetention } from '@/lib/retention/retention-analyzer';
import { RetentionDiagnosticCard } from '@/components/posts/RetentionDiagnosticCard';
import type { TranscriptionSegment } from '@/lib/transcription/types';

// Compute retention analysis (doar pentru Reels/Video)
const isVideo = post.media_type === 'reel' || post.media_type === 'video';

const retentionAnalysis = isVideo ? analyzeRetention({
  avgWatchTimeMs: post.avg_watch_time_ms ?? null,
  totalWatchTimeMs: post.total_watch_time_ms ?? null,
  plays: post.views ?? post.reach ?? null,
  segments: post.transcript_segments as TranscriptionSegment[] ?? null,
  transcript: post.transcript ?? null,
  estimatedDurationSeconds: null,
}) : null;

// Render după PostKpiGrid și înainte de TranscriptSection:
{retentionAnalysis && (
  <RetentionDiagnosticCard analysis={retentionAnalysis} />
)}
```

---

## Deliverable 7: Metrici în dashboard Overview tab

In `src/lib/dashboard/data.ts`, adaugă la `fetchOverviewData` un calcul agregat
de retenție pentru toate Reels-urile din perioadă:

```ts
// Adaugă la OverviewData:
videoRetentionSummary: {
  reelsWithData: number;
  avgCompletionRate: number | null;
  reelsWithWeakHook: number;
  reelsWithCriticalDrop: number;
} | null;
```

Calcul în TypeScript (nu query separat):

```ts
const reelPosts = posts.filter(p =>
  (p.media_type === 'reel' || p.media_type === 'video') &&
  p.avg_watch_time_ms != null
);

const retentionData = reelPosts.map(p => analyzeRetention({
  avgWatchTimeMs: p.avg_watch_time_ms,
  totalWatchTimeMs: p.total_watch_time_ms,
  plays: p.views ?? p.reach,
  segments: p.transcript_segments as TranscriptionSegment[] ?? null,
  transcript: p.transcript ?? null,
})).filter(Boolean);

const videoRetentionSummary = retentionData.length > 0 ? {
  reelsWithData: retentionData.length,
  avgCompletionRate: Math.round(
    retentionData.reduce((s, r) => s + r!.completionRate, 0) / retentionData.length
  ),
  reelsWithWeakHook: retentionData.filter(r => r!.hookStrength === 'weak').length,
  reelsWithCriticalDrop: retentionData.filter(r =>
    r!.retentionHealth === 'critical' || r!.retentionHealth === 'poor'
  ).length,
} : null;
```

Afișare în Overview tab ca un card separat:

```tsx
{videoRetentionSummary && (
  <Card>
    <Eyebrow tone="muted">VIDEO RETENȚIE · MEDIE PERIOADĂ</Eyebrow>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
      <div>
        <Mono tone="muted" style={{ fontSize: 10 }}>AVG COMPLETION</Mono>
        <Mono style={{
          fontSize: 24, fontWeight: 700,
          color: videoRetentionSummary.avgCompletionRate! > 40
            ? 'var(--color-accent-lime)' : 'var(--color-accent-coral)',
        }}>
          {videoRetentionSummary.avgCompletionRate}%
        </Mono>
      </div>
      <div>
        <Mono tone="muted" style={{ fontSize: 10 }}>HOOK SLAB</Mono>
        <Mono style={{ fontSize: 24, fontWeight: 700,
          color: videoRetentionSummary.reelsWithWeakHook > 0
            ? 'var(--color-accent-coral)' : 'var(--color-accent-lime)',
        }}>
          {videoRetentionSummary.reelsWithWeakHook}
        </Mono>
        <Mono tone="muted" style={{ fontSize: 9 }}>din {videoRetentionSummary.reelsWithData} Reels</Mono>
      </div>
      <div>
        <Mono tone="muted" style={{ fontSize: 10 }}>RETENȚIE CRITICĂ</Mono>
        <Mono style={{ fontSize: 24, fontWeight: 700,
          color: videoRetentionSummary.reelsWithCriticalDrop > 0
            ? 'var(--color-accent-coral)' : 'var(--color-accent-lime)',
        }}>
          {videoRetentionSummary.reelsWithCriticalDrop}
        </Mono>
        <Mono tone="muted" style={{ fontSize: 9 }}>necesită atenție</Mono>
      </div>
    </div>
  </Card>
)}
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm lint` passes
3. **avg_watch_time_ms în DB:** verifică că coloana există și e populată:
```sql
   SELECT id, avg_watch_time_ms, total_watch_time_ms
   FROM post_metrics_snapshots
   WHERE avg_watch_time_ms IS NOT NULL
   LIMIT 5;
```
   Dacă nu e populată: face re-sync al contului.
4. **Retention analysis computed:** navighează la un Reel în `/dashboard/posts/[id]`.
   Secțiunea "Retenție Video · Diagnostic" apare deasupra "Transcript".
5. **4 KPI cards:** Completion %, Avg Watch, Hook strength, Skip Rate Est. — toate afișate.
6. **Visual timeline:** bara colorată (lime/coral) cu marker "DROP-OFF MEDIAN" la completion%.
7. **Zone breakdown:** 5 zone (HOOK, BODY DEVREME, BODY MIJLOC, BODY TÂRZIU, CTA/FINAL).
   Fiecare zonă cu bar, diagnosis, fix (dacă severity != ok).
8. **Transcript în zone:** pentru Reels cu transcript, fiecare zonă problematică
   afișează ce s-a spus în acea zonă (citat italic).
9. **Realism check — Reel din screenshot** (piețele emergente, 49s):
   - Duration: 49s (din segment 0:45-0:49)
   - Dacă avg_watch_time e ~8s → completion 16% → "CRITIC"
   - Hook zone (0-10s): afișează "Piețele emergente par interesante..."
   - Diagnosis: "Hook critic — platitudine, nicio tensiune"
10. **Reel fără transcript:** secțiunea apare cu confidence "medium" și nota
    "Activează transcrierea pentru diagnostic complet".
11. **Dashboard Overview:** widget "VIDEO RETENȚIE · MEDIE PERIOADĂ" apare
    cu completion rate mediu și count de hook slab/critic.
12. **Doar pentru Reels:** pe o imagine sau carousel, secțiunea nu apare.
13. **Fără regresi:** `/dashboard`, `/dashboard/posts`, analyses — toate funcționează.

## Notes pentru Claude Code

- `analyzeRetention` returnează `null` dacă lipsesc datele minime (avg_watch_time sau duration).
  Tratează graceful în page: `retentionAnalysis && <RetentionDiagnosticCard />`.
- **Estimările sunt aproximări** — nu curba exactă per-secundă. Documentează clar în UI
  cu nota "CONFIDENȚĂ DATE: MEDIUM" și explicația că API-ul Meta nu expune curba per-secundă.
- **avg_watch_time_ms din Meta** vine în **milisecunde** — împarte la 1000 pentru secunde.
  Verifică în DB că valorile sunt în range realist (ex: 8000ms = 8s pentru un Reel de 49s).
- `estimatedSkipRate` e o aproximație bazată pe completion rate și avg_watch_time.
  Nu e exact — Instagram calculează skip rate intern (primele 3 secunde). Menționează "Est." în UI.
- **Modelul de distribuție** (`zoneWeights`) e o simplificare. Funcționează bine când
  `primaryDropOffZone` e corect determinat. Nu e un model statistic riguros.
- Dacă `avg_watch_time_ms` e mai mare decât `duration * 1000` (poate din replays incluse),
  cap la duration: `completionRate = Math.min(100, ...)`.
- Visual timeline marker: poziția `left: ${analysis.completionRate}%` poate ieși din bounds
  dacă completionRate > 95%. Adaugă `Math.min(completionRate, 95)` pentru poziție.