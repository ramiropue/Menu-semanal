import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para Browser / Client Components ("use client").
 * Gestiona automáticamente el almacenamiento de sesión en cookies del navegador.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Faltan variables de entorno para Supabase (NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
