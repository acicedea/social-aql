const POST_REF_SCHEMA = {
  type: 'object',
  properties: {
    post_id: { type: 'string' },
    caption: { type: 'string' },
  },
  required: ['post_id', 'caption'],
};

export const WEEKLY_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    period_comparison: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        er_change: { type: 'string' },
        reach_change: { type: 'string' },
        follower_change: { type: 'string' },
      },
      required: ['summary', 'er_change', 'reach_change', 'follower_change'],
    },
    top_performers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          post_id: { type: 'string' },
          caption: { type: 'string' },
          metric: { type: 'string' },
          theme: { type: 'string' },
        },
        required: ['post_id', 'caption', 'metric', 'theme'],
      },
    },
    key_findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          tone: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
          metric: { type: 'string' },
          evidence: { type: 'array', items: POST_REF_SCHEMA },
        },
        required: ['title', 'detail', 'tone'],
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          rationale: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['action', 'rationale', 'priority'],
      },
    },
    narrative_markdown: { type: 'string' },
  },
  required: [
    'headline',
    'period_comparison',
    'top_performers',
    'key_findings',
    'recommendations',
    'narrative_markdown',
  ],
};

export const CONTENT_PATTERNS_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          evidence: { type: 'array', items: POST_REF_SCHEMA },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['pattern', 'evidence', 'impact'],
      },
    },
    theme_performance: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          avg_er: { type: 'string' },
          avg_saves: { type: 'string' },
          verdict: { type: 'string' },
        },
        required: ['theme', 'avg_er', 'avg_saves', 'verdict'],
      },
    },
    format_insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          tone: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
          metric: { type: 'string' },
          evidence: { type: 'array', items: POST_REF_SCHEMA },
        },
        required: ['title', 'detail', 'tone'],
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          rationale: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['action', 'rationale', 'priority'],
      },
    },
    narrative_markdown: { type: 'string' },
  },
  required: [
    'headline',
    'patterns',
    'theme_performance',
    'format_insights',
    'recommendations',
    'narrative_markdown',
  ],
};

export const CONTENT_IDEATION_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          format: { type: 'string' },
          theme: { type: 'string' },
          rationale: { type: 'string' },
          structure: { type: 'string' },
          post_references: { type: 'array', items: POST_REF_SCHEMA },
        },
        required: ['title', 'hook', 'format', 'theme', 'rationale', 'structure'],
      },
    },
    narrative_markdown: { type: 'string' },
  },
  required: ['headline', 'ideas', 'narrative_markdown'],
};
