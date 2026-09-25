import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSafeRedirectUrl } from '@/lib/auth/url';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorParam = requestUrl.searchParams.get('error');
  const errorCodeParam = requestUrl.searchParams.get('error_code');
  const rawNext = requestUrl.searchParams.get('next');
  const safeNext = getSafeRedirectUrl(rawNext, '/');

  // 1. Manejo defensivo si Supabase redirige con error o error_code en URL
  // (ej. enlace expirado, denegado o alterado)
  if (errorParam || errorCodeParam) {
    return NextResponse.redirect(new URL('/login?error=callback_error', requestUrl.origin));
  }

  // 2. Si no se incluye el código de intercambio
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=callback_error', requestUrl.origin));
  }

  try {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return NextResponse.redirect(new URL('/login?error=callback_error', requestUrl.origin));
    }

    // 3. Verificación de membresía si el guard del servidor está activo
    if (process.env.AUTH_GUARD_ENABLED === 'true') {
      const { data: isMember, error: memberError } = await supabase.rpc('is_app_member');
      if (memberError || !isMember) {
        // Cierre inmediato de sesión para el usuario no autorizado
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL('/login?error=unauthorized', requestUrl.origin));
      }
    }

    return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  } catch {
    return NextResponse.redirect(new URL('/login?error=callback_error', requestUrl.origin));
  }
}
