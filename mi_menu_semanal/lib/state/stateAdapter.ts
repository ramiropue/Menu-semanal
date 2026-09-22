import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { supabase as legacySupabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SharedStateKey,
  STATE_KEY_CONFIGS,
  StateLoadResult,
  StateSaveOptions,
  StateSaveResult,
  validatePayload,
} from './types';

/**
 * Evalúa si el modo de estado compartido V2 está activado.
 * Por defecto es false (modo V1 seguro).
 */
export function isSharedStateEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHARED_STATE_ENABLED === 'true';
}

let cachedBrowserClient: SupabaseClient | null = null;

/**
 * Obtiene el cliente Supabase adecuado:
 * En el navegador utiliza el cliente SSR con soporte para cookies de sesión.
 * En entornos sin ventana (Node/SSR/Tests) recurre al cliente configurado.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedBrowserClient) {
    return cachedBrowserClient;
  }
  if (typeof window !== 'undefined') {
    cachedBrowserClient = createBrowserClient() as unknown as SupabaseClient;
    return cachedBrowserClient;
  }
  return legacySupabase;
}

/**
 * Permite inyectar o reiniciar el cliente Supabase (útil para tests y reset de sesión).
 */
export function setSupabaseClient(client: SupabaseClient | null): void {
  cachedBrowserClient = client;
}

// Caché en memoria para control optimista de versiones
const versionCache = new Map<SharedStateKey, number>();

/**
 * Obtiene la versión conocida más reciente para una clave dada.
 */
export function getCachedVersion(key: SharedStateKey): number {
  if (versionCache.has(key)) {
    return versionCache.get(key)!;
  }
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(`${STATE_KEY_CONFIGS[key].storageKey}_version`);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) {
        versionCache.set(key, parsed);
        return parsed;
      }
    }
  }
  return 1;
}

/**
 * Actualiza la versión conocida para una clave dada.
 */
export function setCachedVersion(key: SharedStateKey, version: number): void {
  versionCache.set(key, version);
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${STATE_KEY_CONFIGS[key].storageKey}_version`, version.toString());
  }
}

/**
 * Limpia la caché en memoria (utilizado principalmente para tests o reset).
 */
export function resetStateCache(): void {
  versionCache.clear();
  cachedBrowserClient = null;
}

/**
 * Carga el estado unificado con soporte transparente V1 y V2.
 *
 * En V1 (flag desactivado):
 *   Consulta las filas especiales de `categories` (_PLANNER_STATE_, etc.).
 *   Nunca consulta `shared_state`.
 *
 * En V2 (flag activado):
 *   Consulta exclusivamente `public.shared_state`.
 *   Nunca consulta `categories`.
 *
 * Valida estrictamente el payload antes de aplicarlo.
 * En caso de error o payload inválido, rescata el valor por defecto sin bloquear la UI.
 */
export async function getState<T>(
  key: SharedStateKey,
  defaultValue: T,
  clientOverride?: SupabaseClient
): Promise<StateLoadResult<T>> {
  const config = STATE_KEY_CONFIGS[key];
  const supabase = clientOverride || getSupabaseClient();
  let localVal: T = defaultValue;

  // 1. Recuperar caché local si está disponible en el cliente
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(config.storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validation = validatePayload(key, parsed);
        if (validation.valid) {
          localVal = parsed as T;
        } else {
          console.warn(`[stateAdapter] Caché local inválido para '${key}': ${validation.error}`);
        }
      } catch (e) {
        console.error(`[stateAdapter] Error parseando caché local de '${config.storageKey}':`, e);
      }
    }
  }

  // 2. Resolver origen según feature flag
  if (isSharedStateEnabled()) {
    // Modo V2: Lectura exclusiva de public.shared_state (cero lecturas a categories)
    try {
      const { data, error } = await supabase
        .from('shared_state')
        .select('payload, version, updated_at, updated_by')
        .eq('state_key', key)
        .single();

      if (error) {
        console.error(`[stateAdapter] Error consultando shared_state para '${key}':`, error);
        return {
          data: localVal,
          metadata: {
            version: getCachedVersion(key),
            source: 'cache',
          },
          error: new Error(error.message),
        };
      }

      if (data && data.payload !== undefined) {
        const validation = validatePayload(key, data.payload);
        if (!validation.valid) {
          console.error(`[stateAdapter] Payload remoto inválido en shared_state para '${key}':`, validation.error);
          return {
            data: localVal,
            metadata: {
              version: data.version ?? getCachedVersion(key),
              source: 'cache',
            },
            error: new Error(`Payload remoto inválido: ${validation.error}`),
          };
        }

        const validData = data.payload as T;
        const version = typeof data.version === 'number' ? data.version : 1;
        setCachedVersion(key, version);

        if (typeof window !== 'undefined') {
          localStorage.setItem(config.storageKey, JSON.stringify(validData));
          window.dispatchEvent(new Event(config.eventKey));
        }

        return {
          data: validData,
          metadata: {
            version,
            updatedAt: data.updated_at,
            updatedBy: data.updated_by,
            source: 'v2',
          },
        };
      }
    } catch (err) {
      console.error(`[stateAdapter] Excepción de red consultando shared_state para '${key}':`, err);
      return {
        data: localVal,
        metadata: {
          version: getCachedVersion(key),
          source: 'cache',
        },
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  } else {
    // Modo V1: Lectura exclusiva de categories (cero lecturas a shared_state)
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('name')
        .eq('id', config.v1CategoryId)
        .single();

      if (!error && data?.name) {
        try {
          const parsed = JSON.parse(data.name);
          const validation = validatePayload(key, parsed);
          if (validation.valid) {
            const validData = parsed as T;
            if (typeof window !== 'undefined') {
              localStorage.setItem(config.storageKey, JSON.stringify(validData));
              window.dispatchEvent(new Event(config.eventKey));
            }
            return {
              data: validData,
              metadata: {
                version: 1,
                source: 'v1',
              },
            };
          } else {
            console.error(`[stateAdapter] Payload en categories inválido para '${key}':`, validation.error);
          }
        } catch (parseErr) {
          console.error(`[stateAdapter] Error parseando JSON de categories '${config.v1CategoryId}':`, parseErr);
        }
      }
    } catch (e) {
      console.error(`[stateAdapter] Error consultando categories para '${config.v1CategoryId}':`, e);
    }
  }

  return {
    data: localVal,
    metadata: {
      version: getCachedVersion(key),
      source: 'default',
    },
  };
}

/**
 * Guarda el estado unificado con control optimista de concurrencia y validación estricta.
 *
 * Cero escrituras dobles:
 *   - Si flag está activo -> Guarda únicamente en `shared_state`.
 *   - Si flag está inactivo -> Guarda únicamente en `categories`.
 *
 * Control optimista de concurrencia (V2):
 *   - Verifica que la versión coincida con expectedVersion.
 *   - En caso de conflicto de versión: detecta la colisión, recarga el estado remoto actual,
 *     actualiza la caché y emite evento de conflicto.
 */
export async function saveState<T>(
  key: SharedStateKey,
  value: T,
  options?: StateSaveOptions,
  clientOverride?: SupabaseClient
): Promise<StateSaveResult<T>> {
  const config = STATE_KEY_CONFIGS[key];
  const supabase = clientOverride || getSupabaseClient();

  // 1. Validación estricta del payload antes de emitir o persistir
  const validation = validatePayload(key, value);
  if (!validation.valid) {
    const errorMsg = `Validación rechazada para '${key}': ${validation.error}`;
    console.error(`[stateAdapter] ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      source: isSharedStateEnabled() ? 'v2' : 'v1',
    };
  }

  // 2. Actualización optimista en caché local y evento UI
  const jsonStr = JSON.stringify(value);
  if (typeof window !== 'undefined') {
    localStorage.setItem(config.storageKey, jsonStr);
    window.dispatchEvent(new Event(config.eventKey));
  }

  // 3. Persistencia según feature flag
  if (isSharedStateEnabled()) {
    // MODO V2: Escritura exclusiva en public.shared_state (cero escrituras a categories)
    const expectedVersion = options?.expectedVersion ?? getCachedVersion(key);

    try {
      // Intento de actualización atómica con condición OCC (version = expectedVersion)
      const { data, error } = await supabase
        .from('shared_state')
        .update({
          payload: value as unknown as Record<string, unknown>,
          version: expectedVersion + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('state_key', key)
        .eq('version', expectedVersion)
        .select('version, payload, updated_at');

      if (error) {
        const isUnauthorized = error.code === '42501' || error.message.includes('permission');
        console.error(`[stateAdapter] Error guardando en shared_state (${key}):`, error);
        return {
          success: false,
          error: error.message,
          isUnauthorized,
          source: 'v2',
        };
      }

      // Si la consulta actualizó la fila con éxito
      if (data && data.length > 0) {
        const updatedRow = data[0];
        const newVersion = updatedRow.version as number;
        setCachedVersion(key, newVersion);

        return {
          success: true,
          version: newVersion,
          data: updatedRow.payload as T,
          source: 'v2',
        };
      }

      // Si 0 filas se actualizaron -> CONFLICTO DE CONCURRENCIA (versión obsoleta)
      console.warn(`[stateAdapter] Conflicto de concurrencia detectado para '${key}'. Versión esperada: ${expectedVersion}`);

      // Recargar de inmediato el registro remoto actual para informar al cliente
      const { data: latestRecord, error: fetchErr } = await supabase
        .from('shared_state')
        .select('payload, version, updated_at')
        .eq('state_key', key)
        .single();

      if (!fetchErr && latestRecord) {
        const currentVersion = latestRecord.version as number;
        setCachedVersion(key, currentVersion);

        // Actualizar caché local con la verdad del servidor para evitar desincronización
        if (typeof window !== 'undefined') {
          localStorage.setItem(config.storageKey, JSON.stringify(latestRecord.payload));
          window.dispatchEvent(new Event(config.eventKey));
          window.dispatchEvent(
            new CustomEvent(`${config.storageKey}_conflict`, {
              detail: {
                key,
                expectedVersion,
                currentVersion,
                currentData: latestRecord.payload,
              },
            })
          );
        }

        return {
          success: false,
          conflict: true,
          currentVersion,
          currentData: latestRecord.payload,
          error: `Conflicto de concurrencia en '${key}': el dato fue modificado por otra sesión (v${expectedVersion} -> v${currentVersion}).`,
          source: 'v2',
        };
      }

      return {
        success: false,
        conflict: true,
        error: `Conflicto de concurrencia en '${key}': versión remota no coincide con v${expectedVersion}.`,
        source: 'v2',
      };
    } catch (err) {
      console.error(`[stateAdapter] Excepción de red guardando en shared_state (${key}):`, err);
      return {
        success: false,
        isNetworkError: true,
        error: err instanceof Error ? err.message : String(err),
        source: 'v2',
      };
    }
  } else {
    // MODO V1: Escritura exclusiva en categories (sin tocar shared_state)
    try {
      await supabase.from('categories').upsert({
        id: config.v1CategoryId,
        name: jsonStr,
        icon: 'settings',
        is_active: false,
      });

      return {
        success: true,
        version: 1,
        data: value,
        source: 'v1',
      };
    } catch (e) {
      console.error(`[stateAdapter] Error guardando estado V1 en categories (${config.v1CategoryId}):`, e);
      return {
        success: false,
        isNetworkError: true,
        error: e instanceof Error ? e.message : String(e),
        source: 'v1',
      };
    }
  }
}
