import { createClient } from '@supabase/supabase-js';

// Publishable values (safe to ship to the browser). Override with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://iukhgbbcujfbodnqwbzi.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_eLEizPBuwEmKITWWjhkLKQ_ODHLmo13';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function callApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('api', { body: { action, ...payload } });
  if (error) throw error;
  return data as T;
}
