import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isValidSupabaseUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const supabaseConfigError = !supabaseUrl
  ? 'A URL do Supabase não está configurada.'
  : !isValidSupabaseUrl(supabaseUrl)
    ? 'A URL do Supabase é inválida. Confira VITE_SUPABASE_URL nas variáveis da Vercel.'
    : !supabaseAnonKey
      ? 'A chave pública do Supabase não está configurada.'
      : null;

export const supabaseConfigMissing = Boolean(supabaseConfigError);
export const supabase = supabaseConfigMissing
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
