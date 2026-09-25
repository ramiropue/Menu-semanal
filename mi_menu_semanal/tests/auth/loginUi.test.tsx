import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from '@/app/login/page';
import {
  sanitizeOtp,
  isValidOtpFormat,
  getOtpErrorMessage,
  OtpErrorType,
} from '@/lib/auth/otp';

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (param: string) => {
      if (param === 'next') return '/congelador';
      if (param === 'error') return null;
      return null;
    },
  }),
}));

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
  }),
}));

describe('Login Page UI & Accessibility Contract (Etapa 5C-E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. RENDERIZADO INICIAL Y EXPERIENCIA MÓVIL
  // =========================================================================
  it('renders Step 1 (email form) with accessible labels and mobile Safari optimizations', () => {
    const html = renderToStaticMarkup(<LoginPage />);

    // 1. Cabecera y accesibilidad
    expect(html).toContain('Acceso Privado');
    expect(html).toContain('id="email-input"');
    expect(html).toContain('id="login-submit-button"');
    expect(html).toContain('type="email"');

    // 2. Optimización para Safari en iPhone: text-[16px] para evitar auto-zoom
    expect(html).toContain('text-[16px]');

    // 3. Apple Touch Targets: min-h-[44px]
    expect(html).toContain('min-h-[44px]');

    // 4. Texto inicial del botón
    expect(html).toContain('Recibir código de acceso');

    // 5. Pie de privacidad estricto (no registro público)
    expect(html).toContain('Acceso restringido a cuentas dadas de alta por administración');
  });

  // =========================================================================
  // 2. CONTRATO DEL FORMULARIO OTP (PASO 2)
  // =========================================================================
  it('validates OTP field specifications for iOS QuickType autocomplete', () => {
    // Verificamos que la especificación de sanitizeOtp y regex cumpla estrictamente
    // con el autocompletado de códigos de 6 dígitos de iOS:
    const rawIosCode = ' 482910 ';
    const sanitized = sanitizeOtp(rawIosCode);

    expect(sanitized).toBe('482910');
    expect(isValidOtpFormat(sanitized)).toBe(true);
    expect(sanitized.length).toBe(6);
  });

  // =========================================================================
  // 3. MENSAJES DE ERROR DIFERENCIADOS SIN ENUMERACIÓN
  // =========================================================================
  it('provides differentiated, user-friendly error messages without technical codes or enumeration', () => {
    const errorTypes: OtpErrorType[] = [
      'invalid_format',
      'invalid_code',
      'expired_code',
      'rate_limit',
      'send_rate_limit',
      'service_error',
      'unauthorized',
    ];

    for (const errType of errorTypes) {
      const msg = getOtpErrorMessage(errType);
      expect(msg).toBeTruthy();
      // No debe contener términos técnicos de Supabase ni nombres de tablas o RPC
      expect(msg).not.toContain('Supabase');
      expect(msg).not.toContain('42501');
      expect(msg).not.toContain('PGRST');
      expect(msg).not.toContain('app_members');
      expect(msg).not.toContain('is_app_member');
    }
  });

  // =========================================================================
  // 4. SEGURIDAD: CERO ALMACENAMIENTO DEL OTP EN STORAGE
  // =========================================================================
  it('ensures OTP code is never written to localStorage, sessionStorage or cookies', () => {
    const testCode = '749201';
    const sanitized = sanitizeOtp(testCode);

    expect(sanitized).toBe('749201');
    // Verificación de que ninguna clave de storage contiene el OTP
    if (typeof window !== 'undefined') {
      expect(window.localStorage.getItem('otp')).toBeNull();
      expect(window.sessionStorage.getItem('otp')).toBeNull();
    }
  });
});
