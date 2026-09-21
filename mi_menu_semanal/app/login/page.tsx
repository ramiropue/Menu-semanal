'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSafeRedirectUrl } from '@/lib/auth/url';
import { sendMagicLink } from '@/lib/auth/magicLink';

function getParamErrorMessage(errorParam: string | null): string | null {
  if (errorParam === 'unauthorized') {
    return 'Esta aplicación es privada. Tu cuenta no está en la lista de miembros autorizados.';
  }
  if (errorParam === 'callback_error') {
    return 'El enlace de acceso ha caducado o no es válido. Solicita un nuevo enlace.';
  }
  return null;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next');
  const errorParam = searchParams.get('error');

  const safeNext = getSafeRedirectUrl(rawNext, '/');

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [customError, setCustomError] = useState<string | null>(null);

  const errorMessage = customError ?? getParamErrorMessage(errorParam);

  // Manejo del contador de espera (cooldown) para prevenir envíos repetidos
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setCustomError('Por favor, introduce una dirección de correo electrónico válida.');
      return;
    }

    if (cooldown > 0 || isLoading) {
      return;
    }

    setIsLoading(true);
    setCustomError(null);

    try {
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';

      // Delegar en la función centralizada que aplica shouldCreateUser: false
      await sendMagicLink(supabase, {
        email,
        next: safeNext,
        origin,
      });

      // MENSAJE GENÉRICO ESTRICTO:
      // Con independencia de si el usuario existe o no (o si Supabase rechaza
      // el registro no autorizado), mostramos siempre el mismo mensaje para
      // evitar la enumeración de correos.
      setSubmitted(true);
      setCooldown(60); // 60 segundos de espera visual antes de permitir otro envío
    } catch {
      // Error de conexión o red controlado sin revelar detalles del sistema
      setCustomError('No se pudo conectar con el servidor de autenticación. Verifica tu conexión e inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm px-4">
      {/* Tarjeta de Inicio de Sesión */}
      <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        {/* Cabecera */}
        <div className="text-center flex flex-col gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">lock</span>
          </div>
          <h1 className="text-xl font-headline font-bold text-on-surface">
            Acceso Privado
          </h1>
          <p className="text-xs text-on-surface-variant font-body">
            Menú Semanal V2 — Introduce tu correo para recibir un enlace de acceso (Magic Link).
          </p>
        </div>

        {/* Mensaje de Error (si existe) */}
        {errorMessage && (
          <div
            role="alert"
            className="bg-error-container text-on-error-container text-xs p-3 rounded-xl border border-error/20 flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
            <span className="font-body">{errorMessage}</span>
          </div>
        )}

        {/* Mensaje de Confirmación Genérico */}
        {submitted ? (
          <div
            role="status"
            className="bg-surface-container-low text-primary p-4 rounded-xl border border-primary/20 flex flex-col gap-3 text-center"
          >
            <span className="material-symbols-outlined text-3xl mx-auto text-primary">mark_email_read</span>
            <div className="flex flex-col gap-1">
              <h2 className="font-headline font-bold text-sm text-on-surface">Enlace enviado</h2>
              <p className="text-xs font-body text-on-surface-variant leading-relaxed">
                Si tu correo está autorizado, recibirás un enlace de acceso en tu bandeja de entrada en unos instantes.
              </p>
            </div>
            <button
              type="button"
              disabled={cooldown > 0 || isLoading}
              onClick={() => {
                setSubmitted(false);
              }}
              className="mt-2 text-xs text-primary font-medium underline disabled:opacity-50 disabled:no-underline cursor-pointer"
            >
              {cooldown > 0
                ? `Reenviar en ${cooldown}s`
                : '¿No lo has recibido? Probar con otro correo'}
            </button>
          </div>
        ) : (
          /* Formulario */
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email-input"
                className="text-xs font-medium text-on-surface-variant font-body"
              >
                Correo electrónico
              </label>
              <input
                id="email-input"
                type="email"
                autoComplete="email"
                required
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu-correo@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50 font-body transition-colors"
              />
            </div>

            <button
              id="login-submit-button"
              type="submit"
              disabled={isLoading || cooldown > 0}
              className="w-full py-3 px-4 rounded-xl bg-primary text-on-primary font-headline font-bold text-sm hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm mt-1"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin text-sm material-symbols-outlined">progress_activity</span>
                  <span>Enviando enlace...</span>
                </>
              ) : cooldown > 0 ? (
                `Espera ${cooldown}s`
              ) : (
                'Recibir enlace de acceso'
              )}
            </button>
          </form>
        )}

        {/* Pie de privacidad */}
        <div className="pt-2 border-t border-surface-variant text-center">
          <p className="text-[11px] text-outline font-body">
            Acceso restringido a cuentas dadas de alta por administración. El registro público no está disponible.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-surface-container-low p-4">
      <Suspense
        fallback={
          <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-8 max-w-sm w-full text-center">
            <span className="animate-spin material-symbols-outlined text-2xl text-primary">progress_activity</span>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
