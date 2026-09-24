/**
 * Utilidad cliente para comprobar si los controles de autenticación privada están activos en el navegador.
 * Depende exclusivamente de la variable pública NEXT_PUBLIC_AUTH_GUARD_ENABLED.
 *
 * En modo V1 (por defecto o ausente), evalúa a false para no mostrar controles privados (e.g. Cerrar sesión).
 */
export function isPrivateAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED === 'true';
}
