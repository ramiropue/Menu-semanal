/**
 * lib/auth/url.ts
 *
 * Utilidades de validación y saneamiento de URLs para prevenir
 * ataques de redirección abierta (Open Redirect).
 */

/**
 * Valida que una URL de retorno sea estrictamente una ruta relativa interna.
 * Rechaza esquemas (http:, https:, javascript:), URLs relativas a protocolo (//),
 * caracteres de escape y barras invertidas.
 */
export function getSafeRedirectUrl(target: string | null | undefined, fallback: string = '/'): string {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();

  // Validación estricta:
  // 1. Debe comenzar exactamente con '/'
  // 2. No debe comenzar con '//' (evita protocol-relative URLs como //evil.com)
  // 3. No debe comenzar con '/\' ni contener barras invertidas '\'
  // 4. No debe contener dos puntos ':' (evita schemes como javascript: o data:)
  // 5. No debe contener caracteres de control
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes('\\') &&
    !trimmed.includes(':') &&
    !/[\x00-\x1F\x7F]/.test(trimmed)
  ) {
    return trimmed;
  }

  return fallback;
}
