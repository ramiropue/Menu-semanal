import type { SupabaseClient } from '@supabase/supabase-js';
import { getSafeRedirectUrl } from './url';

export interface SendMagicLinkOptions {
  email: string;
  next?: string | null;
  origin?: string;
}

export interface SendMagicLinkResult {
  success: boolean;
  error?: Error | null;
}

/**
 * Envía un enlace de acceso (Magic Link) mediante Supabase Auth (signInWithOtp).
 *
 * Garantías de Seguridad:
 * 1. Establece obligatoriamente `shouldCreateUser: false` para impedir registros públicos.
 * 2. Construye la URL de redirección apuntando estrictamente a `/auth/callback`.
 * 3. Sanea el parámetro `next` para prevenir ataques de redirección abierta.
 */
export async function sendMagicLink(
  supabase: Pick<SupabaseClient, 'auth'>,
  options: SendMagicLinkOptions
): Promise<SendMagicLinkResult> {
  const email = options.email.trim().toLowerCase();
  const safeNext = getSafeRedirectUrl(options.next, '/');
  const origin = options.origin || (typeof window !== 'undefined' ? window.location.origin : '');

  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: false,
      },
    });

    if (error) {
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
