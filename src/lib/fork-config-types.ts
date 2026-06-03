export interface ForkConfig {
  app: {
    name: string;
    tagline: string;
    handle: string;
    locale: 'ro' | 'en';
    defaultDateRangeDays: number;
  };
  theme: {
    bgBase: string;
    bgElevated: string;
    bgCard: string;
    bgCardPositive: string;
    bgCardNegative: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accentPrimary: string;
    accentPrimaryDim: string;
    accentSecondary: string;
    accentSecondaryDim: string;
    borderDefault: string;
    borderPositive: string;
    borderNegative: string;
    fontDisplay: string;
    fontBody: string;
    fontMono: string;
    borderRadius: number;
    borderRadiusSm: number;
  };
  modules: {
    metaInstagram: boolean;
    mockProvider: boolean;
    aiAnalyses: boolean;
    weeklySummary: boolean;
    contentPatterns: boolean;
    contentIdeation: boolean;
    diagnosticFlags: boolean;
    performanceTab: boolean;
    contentTab: boolean;
    aiInsightsTab: boolean;
    postDiagnosticChecklist: boolean;
  };
  ai: {
    provider: 'gemini' | 'claude';
    model: string;
    chatModel: string;
    analysisLocale: 'ro' | 'en';
  };
  contentNiche: {
    label: string;
    description: string;
    themes: string[];
    keywords: string[];
  };
}
