import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { Tag } from '@/components/design-system/Tag';
import { formatKpiPercent, formatLargeNumber } from '@/lib/kpis/formatters';

const THEME_LABELS: Record<string, string> = {
  fed: 'FED',
  crypto: 'CRYPTO',
  stocks_us: 'STOCKS US',
  gold: 'AUR',
  forex: 'FOREX',
  real_estate: 'IMOBILIARE',
  economy_eu: 'EU',
  macro: 'MACRO',
  education: 'EDUCAȚIE',
  investing_principles: 'PRINCIPII',
  trading_strategy: 'STRATEGIE',
  emerging_markets: 'EM',
  other: 'OTHER',
};

const DATE_RANGES: Record<string, number> = {
  '7': 7,
  '30': 30,
  '90': 90,
};

interface SearchParams {
  theme?: string;
  type?: string;
  days?: string;
  sort?: string;
  dir?: string;
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user.id);

  const accountIds = (accounts ?? []).map((a: { id: string }) => a.id);
  if (!accountIds.length) {
    return renderGlobalEmpty();
  }

  const { count: totalPostsCount } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .in('account_id', accountIds);
  const hasAnyPosts = (totalPostsCount ?? 0) > 0;

  if (!hasAnyPosts) {
    return renderGlobalEmpty('NICIUN POST SINCRONIZAT. MERGI LA CONTURI ȘI SINCRONIZEAZĂ.');
  }

  const days = DATE_RANGES[params.days ?? '30'] ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sortCol = params.sort ?? 'published_at';
  const sortAsc = params.dir === 'asc';

  let query = supabase
    .from('posts_with_latest_metrics')
    .select('*')
    .in('account_id', accountIds)
    .gte('published_at', since)
    .limit(200);

  if (params.theme) query = query.eq('theme', params.theme);
  if (params.type) query = query.eq('media_type', params.type.toLowerCase());

  const validSortCols = ['published_at', 'er_by_reach', 'saves_per_reach', 'sends_per_reach', 'reach'];
  const col = validSortCols.includes(sortCol) ? sortCol : 'published_at';
  query = query.order(col, { ascending: sortAsc, nullsFirst: false });

  const { data: posts } = await query;

  const hasActiveFilters = !!(params.theme || params.type || (params.days && params.days !== '30'));
  const hasFilteredPosts = (posts?.length ?? 0) > 0;

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: colors.textMuted,
    padding: '10px 12px',
    textAlign: 'left',
    borderBottom: `1px solid ${colors.borderDefault}`,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };

  const tdStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 12,
    color: colors.textSecondary,
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.borderDefault}`,
    verticalAlign: 'middle',
  };

  function sortLink(column: string, label: string) {
    const newDir = col === column && !sortAsc ? 'asc' : 'desc';
    const sp = new URLSearchParams({ ...params, sort: column, dir: newDir });
    const active = col === column;
    return (
      <Link href={`/dashboard/posts?${sp.toString()}`} style={{ textDecoration: 'none', color: active ? colors.accentLime : colors.textMuted }}>
        {label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </Link>
    );
  }

  function filterLink(key: string, value: string | undefined, label: string) {
    const sp = new URLSearchParams(params as Record<string, string>);
    if (value === undefined || sp.get(key) === value) {
      sp.delete(key);
    } else {
      sp.set(key, value);
    }
    const active = (params as Record<string, string>)[key] === value;
    return (
      <Link
        href={`/dashboard/posts?${sp.toString()}`}
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 11,
          padding: '3px 8px',
          borderRadius: 4,
          border: `1px solid ${active ? colors.accentLime : colors.borderDefault}`,
          color: active ? colors.accentLime : colors.textSecondary,
          textDecoration: 'none',
        }}
      >
        {label}
      </Link>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Eyebrow>POSTĂRI · {hasFilteredPosts ? posts!.length : 0}</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>POSTĂRILE TALE</H2>
        </div>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Mono tone="muted">PERIOADĂ:</Mono>
        {filterLink('days', '7', '7 ZILE')}
        {filterLink('days', '30', '30 ZILE')}
        {filterLink('days', '90', '90 ZILE')}
        <span style={{ width: 1, height: 16, background: colors.borderDefault, margin: '0 4px' }} />
        <Mono tone="muted">TIP:</Mono>
        {filterLink('type', 'reel', 'REEL')}
        {filterLink('type', 'image', 'IMAGE')}
        {filterLink('type', 'carousel', 'CAROUSEL')}
        {filterLink('type', 'video', 'VIDEO')}
        <span style={{ width: 1, height: 16, background: colors.borderDefault, margin: '0 4px' }} />
        <Mono tone="muted">TEMĂ:</Mono>
        {Object.entries(THEME_LABELS).map(([id, label]) =>
          filterLink('theme', id, label)
        )}
      </div>

      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          overflow: 'auto',
        }}
      >
        {hasFilteredPosts ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>TIP</th>
                <th style={{ ...thStyle, width: '30%' }}>CAPTION</th>
                <th style={thStyle}>TEMĂ</th>
                <th style={thStyle}>{sortLink('published_at', 'PUBLICAT')}</th>
                <th style={thStyle}>{sortLink('reach', 'REACH')}</th>
                <th style={thStyle}>{sortLink('er_by_reach', 'ER%')}</th>
                <th style={thStyle}>{sortLink('saves_per_reach', 'SAVE%')}</th>
                <th style={thStyle}>{sortLink('sends_per_reach', 'SEND%')}</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {posts!.map((post) => {
                const date = new Date(post.published_at).toLocaleDateString('ro-RO', {
                  day: '2-digit',
                  month: 'short',
                });
                const themeTag = post.theme ? THEME_LABELS[post.theme] ?? post.theme.toUpperCase() : null;
                const themeVariant = post.theme_confidence === 'high' ? 'lime' : 'muted';

                const erColor = post.er_by_reach == null ? colors.textMuted
                  : post.er_by_reach >= 6 ? colors.accentLime
                  : post.er_by_reach >= 2 ? colors.textPrimary
                  : colors.accentCoral;

                return (
                  <tr key={post.id}>
                    <td style={tdStyle}>
                      <span
                        style={{
                          background: colors.bgElevated,
                          border: `1px solid ${colors.borderDefault}`,
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {post.media_type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: colors.textPrimary, fontFamily: 'var(--font-inter), sans-serif', fontSize: 13 }}>
                      {post.caption
                        ? post.caption.slice(0, 80) + (post.caption.length > 80 ? '…' : '')
                        : <span style={{ color: colors.textMuted }}>—</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      {themeTag ? (
                        <Tag variant={themeVariant}>{themeTag}</Tag>
                      ) : (
                        <span style={{ color: colors.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{date}</td>
                    <td style={tdStyle}>{formatLargeNumber(post.reach)}</td>
                    <td style={{ ...tdStyle, color: erColor, fontWeight: 600 }}>
                      {formatKpiPercent(post.er_by_reach)}
                    </td>
                    <td style={{ ...tdStyle, color: post.saves_per_reach != null ? colors.textPrimary : colors.textMuted }}>
                      {formatKpiPercent(post.saves_per_reach)}
                    </td>
                    <td style={{ ...tdStyle, color: post.sends_per_reach != null ? colors.textPrimary : colors.textMuted }}>
                      {formatKpiPercent(post.sends_per_reach)}
                    </td>
                    <td style={tdStyle}>
                      <Link
                        href={`/dashboard/posts/${post.id}`}
                        style={{
                          color: colors.accentLime,
                          textDecoration: 'none',
                          fontSize: 14,
                        }}
                      >
                        →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Mono tone="muted">NICIUN REZULTAT PENTRU FILTRELE SELECTATE.</Mono>
            {hasActiveFilters && (
              <Link
                href="/dashboard/posts"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 11,
                  color: colors.accentLime,
                  textDecoration: 'none',
                }}
              >
                → ȘTERGE FILTRELE
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function renderGlobalEmpty(message = 'NICIO POSTARE. CONECTEAZĂ UN CONT ȘI SINCRONIZEAZĂ.') {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Eyebrow>POSTĂRI</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>POSTĂRILE TALE</H2>
        </div>
      </div>
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '24px 20px',
          textAlign: 'center',
        }}
      >
        <Mono tone="muted">{message}</Mono>
      </div>
    </div>
  );
}
