export type DropOffZone =
  | 'hook'
  | 'body_early'
  | 'body_mid'
  | 'body_late'
  | 'cta'
  | 'unknown';

export type RetentionHealth =
  | 'excellent'
  | 'good'
  | 'average'
  | 'poor'
  | 'critical';

export type HookStrength =
  | 'strong'
  | 'average'
  | 'weak'
  | 'unknown';

export interface RetentionZoneAnalysis {
  zone: DropOffZone;
  zoneLabel: string;
  startSecond: number;
  endSecond: number;
  startPercent: number;
  endPercent: number;
  transcriptText: string | null;
  estimatedViewerLoss: number;
  diagnosis: string;
  fix: string | null;
  severity: 'critical' | 'warning' | 'ok';
}

export interface RetentionAnalysis {
  durationSeconds: number;
  avgWatchTimeSeconds: number;
  totalWatchTimeSeconds: number;
  plays: number;

  completionRate: number;
  estimatedSkipRate: number;
  retentionHealth: RetentionHealth;
  primaryDropOffZone: DropOffZone;
  primaryDropOffSecond: number;

  hookStrength: HookStrength;
  hookDurationSeconds: number;
  hookTranscript: string | null;
  hookDropEstimate: number;

  zones: RetentionZoneAnalysis[];

  overallScore: number;
  primaryDiagnosis: string;
  topIssues: string[];
  topFixes: string[];

  benchmarks: {
    completionRateGood: number;
    completionRateExcellent: number;
    hookDropNormal: number;
    hookDropCritical: number;
  };

  hasTranscript: boolean;
  dataConfidence: 'high' | 'medium' | 'low';
}
