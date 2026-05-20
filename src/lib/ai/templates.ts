import type { NormalizedAnalysisBundle } from './bundle-types';

export function weeklyUserTemplate(input: NormalizedAnalysisBundle): string {
  const { account, dateRange, accountTimeline, posts, aggregates } = input;

  const timelineStr = accountTimeline
    .map(
      (d) =>
        `${d.date}: followers=${d.followers ?? '?'}, reach=${d.reach ?? '?'}, impressions=${d.impressions ?? '?'}`
    )
    .join('\n');

  const topPosts = [...posts]
    .sort((a, b) => (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0))
    .slice(0, 10)
    .map(
      (p) =>
        `- [${p.mediaType}] ${p.publishedAt.slice(0, 10)}: ER=${p.metrics.engagementRate?.toFixed(2) ?? '?'}%, impresii=${p.metrics.impressions ?? '?'}, likes=${p.metrics.likes ?? '?'} — "${p.captionPreview}"`
    )
    .join('\n');

  return `Cont: ${account.displayName} (@${account.handle ?? 'n/a'}), platforma: ${account.platform}
Perioadă: ${dateRange.from.slice(0, 10)} → ${dateRange.to.slice(0, 10)}
Urmăritori curenți: ${account.currentFollowers ?? '?'}

TIMELINE CONT:
${timelineStr || 'Nicio dată'}

REZUMAT:
- Total postări: ${aggregates.totalPosts}
- ER mediu: ${aggregates.avgEngagementRate?.toFixed(2) ?? '?'}%
- Median impresii: ${aggregates.medianImpressions ?? '?'}

TOP POSTĂRI (după engagement rate):
${topPosts || 'Nicio postare în perioadă'}

Generează un rezumat săptămânal în Markdown. Include: performanță generală, tendințe observate, 3 observații rapide, o recomandare concretă. Fii direct.`;
}

export function patternsUserTemplate(input: NormalizedAnalysisBundle): string {
  const { account, dateRange, posts, aggregates } = input;

  const postsList = posts
    .map((p) => {
      const tags =
        p.hashtags.length > 0 ? ` | hashtags: ${p.hashtags.slice(0, 5).join(', ')}` : '';
      return `- [${p.mediaType}] ${p.publishedAt.slice(0, 10)}: ER=${p.metrics.engagementRate?.toFixed(2) ?? '?'}%, reach=${p.metrics.reach ?? '?'}, likes=${p.metrics.likes ?? '?'}, saves=${p.metrics.saves ?? '?'}${tags} — "${p.captionPreview}"`;
    })
    .join('\n');

  return `Cont: ${account.displayName} (@${account.handle ?? 'n/a'}), platforma: ${account.platform}
Perioadă: ${dateRange.from.slice(0, 10)} → ${dateRange.to.slice(0, 10)} (30 zile)
Urmăritori: ${account.currentFollowers ?? '?'}

STATISTICI AGREGATE:
- Total postări: ${aggregates.totalPosts}
- ER mediu: ${aggregates.avgEngagementRate?.toFixed(2) ?? '?'}%
- Median impresii: ${aggregates.medianImpressions ?? '?'}

TOATE POSTĂRILE:
${postsList || 'Nicio postare'}

Analizează pattern-urile de conținut. Returnează Markdown cu secțiunile: ## Ce funcționează, ## Ce nu funcționează, ## Ipoteze, ## Recomandări. Include exemple concrete.`;
}

export function topPerformersUserTemplate(input: NormalizedAnalysisBundle): string {
  const { account, dateRange, posts, aggregates } = input;

  const sorted = [...posts].sort(
    (a, b) => (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0)
  );
  const top5 = sorted.slice(0, 5);
  const bottom5 = sorted.slice(-5).reverse();

  const fmt = (p: (typeof posts)[0], rank: string) =>
    `${rank}. [${p.mediaType}] ${p.publishedAt.slice(0, 10)}: ER=${p.metrics.engagementRate?.toFixed(2) ?? '?'}%, reach=${p.metrics.reach ?? '?'}, likes=${p.metrics.likes ?? '?'}, comments=${p.metrics.comments ?? '?'}, saves=${p.metrics.saves ?? '?'}\n   caption: "${p.captionPreview}"`;

  return `Cont: ${account.displayName} (@${account.handle ?? 'n/a'}), platforma: ${account.platform}
Perioadă: ${dateRange.from.slice(0, 10)} → ${dateRange.to.slice(0, 10)}
Total postări analizate: ${aggregates.totalPosts}, ER mediu: ${aggregates.avgEngagementRate?.toFixed(2) ?? '?'}%

TOP 5 POSTĂRI:
${top5.map((p, i) => fmt(p, `#${i + 1}`)).join('\n\n') || 'Insuficiente date'}

BOTTOM 5 POSTĂRI:
${bottom5.map((p, i) => fmt(p, `#${i + 1}`)).join('\n\n') || 'Insuficiente date'}

Interpretează diferența. Ce au top-performerele în comun? Ce lipsește din bottom? Răspunde în Markdown sintetic.`;
}
