/**
 * Utilidad cliente para comprobar si la autenticación privada V2 está activa.
 */
export function isPrivateAuthEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED === 'true'
  );
}
