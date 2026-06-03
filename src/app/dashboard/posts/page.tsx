import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { colors } from '@/themes/platform/tokens';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { Tag } from '@/components/design-system/Tag';
import { PostCaptionLink } from '@/components/dashboard/PostCaptionLink';
import { formatKpiPercent, formatLargeNumber } from '@/lib/kpis/formatters';
import forkConfig from '../../../../fork-config';

const THEME_LABELS = forkConfig.contentNiche.themeLabels;

const DATE_RANGES: Record<string, number | null> = {
  '7': 7,
  '30': 30,
  '90': 90,
  'all': null,
};

const PAGE_SIZE = 20;

interface SearchParams {
  theme?: string;
  type?: string;
  days?: string;
  sort?: string;
  dir?: string;
  ids?: string;
  page?: string;
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

  const db = createSupabaseServiceClient();

  const { data: accounts } = await db
    .from('accounts')
    .select('id');

  const accountIds = (accounts ?? []).map((a: { id: string }) => a.id);
  if (!accountIds.length) {
    return renderGlobalEmpty();
  }

  const { count: totalPostsCount } = await db
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .in('account_id', accountIds);
  const hasAnyPosts = (totalPostsCount ?? 0) > 0;

  if (!hasAnyPosts) {
    return renderGlobalEmpty('NICIUN POST SINCRONIZAT. MERGI LA CONTURI ȘI SINCRONIZEAZĂ.');
  }

  const daysKey = params.days ?? '30';
  const daysValue = daysKey in DATE_RANGES ? DATE_RANGES[daysKey] : 30;
  const since = daysValue != null
    ? new Date(Date.now() - daysValue * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const sortCol = params.sort ?? 'published_at';
  const sortAsc = params.dir === 'asc';
  const idFilter = params.ids?.split(',').filter(Boolean) ?? [];
  const page = Math.max(1, parseInt(params.page ?? '1', 10));

  const validSortCols = ['published_at', 'er_by_reach', 'saves_per_reach', 'sends_per_reach', 'reach'];
  const col = validSortCols.includes(sortCol) ? sortCol : 'published_at';

  let countQuery = db
    .from('posts_with_latest_metrics')
    .select('id', { count: 'exact', head: true })
    .in('account_id', accountIds);

  let dataQuery = db
    .from('posts_with_latest_metrics')
    .select('*')
    .in('account_id', accountIds);

  if (idFilter.length > 0) {
    countQuery = countQuery.in('id', idFilter);
    dataQuery = dataQuery.in('id', idFilter);
  } else if (since) {
    countQuery = countQuery.gte('published_at', since);
    dataQuery = dataQuery.gte('published_at', since);
  }

  if (params.theme) {
    countQuery = countQuery.eq('theme', params.theme);
    dataQuery = dataQuery.eq('theme', params.theme);
  }
  if (params.type) {
    countQuery = countQuery.eq('media_type', params.type.toLowerCase());
    dataQuery = dataQuery.eq('media_type', params.type.toLowerCase());
  }

  dataQuery = dataQuery
    .order(col, { ascending: sortAsc, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ count: filteredCount }, { data: posts }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  const totalFiltered = filteredCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  // Fetch transcription status for posts
  const postIds = (posts ?? []).map(p => p.id);
  const { data: transcriptionJobs } = postIds.length > 0
    ? await db
        .from('transcription_jobs')
        .select('post_id, status')
        .in('post_id', postIds)
    : { data: [] };

  const transcriptionStatusMap = new Map(
    (transcriptionJobs ?? []).map(job => [job.post_id, job.status])
  );

  const hasActiveFilters = !!(params.theme || params.type || (params.days && params.days !== '30') || params.ids);
  const hasFilteredPosts = (posts?.length ?? 0) > 0;

  function pageLink(p: number) {
    const sp = new URLSearchParams(params as Record<string, string>);
    sp.set('page', String(p));
    return `/dashboard/posts?${sp.toString()}`;
  }

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
    sp.delete('page');
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
        <Eyebrow>POSTĂRI · {totalFiltered}</Eyebrow>
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
        {filterLink('days', 'all', 'ALL')}
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

      {idFilter.length > 0 && (
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.accentCoral}`,
            borderRadius: 6,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            AFIȘÂND {idFilter.length} POSTĂRI AFECTATE
          </span>
          <Link
            href="/dashboard/posts"
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: colors.accentLime,
              textDecoration: 'none',
            }}
          >
            × ȘTERGE FILTRUL
          </Link>
        </div>
      )}

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
                <th style={thStyle}>TRANSCRIPT</th>
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
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-inter), sans-serif', fontSize: 13, padding: 0 }}>
                      {post.caption ? (
                        <PostCaptionLink postId={post.id} caption={post.caption} />
                      ) : (
                        <span style={{ color: colors.textMuted, display: 'block', padding: '10px 12px' }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {themeTag ? (
                        <Tag variant={themeVariant}>{themeTag}</Tag>
                      ) : (
                        <span style={{ color: colors.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {(() => {
                        const transcriptStatus = transcriptionStatusMap.get(post.id);
                        if (!transcriptStatus) return <span style={{ color: colors.textMuted }}>—</span>;

                        const tagMap: Record<string, { label: string; variant: 'lime' | 'coral' | 'muted' }> = {
                          completed: { label: '✓ DONE', variant: 'lime' },
                          pending: { label: '⏳ PENDING', variant: 'muted' },
                          processing: { label: '◔ PROCESSING', variant: 'muted' },
                          failed: { label: '✗ FAILED', variant: 'coral' },
                          skipped: { label: '⊘ SKIPPED', variant: 'muted' },
                        };

                        const config = tagMap[transcriptStatus] ?? { label: transcriptStatus.toUpperCase(), variant: 'muted' };
                        return <Tag variant={config.variant}>{config.label}</Tag>;
                      })()}
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

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          {page > 1 && (
            <Link
              href={pageLink(page - 1)}
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 11,
                padding: '4px 10px',
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 4,
                color: colors.textSecondary,
                textDecoration: 'none',
              }}
            >
              ← PREV
            </Link>
          )}
          <Mono tone="muted" style={{ fontSize: 11 }}>
            {page} / {totalPages} ({totalFiltered} POSTĂRI)
          </Mono>
          {page < totalPages && (
            <Link
              href={pageLink(page + 1)}
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 11,
                padding: '4px 10px',
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 4,
                color: colors.textSecondary,
                textDecoration: 'none',
              }}
            >
              NEXT →
            </Link>
          )}
        </div>
      )}
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
