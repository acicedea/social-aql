import { colors, spacing, typography } from './tokens';
import { antdTheme } from './antdTheme';

export { colors, spacing, typography };
export { antdTheme };

export const aiLichiditateTheme = {
  id: 'ai-lichiditate' as const,
  displayName: 'AI Lichiditate_aql',
  tokens: { colors, spacing, typography },
  antdTheme,
  cssVariables: buildCssVariables(colors),
};

function buildCssVariables(c: typeof colors): Record<string, string> {
  return Object.fromEntries(
    Object.entries(c).map(([k, v]) => [`--color-${kebab(k)}`, v])
  );
}

function kebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}
