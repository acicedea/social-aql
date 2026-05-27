export const appConfig = {
  name: 'AI LICHIDITATE_aql',
  description: 'Smart money positioning for content.',
  locale: 'ro',
  defaultDateRangeDays: 30,
  features: {
    aiAnalysis: true,
    multiAccountSync: true,
    cronSync: true,
  },
} as const;

export type AppConfig = typeof appConfig;
