import { createBrowserClient } from '@supabase/ssr';

let _browserClientInstance: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente Supabase para Browser / Client Components ("use client").
 * Gestiona automáticamente el almacenamiento de sesión en cookies del navegador.
 * Lanza un error explícito si faltan las variables de entorno obligatorias.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined in environment variables.'
    );
  }

  if (!_browserClientInstance) {
    _browserClientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return _browserClientInstance;
}
