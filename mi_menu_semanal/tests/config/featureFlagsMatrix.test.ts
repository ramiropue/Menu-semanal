import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAuthGuardEnabled, requireAuth } from '@/lib/auth/guard';
import { isPrivateAuthEnabled } from '@/lib/auth/clientAuth';
import { isSharedStateEnabled, getState } from '@/lib/state/stateAdapter';
import { proxy } from '@/proxy';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// Hoisted mocks para Supabase SSR
const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
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

const mockRedirect = vi.fn((url: string) => {
  const error = new Error(`NEXT_REDIRECT: ${url}`);
  (error as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;;`;
  throw error;
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

describe('Feature Flags Matrix & Decoupled Contract (Etapa 5C-A)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AUTH_GUARD_ENABLED;
    delete process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED;
    delete process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED;

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mockproject.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. EVALUACIÓN ESTRICTA: SOLO LA CADENA EXACTA "true" ACTIVA UNA FUNCIÓN
  // =========================================================================
  describe('Strict String Equality Evaluation', () => {
    const nonActivatingValues = [
      undefined,
      '',
      'false',
      'FALSE',
      'False',
      '0',
      '1',
      'TRUE',
      'True',
      'yes',
      'YES',
      'enabled',
      'true ',
      ' true',
    ];

    it.each(nonActivatingValues)(
      'evaluates AUTH_GUARD_ENABLED=%s as FALSE',
      (val) => {
        if (val === undefined) {
          delete process.env.AUTH_GUARD_ENABLED;
        } else {
          process.env.AUTH_GUARD_ENABLED = val;
        }
        expect(isAuthGuardEnabled()).toBe(false);
      }
    );

    it('evaluates AUTH_GUARD_ENABLED="true" as TRUE', () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      expect(isAuthGuardEnabled()).toBe(true);
    });

    it.each(nonActivatingValues)(
      'evaluates NEXT_PUBLIC_AUTH_GUARD_ENABLED=%s as FALSE',
      (val) => {
        if (val === undefined) {
          delete process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED;
        } else {
          process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED = val;
        }
        expect(isPrivateAuthEnabled()).toBe(false);
      }
    );

    it('evaluates NEXT_PUBLIC_AUTH_GUARD_ENABLED="true" as TRUE', () => {
      process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED = 'true';
      expect(isPrivateAuthEnabled()).toBe(true);
    });

    it.each(nonActivatingValues)(
      'evaluates NEXT_PUBLIC_SHARED_STATE_ENABLED=%s as FALSE',
      (val) => {
        if (val === undefined) {
          delete process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED;
        } else {
          process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = val;
        }
        expect(isSharedStateEnabled()).toBe(false);
      }
    );

    it('evaluates NEXT_PUBLIC_SHARED_STATE_ENABLED="true" as TRUE', () => {
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';
      expect(isSharedStateEnabled()).toBe(true);
    });
  });

  // =========================================================================
  // 2. AISLAMIENTO TOTAL: CERO ACTIVACIÓN CRUZADA IMPLÍCITA
  // =========================================================================
  describe('Zero Implicit Cross-Activation', () => {
    it('activating NEXT_PUBLIC_SHARED_STATE_ENABLED alone does NOT activate auth server or auth client', () => {
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';
      expect(isSharedStateEnabled()).toBe(true);
      expect(isAuthGuardEnabled()).toBe(false);
      expect(isPrivateAuthEnabled()).toBe(false);
    });

    it('activating AUTH_GUARD_ENABLED alone does NOT activate client UI or shared_state', () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      expect(isAuthGuardEnabled()).toBe(true);
      expect(isPrivateAuthEnabled()).toBe(false);
      expect(isSharedStateEnabled()).toBe(false);
    });

    it('activating NEXT_PUBLIC_AUTH_GUARD_ENABLED alone does NOT activate server guard or shared_state', () => {
      process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED = 'true';
      expect(isPrivateAuthEnabled()).toBe(true);
      expect(isAuthGuardEnabled()).toBe(false);
      expect(isSharedStateEnabled()).toBe(false);
    });
  });

  // =========================================================================
  // 3. MATRIZ DE COMPORTAMIENTO FUNCIONAL
  // =========================================================================
  describe('Functional Matrix Scenarios', () => {
    // -----------------------------------------------------------------------
    // Escenario A: Variables ausentes o false -> Modo V1 puro
    // -----------------------------------------------------------------------
    it('Scenario A: all false / absent -> full V1 behavior intact', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      // 1. Guard de servidor omitido
      const guardRes = await requireAuth();
      expect(guardRes.bypassed).toBe(true);
      expect(guardRes.authenticated).toBe(false);

      // 2. Proxy middleware no redirige
      const req = new NextRequest('http://localhost:3000/compra');
      const proxyRes = await proxy(req);
      expect(proxyRes.status).toBe(200);
      expect(proxyRes.headers.get('location')).toBeNull();

      // 3. UI de cierre de sesión oculta
      expect(isPrivateAuthEnabled()).toBe(false);

      // 4. Adaptador de estado consulta estrictamente categories
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValueOnce({
                data: { name: JSON.stringify({ lunes: [] }) },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const stateRes = await getState('planner', {}, mockSupabase);
      expect(stateRes.metadata.source).toBe('v1');
      expect(mockSupabase.from).toHaveBeenCalledWith('categories');
      expect(mockSupabase.from).not.toHaveBeenCalledWith('shared_state');
    });

    // -----------------------------------------------------------------------
    // Escenario B: Solo AUTH_GUARD_ENABLED="true" -> Rutas protegidas, UI V1, DB V1
    // -----------------------------------------------------------------------
    it('Scenario B: only AUTH_GUARD_ENABLED=true -> routes protected, UI & storage remain V1', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      // 1. Proxy middleware redirige usuario no autenticado a /login
      const req = new NextRequest('http://localhost:3000/congelador');
      const proxyRes = await proxy(req);
      expect(proxyRes.status).toBe(307);
      expect(proxyRes.headers.get('location')).toContain('/login?next=%2Fcongelador');

      // 2. UI cliente no muestra botón de salida (NEXT_PUBLIC_AUTH_GUARD_ENABLED es false)
      expect(isPrivateAuthEnabled()).toBe(false);

      // 3. Persistencia sigue en V1
      expect(isSharedStateEnabled()).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Escenario C: Solo NEXT_PUBLIC_AUTH_GUARD_ENABLED="true" -> UI activa, rutas abiertas, DB V1
    // -----------------------------------------------------------------------
    it('Scenario C: only NEXT_PUBLIC_AUTH_GUARD_ENABLED=true -> signout button visible, routes bypassed, DB V1', async () => {
      process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED = 'true';

      // 1. UI cliente activa
      expect(isPrivateAuthEnabled()).toBe(true);

      // 2. Rutas siguen abiertas (AUTH_GUARD_ENABLED es false)
      const guardRes = await requireAuth();
      expect(guardRes.bypassed).toBe(true);

      // 3. Persistencia sigue en V1
      expect(isSharedStateEnabled()).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Escenario D: Solo NEXT_PUBLIC_SHARED_STATE_ENABLED="true" -> shared_state activo, rutas abiertas, UI V1
    // -----------------------------------------------------------------------
    it('Scenario D: only NEXT_PUBLIC_SHARED_STATE_ENABLED=true -> shared_state active, routes bypassed, UI V1', async () => {
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';

      // 1. Persistencia pasa a V2
      expect(isSharedStateEnabled()).toBe(true);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValueOnce({
                data: { payload: ['rec-1'], version: 1, updated_at: '2026-09-22T10:00:00Z' },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const stateRes = await getState('favorites', [], mockSupabase);
      expect(stateRes.metadata.source).toBe('v2');
      expect(mockSupabase.from).toHaveBeenCalledWith('shared_state');
      expect(mockSupabase.from).not.toHaveBeenCalledWith('categories');

      // 2. Rutas siguen abiertas en V1
      const guardRes = await requireAuth();
      expect(guardRes.bypassed).toBe(true);

      // 3. UI cliente sigue en V1
      expect(isPrivateAuthEnabled()).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Escenario E: Las tres variables="true" -> Modo V2 Preview completo
    // -----------------------------------------------------------------------
    it('Scenario E: all three variables=true -> full V2 preview mode', async () => {
      process.env.AUTH_GUARD_ENABLED = 'true';
      process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED = 'true';
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';

      expect(isAuthGuardEnabled()).toBe(true);
      expect(isPrivateAuthEnabled()).toBe(true);
      expect(isSharedStateEnabled()).toBe(true);
    });
  });
});
