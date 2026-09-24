import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Rutas públicas que nunca deben ser interceptadas por el guard
 * para evitar cualquier bucle de redirección.
 */
const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/signout'];

/**
 * Middleware helper para:
 * 1. Refrescar tokens de sesión Supabase Auth expirados (usando getUser()).
 * 2. Mantener las cookies sincronizadas entre Request y Response.
 * 3. Proteger rutas condicionalmente si AUTH_GUARD_ENABLED === 'true' (por defecto inactivo en V1).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Validar y refrescar la sesión del usuario si existe
  // NOTA: Se usa getUser() en lugar de getSession() para validar contra el servidor de Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si el guard de autenticación está desactivado (modo V1 por defecto), no bloquea nada
  if (process.env.AUTH_GUARD_ENABLED !== 'true') {
    return supabaseResponse;
  }

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  // Si la ruta es pública, permitir siempre el acceso
  if (isPublicPath) {
    return supabaseResponse;
  }

  // 1. Usuario sin sesión: redirigir a /login preservando la ruta solicitada
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    if (pathname && pathname !== '/') {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 2. Usuario autenticado: verificar membresía en app_members mediante RPC
  const { data: isMember, error: memberError } = await supabase.rpc('is_app_member');

  if (memberError || !isMember) {
    // Usuario autenticado pero no autorizado: rechazar de forma segura
    const unauthorizedUrl = new URL('/login', request.url);
    unauthorizedUrl.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(unauthorizedUrl);
  }

  return supabaseResponse;
}
