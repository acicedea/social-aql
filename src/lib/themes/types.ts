export type ThemeId =
  | 'fed'
  | 'crypto'
  | 'stocks_us'
  | 'gold'
  | 'forex'
  | 'real_estate'
  | 'economy_eu'
  | 'macro'
  | 'education'
  | 'investing_principles'
  | 'trading_strategy'
  | 'emerging_markets'
  | 'other';

export interface Theme {
  id: ThemeId;
  displayName: string;
  shortLabel: string;
  description: string;
  keywords: string[];
}

export type ThemeConfidence = 'high' | 'medium' | 'low';

export interface ThemeDetectionResult {
  theme: ThemeId;
  themeSecondary: ThemeId | null;
  confidence: ThemeConfidence;
  matchedKeywords?: string[];
  source: 'ai' | 'keyword' | 'fallback';
}
