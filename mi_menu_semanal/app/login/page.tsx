'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSafeRedirectUrl } from '@/lib/auth/url';
import {
  requestLoginOtp,
  verifyLoginOtp,
  getOtpErrorMessage,
  isValidOtpFormat,
  sanitizeOtp,
  normalizeEmail,
} from '@/lib/auth/otp';
import { clearSharedStateCache } from '@/lib/state/stateAdapter';

function getParamErrorMessage(errorParam: string | null): string | null {
  if (errorParam === 'unauthorized') {
    return 'Esta aplicación es privada. Tu cuenta no está en la lista de miembros autorizados.';
  }
  if (errorParam === 'callback_error') {
    return 'El enlace de acceso ha caducado o no es válido. Solicita un nuevo código.';
  }
  return null;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next');
  const errorParam = searchParams.get('error');

  const safeNext = getSafeRedirectUrl(rawNext, '/');

  // Estado del flujo de dos pasos: 'email' (Paso 1) u 'otp' (Paso 2)
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [customError, setCustomError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const errorMessage = customError ?? getParamErrorMessage(errorParam);

  // Limpieza defensiva de la caché privada si el servidor redirigió con error=unauthorized
  useEffect(() => {
    if (errorParam === 'unauthorized') {
      clearSharedStateCache();
    }
  }, [errorParam]);

  // Borrado de seguridad del OTP al desmontar el componente (cero persistencia en memoria)
  useEffect(() => {
    return () => {
      setOtp('');
    };
  }, []);

  // Manejo del contador de espera (cooldown) de 60 segundos antes de permitir reenvío
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  // Paso 1: Solicitud del código OTP por correo
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      setCustomError('Por favor, introduce una dirección de correo electrónico válida.');
      return;
    }

    if (cooldown > 0 || isLoading || isVerifying) {
      return;
    }

    setIsLoading(true);
    setCustomError(null);
    setInfoMessage(null);

    try {
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';

      const result = await requestLoginOtp(supabase, {
        email: normalized,
        next: safeNext,
        origin,
      });

      if (!result.success && result.errorType) {
        setCustomError(getOtpErrorMessage(result.errorType));
        return;
      }

      // Transición al Paso 2: Introducción del código
      // La respuesta visible es neutra y no revela si la cuenta existe
      setStep('otp');
      setOtp('');
      setCooldown(60);
    } catch {
      setCustomError(getOtpErrorMessage('service_error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Paso 2: Verificación del código OTP de 6 dígitos
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanedToken = sanitizeOtp(otp);
    if (!isValidOtpFormat(cleanedToken)) {
      setCustomError(getOtpErrorMessage('invalid_format'));
      return;
    }

    // Bloquear envíos duplicados mientras se procesa la petición
    if (isVerifying || isLoading) {
      return;
    }

    setIsVerifying(true);
    setCustomError(null);
    setInfoMessage(null);

    try {
      const supabase = createClient();
      const result = await verifyLoginOtp(supabase, {
        email,
        token: cleanedToken,
      });

      // Borrado inmediato del OTP de la memoria tras el intento
      setOtp('');

      if (!result.success) {
        if (result.errorType === 'unauthorized') {
          clearSharedStateCache();
          router.replace('/login?error=unauthorized');
          return;
        }

        setCustomError(getOtpErrorMessage(result.errorType || 'invalid_code'));
        return;
      }

      // Usuario verificado y autorizado en public.app_members:
      // Forzar actualización de la sesión y de los Server Components
      router.refresh();
      router.push(safeNext);
    } catch {
      setCustomError(getOtpErrorMessage('service_error'));
    } finally {
      setIsVerifying(false);
    }
  };

  // Reenvío de código con cooldown y shouldCreateUser: false
  const handleResendOtp = async () => {
    if (cooldown > 0 || isLoading || isVerifying) {
      return;
    }

    setIsLoading(true);
    setCustomError(null);
    setInfoMessage(null);

    try {
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';

      const result = await requestLoginOtp(supabase, {
        email,
        next: safeNext,
        origin,
      });

      if (!result.success && result.errorType) {
        setCustomError(getOtpErrorMessage(result.errorType));
        return;
      }

      setCooldown(60);
      setInfoMessage('Código reenviado. Revisa tu bandeja de entrada.');
    } catch {
      setCustomError(getOtpErrorMessage('service_error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Cambio de correo electrónico: restablece el estado y vuelve al Paso 1
  const handleChangeEmail = () => {
    if (isVerifying) return;
    setOtp('');
    setCustomError(null);
    setInfoMessage(null);
    setStep('email');
  };

  return (
    <div className="w-full max-w-sm px-4">
      {/* Tarjeta de Inicio de Sesión */}
      <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        {/* Cabecera */}
        <div className="text-center flex flex-col gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">
              {step === 'otp' ? 'pin' : 'lock'}
            </span>
          </div>
          <h1 className="text-xl font-headline font-bold text-on-surface">
            {step === 'otp' ? 'Introduce el código' : 'Acceso Privado'}
          </h1>
          <p className="text-xs text-on-surface-variant font-body leading-relaxed">
            {step === 'otp'
              ? 'Introduce el código de 6 dígitos recibido por correo.'
              : 'Menú Semanal V2 — Introduce tu correo para recibir un código de acceso de seis dígitos.'}
          </p>
        </div>

        {/* Mensaje de Error (si existe) */}
        {errorMessage && (
          <div
            role="alert"
            className="bg-error-container text-on-error-container text-xs p-3 rounded-xl border border-error/20 flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
            <span className="font-body leading-normal">{errorMessage}</span>
          </div>
        )}

        {/* Mensaje Informativo Neutro (si existe) */}
        {infoMessage && (
          <div
            role="status"
            className="bg-surface-container-low text-primary text-xs p-3 rounded-xl border border-primary/20 flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-base shrink-0 mt-0.5">check_circle</span>
            <span className="font-body leading-normal">{infoMessage}</span>
          </div>
        )}

        {/* Paso 1: Formulario de Correo */}
        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email-input"
                className="text-xs font-medium text-on-surface-variant font-body"
              >
                Correo electrónico
              </label>
              {/* text-[16px] evita el zoom automático de Safari en iPhone al hacer foco */}
              <input
                id="email-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu-correo@example.com"
                className="w-full px-3.5 py-3 rounded-xl border border-outline-variant bg-surface text-[16px] sm:text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50 font-body transition-colors min-h-[44px]"
              />
            </div>

            <button
              id="login-submit-button"
              type="submit"
              disabled={isLoading || cooldown > 0}
              className="w-full py-3 px-4 rounded-xl bg-primary text-on-primary font-headline font-bold text-sm hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm mt-1 min-h-[44px]"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin text-sm material-symbols-outlined">
                    progress_activity
                  </span>
                  <span>Enviando código...</span>
                </>
              ) : cooldown > 0 ? (
                `Espera ${cooldown}s`
              ) : (
                'Recibir código de acceso'
              )}
            </button>
          </form>
        ) : (
          /* Paso 2: Formulario del Código OTP */
          <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
            {/* Aviso informativo neutro y aviso de Spam */}
            <div className="bg-surface-container-low text-on-surface p-3.5 rounded-xl border border-outline-variant/30 flex flex-col gap-1 text-center">
              <p className="text-xs font-body text-on-surface-variant leading-relaxed">
                Si tu correo está autorizado, recibirás un código de 6 dígitos en unos instantes.
              </p>
              <p className="text-[11px] font-body text-outline leading-tight">
                ¿No lo ves en tu bandeja? Revisa tu carpeta de <strong>Spam</strong> o correo no deseado.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="otp-input"
                className="text-xs font-medium text-on-surface-variant font-body text-center"
              >
                Código de verificación (6 dígitos)
              </label>
              {/*
                Optimizaciones estrictas para Safari en iPhone:
                - text-[22px] (>= 16px) previene zoom automático indeseado
                - inputMode="numeric" abre teclado numérico en móvil
                - autoComplete="one-time-code" activa el autocompletado nativo de iOS
                - min-h-[48px] garantiza objetivo táctil accesible (Apple HIG >= 44pt)
              */}
              <input
                id="otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                disabled={isVerifying}
                value={otp}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(cleaned);
                }}
                placeholder="······"
                aria-label="Código de verificación de 6 dígitos"
                className="w-full text-center font-mono text-[22px] tracking-[0.35em] py-2.5 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface placeholder:text-outline/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50 font-body transition-colors min-h-[48px]"
              />
            </div>

            {/* Botón Verificar código */}
            <button
              id="verify-otp-button"
              type="submit"
              disabled={isVerifying || otp.replace(/\D/g, '').length !== 6}
              className="w-full py-3 px-4 rounded-xl bg-primary text-on-primary font-headline font-bold text-sm hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm min-h-[44px]"
            >
              {isVerifying ? (
                <>
                  <span className="animate-spin text-sm material-symbols-outlined">
                    progress_activity
                  </span>
                  <span>Verificando código...</span>
                </>
              ) : (
                'Verificar código'
              )}
            </button>

            {/* Controles secundarios: Reenviar y Cambiar Correo */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                id="resend-otp-button"
                type="button"
                disabled={cooldown > 0 || isLoading || isVerifying}
                onClick={handleResendOtp}
                className="w-full py-2 px-3 text-xs text-primary font-medium rounded-lg hover:bg-primary/5 disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors min-h-[44px] flex items-center justify-center"
              >
                {isLoading ? (
                  <span>Reenviando...</span>
                ) : cooldown > 0 ? (
                  `Reenviar código (${cooldown}s)`
                ) : (
                  'Reenviar código'
                )}
              </button>

              <button
                id="change-email-button"
                type="button"
                disabled={isVerifying}
                onClick={handleChangeEmail}
                className="w-full py-2 px-3 text-xs text-on-surface-variant hover:text-on-surface font-body underline rounded-lg disabled:opacity-50 cursor-pointer min-h-[44px] flex items-center justify-center"
              >
                Cambiar correo electrónico
              </button>
            </div>
          </form>
        )}

        {/* Pie de privacidad */}
        <div className="pt-2 border-t border-surface-variant text-center">
          <p className="text-[11px] text-outline font-body leading-relaxed">
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
            <span className="animate-spin material-symbols-outlined text-2xl text-primary">
              progress_activity
            </span>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
