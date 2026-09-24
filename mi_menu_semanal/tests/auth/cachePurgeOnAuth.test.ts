import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getState,
  saveState,
  clearSharedStateCache,
  getCachedVersion,
  setCachedVersion,
  resetStateCache,
} from '@/lib/state/stateAdapter';
import { STATE_KEY_CONFIGS } from '@/lib/state/types';
import { POST as signoutPostHandler } from '@/app/auth/signout/route';
import { isPrivateAuthEnabled } from '@/lib/auth/clientAuth';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// Polyfill de localStorage y window para entorno Node
const mockLocalStorageStore = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => mockLocalStorageStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mockLocalStorageStore.set(key, String(value));
  },
  removeItem: (key: string) => {
    mockLocalStorageStore.delete(key);
  },
  clear: () => {
    mockLocalStorageStore.clear();
  },
};

if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    location: { href: '' },
    localStorage: mockLocalStorage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
} else {
  (globalThis.window as unknown as { localStorage: unknown }).localStorage = mockLocalStorage;
}
(globalThis as unknown as { localStorage: unknown }).localStorage = mockLocalStorage;

// Mock para Supabase Server (usado en /auth/signout)
const mockSignOut = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signOut: mockSignOut,
    },
  })),
}));

describe('Auth Cache Purge & SignOut Hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorageStore.clear();
    resetStateCache();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. LAS CUATRO CLAVES Y VERSIONES DESAPARECEN AL CERRAR SESIÓN
  // =========================================================================
  it('purges all 4 shared state payloads and versions completely on sign out', () => {
    // Población previa de las 4 claves y sus versiones
    for (const conf of Object.values(STATE_KEY_CONFIGS)) {
      localStorage.setItem(conf.storageKey, JSON.stringify({ key: conf.key, private: true }));
      localStorage.setItem(`${conf.storageKey}_version`, '5');
      setCachedVersion(conf.key, 5);
    }

    // Confirmar que existen antes del cierre
    expect(localStorage.getItem('planner_meals')).not.toBeNull();
    expect(localStorage.getItem('congelador_items')).not.toBeNull();
    expect(localStorage.getItem('shopping_list_items')).not.toBeNull();
    expect(localStorage.getItem('mimenu_favorites')).not.toBeNull();
    expect(getCachedVersion('planner')).toBe(5);

    // Ejecutar la limpieza de sesión
    clearSharedStateCache();

    // Las 4 claves y sus versiones deben desaparecer de localStorage
    for (const conf of Object.values(STATE_KEY_CONFIGS)) {
      expect(localStorage.getItem(conf.storageKey)).toBeNull();
      expect(localStorage.getItem(`${conf.storageKey}_version`)).toBeNull();
      // Las versiones en memoria deben reiniciarse al valor base
      expect(getCachedVersion(conf.key)).toBe(1);
    }
  });

  // =========================================================================
  // 2. UN NO-MIEMBRO PROVOCA LIMPIEZA COMPLETA Y REDIRECCIÓN
  // =========================================================================
  it('triggers full cache purge and redirects when a non-member is rejected (42501 / unauthorized)', async () => {
    process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';

    // Poblamos datos privados en caché
    localStorage.setItem('planner_meals', JSON.stringify({ familia: 'datos-privados' }));
    localStorage.setItem('congelador_items', JSON.stringify([{ id: 1 }]));
    localStorage.setItem('shopping_list_items', JSON.stringify([{ name: 'Fruta' }]));
    localStorage.setItem('mimenu_favorites', JSON.stringify(['receta-secreta']));
    setCachedVersion('planner', 3);

    // Mock de cliente Supabase que devuelve 42501 (no miembro)
    const mockClient = {
      rpc: vi.fn().mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'Usuario no autorizado para modificar shared_state' },
      }),
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const result = await saveState('planner', { lunes: [] }, undefined, mockClient);

    expect(result.success).toBe(false);
    expect(result.isUnauthorized).toBe(true);

    // Comprobación de limpieza completa
    expect(localStorage.getItem('planner_meals')).toBeNull();
    expect(localStorage.getItem('congelador_items')).toBeNull();
    expect(localStorage.getItem('shopping_list_items')).toBeNull();
    expect(localStorage.getItem('mimenu_favorites')).toBeNull();
    expect(getCachedVersion('planner')).toBe(1);

    // Redirección ejecutada de forma segura
    expect(window.location.href).toContain('/login?error=unauthorized');
  });

  // =========================================================================
  // 3. UN USUARIO NUEVO EN EL MISMO NAVEGADOR NO VE DATOS DEL USUARIO ANTERIOR
  // =========================================================================
  it('prevents a new user from seeing cached data belonging to a previous user', async () => {
    process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';

    // Usuario A tiene datos privados
    localStorage.setItem('planner_meals', JSON.stringify({ usuarioA: 'recetas-de-usuario-A' }));
    setCachedVersion('planner', 4);

    // Usuario A cierra sesión -> Se purga la caché
    clearSharedStateCache();

    // Usuario B entra al navegador. Si la petición remota aún no ha respondido o falla,
    // getState debe retornar el valor por defecto y NUNCA los datos de Usuario A
    const defaultState = { defaultMeals: [] };
    const mockClientUserB = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValueOnce({
              data: null,
              error: { code: '42501', message: 'permission denied' },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const resUserB = await getState('planner', defaultState, mockClientUserB);

    // Usuario B ve estrictamente el defaultState, no los datos de Usuario A
    expect(resUserB.data).toEqual(defaultState);
    expect(resUserB.data).not.toHaveProperty('usuarioA');
    expect(localStorage.getItem('planner_meals')).toBeNull();
  });

  // =========================================================================
  // 4. EL CIERRE DE SESIÓN CONTINÚA SIENDO EXCLUSIVAMENTE POST
  // =========================================================================
  it('ensures /auth/signout is strictly POST-only and redirects with status 302', async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });

    const signoutModule = await import('@/app/auth/signout/route');
    // Verificación de que no existe handler GET (protección contra prefetching y CSRF)
    expect((signoutModule as { GET?: unknown }).GET).toBeUndefined();
    expect(typeof signoutModule.POST).toBe('function');

    const req = new NextRequest('http://localhost:3000/auth/signout', { method: 'POST' });
    const res = await signoutPostHandler(req);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
  });

  // =========================================================================
  // 5. CONTROL CLIENTE: NO MOSTRAR BOTÓN EN MODO V1
  // =========================================================================
  it('keeps private auth controls hidden in mode V1 (strictly depends on NEXT_PUBLIC_AUTH_GUARD_ENABLED)', () => {
    delete process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED;
    delete process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED;

    expect(isPrivateAuthEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED = 'false';
    process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'false';
    expect(isPrivateAuthEnabled()).toBe(false);

    // Activación aislada de shared_state NO debe activar los controles de autenticación
    process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';
    expect(isPrivateAuthEnabled()).toBe(false);

    // Se activa únicamente cuando NEXT_PUBLIC_AUTH_GUARD_ENABLED es estrictamente 'true'
    process.env.NEXT_PUBLIC_AUTH_GUARD_ENABLED = 'true';
    expect(isPrivateAuthEnabled()).toBe(true);
  });
});
