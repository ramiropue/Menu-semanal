import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSafeRedirectUrl } from '@/lib/auth/url';
import { requireAuth, isAuthGuardEnabled } from '@/lib/auth/guard';
import { sendMagicLink } from '@/lib/auth/magicLink';
import { GET as callbackHandler } from '@/app/auth/callback/route';
import { POST as signoutHandler } from '@/app/auth/signout/route';
import { proxy } from '@/proxy';
import { NextRequest } from 'next/server';

// Hoisted mocks for Supabase SSR client
const { mockGetUser, mockRpc, mockExchangeCodeForSession, mockSignOut, mockSignInWithOtp } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockRpc: vi.fn(),
    mockExchangeCodeForSession: vi.fn(),
    mockSignOut: vi.fn(),
    mockSignInWithOtp: vi.fn(),
  }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      exchangeCodeForSession: mockExchangeCodeForSession,
      signOut: mockSignOut,
      signInWithOtp: mockSignInWithOtp,
    },
    rpc: mockRpc,
  })),
}));

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

// Mock Next.js navigation redirect
const mockRedirect = vi.fn((url: string) => {
  const error = new Error(`NEXT_REDIRECT: ${url}`);
  (error as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;;`;
  throw error;
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

describe('Private Authentication Flow (Etapa 5A Hardening)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mockproject.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ============================================================
  // 1. OPEN REDIRECT PREVENTION (getSafeRedirectUrl)
  // ============================================================
  describe('Open Redirect Prevention (getSafeRedirectUrl)', () => {
    it('permits valid relative paths', () => {
      expect(getSafeRedirectUrl('/')).toBe('/');
      expect(getSafeRedirectUrl('/recetas')).toBe('/recetas');
      expect(getSafeRedirectUrl('/planear?dia=lunes')).toBe('/planear?dia=lunes');
      expect(getSafeRedirectUrl('/compra')).toBe('/compra');
    });

    it('blocks protocol-relative URLs (e.g. //evil.com)', () => {
      expect(getSafeRedirectUrl('//evil.com')).toBe('/');
      expect(getSafeRedirectUrl('//evil.com/hack')).toBe('/');
    });

    it('blocks absolute URLs with schemes (http:, https:, javascript:, data:)', () => {
      expect(getSafeRedirectUrl('https://evil.com')).toBe('/');
      expect(getSafeRedirectUrl('http://evil.com/login')).toBe('/');
      expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/');
      expect(getSafeRedirectUrl('data:text/html,<script>evil</script>')).toBe('/');
    });

    it('blocks backslash and escape tricks (/\\evil.com, \\evil.com)', () => {
      expect(getSafeRedirectUrl('/\\evil.com')).toBe('/');
      expect(getSafeRedirectUrl('\\evil.com')).toBe('/');
      expect(getSafeRedirectUrl('/recetas\\evil.com')).toBe('/');
    });

    it('falls back to provided custom fallback when invalid or empty', () => {
      expect(getSafeRedirectUrl('', '/recetas')).toBe('/recetas');
      expect(getSafeRedirectUrl(null, '/recetas')).toBe('/recetas');
      expect(getSafeRedirectUrl(undefined, '/planear')).toBe('/planear');
    });
  });

  // ============================================================
  // 2. MAGIC LINK SENDER (sendMagicLink)
  // ============================================================
  describe('Magic Link Sender (sendMagicLink)', () => {
    it('spies on real signInWithOtp and verifies shouldCreateUser: false and emailRedirectTo pointing to /auth/callback', async () => {
      const mockAuthClient = {
        signInWithOtp: mockSignInWithOtp.mockResolvedValueOnce({
          data: {},
          error: null,
        }),
      };

      const result = await sendMagicLink(
        { auth: mockAuthClient as unknown as import('@supabase/supabase-js').SupabaseClient['auth'] },
        {
          email: '  Usuario_Autorizado@Example.com  ',
          next: '/recetas/nueva',
          origin: 'https://mi-menu.example.com',
        }
      );

      expect(result.success).toBe(true);
      expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);

      const calledArgs = mockSignInWithOtp.mock.calls[0][0];

      // 1. Verificación de normalización de correo
      expect(calledArgs.email).toBe('usuario_autorizado@example.com');

      // 2. Verificación OBLIGATORIA: shouldCreateUser === false
      expect(calledArgs.options.shouldCreateUser).toBe(false);

      // 3. Verificación OBLIGATORIA: emailRedirectTo apunta a /auth/callback
      expect(calledArgs.options.emailRedirectTo).toBe(
        'https://mi-menu.example.com/auth/callback?next=%2Frecetas%2Fnueva'
      );
    });
  });

  // ============================================================
  // 3. PKCE CALLBACK ROUTE (/auth/callback)
  // ============================================================
  describe('PKCE Auth Callback (/auth/callback)', () => {
    it('redirects to /login?error=callback_error when code is missing', async () => {
      const req = new NextRequest('http://localhost:3000/auth/callback');
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=callback_error');
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('redirects to /login?error=callback_error when code exchange fails', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: null,
        error: new Error('Invalid or expired PKCE code'),
      });

      const req = new NextRequest('http://localhost:3000/auth/callback?code=bad_code');
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=callback_error');
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('bad_code');
    });

    it('exchanges valid code and redirects to safe next destination', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/auth/callback?code=good_code&next=/recetas');
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/recetas');
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('good_code');
    });

    it('sanitizes open redirect attempt in callback next parameter', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/auth/callback?code=good_code&next=https://evil.com');
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/');
    });

    it('blocks authenticated non-member in callback, calls signOut() and redirects to /login?error=unauthorized', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';

      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'unauth-user' } } },
        error: null,
      });
      mockRpc.mockResolvedValueOnce({ data: false, error: null }); // is_app_member -> false
      mockSignOut.mockResolvedValueOnce({ error: null });

      const req = new NextRequest('http://localhost:3000/auth/callback?code=good_code');
      const res = await callbackHandler(req);

      // Verificación EXPRESA: debe invocar signOut() antes de redirigir
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=unauthorized');
    });
  });

  // ============================================================
  // 4. SIGN OUT (/auth/signout)
  // ============================================================
  describe('Sign Out Route (/auth/signout)', () => {
    it('calls signOut and redirects to /login on POST', async () => {
      mockSignOut.mockResolvedValueOnce({ error: null });

      const req = new NextRequest('http://localhost:3000/auth/signout', { method: 'POST' });
      const res = await signoutHandler(req);

      expect(mockSignOut).toHaveBeenCalled();
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login');
    });

    it('confirms that GET handler does NOT exist in /auth/signout (POST-only)', async () => {
      const signoutModule = await import('@/app/auth/signout/route');
      expect((signoutModule as { GET?: unknown }).GET).toBeUndefined();
      expect(typeof (signoutModule as { POST?: unknown }).POST).toBe('function');
    });
  });

  // ============================================================
  // 5. SERVER GUARD (requireAuth)
  // ============================================================
  describe('Server Guard (requireAuth)', () => {
    it('bypasses guard completely when AUTH_GUARD_ENABLED is not true (V1 mode)', async () => {
      delete process.env.AUTH_GUARD_ENABLED;
      expect(isAuthGuardEnabled()).toBe(false);

      const result = await requireAuth({ currentPath: '/recetas' });
      expect(result.bypassed).toBe(true);
      expect(result.authenticated).toBe(false);
      expect(result.isMember).toBe(false);
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('redirects unauthenticated user to /login with safe next parameter', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('No session') });

      await expect(requireAuth({ currentPath: '/planear' })).rejects.toThrow('NEXT_REDIRECT: /login?next=%2Fplanear');
      expect(mockGetUser).toHaveBeenCalled();
    });

    it('returns unauthenticated result without throwing when redirectToLogin is false', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      const result = await requireAuth({ redirectToLogin: false });
      expect(result.authenticated).toBe(false);
      expect(result.isMember).toBe(false);
      expect(result.user).toBeNull();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('rejects authenticated user who is NOT a member of app_members', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'user-intruder', email: 'intruso@example.com' } },
        error: null,
      });
      mockRpc.mockResolvedValueOnce({ data: false, error: null }); // is_app_member -> false

      await expect(requireAuth({ currentPath: '/recetas' })).rejects.toThrow('NEXT_REDIRECT: /login?error=unauthorized');
      expect(mockRpc).toHaveBeenCalledWith('is_app_member');
    });

    it('allows access to authorized app_member without redirecting', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      const authorizedUser = { id: 'member-1', email: 'pareja_a@example.com' };

      mockGetUser.mockResolvedValueOnce({
        data: { user: authorizedUser },
        error: null,
      });
      mockRpc.mockResolvedValueOnce({ data: true, error: null }); // is_app_member -> true

      const result = await requireAuth({ currentPath: '/planear' });
      expect(result.bypassed).toBe(false);
      expect(result.authenticated).toBe(true);
      expect(result.isMember).toBe(true);
      expect(result.user).toEqual(authorizedUser);
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 6. PROXY TESTS (proxy.ts / Next.js 16)
  // ============================================================
  describe('Proxy Middleware (proxy.ts)', () => {
    it('bypasses guard completely when AUTH_GUARD_ENABLED is not true (V1 mode intact)', async () => {
      delete process.env.AUTH_GUARD_ENABLED;
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      const req = new NextRequest('http://localhost:3000/planear');
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('always allows public routes /login, /auth/callback, /auth/signout without redirecting', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      for (const route of ['/login', '/auth/callback', '/auth/signout']) {
        const req = new NextRequest(`http://localhost:3000${route}`);
        const res = await proxy(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
      }
    });

    it('redirects unauthenticated user accessing protected route to /login?next=...', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      const req = new NextRequest('http://localhost:3000/recetas');
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?next=%2Frecetas');
    });

    it('redirects authenticated non-member to /login?error=unauthorized', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'unauthorized-user' } },
        error: null,
      });
      mockRpc.mockResolvedValueOnce({ data: false, error: null }); // is_app_member -> false

      const req = new NextRequest('http://localhost:3000/compra');
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=unauthorized');
    });

    it('allows authorized member through when guard is enabled', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'authorized-member-id' } },
        error: null,
      });
      mockRpc.mockResolvedValueOnce({ data: true, error: null }); // is_app_member -> true

      const req = new NextRequest('http://localhost:3000/compra');
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });
});
