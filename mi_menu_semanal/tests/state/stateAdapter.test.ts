import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getState,
  saveState,
  isSharedStateEnabled,
  getCachedVersion,
  setCachedVersion,
  resetStateCache,
  setSupabaseClient,
} from '@/lib/state/stateAdapter';
import { validatePayload } from '@/lib/state/types';
import { getPlannedMeals, savePlannedMeals } from '@/lib/plannerStore';
import {
  getFreezerItems,
  saveFreezerItems,
  getShoppingList,
  saveShoppingList,
  getFavorites,
  saveFavorites,
  getSyncedState,
  saveSyncedState,
} from '@/lib/syncStore';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mocks para Supabase Client
function createMockSupabase() {
  const fromMock = vi.fn();
  const selectMock = vi.fn();
  const eqMock = vi.fn();
  const singleMock = vi.fn();
  const updateMock = vi.fn();
  const upsertMock = vi.fn();
  const rpcMock = vi.fn();

  let nextRpcResult: { data: unknown; error: unknown } = {
    data: [{ success: true, current_version: 2, current_payload: {} }],
    error: null,
  };
  let shouldRejectRpc: Error | null = null;

  rpcMock.mockImplementation(() => {
    if (shouldRejectRpc) {
      return Promise.reject(shouldRejectRpc);
    }
    return Promise.resolve(nextRpcResult);
  });

  const queryChain: Record<string, unknown> = {
    select: selectMock,
    eq: eqMock,
    single: singleMock,
    update: updateMock,
    upsert: upsertMock,
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
    },
  };

  selectMock.mockReturnValue(queryChain);
  eqMock.mockReturnValue(queryChain);
  updateMock.mockReturnValue(queryChain);
  upsertMock.mockReturnValue(queryChain);
  fromMock.mockReturnValue(queryChain);
  singleMock.mockResolvedValue({ data: null, error: null });

  return {
    client: { from: fromMock, rpc: rpcMock } as unknown as SupabaseClient,
    fromMock,
    selectMock,
    eqMock,
    singleMock,
    updateMock,
    upsertMock,
    rpcMock,
    queryChain,
    setRpcResult: (result: { data: unknown; error: unknown }) => {
      nextRpcResult = result;
      shouldRejectRpc = null;
    },
    setRejectRpc: (err: Error) => {
      shouldRejectRpc = err;
    },
  };
}

// Polyfill para simular localStorage y window en entorno de test Node
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

describe('State Adapter & Store Layer (Etapa 5B)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorageStore.clear();
    resetStateCache();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ==========================================================================
  // 1. VALIDACIÓN ESTRICTA DE PAYLOADS
  // ==========================================================================
  describe('Strict Payload Validation (validatePayload)', () => {
    it('validates planner payload: must be a plain object, not an array or primitive', () => {
      expect(validatePayload('planner', { lunes: [{ type: 'COMIDA', recipeId: 'r1' }] }).valid).toBe(true);
      expect(validatePayload('planner', {}).valid).toBe(true);

      // Casos inválidos
      expect(validatePayload('planner', null).valid).toBe(false);
      expect(validatePayload('planner', undefined).valid).toBe(false);
      expect(validatePayload('planner', []).valid).toBe(false);
      expect(validatePayload('planner', 'texto').valid).toBe(false);
      expect(validatePayload('planner', 123).valid).toBe(false);
    });

    it('validates freezer payload: must be an array', () => {
      expect(validatePayload('freezer', [{ id: 1, title: 'Pollo' }]).valid).toBe(true);
      expect(validatePayload('freezer', []).valid).toBe(true);

      // Casos inválidos
      expect(validatePayload('freezer', null).valid).toBe(false);
      expect(validatePayload('freezer', { id: 1 }).valid).toBe(false);
      expect(validatePayload('freezer', 'congelador').valid).toBe(false);
      expect(validatePayload('freezer', 42).valid).toBe(false);
    });

    it('validates shopping_list payload: must be an array', () => {
      expect(validatePayload('shopping_list', [{ name: 'Leche', quantity: 1 }]).valid).toBe(true);
      expect(validatePayload('shopping_list', []).valid).toBe(true);

      // Casos inválidos
      expect(validatePayload('shopping_list', null).valid).toBe(false);
      expect(validatePayload('shopping_list', {}).valid).toBe(false);
      expect(validatePayload('shopping_list', 'lista').valid).toBe(false);
    });

    it('validates favorites payload: must be an array of strings', () => {
      expect(validatePayload('favorites', ['receta-1', 'receta-2']).valid).toBe(true);
      expect(validatePayload('favorites', []).valid).toBe(true);

      // Casos inválidos
      expect(validatePayload('favorites', null).valid).toBe(false);
      expect(validatePayload('favorites', {}).valid).toBe(false);
      expect(validatePayload('favorites', [1, 2, 3]).valid).toBe(false);
      expect(validatePayload('favorites', ['receta-1', { id: 'receta-2' }]).valid).toBe(false);
      expect(validatePayload('favorites', 'receta-1').valid).toBe(false);
    });

    it('returns a controlled error on invalid payload without throwing or crashing', async () => {
      const mockSupabase = createMockSupabase();
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';

      const saveResult = await saveState(
        'freezer',
        'no-es-un-array' as unknown as unknown[],
        undefined,
        mockSupabase.client
      );

      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toContain('Validación rechazada');
      expect(mockSupabase.fromMock).not.toHaveBeenCalled();
      expect(mockSupabase.rpcMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. MODO V1 (Por defecto: NEXT_PUBLIC_SHARED_STATE_ENABLED=false)
  // ==========================================================================
  describe('Mode V1 (categories special rows)', () => {
    it('recognizes V1 mode by default when env flag is absent or false', () => {
      expect(isSharedStateEnabled()).toBe(false);
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'false';
      expect(isSharedStateEnabled()).toBe(false);
    });

    it('reads strictly from categories and NEVER from shared_state in V1', async () => {
      const mock = createMockSupabase();
      mock.singleMock.mockResolvedValueOnce({
        data: { name: JSON.stringify({ lunes: [] }) },
        error: null,
      });

      const result = await getState('planner', {}, mock.client);

      expect(mock.fromMock).toHaveBeenCalledWith('categories');
      expect(mock.fromMock).not.toHaveBeenCalledWith('shared_state');
      expect(mock.eqMock).toHaveBeenCalledWith('id', '_PLANNER_STATE_');
      expect(result.metadata.source).toBe('v1');
      expect(result.data).toEqual({ lunes: [] });
    });

    it('writes strictly to categories (upsert) and NEVER to shared_state in V1 (no double writes)', async () => {
      const mock = createMockSupabase();
      mock.upsertMock.mockResolvedValueOnce({ error: null });

      const testMeals = { martes: [{ type: 'CENA' as const, recipeId: 'rec-123' }] };
      const result = await saveState('planner', testMeals, undefined, mock.client);

      expect(result.success).toBe(true);
      expect(result.source).toBe('v1');
      expect(mock.fromMock).toHaveBeenCalledWith('categories');
      expect(mock.fromMock).not.toHaveBeenCalledWith('shared_state');
      expect(mock.rpcMock).not.toHaveBeenCalled();
      expect(mock.upsertMock).toHaveBeenCalledWith({
        id: '_PLANNER_STATE_',
        name: JSON.stringify(testMeals),
        icon: 'settings',
        is_active: false,
      });
      expect(localStorage.getItem('planner_meals')).toBe(JSON.stringify(testMeals));
    });

    it('handles categories upsert error in V1: returns failure and does not commit to localStorage', async () => {
      const mock = createMockSupabase();
      mock.upsertMock.mockResolvedValueOnce({ error: { message: 'Database connection failed' } });

      localStorage.setItem('planner_meals', JSON.stringify({ old: true }));
      const newMeals = { miercoles: [{ type: 'COMIDA' as const, recipeId: 'rec-fail' }] };
      const result = await saveState('planner', newMeals, undefined, mock.client);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
      // No debe sobrescribir localStorage si Supabase falló
      expect(localStorage.getItem('planner_meals')).toBe(JSON.stringify({ old: true }));
    });

    it('reads freezer and shopping_list from respective V1 categories', async () => {
      const mock = createMockSupabase();
      mock.singleMock
        .mockResolvedValueOnce({
          data: { name: JSON.stringify([{ id: 1, title: 'Carne' }]) },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { name: JSON.stringify([{ name: 'Pan', quantity: 1 }]) },
          error: null,
        });

      const freezerRes = await getState('freezer', [], mock.client);
      expect(freezerRes.data).toEqual([{ id: 1, title: 'Carne' }]);
      expect(mock.eqMock).toHaveBeenCalledWith('id', '_FREEZER_STATE_');

      const shoppingRes = await getState('shopping_list', [], mock.client);
      expect(shoppingRes.data).toEqual([{ name: 'Pan', quantity: 1 }]);
      expect(mock.eqMock).toHaveBeenCalledWith('id', '_SHOPPING_LIST_STATE_');
    });
  });

  // ==========================================================================
  // 3. MODO V2 (NEXT_PUBLIC_SHARED_STATE_ENABLED=true)
  // ==========================================================================
  describe('Mode V2 (shared_state table)', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';
    });

    it('recognizes V2 mode when flag is true', () => {
      expect(isSharedStateEnabled()).toBe(true);
    });

    it('reads strictly from shared_state and NEVER from categories in V2', async () => {
      const mock = createMockSupabase();
      mock.singleMock.mockResolvedValueOnce({
        data: {
          payload: ['receta-a', 'receta-b'],
          version: 4,
          updated_at: '2026-09-22T08:00:00Z',
          updated_by: 'user-uuid-1',
        },
        error: null,
      });

      const result = await getState('favorites', [], mock.client);

      expect(mock.fromMock).toHaveBeenCalledWith('shared_state');
      expect(mock.fromMock).not.toHaveBeenCalledWith('categories');
      expect(mock.eqMock).toHaveBeenCalledWith('state_key', 'favorites');
      expect(result.metadata.source).toBe('v2');
      expect(result.metadata.version).toBe(4);
      expect(result.data).toEqual(['receta-a', 'receta-b']);
      expect(getCachedVersion('favorites')).toBe(4);
      expect(localStorage.getItem('mimenu_favorites')).toBe(JSON.stringify(['receta-a', 'receta-b']));
    });

    it('writes EXCLUSIVELY via update_shared_state RPC (never direct table update)', async () => {
      const mock = createMockSupabase();
      setCachedVersion('shopping_list', 2);

      const updatedPayload = [{ name: 'Arroz', quantity: 1 }];
      mock.setRpcResult({
        data: [
          {
            success: true,
            current_version: 3,
            current_payload: updatedPayload,
            updated_at: '2026-09-22T08:05:00Z',
          },
        ],
        error: null,
      });

      const result = await saveState('shopping_list', updatedPayload, { expectedVersion: 2 }, mock.client);

      expect(result.success).toBe(true);
      expect(result.version).toBe(3);
      expect(result.source).toBe('v2');

      // Vía exclusiva RPC: nunca .from('shared_state').update()
      expect(mock.rpcMock).toHaveBeenCalledWith('update_shared_state', {
        p_key: 'shopping_list',
        p_payload: updatedPayload,
        p_expected_version: 2,
      });
      expect(mock.updateMock).not.toHaveBeenCalled();
      expect(mock.fromMock).not.toHaveBeenCalled();

      // Confirmado en caché local únicamente tras respuesta RPC exitosa
      expect(getCachedVersion('shopping_list')).toBe(3);
      expect(localStorage.getItem('shopping_list_items')).toBe(JSON.stringify(updatedPayload));
    });

    it('detects concurrency conflict from RPC and updates cache to server truth without silent overwrite', async () => {
      const mock = createMockSupabase();
      setCachedVersion('planner', 1);

      const serverRemoteData = { martes: [{ type: 'COMIDA', recipeId: 'rec-sesion-a' }] };
      mock.setRpcResult({
        data: [
          {
            success: false,
            current_version: 2,
            current_payload: serverRemoteData,
            updated_at: '2026-09-22T08:10:00Z',
          },
        ],
        error: null,
      });

      const sessionBAttempt = { martes: [{ type: 'COMIDA', recipeId: 'rec-sesion-b' }] };
      const result = await saveState('planner', sessionBAttempt, { expectedVersion: 1 }, mock.client);

      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
      expect(result.currentVersion).toBe(2);
      expect(result.currentData).toEqual(serverRemoteData);
      expect(result.error).toContain('Conflicto de concurrencia');

      // La versión y payload local se sincronizan con la verdad remota
      expect(getCachedVersion('planner')).toBe(2);
      expect(localStorage.getItem('planner_meals')).toBe(JSON.stringify(serverRemoteData));
    });

    it('handles unauthorized error (RLS 42501 / 401 / 403) by clearing private cache of all keys', async () => {
      const mock = createMockSupabase();

      // Poblamos caché previa con datos privados
      localStorage.setItem('planner_meals', JSON.stringify({ secreto: 'datos-familiares' }));
      localStorage.setItem('congelador_items', JSON.stringify([{ id: 1 }]));
      localStorage.setItem('shopping_list_items', JSON.stringify([{ name: 'Pan' }]));
      localStorage.setItem('mimenu_favorites', JSON.stringify(['fav-1']));
      setCachedVersion('freezer', 3);

      mock.setRpcResult({
        data: null,
        error: { code: '42501', message: 'permission denied for function update_shared_state' },
      });

      const result = await saveState('freezer', [{ id: 2 }], undefined, mock.client);

      expect(result.success).toBe(false);
      expect(result.isUnauthorized).toBe(true);
      expect(result.error).toContain('permission denied');

      // Comprobación de condición 1: Eliminación total de caché privada de las 4 claves
      expect(localStorage.getItem('planner_meals')).toBeNull();
      expect(localStorage.getItem('congelador_items')).toBeNull();
      expect(localStorage.getItem('shopping_list_items')).toBeNull();
      expect(localStorage.getItem('mimenu_favorites')).toBeNull();
      expect(getCachedVersion('freezer')).toBe(1);
    });

    it('clears private cache on getState unauthorized and returns safe default without leaking private cache', async () => {
      const mock = createMockSupabase();

      localStorage.setItem('planner_meals', JSON.stringify({ datos: 'privados' }));
      mock.singleMock.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'permission denied for table shared_state' },
      });

      const result = await getState('planner', { default: true }, mock.client);

      expect(result.error).toBeDefined();
      expect(result.data).toEqual({ default: true }); // No devuelve datos privados de caché
      expect(localStorage.getItem('planner_meals')).toBeNull();
    });

    it('handles network error gracefully without committing optimistic payload to localStorage', async () => {
      const mock = createMockSupabase();
      localStorage.setItem('mimenu_favorites', JSON.stringify(['rec-old']));
      mock.setRejectRpc(new Error('Network connection timeout'));

      const result = await saveState('favorites', ['rec-new'], undefined, mock.client);

      expect(result.success).toBe(false);
      expect(result.isNetworkError).toBe(true);
      expect(result.error).toContain('Network connection timeout');
      // La caché local conserva el estado confirmado previo
      expect(localStorage.getItem('mimenu_favorites')).toBe(JSON.stringify(['rec-old']));
    });

    it('serializes rapid consecutive writes via queue and reads expectedVersion at execution time', async () => {
      const mock = createMockSupabase();
      setCachedVersion('favorites', 1);

      const op1Payload = ['fav-1'];
      const op2Payload = ['fav-1', 'fav-2'];

      let op1Executed = false;
      let op2ExpectedVersionAtExec = -1;

      mock.rpcMock.mockImplementation((_fn: string, args: { p_key: string; p_payload: unknown; p_expected_version: number }) => {
        if (!op1Executed) {
          op1Executed = true;
          expect(args.p_expected_version).toBe(1);
          return Promise.resolve({
            data: [{ success: true, current_version: 2, current_payload: op1Payload }],
            error: null,
          });
        } else {
          op2ExpectedVersionAtExec = args.p_expected_version;
          return Promise.resolve({
            data: [{ success: true, current_version: 3, current_payload: op2Payload }],
            error: null,
          });
        }
      });

      // Se encolan ambas operaciones rápidamente sin esperar la primera
      const promise1 = saveState('favorites', op1Payload, undefined, mock.client);
      const promise2 = saveState('favorites', op2Payload, undefined, mock.client);

      const [res1, res2] = await Promise.all([promise1, promise2]);

      expect(res1.success).toBe(true);
      expect(res1.version).toBe(2);
      expect(res2.success).toBe(true);
      expect(res2.version).toBe(3);

      // Verificación clave: la op 2 leyó expectedVersion=2 al ejecutarse, NO al encolarse
      expect(op2ExpectedVersionAtExec).toBe(2);
      expect(getCachedVersion('favorites')).toBe(3);
    });

    it('continues queue processing even if prior operation fails', async () => {
      const mock = createMockSupabase();
      setCachedVersion('freezer', 1);

      let callIndex = 0;
      mock.rpcMock.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return Promise.reject(new Error('Transient connection loss'));
        }
        return Promise.resolve({
          data: [{ success: true, current_version: 2, current_payload: [{ id: 99 }] }],
          error: null,
        });
      });

      const p1 = saveState('freezer', [{ id: 1 }], undefined, mock.client);
      const p2 = saveState('freezer', [{ id: 99 }], undefined, mock.client);

      const [res1, res2] = await Promise.all([p1, p2]);

      expect(res1.success).toBe(false);
      expect(res1.isNetworkError).toBe(true);
      expect(res2.success).toBe(true);
      expect(res2.version).toBe(2);
    });

    it('recovers with fallback data when remote payload in shared_state is corrupt or invalid', async () => {
      const mock = createMockSupabase();
      mock.singleMock.mockResolvedValueOnce({
        data: {
          payload: 'corrupt-string-instead-of-array',
          version: 2,
        },
        error: null,
      });

      const defaultFreezer = [{ id: 99, title: 'Fallback' }];
      const result = await getState('freezer', defaultFreezer, mock.client);

      expect(result.data).toEqual(defaultFreezer);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Payload remoto inválido');
    });
  });

  // ==========================================================================
  // 4. INTEGRACIÓN DE STORES ADAPTADOS (plannerStore & syncStore)
  // ==========================================================================
  describe('Adapted Stores Integration (plannerStore & syncStore)', () => {
    it('plannerStore getPlannedMeals and savePlannedMeals function seamlessly in V1 mode', async () => {
      delete process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED;

      const mock = createMockSupabase();
      mock.singleMock.mockResolvedValueOnce({
        data: { name: JSON.stringify({ lunes: [] }) },
        error: null,
      });
      mock.upsertMock.mockResolvedValueOnce({ error: null });

      setSupabaseClient(mock.client);

      const meals = await getPlannedMeals();
      expect(meals).toEqual({ lunes: [] });
      expect(mock.fromMock).toHaveBeenCalledWith('categories');

      const saveRes = await savePlannedMeals({ lunes: [] });
      expect(saveRes.success).toBe(true);
      expect(saveRes.source).toBe('v1');
    });

    it('syncStore getFreezerItems and saveFreezerItems adapt cleanly in V2 mode', async () => {
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';
      const mock = createMockSupabase();

      mock.singleMock.mockResolvedValueOnce({
        data: { payload: [{ id: 10, title: 'Merluza' }], version: 1 },
        error: null,
      });
      mock.setRpcResult({
        data: [{ success: true, current_version: 2, current_payload: [{ id: 10, title: 'Merluza' }], updated_at: '2026-09-22T08:00:00Z' }],
        error: null,
      });

      setSupabaseClient(mock.client);

      const items = await getFreezerItems([]);
      expect(items).toEqual([{ id: 10, title: 'Merluza' }]);
      expect(mock.fromMock).toHaveBeenCalledWith('shared_state');

      const saveRes = await saveFreezerItems([{ id: 10, title: 'Merluza' }]);
      expect(saveRes.success).toBe(true);
      expect(saveRes.version).toBe(2);
    });

    it('syncStore getShoppingList, saveShoppingList, getFavorites, saveFavorites work correctly', async () => {
      process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED = 'true';
      const mock = createMockSupabase();

      mock.singleMock
        .mockResolvedValueOnce({
          data: { payload: [{ name: 'Sal', quantity: 1 }], version: 1 },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { payload: ['fav-rec-1'], version: 3 },
          error: null,
        });

      mock.setRpcResult({
        data: [{ success: true, current_version: 2, current_payload: [{ name: 'Sal', quantity: 2 }] }],
        error: null,
      });

      setSupabaseClient(mock.client);

      const list = await getShoppingList([]);
      expect(list).toEqual([{ name: 'Sal', quantity: 1 }]);

      const saveListRes = await saveShoppingList([{ name: 'Sal', quantity: 2 }]);
      expect(saveListRes.success).toBe(true);

      mock.setRpcResult({
        data: [{ success: true, current_version: 4, current_payload: ['fav-rec-1', 'fav-rec-2'] }],
        error: null,
      });

      const favs = await getFavorites([]);
      expect(favs).toEqual(['fav-rec-1']);

      const saveFavsRes = await saveFavorites(['fav-rec-1', 'fav-rec-2']);
      expect(saveFavsRes.success).toBe(true);
    });

    it('syncStore getSyncedState and saveSyncedState map legacy IDs correctly', async () => {
      delete process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED;
      const mock = createMockSupabase();

      mock.singleMock.mockResolvedValueOnce({
        data: { name: JSON.stringify(['fav-1', 'fav-2']) },
        error: null,
      });
      mock.upsertMock.mockResolvedValueOnce({ error: null });

      setSupabaseClient(mock.client);

      const favs = await getSyncedState('mimenu_favorites', '_FAVORITES_STATE_', []);
      expect(favs).toEqual(['fav-1', 'fav-2']);

      const saveRes = await saveSyncedState('mimenu_favorites', '_FAVORITES_STATE_', ['fav-1']);
      expect(saveRes.success).toBe(true);
      expect(saveRes.source).toBe('v1');
    });
  });
});
