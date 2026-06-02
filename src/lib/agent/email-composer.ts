import 'server-only';
import type { AccountPulse, IndustryNewsItem, UpcomingEvent, ContentOpportunity, RunType } from './types';

export function buildAgentEmailHtml(params: {
  runType: RunType;
  pulse: AccountPulse;
  news: IndustryNewsItem[];
  events: UpcomingEvent[];
  opportunities: ContentOpportunity[];
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const { runType, pulse, news, events, opportunities } = params;

  // ── Subject line ────────────────────────────────────────────────────
  const urgentEvent = events.find(e => e.urgency === 'urgent');
  const topOpportunity = opportunities.find(o => o.priority === 1);
  const hasAlerts = pulse.alertPosts.length > 0 || pulse.reachTrend === 'down';

  const runLabels: Record<RunType, string> = {
    monday: 'BRIEFING LUNI',
    wednesday: 'PULS MIERCURI',
    friday: 'PREP VINERI',
  };

  let subject = `📊 AI LICHIDITATE · ${runLabels[runType]}`;
  if (urgentEvent) subject += ` · ${urgentEvent.event}`;
  else if (topOpportunity) subject += ` · ${topOpportunity.title}`;
  if (hasAlerts) subject += ' ⚠️';

  // ── Colors ──────────────────────────────────────────────────────────
  const C = {
    bg: '#000000',
    bgCard: '#111111',
    bgPositive: '#0A1A04',
    bgNegative: '#1A0806',
    textPrimary: '#F2EFE4',
    textSecondary: '#8A8A8A',
    textMuted: '#5A5A5A',
    lime: '#C7F84C',
    limeDim: '#7A9A2E',
    coral: '#FF5A4E',
    border: '#222222',
    borderPositive: '#2A4A10',
  };

  // ── Helpers ─────────────────────────────────────────────────────────
  const mono = (text: string, size = 13, color = C.textPrimary, weight = 400) =>
    `<span style="font-family:'Courier New',Courier,monospace;font-size:${size}px;color:${color};font-weight:${weight};">${text}</span>`;

  const body = (text: string, size = 13, color = C.textPrimary) =>
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:${size}px;color:${color};line-height:1.6;">${text}</p>`;

  const metricPill = (label: string, value: string, valueColor = C.textPrimary) =>
    `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:6px;">
      <tr>
        <td style="background-color:${C.bgCard};border:1px solid ${C.border};border-radius:4px;padding:10px 14px;">
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td>${mono(label, 11, C.textSecondary)}</td>
              <td align="right">${mono(value, 13, valueColor, 600)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const alertBox = (text: string) =>
    `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:8px;">
      <tr>
        <td style="background-color:${C.bgNegative};border-left:3px solid ${C.coral};border-radius:0 4px 4px 0;padding:10px 14px;">
          ${body(`⚠️ ${text}`, 12, C.coral)}
        </td>
      </tr>
    </table>`;

  const newsCard = (item: IndustryNewsItem) => {
    const borderColor = item.relevance === 'high' ? C.lime : C.limeDim;
    const dot = item.relevance === 'high' ? '🔴' : '🟡';
    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:8px;">
      <tr>
        <td style="background-color:${C.bgCard};border-left:3px solid ${borderColor};border-radius:0 4px 4px 0;padding:10px 14px;">
          ${body(`${dot} <strong>${item.title}</strong>`, 13, C.textPrimary)}
          <div style="height:4px;"></div>
          ${body(item.summary, 12, C.textSecondary)}
          ${item.source ? `<div style="height:4px;"></div>${mono(item.source + (item.url ? ` · <a href="${item.url}" style="color:${C.limeDim};text-decoration:none;">citește →</a>` : ''), 10, C.textMuted)}` : ''}
        </td>
      </tr>
    </table>`;
  };

  const eventCard = (event: UpcomingEvent) => {
    const isUrgent = event.urgency === 'urgent';
    const bg = isUrgent ? C.bgNegative : C.bgCard;
    const border = isUrgent ? C.coral : C.limeDim;
    const urgencyLabel = isUrgent ? '⚡ URGENT' : '📅 PROGRAMAT';
    const urgencyColor = isUrgent ? C.coral : C.limeDim;
    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:6px;">
      <tr>
        <td style="background-color:${bg};border-left:3px solid ${border};border-radius:0 4px 4px 0;padding:10px 14px;">
          ${mono(`${urgencyLabel} · ${event.dateDescription.toUpperCase()}`, 10, urgencyColor)}
          <div style="height:4px;"></div>
          ${body(`<strong>${event.event}</strong>`, 13, C.textPrimary)}
          <div style="height:4px;"></div>
          ${body(event.description, 12, C.textSecondary)}
        </td>
      </tr>
    </table>`;
  };

  const opportunityCard = (opp: ContentOpportunity) => {
    const stars = '⭐'.repeat(4 - opp.priority);
    const urgencyLabel = opp.urgency === 'now' ? 'POSTEAZĂ ACUM'
      : opp.urgency === 'tomorrow' ? 'MÂINE'
      : 'ACEASTĂ SĂPTĂMÂNĂ';

    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:12px;">
      <tr>
        <td style="background-color:${C.bgPositive};border:1px solid ${C.borderPositive};border-radius:6px;padding:16px;">
          ${mono(`${stars} PRIORITATE ${opp.priority} · ${urgencyLabel}`, 10, C.lime)}
          <div style="height:8px;"></div>
          ${body(`<strong style="font-size:15px;">${opp.title}</strong>`, 15, C.textPrimary)}
          <div style="height:10px;"></div>
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td style="background-color:${C.bgCard};border-left:3px solid ${C.lime};border-radius:0 4px 4px 0;padding:10px 14px;">
                ${body(`<em>"${opp.hook}"</em>`, 13, C.textPrimary)}
              </td>
            </tr>
          </table>
          <div style="height:10px;"></div>
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-right:6px;"><span style="display:inline-block;background-color:${C.bgCard};border:1px solid ${C.border};border-radius:3px;padding:3px 8px;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">${opp.format}</span></td>
              <td style="padding-right:6px;"><span style="display:inline-block;background-color:${C.bgCard};border:1px solid ${C.border};border-radius:3px;padding:3px 8px;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">${opp.theme.toUpperCase()}</span></td>
              <td style="padding-right:6px;"><span style="display:inline-block;background-color:${C.bgCard};border:1px solid ${C.border};border-radius:3px;padding:3px 8px;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">⏰ ${opp.bestTimeToPost}</span></td>
              <td><span style="display:inline-block;background-color:${C.bgCard};border:1px solid ${C.borderPositive};border-radius:3px;padding:3px 8px;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.limeDim};">ER est. ${opp.estimatedEr}</span></td>
            </tr>
          </table>
          <div style="height:10px;"></div>
          ${body(opp.rationale, 12, C.textSecondary)}
        </td>
      </tr>
    </table>`;
  };

  // ── Build content ────────────────────────────────────────────────────
  const dateStr = new Date().toLocaleDateString('ro-RO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const runLabelsFull: Record<RunType, string> = {
    monday: 'BRIEFING SĂPTĂMÂNAL · LUNI',
    wednesday: 'PULS MID-WEEK · MIERCURI',
    friday: 'PREP WEEKEND · VINERI',
  };

  const nextRunLabels: Record<RunType, string> = {
    monday: 'Miercuri dimineață',
    wednesday: 'Vineri dimineață',
    friday: 'Luni dimineața viitoare',
  };

  const reachColor = pulse.reachTrend === 'up' ? C.lime
    : pulse.reachTrend === 'down' ? C.coral : C.textPrimary;
  const reachArrow = pulse.reachTrend === 'up' ? '↑' : pulse.reachTrend === 'down' ? '↓' : '→';
  const reachDeltaStr = `${pulse.reachDelta > 0 ? '+' : ''}${pulse.reachDelta}%`;

  let pulseContent = '';
  if (pulse.reachTrend === 'down' && Math.abs(pulse.reachDelta) > 15) {
    pulseContent += alertBox(`Reach în scădere ${reachDeltaStr} față de perioada precedentă`);
  }
  if (pulse.daysSinceLastPost >= 3) {
    pulseContent += alertBox(`${pulse.daysSinceLastPost} zile fără postare — consistența e cheie`);
  }
  pulseContent += metricPill('POSTĂRI PUBLICATE', `${pulse.postsPublished}`);
  pulseContent += metricPill('TREND REACH', `${reachArrow} ${reachDeltaStr}`, reachColor);
  if (pulse.accountAvgEr != null) {
    pulseContent += metricPill('ER MEDIU CONT', `${pulse.accountAvgEr.toFixed(2)}%`, C.lime);
  }
  if (pulse.topPost) {
    pulseContent += metricPill(
      `TOP: "${(pulse.topPost.caption ?? '').slice(0, 35)}..."`,
      `ER ${pulse.topPost.erByReach?.toFixed(2)}%`,
      C.lime,
    );
  }
  for (const alert of pulse.alertPosts) {
    pulseContent += metricPill(
      `⚠️ "${(alert.caption ?? '').slice(0, 35)}..."`,
      alert.issue,
      C.coral,
    );
  }

  const highNews = news.filter(n => n.relevance === 'high').slice(0, 3);
  const mediumNews = news.filter(n => n.relevance === 'medium').slice(0, 2);
  const hasNews = highNews.length > 0 || mediumNews.length > 0;
  const newsContent = [...highNews, ...mediumNews].map(newsCard).join('');

  const urgentEvents = events.filter(e => e.urgency === 'urgent');
  const plannedEvents = events.filter(e => e.urgency === 'planned');
  const hasEvents = urgentEvents.length > 0 || plannedEvents.length > 0;
  const eventsContent = [...urgentEvents, ...plannedEvents].map(eventCard).join('');

  const sortedOpps = [...opportunities].sort((a, b) => a.priority - b.priority);
  const oppsContent = sortedOpps.map(opportunityCard).join('');

  // ── Final HTML ───────────────────────────────────────────────────────
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.bg};">
  <tr>
    <td align="center" style="background-color:${C.bg};padding:32px 16px;">

      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${C.bg};">

        <!-- HEADER -->
        <tr>
          <td style="background-color:${C.bg};padding:0 0 20px 0;border-bottom:1px solid ${C.border};">
            <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:700;letter-spacing:0.1em;color:${C.lime};">AI LICHIDITATE</p>
            <p style="margin:4px 0 0 0;font-family:'Courier New',Courier,monospace;font-size:11px;color:${C.textMuted};letter-spacing:0.06em;">${runLabelsFull[runType]} · ${dateStr.toUpperCase()}</p>
          </td>
        </tr>

        <!-- ACCOUNT PULSE -->
        <tr>
          <td style="background-color:${C.bg};padding:24px 0 0 0;">
            <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${C.textMuted};text-transform:uppercase;">CONT · ULTIMELE ${runType === 'monday' ? '72H' : '48H'}</p>
            ${pulseContent}
          </td>
        </tr>

        ${hasNews ? `
        <!-- NEWS -->
        <tr>
          <td style="background-color:${C.bg};padding:24px 0 0 0;">
            <div style="height:1px;background-color:${C.border};margin-bottom:20px;"></div>
            <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${C.textMuted};text-transform:uppercase;">PIEȚE · ȘTIRI RELEVANTE</p>
            ${newsContent}
          </td>
        </tr>` : ''}

        ${hasEvents ? `
        <!-- EVENTS -->
        <tr>
          <td style="background-color:${C.bg};padding:24px 0 0 0;">
            <div style="height:1px;background-color:${C.border};margin-bottom:20px;"></div>
            <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${C.textMuted};text-transform:uppercase;">CALENDAR · EVENIMENTE</p>
            ${eventsContent}
          </td>
        </tr>` : ''}

        <!-- OPPORTUNITIES -->
        <tr>
          <td style="background-color:${C.bg};padding:24px 0 0 0;">
            <div style="height:1px;background-color:${C.border};margin-bottom:20px;"></div>
            <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${C.textMuted};text-transform:uppercase;">OPORTUNITĂȚI CONȚINUT · ${opportunities.length} IDEI</p>
            ${oppsContent}
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background-color:${C.bg};padding:28px 0 0 0;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${C.lime};border-radius:4px;">
                  <a href="${params.appUrl}/dashboard/agent"
                     style="display:inline-block;padding:13px 28px;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#000000;text-decoration:none;text-transform:uppercase;">
                    → DESCHIDE DASHBOARD COMPLET
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color:${C.bg};padding:28px 0 0 0;border-top:1px solid ${C.border};margin-top:28px;">
            <p style="margin:28px 0 0 0;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">AI LICHIDITATE · Agent Proactiv · ${runLabelsFull[runType]}</p>
            <p style="margin:4px 0 0 0;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">Următorul briefing: ${nextRunLabels[runType]}</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;

  // ── Plain text ───────────────────────────────────────────────────────
  const text = [
    `AI LICHIDITATE · ${runLabelsFull[runType]}`,
    dateStr.toUpperCase(),
    '='.repeat(50),
    '',
    `CONT · ULTIMELE 48H`,
    `Postări: ${pulse.postsPublished} | Trend reach: ${reachArrow} ${reachDeltaStr}`,
    pulse.accountAvgEr ? `ER mediu cont: ${pulse.accountAvgEr.toFixed(2)}%` : '',
    pulse.alertPosts.map(p => `⚠️ ${p.issue}`).join('\n'),
    '',
    hasNews ? 'ȘTIRI:' : '',
    ...highNews.map(n => `🔴 ${n.title}\n   ${n.summary} (${n.source})`),
    '',
    hasEvents ? 'EVENIMENTE:' : '',
    ...urgentEvents.map(e => `⚡ ${e.event} — ${e.dateDescription}`),
    ...plannedEvents.map(e => `📅 ${e.event} — ${e.dateDescription}`),
    '',
    'OPORTUNITĂȚI:',
    ...sortedOpps.map((o, i) => [
      `${i + 1}. [P${o.priority}] ${o.title}`,
      `   Hook: "${o.hook}"`,
      `   ${o.format} · ${o.theme.toUpperCase()} · ${o.bestTimeToPost}`,
      `   ${o.rationale}`,
    ].join('\n')),
    '',
    `Dashboard: ${params.appUrl}/dashboard/agent`,
    `Următorul briefing: ${nextRunLabels[runType]}`,
  ].filter(s => s !== '').join('\n');

  return { subject, html, text };
}
