/**
 * Definición de tipos y validadores para la capa de estado compartido (shared_state).
 * Soporta modo dual V1 (categories) y V2 (public.shared_state).
 */

export type SharedStateKey = 'planner' | 'freezer' | 'shopping_list' | 'favorites';

export interface StateKeyConfig {
  key: SharedStateKey;
  v1CategoryId: string;
  storageKey: string;
  eventKey: string;
}

export const STATE_KEY_CONFIGS: Record<SharedStateKey, StateKeyConfig> = {
  planner: {
    key: 'planner',
    v1CategoryId: '_PLANNER_STATE_',
    storageKey: 'planner_meals',
    eventKey: 'planner_meals_updated',
  },
  freezer: {
    key: 'freezer',
    v1CategoryId: '_FREEZER_STATE_',
    storageKey: 'congelador_items',
    eventKey: 'congelador_items_updated',
  },
  shopping_list: {
    key: 'shopping_list',
    v1CategoryId: '_SHOPPING_LIST_STATE_',
    storageKey: 'shopping_list_items',
    eventKey: 'shopping_list_items_updated',
  },
  favorites: {
    key: 'favorites',
    v1CategoryId: '_FAVORITES_STATE_',
    storageKey: 'mimenu_favorites',
    eventKey: 'mimenu_favorites_updated',
  },
};

export interface StateMetadata {
  version: number;
  updatedAt?: string;
  updatedBy?: string | null;
  source: 'v1' | 'v2' | 'cache' | 'default';
}

export interface StateLoadResult<T> {
  data: T;
  metadata: StateMetadata;
  error?: Error | null;
}

export interface StateSaveOptions {
  expectedVersion?: number;
}

export interface StateSaveResult<T> {
  success: boolean;
  data?: T;
  version?: number;
  conflict?: boolean;
  currentVersion?: number;
  currentData?: unknown;
  error?: string | null;
  isUnauthorized?: boolean;
  isNetworkError?: boolean;
  source: 'v1' | 'v2' | 'cache';
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida estrictamente el payload según la especificación de cada clave:
 * - planner: objeto (no nulo, no array).
 * - freezer: array.
 * - shopping_list: array.
 * - favorites: array de strings.
 */
export function validatePayload(key: SharedStateKey, payload: unknown): ValidationResult {
  if (payload === null || payload === undefined) {
    return { valid: false, error: `El payload para '${key}' no puede ser nulo o indefinido.` };
  }

  switch (key) {
    case 'planner':
      if (typeof payload !== 'object' || Array.isArray(payload)) {
        return {
          valid: false,
          error: `El payload para 'planner' debe ser un objeto plano. Recibido: ${
            Array.isArray(payload) ? 'array' : typeof payload
          }`,
        };
      }
      return { valid: true };

    case 'freezer':
    case 'shopping_list':
      if (!Array.isArray(payload)) {
        return {
          valid: false,
          error: `El payload para '${key}' debe ser un array. Recibido: ${typeof payload}`,
        };
      }
      return { valid: true };

    case 'favorites':
      if (!Array.isArray(payload)) {
        return {
          valid: false,
          error: `El payload para 'favorites' debe ser un array. Recibido: ${typeof payload}`,
        };
      }
      for (let i = 0; i < payload.length; i++) {
        if (typeof payload[i] !== 'string') {
          return {
            valid: false,
            error: `El elemento en el índice ${i} de 'favorites' no es una cadena de texto.`,
          };
        }
      }
      return { valid: true };

    default:
      return { valid: false, error: `Clave de estado desconocida: ${String(key)}` };
  }
}
