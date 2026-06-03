/**
 * FORK CONFIGURATION
 * ==================
 * This is the ONLY file you need to change when forking social-aql.
 *
 * Steps to create a new fork:
 * 1. Fork the social-aql repo on GitHub
 * 2. Edit THIS file with your brand settings
 * 3. Run `pnpm dev` and verify the app looks correct
 * 4. Deploy to Vercel
 *
 * To pull updates from social-aql:
 *   git remote add upstream https://github.com/your-org/social-aql.git
 *   git fetch upstream
 *   git merge upstream/main
 *   (resolve any conflicts in this file only)
 */

import type { ForkConfig } from './src/lib/fork-config-types';

const config: ForkConfig = {
  // ===================================================================
  // APP IDENTITY
  // ===================================================================
  app: {
    name: 'AI LICHIDITATE',
    tagline: 'Smart money positioning for content.',
    handle: '@ailichiditate',
    locale: 'ro',
    defaultDateRangeDays: 30,
  },

  // ===================================================================
  // VISUAL THEME
  // Replace hex values with your brand colors.
  // accentPrimary: positive signals, active states, CTAs (currently lime)
  // accentSecondary: negative signals, warnings, errors (currently coral)
  // ===================================================================
  theme: {
    bgBase: '#000000',
    bgElevated: '#0F0F0F',
    bgCard: '#141414',
    bgCardPositive: '#0E1A06',
    bgCardNegative: '#1A0908',

    textPrimary: '#F2EFE4',
    textSecondary: '#8A8A8A',
    textMuted: '#5A5A5A',

    accentPrimary: '#C7F84C',
    accentPrimaryDim: '#7A9A2E',
    accentSecondary: '#FF5A4E',
    accentSecondaryDim: '#8C2F28',

    borderDefault: '#262626',
    borderPositive: '#3A5C0F',
    borderNegative: '#5C1F1A',

    fontDisplay: 'League Spartan',
    fontBody: 'Inter',
    fontMono: 'JetBrains Mono',

    borderRadius: 6,
    borderRadiusSm: 4,
  },

  // ===================================================================
  // MODULES
  // Disabled modules are completely hidden from the UI.
  // ===================================================================
  modules: {
    metaInstagram: true,
    mockProvider: true,

    aiAnalyses: true,
    weeklySummary: true,
    contentPatterns: true,
    contentIdeation: true,

    diagnosticFlags: true,
    performanceTab: true,
    contentTab: true,
    aiInsightsTab: true,

    postDiagnosticChecklist: true,
  },

  // ===================================================================
  // AI CONFIGURATION
  // ===================================================================
  ai: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    chatModel: 'gemini-2.5-flash',
    analysisLocale: 'ro',
  },

  // ===================================================================
  // CONTENT THEMES
  // ===================================================================
  contentNiche: {
    label: 'Finanțe & Economie',
    description: 'Creator de conținut financiar și economic în limba română.',
    themes: [
      'fed', 'crypto', 'stocks_us', 'gold', 'forex',
      'real_estate', 'economy_eu', 'macro',
      'education', 'investing_principles', 'trading_strategy', 'emerging_markets',
    ],
    keywords: [
      'fed', 'federal reserve', 'bce', 'fomc', 'powell', 'lagarde',
      'dobândă', 'dobanda', 'rata dobânzii', 'rata dobanzii',
      'inflație', 'inflatie', 'deflație', 'deflatie',
      'pib', 'gdp', 'recesiune', 'recession',
      'lichiditate', 'liquidity', 'spread',
      'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cripto',
      's&p', 'sp500', 'nasdaq', 'dow', 'wall street',
      'nvidia', 'nvda', 'apple', 'aapl', 'microsoft',
      'aur', 'xau', 'gold', 'argint', 'silver',
      'dxy', 'dolar', 'dollar', 'eur/usd', 'forex',
      'imobiliar', 'ipotecă', 'ipoteca', 'mortgage',
      'obligațiuni', 'obligatiuni', 'bonds', 'yield',
      'portofoliu', 'portfolio', 'diversificare', 'risc',
      'bull market', 'bear market', 'bullish', 'bearish',
      'breakout', 'rezistență', 'rezistenta', 'suport',
      'randament', 'dividend', 'profit', 'pierdere',
      'piețe emergente', 'piete emergente', 'emerging markets',
      'capitalul', 'capital', 'investiție', 'investitie',
      'tapering', 'qe', 'quantitative easing',
      'trezorerie', 'treasury', 't-bills',
    ],
  },
};

export default config;
