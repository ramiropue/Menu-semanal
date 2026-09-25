import type { SupabaseClient } from '@supabase/supabase-js';
import { requestLoginOtp, RequestOtpOptions } from './otp';

export type SendMagicLinkOptions = RequestOtpOptions;

export interface SendMagicLinkResult {
  success: boolean;
  error?: Error | null;
}

/**
 * Envía un enlace de acceso (Magic Link / OTP) mediante Supabase Auth.
 * Mantenido temporalmente para compatibilidad durante la transición hacia OTP de 6 dígitos.
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
  const result = await requestLoginOtp(supabase, options);
  return {
    success: result.success,
    error:
      result.rawError instanceof Error
        ? result.rawError
        : result.rawError
          ? new Error(String(result.rawError))
          : null,
  };
}
