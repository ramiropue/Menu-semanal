import type { StateSaveResult } from './types';
import { clearSharedStateCache } from './stateAdapter';

// Throttling para evitar spam de alertas repetitivas en pulsaciones rápidas
const notificationThrottle = new Map<string, number>();
const THROTTLE_MS = 2500;

export type ToastType = 'info' | 'success' | 'warning' | 'error';

/**
 * Muestra una notificación visual no bloqueante y accesible en el DOM.
 * Evita la intrusión de window.alert y previene duplicados en ráfagas.
 */
export function showToast(message: string, type: ToastType = 'info'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const now = Date.now();
  const lastTime = notificationThrottle.get(message) || 0;
  if (now - lastTime < THROTTLE_MS) {
    return; // Suprimir duplicados en ráfaga
  }
  notificationThrottle.set(message, now);

  // Contenedor de toasts
  let container = document.getElementById('app-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'app-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: 90vw;
      width: 420px;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const bgColors: Record<ToastType, string> = {
    info: '#0B3B3C',
    success: '#08635d',
    warning: '#B93B11',
    error: '#DC2626',
  };

  toast.style.cssText = `
    background-color: ${bgColors[type]};
    color: #FFFFFF;
    padding: 12px 18px;
    border-radius: 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    text-align: center;
    pointer-events: auto;
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 0.25s ease, transform 0.25s ease;
  `;
  toast.textContent = message;

  container.appendChild(toast);

  // Animación de entrada
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Animación de salida y limpieza
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }, 3500);
}

export interface HandleMutationOptions {
  onRollback?: () => void;
  onConflict?: (currentData: unknown) => void;
  successMessage?: string;
  redirectToLoginOnAuthError?: boolean;
}

/**
 * Procesa de forma estandarizada los resultados de mutación de estado en los componentes visuales:
 * - Éxito: conserva la actualización y opcionalmente notifica.
 * - Conflicto: ejecuta onConflict con el estado del servidor y notifica.
 * - Error de red / fallo: ejecuta onRollback y notifica "No se pudo guardar".
 * - Sesión no autorizada / 401: purga caché y redirige a login.
 */
export function handleMutationResult<T>(
  result: StateSaveResult<T>,
  options: HandleMutationOptions = {}
): boolean {
  if (result.success) {
    if (options.successMessage) {
      showToast(options.successMessage, 'success');
    }
    return true;
  }

  if (result.isUnauthorized) {
    clearSharedStateCache();
    showToast('Sesión no autorizada o expirada. Redirigiendo...', 'error');
    if (options.redirectToLoginOnAuthError !== false && typeof window !== 'undefined') {
      setTimeout(() => {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login?error=unauthorized';
      }, 1200);
    }
    return false;
  }

  if (result.conflict) {
    if (options.onConflict && result.currentData !== undefined) {
      options.onConflict(result.currentData);
    }
    showToast('El contenido fue modificado por otra sesión. Se han cargado los cambios más recientes.', 'warning');
    return false;
  }

  // Fallo de red u otros errores
  if (options.onRollback) {
    options.onRollback();
  }
  showToast('No se pudo guardar los cambios. Comprueba tu conexión.', 'error');
  return false;
}
