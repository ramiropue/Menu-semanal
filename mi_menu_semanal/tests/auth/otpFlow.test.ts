import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeEmail,
  sanitizeOtp,
  isValidOtpFormat,
  classifyVerifyOtpError,
  classifyRequestOtpError,
  getOtpErrorMessage,
  requestLoginOtp,
  verifyLoginOtp,
} from '@/lib/auth/otp';
import { getSafeRedirectUrl } from '@/lib/auth/url';
import { GET as callbackHandler } from '@/app/auth/callback/route';
import { POST as signoutHandler } from '@/app/auth/signout/route';
import { NextRequest } from 'next/server';

// Hoisted mocks para Supabase SSR
const {
  mockGetUser,
  mockRpc,
  mockExchangeCodeForSession,
  mockSignOut,
  mockSignInWithOtp,
  mockVerifyOtp,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockExchangeCodeForSession: vi.fn(),
  mockSignOut: vi.fn(),
  mockSignInWithOtp: vi.fn(),
  mockVerifyOtp: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      exchangeCodeForSession: mockExchangeCodeForSession,
      signOut: mockSignOut,
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
    },
    rpc: mockRpc,
  })),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

describe('6-Digit OTP Authentication Flow (Etapa 5C-E)', () => {
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

  // =========================================================================
  // 1. NORMALIZACIÓN DEL CORREO
  // =========================================================================
  describe('1. Normalización del Correo Electrónico', () => {
    it('normaliza correos eliminando espacios extremos y pasando a minúsculas', () => {
      expect(normalizeEmail('   Usuario@Example.COM  ')).toBe('usuario@example.com');
      expect(normalizeEmail('  TEST.USER+TAG@DOMINIO.ES ')).toBe('test.user+tag@dominio.es');
      expect(normalizeEmail('')).toBe('');
    });

    it('requestLoginOtp aplica normalizeEmail antes de llamar a signInWithOtp', async () => {
      const mockAuth = {
        signInWithOtp: mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null }),
      };

      await requestLoginOtp(
        { auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'] },
        {
          email: '  Usuario_Autorizado@Example.COM  ',
          next: '/planear',
          origin: 'https://menu.example.com',
        }
      );

      expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);
      const callArgs = mockSignInWithOtp.mock.calls[0][0];
      expect(callArgs.email).toBe('usuario_autorizado@example.com');
    });

    it('verifyLoginOtp aplica normalizeEmail antes de llamar a verifyOtp', async () => {
      const mockAuth = {
        verifyOtp: mockVerifyOtp.mockResolvedValueOnce({
          data: { user: { id: 'u-1', email: 'usuario_autorizado@example.com' } },
          error: null,
        }),
        signOut: mockSignOut,
      };
      const mockRpcClient = mockRpc.mockResolvedValueOnce({ data: true, error: null });

      await verifyLoginOtp(
        {
          auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'],
          rpc: mockRpcClient,
        },
        {
          email: '  Usuario_Autorizado@Example.COM  ',
          token: '123456',
        }
      );

      expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
      const callArgs = mockVerifyOtp.mock.calls[0][0];
      expect(callArgs.email).toBe('usuario_autorizado@example.com');
    });
  });

  // =========================================================================
  // 2. shouldCreateUser: false EN SOLICITUD Y REENVÍO
  // =========================================================================
  describe('2. shouldCreateUser: false en Solicitud Inicial y Reenvío', () => {
    it('incluye estrictamente shouldCreateUser: false en la solicitud inicial', async () => {
      const mockAuth = {
        signInWithOtp: mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null }),
      };

      const result = await requestLoginOtp(
        { auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'] },
        { email: 'member@example.com' }
      );

      expect(result.success).toBe(true);
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            shouldCreateUser: false,
          }),
        })
      );
    });

    it('mantiene shouldCreateUser: false en reenvíos subsiguientes', async () => {
      const mockAuth = {
        signInWithOtp: mockSignInWithOtp
          .mockResolvedValueOnce({ data: {}, error: null })
          .mockResolvedValueOnce({ data: {}, error: null }),
      };

      const client = {
        auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'],
      };

      // Solicitud inicial
      await requestLoginOtp(client, { email: 'member@example.com' });
      // Reenvío
      await requestLoginOtp(client, { email: 'member@example.com' });

      expect(mockSignInWithOtp).toHaveBeenCalledTimes(2);
      expect(mockSignInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);
      expect(mockSignInWithOtp.mock.calls[1][0].options.shouldCreateUser).toBe(false);
    });
  });

  // =========================================================================
  // 3. CONSERVACIÓN DE emailRedirectTo
  // =========================================================================
  describe('3. Conservación de emailRedirectTo para compatibilidad', () => {
    it('construye emailRedirectTo apuntando a /auth/callback con el parámetro next saneado', async () => {
      const mockAuth = {
        signInWithOtp: mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null }),
      };

      await requestLoginOtp(
        { auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'] },
        {
          email: 'member@example.com',
          next: '/congelador',
          origin: 'https://menu.example.com',
        }
      );

      const calledOptions = mockSignInWithOtp.mock.calls[0][0].options;
      expect(calledOptions.emailRedirectTo).toBe(
        'https://menu.example.com/auth/callback?next=%2Fcongelador'
      );
    });
  });

  // =========================================================================
  // 4. SANITIZACIÓN Y ACEPTACIÓN DE EXACTAMENTE SEIS DÍGITOS
  // =========================================================================
  describe('4. Validación y Formato de Código OTP (6 Dígitos)', () => {
    it('acepta códigos de exactamente seis dígitos numéricos', () => {
      expect(isValidOtpFormat('123456')).toBe(true);
      expect(isValidOtpFormat('000000')).toBe(true);
      expect(isValidOtpFormat('999999')).toBe(true);
    });

    it('sanitiza espacios y caracteres no numéricos, recortando a máximo 6 caracteres', () => {
      expect(sanitizeOtp(' 1 2 3 4 5 6 ')).toBe('123456');
      expect(sanitizeOtp('12-34-56')).toBe('123456');
      expect(sanitizeOtp('abc123456def')).toBe('123456');
      expect(sanitizeOtp('1234567890')).toBe('123456');
    });

    it('rechaza códigos incompletos, vacíos o no numéricos', () => {
      expect(isValidOtpFormat('')).toBe(false);
      expect(isValidOtpFormat('12345')).toBe(false);
      expect(isValidOtpFormat('1234567')).toBe(false);
      expect(isValidOtpFormat('12345a')).toBe(false);
      expect(isValidOtpFormat('abcdef')).toBe(false);
    });

    it('verifyLoginOtp rechaza sin llamar a Supabase si el código es inválido', async () => {
      const mockAuth = { verifyOtp: mockVerifyOtp, signOut: mockSignOut };
      const mockRpcClient = mockRpc;

      const result = await verifyLoginOtp(
        {
          auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'],
          rpc: mockRpcClient,
        },
        {
          email: 'member@example.com',
          token: '1234', // incompleto
        }
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('invalid_format');
      expect(mockVerifyOtp).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. LLAMADA EXACTA A verifyOtp CON type: 'email'
  // =========================================================================
  describe('5. Llamada Exacta a verifyOtp({ email, token, type: "email" })', () => {
    it('invoca verifyOtp con los argumentos requeridos por Supabase', async () => {
      const mockAuth = {
        verifyOtp: mockVerifyOtp.mockResolvedValueOnce({
          data: { user: { id: 'u-1', email: 'member@example.com' } },
          error: null,
        }),
        signOut: mockSignOut,
      };
      const mockRpcClient = mockRpc.mockResolvedValueOnce({ data: true, error: null });

      const result = await verifyLoginOtp(
        {
          auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'],
          rpc: mockRpcClient,
        },
        {
          email: 'member@example.com',
          token: '654321',
        }
      );

      expect(result.success).toBe(true);
      expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'member@example.com',
        token: '654321',
        type: 'email',
      });
    });
  });

  // =========================================================================
  // 6. GESTIÓN DIFERENCIADA DE ERRORES: INCORRECTO, CADUCADO, RATE LIMIT, SERVICIO
  // =========================================================================
  describe('6. Clasificación de Errores y Mensajes Amigables', () => {
    it('clasifica código incorrecto con mensaje adecuado sin detalles técnicos', () => {
      const errType = classifyVerifyOtpError({ message: 'Token is invalid', status: 400 });
      expect(errType).toBe('invalid_code');
      expect(getOtpErrorMessage(errType)).toBe(
        'El código introducido no es correcto. Compruébalo e inténtalo de nuevo.'
      );
    });

    it('clasifica código caducado con mensaje adecuado', () => {
      const errTypeByCode = classifyVerifyOtpError({ code: 'otp_expired', status: 400 });
      expect(errTypeByCode).toBe('expired_code');

      const errTypeByMsg = classifyVerifyOtpError({ message: 'Token has expired', status: 400 });
      expect(errTypeByMsg).toBe('expired_code');

      expect(getOtpErrorMessage('expired_code')).toBe(
        'El código ha caducado. Solicita un nuevo código.'
      );
    });

    it('clasifica rate limit de intentos (429) con mensaje adecuado', () => {
      const errTypeStatus = classifyVerifyOtpError({ status: 429, message: 'Too many requests' });
      expect(errTypeStatus).toBe('rate_limit');

      const errTypeMsg = classifyVerifyOtpError({ message: 'Over request rate limit' });
      expect(errTypeMsg).toBe('rate_limit');

      expect(getOtpErrorMessage('rate_limit')).toBe(
        'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.'
      );
    });

    it('clasifica límite temporal de envío de correos (request OTP)', () => {
      const errType = classifyRequestOtpError({ status: 429, message: 'over_email_send_rate_limit' });
      expect(errType).toBe('send_rate_limit');
      expect(getOtpErrorMessage('send_rate_limit')).toBe(
        'Has alcanzado el límite temporal de envíos. Espera unos minutos antes de solicitar otro código.'
      );
    });

    it('clasifica errores 5xx como service_error temporal', () => {
      const errType = classifyVerifyOtpError({ status: 503, message: 'Database connection failed' });
      expect(errType).toBe('service_error');
      expect(getOtpErrorMessage('service_error')).toBe(
        'Error temporal del servicio de autenticación. Inténtalo de nuevo en unos instantes.'
      );
    });

    it('mantiene respuesta neutra ante rechazo por usuario inexistente (shouldCreateUser: false)', () => {
      // Supabase devuelve error tipo "Signups not allowed for otp" si shouldCreateUser === false
      // classifyRequestOtpError debe retornar null para que requestLoginOtp devuelva success: true
      const errType = classifyRequestOtpError({ message: 'Signups not allowed for otp', status: 422 });
      expect(errType).toBeNull();
    });
  });

  // =========================================================================
  // 7. AUTORIZACIÓN EN app_members Y CIERRE INMEDIATO DE NO-MIEMBRO
  // =========================================================================
  describe('7. Verificación de Membresía en app_members', () => {
    it('permite el acceso si is_app_member retorna true', async () => {
      const authorizedUser = { id: 'usr-1', email: 'autorizado@example.com' };
      const mockAuth = {
        verifyOtp: mockVerifyOtp.mockResolvedValueOnce({
          data: { user: authorizedUser },
          error: null,
        }),
        signOut: mockSignOut,
      };
      const mockRpcClient = mockRpc.mockResolvedValueOnce({ data: true, error: null });

      const result = await verifyLoginOtp(
        {
          auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'],
          rpc: mockRpcClient,
        },
        {
          email: 'autorizado@example.com',
          token: '123456',
        }
      );

      expect(result.success).toBe(true);
      expect(result.user).toEqual(authorizedUser);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('cierra inmediatamente la sesión mediante signOut() y retorna unauthorized si is_app_member es false', async () => {
      const intruderUser = { id: 'usr-intruder', email: 'intruso@example.com' };
      const mockAuth = {
        verifyOtp: mockVerifyOtp.mockResolvedValueOnce({
          data: { user: intruderUser },
          error: null,
        }),
        signOut: mockSignOut.mockResolvedValueOnce({ error: null }),
      };
      const mockRpcClient = mockRpc.mockResolvedValueOnce({ data: false, error: null });

      const result = await verifyLoginOtp(
        {
          auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'],
          rpc: mockRpcClient,
        },
        {
          email: 'intruso@example.com',
          token: '123456',
        }
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('unauthorized');
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('cierra inmediatamente la sesión si is_app_member falla con error RPC', async () => {
      const mockAuth = {
        verifyOtp: mockVerifyOtp.mockResolvedValueOnce({
          data: { user: { id: 'usr-err' } },
          error: null,
        }),
        signOut: mockSignOut.mockResolvedValueOnce({ error: null }),
      };
      const mockRpcClient = mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await verifyLoginOtp(
        {
          auth: mockAuth as unknown as import('@supabase/supabase-js').SupabaseClient['auth'],
          rpc: mockRpcClient,
        },
        {
          email: 'user@example.com',
          token: '123456',
        }
      );

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('unauthorized');
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 8. SANEAMIENTO DE next Y BLOQUEO DE REDIRECCIONES EXTERNAS
  // =========================================================================
  describe('8. Saneamiento de next y Bloqueo de Redirecciones Abiertas', () => {
    it('permite rutas internas válidas', () => {
      expect(getSafeRedirectUrl('/planear')).toBe('/planear');
      expect(getSafeRedirectUrl('/congelador?tab=nuevo')).toBe('/congelador?tab=nuevo');
      expect(getSafeRedirectUrl('/compra')).toBe('/compra');
    });

    it('bloquea URLs con esquemas externos (https, http, javascript)', () => {
      expect(getSafeRedirectUrl('https://malicious.com')).toBe('/');
      expect(getSafeRedirectUrl('http://malicious.com/login')).toBe('/');
      expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/');
    });

    it('bloquea protocol-relative URLs (//malicious.com)', () => {
      expect(getSafeRedirectUrl('//malicious.com')).toBe('/');
      expect(getSafeRedirectUrl('//evil.org/phish')).toBe('/');
    });

    it('bloquea secuencias con barras invertidas (/\\evil.com)', () => {
      expect(getSafeRedirectUrl('/\\evil.com')).toBe('/');
      expect(getSafeRedirectUrl('\\evil.com')).toBe('/');
    });
  });

  // =========================================================================
  // 9. COMPATIBILIDAD CON /auth/callback
  // =========================================================================
  describe('9. Compatibilidad Temporal con /auth/callback', () => {
    it('gestiona defensivamente error o error_code en los query params', async () => {
      const reqWithError = new NextRequest(
        'http://localhost:3000/auth/callback?error=access_denied&error_code=otp_expired'
      );
      const res = await callbackHandler(reqWithError);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=callback_error');
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('gestiona defensivamente la ausencia de parámetro code', async () => {
      const reqNoCode = new NextRequest('http://localhost:3000/auth/callback');
      const res = await callbackHandler(reqNoCode);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=callback_error');
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('gestiona el fallo en exchangeCodeForSession', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: null,
        error: new Error('Exchange failed'),
      });

      const req = new NextRequest('http://localhost:3000/auth/callback?code=bad-code');
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=callback_error');
    });

    it('intercambia código válido y redirige a ruta segura', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'u-1' } } },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/auth/callback?code=good-code&next=/recetas');
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/recetas');
    });

    it('cierra sesión con signOut() en callback si el usuario no es miembro de app_members', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'intruder' } } },
        error: null,
      });
      mockRpc.mockResolvedValueOnce({ data: false, error: null });
      mockSignOut.mockResolvedValueOnce({ error: null });

      const req = new NextRequest('http://localhost:3000/auth/callback?code=good-code');
      const res = await callbackHandler(req);

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=unauthorized');
    });
  });

  // =========================================================================
  // 10. CIERRE DE SESIÓN MEDIANTE POST (/auth/signout)
  // =========================================================================
  describe('10. Cierre de Sesión Exclusivo por POST', () => {
    it('cierra la sesión mediante POST y redirige con código 302 a /login', async () => {
      mockSignOut.mockResolvedValueOnce({ error: null });

      const req = new NextRequest('http://localhost:3000/auth/signout', { method: 'POST' });
      const res = await signoutHandler(req);

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login');
    });

    it('verifica que no existe endpoint GET en /auth/signout (protección contra prefetch)', async () => {
      const signoutModule = await import('@/app/auth/signout/route');
      expect((signoutModule as { GET?: unknown }).GET).toBeUndefined();
      expect(typeof (signoutModule as { POST?: unknown }).POST).toBe('function');
    });
  });
});
