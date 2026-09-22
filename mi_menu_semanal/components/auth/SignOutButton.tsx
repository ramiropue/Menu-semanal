'use client';

import React from 'react';
import { clearSharedStateCache } from '@/lib/state/stateAdapter';
import { isPrivateAuthEnabled } from '@/lib/auth/clientAuth';

export interface SignOutButtonProps {
  className?: string;
  onSignOut?: () => void;
}

/**
 * Control cliente accesible para cerrar sesión.
 *
 * Garantías:
 * 1. Antes del envío POST a /auth/signout, ejecuta clearSharedStateCache() para
 *    eliminar de raíz payloads y versiones de las cuatro claves.
 * 2. Utiliza exclusivamente el método POST mediante formulario web estándar.
 * 3. En modo V1 (autenticación privada inactiva), no se renderiza en la interfaz.
 */
export function SignOutButton({ className = '', onSignOut }: SignOutButtonProps) {
  // No mostrar el botón en modo V1 si la autenticación privada está desactivada
  if (!isPrivateAuthEnabled()) {
    return null;
  }

  const handleSignOut = () => {
    // Limpieza obligatoria de la caché antes de enviar el POST
    clearSharedStateCache();
    if (onSignOut) {
      onSignOut();
    }
  };

  return (
    <form action="/auth/signout" method="POST" onSubmit={handleSignOut} className="inline-block">
      <button
        type="submit"
        id="signout-button"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer flex items-center gap-1.5 ${className}`}
      >
        <span className="material-symbols-outlined text-base">logout</span>
        <span>Cerrar sesión</span>
      </button>
    </form>
  );
}

/**
 * Helper programático para cerrar sesión desde cualquier lógica cliente (e.g. timeout de inactividad).
 */
export function triggerSignOut(): void {
  clearSharedStateCache();
  if (typeof document !== 'undefined') {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/signout';
    document.body.appendChild(form);
    form.submit();
  }
}
