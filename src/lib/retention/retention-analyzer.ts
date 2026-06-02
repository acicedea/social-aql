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
  avgWatchTimeMs: number | null;
  totalWatchTimeMs: number | null;
  plays: number | null;
  segments: TranscriptionSegment[] | null;
  transcript: string | null;
  estimatedDurationSeconds?: number | null;
}

function parseTimeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return 0;
}

function getTranscriptDuration(segments: TranscriptionSegment[]): number {
  if (segments.length === 0) return 0;
  return parseTimeToSeconds(segments[segments.length - 1]!.end);
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
      return sStart < endSec && sEnd > startSec;
    })
    .map(s => s.text)
    .join(' ')
    .trim();
}

function defineZones(): Array<{
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

function estimateZoneViewerLoss(
  zone: DropOffZone,
  completionRate: number,
  primaryDropOffPercent: number,
): number {
  const totalLoss = 100 - completionRate;

  const zoneWeights: Record<DropOffZone, number> = {
    hook: 0,
    body_early: 0,
    body_mid: 0,
    body_late: 0,
    cta: 0,
    unknown: 0,
  };

  if (primaryDropOffPercent <= 20) {
    zoneWeights.hook = 0.60;
    zoneWeights.body_early = 0.20;
    zoneWeights.body_mid = 0.12;
    zoneWeights.body_late = 0.06;
    zoneWeights.cta = 0.02;
  } else if (primaryDropOffPercent <= 45) {
    zoneWeights.hook = 0.30;
    zoneWeights.body_early = 0.40;
    zoneWeights.body_mid = 0.18;
    zoneWeights.body_late = 0.09;
    zoneWeights.cta = 0.03;
  } else if (primaryDropOffPercent <= 70) {
    zoneWeights.hook = 0.25;
    zoneWeights.body_early = 0.25;
    zoneWeights.body_mid = 0.30;
    zoneWeights.body_late = 0.15;
    zoneWeights.cta = 0.05;
  } else {
    zoneWeights.hook = 0.20;
    zoneWeights.body_early = 0.20;
    zoneWeights.body_mid = 0.20;
    zoneWeights.body_late = 0.25;
    zoneWeights.cta = 0.15;
  }

  return Math.round((zoneWeights[zone] ?? 0) * totalLoss);
}

function diagnoseZone(
  zone: DropOffZone,
  estimatedLoss: number,
  transcriptText: string | null,
  _completionRate: number,
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
        diagnosis: 'Hook solid — pierdere normală în primele secunde (scroll-by behavior).',
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
        diagnosis: 'Tranziție hook→body slabă — ritmul scade după introducere.',
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
        diagnosis: 'Ritm slab la mijloc — atenția scade mai repede decât normal.',
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
        diagnosis: 'CTA ratat — puțini viewers ajung la final. Salvarea și trimiterea sunt minimale.',
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

function determinePrimaryDropOffZone(dropOffPercent: number): DropOffZone {
  if (dropOffPercent <= 20) return 'hook';
  if (dropOffPercent <= 45) return 'body_early';
  if (dropOffPercent <= 70) return 'body_mid';
  if (dropOffPercent <= 90) return 'body_late';
  return 'cta';
}

export function analyzeRetention(input: RetentionInput): RetentionAnalysis | null {
  const avgWatchTimeSec = input.avgWatchTimeMs != null
    ? input.avgWatchTimeMs / 1000
    : null;

  const segments = input.segments ?? [];
  const hasTranscript = segments.length > 0 && !!input.transcript;

  const durationSeconds = hasTranscript
    ? getTranscriptDuration(segments)
    : (input.estimatedDurationSeconds ?? null);

  if (!durationSeconds || durationSeconds === 0) return null;
  if (!avgWatchTimeSec || avgWatchTimeSec === 0) return null;

  const completionRate = Math.min(100,
    Math.round((avgWatchTimeSec / durationSeconds) * 100)
  );

  const estimatedSkipRate = avgWatchTimeSec < 3
    ? 80
    : avgWatchTimeSec < 5
    ? Math.round(70 - (avgWatchTimeSec - 3) * 10)
    : Math.max(0, Math.round(50 - completionRate * 0.3));

  const dropOffPercent = Math.round((avgWatchTimeSec / durationSeconds) * 100);
  const primaryDropOffZone = determinePrimaryDropOffZone(dropOffPercent);

  const hookEndSeconds = Math.round(durationSeconds * 0.20);
  const hookTranscript = hasTranscript
    ? getTranscriptTextInRange(segments, 0, hookEndSeconds)
    : null;
  const hookDropEstimate = estimateZoneViewerLoss('hook', completionRate, dropOffPercent);
  const hookStrength: HookStrength = getHookStrength(hookDropEstimate);

  const zoneDefs = defineZones();
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

  const retentionHealth = getCompletionRateHealth(completionRate);
  const healthScore: Record<string, number> = {
    excellent: 95, good: 75, average: 50, poor: 30, critical: 10,
  };
  const overallScore = healthScore[retentionHealth] ?? 50;

  const problematicZones = zones
    .filter(z => z.severity !== 'ok' && z.fix)
    .sort((a, b) => b.estimatedViewerLoss - a.estimatedViewerLoss);

  const topIssues = problematicZones.slice(0, 3).map(z => z.diagnosis);
  const topFixes = problematicZones.slice(0, 3).map(z => z.fix!);

  const primaryDiagnosis = buildPrimaryDiagnosis(
    completionRate, primaryDropOffZone, avgWatchTimeSec, durationSeconds, hookStrength
  );

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
