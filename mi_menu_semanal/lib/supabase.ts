import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabaseInstance: SupabaseClient | null = null;

/**
 * Retorna la instancia singleton del cliente Supabase con inicialización diferida.
 * Lanza un error explícito si faltan variables reales en lugar de usar placeholders.
 */
export function getLegacySupabaseClient(): SupabaseClient {
  if (!_supabaseInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined in environment variables.'
      );
    }
    _supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabaseInstance;
}

/**
 * Exportación singleton perezosa mediante Proxy para retrocompatibilidad segura.
 * No intenta inicializar la conexión en tiempo de importación de módulos.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getLegacySupabaseClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
