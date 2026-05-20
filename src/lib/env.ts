import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  GOOGLE_AI_API_KEY: z.string().min(1),
  AI_DEFAULT_TIER: z.enum(['batch', 'deep']).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_ENABLE_MOCK_PROVIDER: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().optional(),
  META_REDIRECT_URI: z.string().url().optional(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
  AI_DEFAULT_TIER: process.env.AI_DEFAULT_TIER,
  CRON_SECRET: process.env.CRON_SECRET,
  NEXT_PUBLIC_ENABLE_MOCK_PROVIDER: process.env.NEXT_PUBLIC_ENABLE_MOCK_PROVIDER,
  META_APP_ID: process.env.META_APP_ID,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
  META_REDIRECT_URI: process.env.META_REDIRECT_URI,
});
