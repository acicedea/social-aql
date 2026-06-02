'use client';

import Link from 'next/link';
import { colors } from '@/themes/platform/tokens';

interface Props {
  postId: string;
  caption: string;
}

export function PostCaptionLink({ postId, caption }: Props) {
  return (
    <Link
      href={`/dashboard/posts/${postId}`}
      style={{
        display: 'block',
        color: colors.textPrimary,
        textDecoration: 'none',
        padding: '10px 12px',
        transition: 'color 0.2s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.color = colors.accentLime;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.color = colors.textPrimary;
      }}
    >
      {caption.slice(0, 80) + (caption.length > 80 ? '…' : '')}
    </Link>
  );
}
