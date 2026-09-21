-- supabase_v2_stage_4a_additive.sql
-- ==============================================================================
-- ETAPA 4A: PREPARACIÓN ADITIVA SIN INTERRUPCIÓN (ZERO-DOWNTIME ADDITIVE DDL)
-- ==============================================================================
-- ESTADO: BORRADOR PARA REVISIÓN TÉCNICA (NO EJECUTADO EN SUPABASE REMOTO).
-- ==============================================================================
-- GARANTÍAS ESTRICTAS DE NO INTERRUPCIÓN:
-- 1. CERO MODIFICACIONES DE V1: No se retira ni altera ninguna política pública
--    actual de recipes, categories ni storage.objects.
-- 2. CERO REVOCACIONES A PERMISOS USADOS POR V1: Los roles anon y authenticated
--    conservan intactos todos sus permisos de tabla actuales en recipes y categories.
-- 3. CERO CAMBIOS EN STORAGE: El bucket recipe-images permanece público para no
--    romper las URLs de imágenes servidas en el frontend V1 desplegado.
-- 4. CERO BORRADO DE DATOS: Las filas originales en categories permanecen intactas.
-- 5. TOTALMENTE ADITIVO E IDEMPOTENTE: Usa CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
--    FUNCTION y ON CONFLICT (state_key) DO NOTHING para no sobrescribir datos.
-- ==============================================================================

BEGIN;

-- 1. Tabla de Autorización Mínima (app_members)
-- Solo almacena los user_id de las dos cuentas autorizadas.
CREATE TABLE IF NOT EXISTS public.app_members (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Función Segura de Verificación de Membresía
CREATE OR REPLACE FUNCTION public.is_app_member()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.app_members
        WHERE user_id = auth.uid()
    );
$$;

-- Permisos mínimos sobre la función
REVOKE ALL ON FUNCTION public.is_app_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_app_member() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_app_member() TO authenticated;

-- 3. Tabla de Estado Compartido (shared_state)
-- Las cuatro claves son fijas e inmutables; no se permite DELETE.
CREATE TABLE IF NOT EXISTS public.shared_state (
    state_key TEXT PRIMARY KEY CHECK (state_key IN ('planner', 'freezer', 'shopping_list', 'favorites')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 4. Revocaciones Explícitas Previas sobre las Tablas Nuevas
REVOKE ALL ON TABLE public.app_members FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.shared_state FROM anon, PUBLIC;

-- Conceder únicamente permisos mínimos necesarios a authenticated
GRANT SELECT ON TABLE public.app_members TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.app_members FROM authenticated;
-- NOTA: NO se concede DELETE sobre shared_state (las 4 filas son estados fijos)
GRANT SELECT, INSERT, UPDATE ON TABLE public.shared_state TO authenticated;
REVOKE DELETE ON TABLE public.shared_state FROM authenticated, anon, PUBLIC;

-- 5. Habilitación de RLS exclusivamente en las nuevas tablas
ALTER TABLE public.app_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_state ENABLE ROW LEVEL SECURITY;

-- Políticas para app_members
DROP POLICY IF EXISTS "Members can view membership" ON public.app_members;
CREATE POLICY "Members can view membership" ON public.app_members
    FOR SELECT TO authenticated
    USING (public.is_app_member());

-- Políticas para shared_state (separadas: SELECT, INSERT, UPDATE; sin DELETE)
DROP POLICY IF EXISTS "Shared state members select" ON public.shared_state;
CREATE POLICY "Shared state members select" ON public.shared_state
    FOR SELECT TO authenticated
    USING (public.is_app_member());

DROP POLICY IF EXISTS "Shared state members insert" ON public.shared_state;
CREATE POLICY "Shared state members insert" ON public.shared_state
    FOR INSERT TO authenticated
    WITH CHECK (public.is_app_member());

DROP POLICY IF EXISTS "Shared state members update" ON public.shared_state;
CREATE POLICY "Shared state members update" ON public.shared_state
    FOR UPDATE TO authenticated
    USING (public.is_app_member())
    WITH CHECK (public.is_app_member());

-- 6. Migración No Destructiva de Estados a shared_state (Estrategia DO NOTHING)
-- Si ya existen valores en shared_state, DO NOTHING garantiza que no se sobrescriban.

-- A) Planificador semanal (_PLANNER_STATE_)
INSERT INTO public.shared_state (state_key, payload, version, updated_at)
SELECT
    'planner',
    CASE WHEN c.name IS NULL OR trim(c.name) = '' THEN '{}'::jsonb ELSE c.name::jsonb END,
    1,
    now()
FROM public.categories c WHERE c.id = '_PLANNER_STATE_'
ON CONFLICT (state_key) DO NOTHING;

INSERT INTO public.shared_state (state_key, payload, version, updated_at)
VALUES ('planner', '{}'::jsonb, 1, now())
ON CONFLICT (state_key) DO NOTHING;

-- B) Congelador (_FREEZER_STATE_)
INSERT INTO public.shared_state (state_key, payload, version, updated_at)
SELECT
    'freezer',
    CASE WHEN c.name IS NULL OR trim(c.name) = '' THEN '[]'::jsonb ELSE c.name::jsonb END,
    1,
    now()
FROM public.categories c WHERE c.id = '_FREEZER_STATE_'
ON CONFLICT (state_key) DO NOTHING;

INSERT INTO public.shared_state (state_key, payload, version, updated_at)
VALUES ('freezer', '[]'::jsonb, 1, now())
ON CONFLICT (state_key) DO NOTHING;

-- C) Lista de la compra (_SHOPPING_LIST_STATE_)
INSERT INTO public.shared_state (state_key, payload, version, updated_at)
SELECT
    'shopping_list',
    CASE WHEN c.name IS NULL OR trim(c.name) = '' THEN '[]'::jsonb ELSE c.name::jsonb END,
    1,
    now()
FROM public.categories c WHERE c.id = '_SHOPPING_LIST_STATE_'
ON CONFLICT (state_key) DO NOTHING;

INSERT INTO public.shared_state (state_key, payload, version, updated_at)
VALUES ('shopping_list', '[]'::jsonb, 1, now())
ON CONFLICT (state_key) DO NOTHING;

-- D) Favoritos: al no existir _FAVORITES_STATE_ en categories, se garantiza su creación con []::jsonb
INSERT INTO public.shared_state (state_key, payload, version, updated_at)
SELECT
    'favorites',
    CASE WHEN c.name IS NULL OR trim(c.name) = '' THEN '[]'::jsonb ELSE c.name::jsonb END,
    1,
    now()
FROM public.categories c WHERE c.id = '_FAVORITES_STATE_'
ON CONFLICT (state_key) DO NOTHING;

INSERT INTO public.shared_state (state_key, payload, version, updated_at)
VALUES ('favorites', '[]'::jsonb, 1, now())
ON CONFLICT (state_key) DO NOTHING;

-- 7. Plantilla Manual para Bootstrap de los UUID de los Dos Miembros
-- INSTRUCCIONES: Una vez dadas de alta las dos cuentas privadas en Supabase Dashboard
-- (Authentication -> Users -> Invite/Add user), reemplaza estos marcadores con sus UUID
-- reales antes de ejecutar este bloque:
--
-- INSERT INTO public.app_members (user_id) VALUES
--     ('<UUID_MIEMBRO_A>'::uuid),
--     ('<UUID_MIEMBRO_B>'::uuid)
-- ON CONFLICT (user_id) DO NOTHING;

COMMIT;
