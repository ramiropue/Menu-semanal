import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSafeRedirectUrl } from './url';

export type OtpErrorType =
  | 'invalid_format'
  | 'invalid_code'
  | 'expired_code'
  | 'rate_limit'
  | 'send_rate_limit'
  | 'service_error'
  | 'unauthorized';

export interface RequestOtpOptions {
  email: string;
  next?: string | null;
  origin?: string;
}

export interface RequestOtpResult {
  success: boolean;
  errorType?: 'send_rate_limit' | 'service_error';
  rawError?: unknown;
}

export interface VerifyOtpOptions {
  email: string;
  token: string;
}

export interface VerifyOtpResult {
  success: boolean;
  errorType?: OtpErrorType;
  user?: User | null;
  rawError?: unknown;
}

/**
 * Normaliza una dirección de correo eliminando espacios y convirtiendo a minúsculas.
 */
export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

/**
 * Sanitiza el código OTP eliminando espacios y caracteres no numéricos,
 * limitando la longitud máxima a 6 caracteres.
 */
export function sanitizeOtp(token: string): string {
  return (token || '').replace(/\D/g, '').slice(0, 6);
}

/**
 * Valida si el código cumple estrictamente con el formato de 6 dígitos numéricos.
 */
export function isValidOtpFormat(token: string): boolean {
  return /^\d{6}$/.test(token);
}

/**
 * Clasifica los errores devueltos por Supabase Auth durante la verificación de OTP.
 * Mapea a tipos de error tipados sin exponer detalles técnicos ni revelar existencia de cuentas.
 */
export function classifyVerifyOtpError(error: unknown): OtpErrorType {
  if (!error || typeof error !== 'object') {
    return 'invalid_code';
  }

  const err = error as { status?: number; code?: string; message?: string };
  const message = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  const status = err.status;

  // Límite de intentos alcanzado (Rate Limit)
  if (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many') ||
    code.includes('rate_limit') ||
    code.includes('over_request_rate_limit')
  ) {
    return 'rate_limit';
  }

  // Código caducado
  if (
    code.includes('expired') ||
    code.includes('otp_expired') ||
    message.includes('expired') ||
    message.includes('caducado')
  ) {
    return 'expired_code';
  }

  // Error de infraestructura del servidor
  if (status && status >= 500) {
    return 'service_error';
  }

  // Código incorrecto o formato inválido devuelto por Auth
  return 'invalid_code';
}

/**
 * Clasifica los errores devueltos durante la solicitud de OTP (signInWithOtp).
 */
export function classifyRequestOtpError(
  error: unknown
): 'send_rate_limit' | 'service_error' | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const err = error as { status?: number; code?: string; message?: string };
  const message = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  const status = err.status;

  // Límite temporal de envíos (Rate limit en proveedor de correo o Supabase)
  if (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('over_email_send_rate_limit') ||
    code.includes('rate_limit') ||
    code.includes('over_email_send_rate_limit')
  ) {
    return 'send_rate_limit';
  }

  // Si Supabase rechaza el envío porque shouldCreateUser === false (ej: 'Signups not allowed for otp')
  // Retornamos null para que la respuesta pública sea neutra y no permita enumeración de correos.
  if (
    message.includes('signups not allowed') ||
    code.includes('signup_disabled') ||
    code.includes('otp_disabled')
  ) {
    return null;
  }

  // Error del servidor o red
  if (status && status >= 500) {
    return 'service_error';
  }

  return null;
}

/**
 * Devuelve el mensaje amigable y neutro correspondiente a cada tipo de error.
 * No revela si la cuenta existe ni expone códigos internos.
 */
export function getOtpErrorMessage(type: OtpErrorType): string {
  switch (type) {
    case 'invalid_format':
      return 'Introduce el código de 6 dígitos numéricos.';
    case 'invalid_code':
      return 'El código introducido no es correcto. Compruébalo e inténtalo de nuevo.';
    case 'expired_code':
      return 'El código ha caducado. Solicita un nuevo código.';
    case 'rate_limit':
      return 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.';
    case 'send_rate_limit':
      return 'Has alcanzado el límite temporal de envíos. Espera unos minutos antes de solicitar otro código.';
    case 'service_error':
      return 'Error temporal del servicio de autenticación. Inténtalo de nuevo en unos instantes.';
    case 'unauthorized':
      return 'Esta aplicación es privada. Tu cuenta no está en la lista de miembros autorizados.';
    default:
      return 'Se produjo un error al procesar la autenticación.';
  }
}

/**
 * Solicita el envío de un código OTP mediante Supabase Auth (signInWithOtp).
 *
 * Garantías de Seguridad:
 * 1. Normaliza estrictamente el correo (trim y toLowerCase).
 * 2. Establece obligatoriamente `shouldCreateUser: false` para impedir nuevos registros.
 * 3. Conserva temporalmente `emailRedirectTo` hacia `/auth/callback` para compatibilidad con Magic Link.
 * 4. Sanea el parámetro interno `next`.
 * 5. Mantiene la respuesta visible neutra frente a correos inexistentes.
 */
export async function requestLoginOtp(
  supabase: Pick<SupabaseClient, 'auth'>,
  options: RequestOtpOptions
): Promise<RequestOtpResult> {
  const email = normalizeEmail(options.email);
  const safeNext = getSafeRedirectUrl(options.next, '/');
  const origin =
    options.origin || (typeof window !== 'undefined' ? window.location.origin : '');

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
      const classified = classifyRequestOtpError(error);
      if (classified) {
        return { success: false, errorType: classified, rawError: error };
      }
      // Respuesta neutra estricta: para errores de usuario inexistente o signups prohibidos,
      // devolvemos success: true para no filtrar qué correos existen.
      return { success: true };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      errorType: 'service_error',
      rawError: err,
    };
  }
}

/**
 * Verifica un código OTP de 6 dígitos mediante Supabase Auth (verifyOtp).
 *
 * Garantías de Seguridad:
 * 1. Normaliza el correo y sanitiza el token numérico.
 * 2. Llama a verifyOtp con `type: 'email'`.
 * 3. Valida la membresía en `public.app_members` mediante `is_app_member()`.
 * 4. Si el usuario no pertenece a app_members, ejecuta de inmediato `signOut()`.
 */
export async function verifyLoginOtp(
  supabase: Pick<SupabaseClient, 'auth' | 'rpc'>,
  options: VerifyOtpOptions
): Promise<VerifyOtpResult> {
  const email = normalizeEmail(options.email);
  const token = sanitizeOtp(options.token);

  if (!isValidOtpFormat(token)) {
    return {
      success: false,
      errorType: 'invalid_format',
    };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error || !data?.user) {
      const errorType = classifyVerifyOtpError(error);
      return {
        success: false,
        errorType,
        rawError: error,
      };
    }

    // Comprobación de autorización: el usuario debe pertenecer a public.app_members
    const { data: isMember, error: memberError } = await supabase.rpc('is_app_member');

    if (memberError || !isMember) {
      // Hardening: Si el usuario existe en Auth pero NO está en app_members,
      // cerrar inmediatamente la sesión y revocar tokens
      await supabase.auth.signOut();
      return {
        success: false,
        errorType: 'unauthorized',
      };
    }

    return {
      success: true,
      user: data.user,
    };
  } catch (err) {
    return {
      success: false,
      errorType: 'service_error',
      rawError: err,
    };
  }
}
