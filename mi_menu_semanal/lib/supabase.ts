import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan variables de entorno para Supabase. Verifica tu archivo .env.local');
}

/**
 * @deprecated En V2, utiliza:
 * - `import { createClient } from '@/lib/supabase/client'` para componentes cliente ("use client").
 * - `import { createClient } from '@/lib/supabase/server'` para Server Components, Actions y Route Handlers.
 *
 * Este export singleton se mantiene temporalmente por compatibilidad regresiva.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
