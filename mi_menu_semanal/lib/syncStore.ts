import { getState, saveState, getCachedVersion } from '@/lib/state/stateAdapter';
import type { SharedStateKey, StateSaveOptions, StateSaveResult } from '@/lib/state/types';

// Mapeo auxiliar para retrocompatibilidad con identificadores antiguos
const DB_ID_TO_KEY: Record<string, SharedStateKey> = {
  _FREEZER_STATE_: 'freezer',
  _SHOPPING_LIST_STATE_: 'shopping_list',
  _FAVORITES_STATE_: 'favorites',
  _PLANNER_STATE_: 'planner',
};

const STORAGE_KEY_TO_KEY: Record<string, SharedStateKey> = {
  congelador_items: 'freezer',
  shopping_list_items: 'shopping_list',
  mimenu_favorites: 'favorites',
  planner_meals: 'planner',
};

function resolveStateKey(storageKey: string, dbId: string): SharedStateKey | null {
  return DB_ID_TO_KEY[dbId] || STORAGE_KEY_TO_KEY[storageKey] || null;
}

/**
 * Función genérica de lectura retrocompatible adaptada a stateAdapter.
 */
export async function getSyncedState<T>(
  storageKey: string,
  dbId: string,
  defaultVal: T
): Promise<T> {
  const resolvedKey = resolveStateKey(storageKey, dbId);
  if (resolvedKey) {
    const result = await getState<T>(resolvedKey, defaultVal);
    return result.data;
  }
  return defaultVal;
}

/**
 * Función genérica de guardado retrocompatible adaptada a stateAdapter.
 */
export async function saveSyncedState<T>(
  storageKey: string,
  dbId: string,
  val: T
): Promise<StateSaveResult<T>> {
  const resolvedKey = resolveStateKey(storageKey, dbId);
  if (resolvedKey) {
    return saveState<T>(resolvedKey, val);
  }
  return {
    success: false,
    error: `Clave no reconocida: ${dbId} / ${storageKey}`,
    source: 'v1',
  };
}

// ============================================================
// CONGELADOR
// ============================================================
export const FREEZER_STORAGE_KEY = 'congelador_items';
export const FREEZER_DB_ID = '_FREEZER_STATE_';

export function getFreezerVersion(): number {
  return getCachedVersion('freezer');
}

export async function getFreezerItems<T = unknown[]>(defaultVal: T): Promise<T> {
  const result = await getState<T>('freezer', defaultVal);
  return result.data;
}

export async function saveFreezerItems<T = unknown[]>(
  items: T,
  options?: StateSaveOptions
): Promise<StateSaveResult<T>> {
  return saveState<T>('freezer', items, options);
}

// ============================================================
// LISTA DE LA COMPRA
// ============================================================
export const SHOPPING_STORAGE_KEY = 'shopping_list_items';
export const SHOPPING_DB_ID = '_SHOPPING_LIST_STATE_';

export function getShoppingListVersion(): number {
  return getCachedVersion('shopping_list');
}

export async function getShoppingList<T = unknown[]>(defaultVal: T): Promise<T> {
  const result = await getState<T>('shopping_list', defaultVal);
  return result.data;
}

export async function saveShoppingList<T = unknown[]>(
  items: T,
  options?: StateSaveOptions
): Promise<StateSaveResult<T>> {
  return saveState<T>('shopping_list', items, options);
}

// ============================================================
// FAVORITOS
// ============================================================
export const FAVORITES_STORAGE_KEY = 'mimenu_favorites';
export const FAVORITES_DB_ID = '_FAVORITES_STATE_';

export function getFavoritesVersion(): number {
  return getCachedVersion('favorites');
}

export async function getFavorites(defaultVal: string[]): Promise<string[]> {
  const result = await getState<string[]>('favorites', defaultVal);
  return result.data;
}

export async function saveFavorites(
  items: string[],
  options?: StateSaveOptions
): Promise<StateSaveResult<string[]>> {
  return saveState<string[]>('favorites', items, options);
}
