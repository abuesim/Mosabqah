import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).\n' +
    '   Add them in your Vercel project → Settings → Environment Variables.\n'
  );
}

/**
 * Build-safe Supabase client.
 *
 * `createClient` throws if the URL is empty, which crashes static prerendering
 * during `next build` when env vars aren't set yet (e.g. on Vercel before the
 * first deployment config). We fall back to a harmless placeholder so the build
 * succeeds; the runtime warning above guides the developer to add real keys.
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
