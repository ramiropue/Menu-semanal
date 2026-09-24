import { createClient } from '@/lib/supabase/server';
import { getSafeRedirectUrl } from './url';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

export interface AuthGuardResult {
  authenticated: boolean;
  isMember: boolean;
  user: User | null;
  bypassed: boolean;
}

/**
 * Comprueba si la protección de rutas por autenticación está activa.
 * Permanece desactivada por defecto para no alterar la V1 en producción.
 */
export function isAuthGuardEnabled(): boolean {
  return process.env.AUTH_GUARD_ENABLED === 'true';
}

/**
 * Guard reutilizable de servidor para Server Components, Server Actions o Route Handlers.
 *
 * Garantías de Seguridad:
 * 1. Utiliza exclusivamente `getUser()` para validar el token contra el servidor de Auth.
 *    (NUNCA confía ciegamente en `getSession()`).
 * 2. Valida la membresía en `app_members` mediante la función segura `is_app_member()`.
 * 3. Si no hay sesión, redirige a `/login` preservando la ruta solicitada de forma segura.
 * 4. Si el usuario está autenticado pero no está registrado en `app_members`, lo rechaza
 *    redirigiendo a `/login?error=unauthorized` para impedir accesos indebidos.
 * 5. Si `AUTH_GUARD_ENABLED` no es 'true', permite el paso sin redirección (modo V1).
 */
export async function requireAuth(options?: {
  currentPath?: string;
  redirectToLogin?: boolean;
}): Promise<AuthGuardResult> {
  const shouldRedirect = options?.redirectToLogin ?? true;
  const safePath = getSafeRedirectUrl(options?.currentPath, '/');

  if (!isAuthGuardEnabled()) {
    return {
      authenticated: false,
      isMember: false,
      user: null,
      bypassed: true,
    };
  }

  const supabase = await createClient();

  // 1. Verificación estricta de identidad con getUser()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (shouldRedirect) {
      const loginUrl =
        safePath && safePath !== '/'
          ? `/login?next=${encodeURIComponent(safePath)}`
          : '/login';
      redirect(loginUrl);
    }
    return {
      authenticated: false,
      isMember: false,
      user: null,
      bypassed: false,
    };
  }

  // 2. Verificación de membresía autorizada en app_members
  const { data: isMember, error: memberError } = await supabase.rpc('is_app_member');

  if (memberError || !isMember) {
    if (shouldRedirect) {
      redirect('/login?error=unauthorized');
    }
    return {
      authenticated: true,
      isMember: false,
      user,
      bypassed: false,
    };
  }

  return {
    authenticated: true,
    isMember: true,
    user,
    bypassed: false,
  };
}
