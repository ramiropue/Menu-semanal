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

  let nextUpdateResult: { data: unknown; error: unknown } = { data: [], error: null };
  let shouldRejectUpdate: Error | null = null;

  const queryChain: Record<string, unknown> = {
    select: selectMock,
    eq: eqMock,
    single: singleMock,
    update: updateMock,
    upsert: upsertMock,
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
      if (shouldRejectUpdate) {
        return Promise.reject(shouldRejectUpdate).then(onFulfilled, onRejected);
      }
      return Promise.resolve(nextUpdateResult).then(onFulfilled, onRejected);
    },
  };

  selectMock.mockReturnValue(queryChain);
  eqMock.mockReturnValue(queryChain);
  updateMock.mockReturnValue(queryChain);
  upsertMock.mockReturnValue(queryChain);
  fromMock.mockReturnValue(queryChain);
  singleMock.mockResolvedValue({ data: null, error: null });

  return {
    client: { from: fromMock } as unknown as SupabaseClient,
    fromMock,
    selectMock,
    eqMock,
    singleMock,
    updateMock,
    upsertMock,
    queryChain,
    setUpdateResult: (result: { data: unknown; error: unknown }) => {
      nextUpdateResult = result;
      shouldRejectUpdate = null;
    },
    setRejectUpdate: (err: Error) => {
      shouldRejectUpdate = err;
    },
  };
}

describe('State Adapter & Store Layer (Etapa 5B)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetStateCache();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED;

    // Limpiar localStorage simulado
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
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

      // Intento de guardar payload inválido (un string en freezer)
      const saveResult = await saveState(
        'freezer',
        'no-es-un-array' as unknown as unknown[],
        undefined,
        mockSupabase.client
      );

      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toContain('Validación rechazada');
      // No debe interactuar con Supabase si el payload es inválido
      expect(mockSupabase.fromMock).not.toHaveBeenCalled();
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
      expect(mock.upsertMock).toHaveBeenCalledWith({
        id: '_PLANNER_STATE_',
        name: JSON.stringify(testMeals),
        icon: 'settings',
        is_active: false,
      });
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
    });

    it('increments version atomically on successful save (version -> version + 1)', async () => {
      const mock = createMockSupabase();
      setCachedVersion('shopping_list', 2);

      const updatedPayload = [{ name: 'Arroz', quantity: 1 }];
      mock.setUpdateResult({
        data: [
          {
            version: 3,
            payload: updatedPayload,
            updated_at: '2026-09-22T08:05:00Z',
          },
        ],
        error: null,
      });

      const result = await saveState('shopping_list', updatedPayload, { expectedVersion: 2 }, mock.client);

      expect(result.success).toBe(true);
      expect(result.version).toBe(3);
      expect(result.source).toBe('v2');
      expect(mock.fromMock).toHaveBeenCalledWith('shared_state');
      expect(mock.fromMock).not.toHaveBeenCalledWith('categories');

      // Verificar parámetros de actualización OCC
      expect(mock.updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: updatedPayload,
          version: 3,
        })
      );
      expect(mock.eqMock).toHaveBeenCalledWith('state_key', 'shopping_list');
      expect(mock.eqMock).toHaveBeenCalledWith('version', 2);
      expect(getCachedVersion('shopping_list')).toBe(3);
    });

    it('detects concurrency conflict between two sessions and does not overwrite silently', async () => {
      const mock = createMockSupabase();
      setCachedVersion('planner', 1);

      // 0 filas actualizadas -> Conflicto OCC
      mock.setUpdateResult({
        data: [],
        error: null,
      });

      // Recarga automática de la verdad remota
      const serverRemoteData = { martes: [{ type: 'COMIDA', recipeId: 'rec-sesion-a' }] };
      mock.singleMock.mockResolvedValueOnce({
        data: {
          payload: serverRemoteData,
          version: 2,
          updated_at: '2026-09-22T08:10:00Z',
        },
        error: null,
      });

      const sessionBAttempt = { martes: [{ type: 'COMIDA', recipeId: 'rec-sesion-b' }] };
      const result = await saveState('planner', sessionBAttempt, { expectedVersion: 1 }, mock.client);

      // Comprobaciones obligatorias de no sobreescritura y detección de conflicto
      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
      expect(result.currentVersion).toBe(2);
      expect(result.currentData).toEqual(serverRemoteData);
      expect(result.error).toContain('Conflicto de concurrencia');

      // La versión local se actualiza a la del servidor
      expect(getCachedVersion('planner')).toBe(2);
    });

    it('handles unauthorized error (RLS 42501) gracefully without UI crash', async () => {
      const mock = createMockSupabase();
      mock.setUpdateResult({
        data: null,
        error: { code: '42501', message: 'permission denied for table shared_state' },
      });

      const result = await saveState('freezer', [{ id: 1, title: 'Pescado' }], undefined, mock.client);

      expect(result.success).toBe(false);
      expect(result.isUnauthorized).toBe(true);
      expect(result.error).toContain('permission denied');
    });

    it('handles network error gracefully without throwing unhandled exceptions', async () => {
      const mock = createMockSupabase();
      mock.setRejectUpdate(new Error('Network connection timeout'));

      const result = await saveState('favorites', ['rec-1'], undefined, mock.client);

      expect(result.success).toBe(false);
      expect(result.isNetworkError).toBe(true);
      expect(result.error).toContain('Network connection timeout');
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
      mock.setUpdateResult({
        data: [{ version: 2, payload: [{ id: 10, title: 'Merluza' }], updated_at: '2026-09-22T08:00:00Z' }],
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

      mock.setUpdateResult({
        data: [{ version: 2, payload: [{ name: 'Sal', quantity: 2 }] }],
        error: null,
      });

      setSupabaseClient(mock.client);

      const list = await getShoppingList([]);
      expect(list).toEqual([{ name: 'Sal', quantity: 1 }]);

      const saveListRes = await saveShoppingList([{ name: 'Sal', quantity: 2 }]);
      expect(saveListRes.success).toBe(true);

      mock.setUpdateResult({
        data: [{ version: 4, payload: ['fav-rec-1', 'fav-rec-2'] }],
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
