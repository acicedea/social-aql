export type AnalysisType = 'weekly_summary' | 'content_patterns' | 'content_ideation';

export interface AnalysisMetadata {
  id: string;
  userId: string;
  accountId: string | null;
  analysisType: AnalysisType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggerSource: 'manual' | 'cron';
  createdAt: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  model: string;
  tokensUsed: number | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface PostRef {
  post_id: string;
  caption: string;
}

export interface KeyFinding {
  title: string;
  detail: string;
  tone: 'positive' | 'negative' | 'neutral';
  metric?: string;
  evidence?: PostRef[];
}

export interface Recommendation {
  action: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
}

export interface PostReference {
  post_id: string;
  caption: string;
  metric: string;
  theme: string | null;
}

export interface WeeklySummaryOutput {
  headline: string;
  period_comparison: {
    summary: string;
    er_change: string;
    reach_change: string;
    follower_change: string;
  };
  top_performers: PostReference[];
  key_findings: KeyFinding[];
  recommendations: Recommendation[];
  narrative_markdown: string;
}

export interface ContentPatternsOutput {
  headline: string;
  patterns: Array<{
    pattern: string;
    evidence: PostRef[] | string;
    impact: 'high' | 'medium' | 'low';
  }>;
  theme_performance: Array<{
    theme: string;
    avg_er: string;
    avg_saves: string;
    verdict: string;
  }>;
  format_insights: KeyFinding[];
  recommendations: Recommendation[];
  narrative_markdown: string;
}

export interface ContentIdeationOutput {
  headline: string;
  ideas: Array<{
    title: string;
    hook: string;
    format: string;
    theme: string;
    rationale: string;
    structure: string;
    post_references?: PostRef[];
  }>;
  narrative_markdown: string;
}

export type AnalysisOutput =
  | WeeklySummaryOutput
  | ContentPatternsOutput
  | ContentIdeationOutput;
