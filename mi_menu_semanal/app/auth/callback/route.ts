import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSafeRedirectUrl } from '@/lib/auth/url';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next');
  const safeNext = getSafeRedirectUrl(rawNext, '/');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Si el guard está habilitado, verificar si la cuenta pertenece a app_members
      if (process.env.AUTH_GUARD_ENABLED === 'true') {
        const { data: isMember, error: memberError } = await supabase.rpc('is_app_member');
        if (memberError || !isMember) {
          // Hardening: Cerrar sesión inmediatamente para revocar tokens de un usuario no autorizado
          await supabase.auth.signOut();
          return NextResponse.redirect(new URL('/login?error=unauthorized', requestUrl.origin));
        }
      }

      return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
    }
  }

  // Si no hay código o el intercambio falló (ej. código caducado o alterado)
  return NextResponse.redirect(new URL('/login?error=callback_error', requestUrl.origin));
}
