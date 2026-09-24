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

let cachedClientOverride: SupabaseClient | null = null;

/**
 * Obtiene el cliente Supabase adecuado:
 * En el navegador utiliza el cliente SSR con soporte para cookies de sesión.
 * En entornos sin ventana (Node/SSR/Tests) recurre al cliente configurado o mock inyectado.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClientOverride) {
    return cachedClientOverride;
  }
  if (typeof window !== 'undefined') {
    return createBrowserClient() as unknown as SupabaseClient;
  }
  return legacySupabase;
}

/**
 * Permite inyectar o reiniciar el cliente Supabase (utilizado para tests y reset de sesión).
 */
export function setSupabaseClient(client: SupabaseClient | null): void {
  cachedClientOverride = client;
}

// Caché en memoria para control optimista de versiones
const versionCache = new Map<SharedStateKey, number>();

// Colas de serialización por state_key para prevenir colisiones locales por pulsaciones rápidas
const writeQueues = new Map<SharedStateKey, Promise<unknown>>();

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
 * Limpia la caché privada de las cuatro claves y sus versiones.
 * Debe invocarse ante errores de autorización (401/403/42501) o al cerrar sesión.
 */
export function clearSharedStateCache(): void {
  versionCache.clear();
  if (typeof window !== 'undefined') {
    for (const conf of Object.values(STATE_KEY_CONFIGS)) {
      localStorage.removeItem(conf.storageKey);
      localStorage.removeItem(`${conf.storageKey}_version`);
    }
  }
}

/**
 * Limpia la caché y el cliente inyectado (utilizado principalmente para tests o reset).
 */
export function resetStateCache(): void {
  clearSharedStateCache();
  writeQueues.clear();
  cachedClientOverride = null;
}

/**
 * Redirige al login de forma segura si se encuentra en entorno de navegador.
 */
export function safeRedirectToLogin(reason = 'unauthorized'): void {
  if (typeof window !== 'undefined' && window.location) {
    try {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?error=${encodeURIComponent(reason)}`;
    } catch {
      // Ignorar en entornos de test donde jsdom restringe window.location.href
    }
  }
}

/**
 * Comprueba si un error devuelto por Supabase corresponde a falta de autorización o sesión caducada.
 */
export function isUnauthorizedError(
  error: { code?: string; message?: string; status?: number } | null | undefined
): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const status = (error as { status?: number }).status;
  const msg = (error.message || '').toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    code === '401' ||
    code === '403' ||
    code === '42501' ||
    code === 'PGRST301' ||
    msg.includes('permission denied') ||
    msg.includes('jwt') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('not allowed') ||
    msg.includes('session expired') ||
    msg.includes('membership') ||
    msg.includes('invalid claim')
  );
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
 * En caso de 401/403/42501:
 *   Purga la caché privada completa y no expone datos privados obsoletos.
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
        if (isUnauthorizedError(error)) {
          console.warn(`[stateAdapter] Acceso no autorizado a shared_state (${key}). Purgando caché privada.`);
          clearSharedStateCache();
          safeRedirectToLogin('unauthorized');
          return {
            data: defaultValue, // No devolver datos privados antiguos de caché
            metadata: {
              version: 1,
              source: 'default',
            },
            error: new Error(error.message),
          };
        }

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
 * Ejecuta la mutación de guardado (interna).
 */
async function executeSaveState<T>(
  key: SharedStateKey,
  value: T,
  options?: StateSaveOptions,
  clientOverride?: SupabaseClient
): Promise<StateSaveResult<T>> {
  const config = STATE_KEY_CONFIGS[key];
  const supabase = clientOverride || getSupabaseClient();

  // 1. Validación estricta del payload antes de intentar persistir
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

  // 2. Persistencia según feature flag
  if (isSharedStateEnabled()) {
    // MODO V2: Escritura exclusiva vía RPC public.update_shared_state
    // IMPORTANTE: expectedVersion se evalúa en el momento exacto de ejecución
    const expectedVersion = options?.expectedVersion ?? getCachedVersion(key);

    try {
      const { data: rpcData, error } = await supabase.rpc('update_shared_state', {
        p_key: key,
        p_payload: value,
        p_expected_version: expectedVersion,
      });

      if (error) {
        const isUnauthorized = isUnauthorizedError(error);
        if (isUnauthorized) {
          console.warn(`[stateAdapter] Mutación no autorizada en shared_state (${key}). Purgando caché.`);
          clearSharedStateCache();
          safeRedirectToLogin('unauthorized');
        } else {
          console.error(`[stateAdapter] Error RPC update_shared_state (${key}):`, error);
        }
        return {
          success: false,
          error: error.message,
          isUnauthorized,
          source: 'v2',
        };
      }

      // Procesar resultado de la tabla devuelta por la función RPC
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      if (!row) {
        return {
          success: false,
          error: 'Respuesta vacía del servidor RPC update_shared_state',
          source: 'v2',
        };
      }

      // Caso A: Actualización exitosa en el servidor
      if (row.success === true) {
        const newVersion = row.current_version as number;
        setCachedVersion(key, newVersion);

        // Confirmar en caché local ÚNICAMENTE tras el éxito remoto
        if (typeof window !== 'undefined') {
          localStorage.setItem(config.storageKey, JSON.stringify(row.current_payload));
          window.dispatchEvent(new Event(config.eventKey));
        }

        return {
          success: true,
          version: newVersion,
          data: row.current_payload as T,
          source: 'v2',
        };
      }

      // Caso B: Conflicto OCC (versión desfasada en el servidor)
      console.warn(
        `[stateAdapter] Conflicto OCC detectado en '${key}' (v${expectedVersion} vs v${row.current_version}).`
      );

      const currentVersion = row.current_version as number;
      setCachedVersion(key, currentVersion);

      // Reemplazar la caché local con el estado más reciente del servidor
      if (typeof window !== 'undefined') {
        localStorage.setItem(config.storageKey, JSON.stringify(row.current_payload));
        window.dispatchEvent(new Event(config.eventKey));
        window.dispatchEvent(
          new CustomEvent(`${config.storageKey}_conflict`, {
            detail: {
              key,
              expectedVersion,
              currentVersion,
              currentData: row.current_payload,
            },
          })
        );
      }

      return {
        success: false,
        conflict: true,
        currentVersion,
        currentData: row.current_payload,
        error: `Conflicto de concurrencia en '${key}': el dato fue modificado por otra sesión (v${expectedVersion} -> v${currentVersion}).`,
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
    const jsonStr = JSON.stringify(value);
    try {
      const { error } = await supabase.from('categories').upsert({
        id: config.v1CategoryId,
        name: jsonStr,
        icon: 'settings',
        is_active: false,
      });

      // Si Supabase rechazó la operación, NO confirmar en localStorage y devolver error
      if (error) {
        console.error(`[stateAdapter] Error guardando estado V1 en categories (${config.v1CategoryId}):`, error);
        return {
          success: false,
          error: error.message,
          source: 'v1',
        };
      }

      // Confirmar en caché local únicamente tras éxito de upsert
      if (typeof window !== 'undefined') {
        localStorage.setItem(config.storageKey, jsonStr);
        window.dispatchEvent(new Event(config.eventKey));
      }

      return {
        success: true,
        version: 1,
        data: value,
        source: 'v1',
      };
    } catch (e) {
      console.error(`[stateAdapter] Excepción guardando estado V1 en categories (${config.v1CategoryId}):`, e);
      return {
        success: false,
        isNetworkError: true,
        error: e instanceof Error ? e.message : String(e),
        source: 'v1',
      };
    }
  }
}

/**
 * Guarda el estado unificado con serialización estricta por clave (cola de promesas),
 * control optimista de concurrencia vía RPC y caché atómica pos-confirmación.
 *
 * Garantías:
 * 1. Lee expectedVersion al empezar a ejecutarse, no al encolarse.
 * 2. Continúa procesando la cola aunque una operación anterior falle.
 * 3. Se limpia en finally sin eliminar operaciones posteriores.
 * 4. No confirma en localStorage antes de que el servidor acepte el cambio.
 */
export async function saveState<T>(
  key: SharedStateKey,
  value: T,
  options?: StateSaveOptions,
  clientOverride?: SupabaseClient
): Promise<StateSaveResult<T>> {
  const previousOp = writeQueues.get(key) || Promise.resolve();

  const currentOpPromise: Promise<StateSaveResult<T>> = previousOp
    .catch(() => {}) // Continuar funcionando aunque la operación anterior haya sido rechazada
    .then(() => {
      return executeSaveState<T>(key, value, options, clientOverride);
    })
    .finally(() => {
      // Limpieza segura en finally sin eliminar una operación posterior
      if (writeQueues.get(key) === currentOpPromise) {
        writeQueues.delete(key);
      }
    });

  writeQueues.set(key, currentOpPromise);
  return currentOpPromise;
}
