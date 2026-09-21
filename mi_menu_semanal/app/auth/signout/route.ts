import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Endpoint de cierre de sesión exclusivo por POST.
 * Protege contra invocaciones no deseadas por pre-fetching o enlaces GET (defensa CSRF).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const requestUrl = new URL(request.url);
  return NextResponse.redirect(new URL('/login', requestUrl.origin), {
    status: 302,
  });
}
