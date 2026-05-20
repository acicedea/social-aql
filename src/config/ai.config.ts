import type { AiTier } from '@/ai/providers/types';
import type { NormalizedAnalysisBundle } from '@/lib/ai/bundle-types';
import {
  weeklyUserTemplate,
  patternsUserTemplate,
  topPerformersUserTemplate,
} from '@/lib/ai/templates';

export interface AnalysisDefinition {
  id: string;
  displayName: string;
  description: string;
  tier: AiTier;
  systemPrompt: string;
  userTemplate: (input: NormalizedAnalysisBundle) => string;
  includeImages: boolean;
  outputFormat: 'markdown';
}

export const aiConfig: {
  defaultTier: AiTier;
  maxTokens: { batch: number; deep: number };
  temperature: number;
  analyses: Record<string, AnalysisDefinition>;
} = {
  defaultTier: (process.env.AI_DEFAULT_TIER as AiTier) ?? 'batch',
  maxTokens: { batch: 2048, deep: 4096 },
  temperature: 0.6,
  analyses: {
    weekly_summary: {
      id: 'weekly_summary',
      displayName: 'Rezumat săptămânal',
      description: 'Performanță pe ultimele 7 zile cu observații rapide.',
      tier: 'batch',
      includeImages: false,
      outputFormat: 'markdown',
      systemPrompt: `Ești un analist de marketing de conținut. Vorbești în română, direct, fără politețuri. Folosești terminologie de social media în engleză când este standard (reach, impressions, engagement). Răspunzi în Markdown structurat.`,
      userTemplate: weeklyUserTemplate,
    },
    content_patterns: {
      id: 'content_patterns',
      displayName: 'Tipare de conținut',
      description:
        'Analiză de pattern-uri ce funcționează vs. ce nu, pe baza ultimelor 30 de zile.',
      tier: 'deep',
      includeImages: true,
      outputFormat: 'markdown',
      systemPrompt: `Ești un strategist senior de social media. Analizezi pattern-uri în conținut și performanță. Vorbești română, direct, cu observații concrete și acționabile. Returnezi Markdown cu secțiuni clare: Ce funcționează, Ce nu funcționează, Ipoteze, Recomandări.`,
      userTemplate: patternsUserTemplate,
    },
    top_performers: {
      id: 'top_performers',
      displayName: 'Top postări',
      description: 'Top 5 și bottom 5 postări cu interpretare a diferențelor.',
      tier: 'batch',
      includeImages: false,
      outputFormat: 'markdown',
      systemPrompt: `Ești un analist de date. Vorbești română, sintetic. Răspunzi în Markdown.`,
      userTemplate: topPerformersUserTemplate,
    },
  },
};
