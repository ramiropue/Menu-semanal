-- supabase_v2_draft_rollback.sql
-- ==============================================================================
-- BORRADOR DE ROLLBACK SEGURO PARA FASE 1 V2
-- ==============================================================================
-- IMPORTANTE: Este rollback revierte las tablas y columnas añadidas por la V2,
-- pero NUNCA vuelve a habilitar las políticas de escritura pública anónima de V1.
-- ==============================================================================

BEGIN;

-- 1. Eliminar tablas añadidas por la Fase 1
DROP TABLE IF EXISTS public.household_invitations CASCADE;
DROP TABLE IF EXISTS public.household_state CASCADE;
DROP TABLE IF EXISTS public.household_members CASCADE;
DROP TABLE IF EXISTS public.households CASCADE;

-- 2. Eliminar funciones de ayuda
DROP FUNCTION IF EXISTS public.is_household_admin(UUID);
DROP FUNCTION IF EXISTS public.is_household_member(UUID);

-- 3. Revertir columnas añadidas en recipes y categories
ALTER TABLE public.recipes 
    DROP COLUMN IF EXISTS household_id,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS is_shared_catalog,
    DROP COLUMN IF EXISTS created_at,
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE public.categories 
    DROP COLUMN IF EXISTS household_id;

-- 4. POLÍTICAS DE CONTENCIÓN:
-- Reinstaurar lectura pública pero MANTENER ESCRITURA BLOQUEADA PARA ANÓNIMOS.
DROP POLICY IF EXISTS "Recipes read policy" ON public.recipes;
DROP POLICY IF EXISTS "Recipes insert policy" ON public.recipes;
DROP POLICY IF EXISTS "Recipes update policy" ON public.recipes;
DROP POLICY IF EXISTS "Recipes delete policy" ON public.recipes;

CREATE POLICY "Public recipes read only" ON public.recipes 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Categories read policy" ON public.categories;
DROP POLICY IF EXISTS "Categories insert policy" ON public.categories;
DROP POLICY IF EXISTS "Categories update policy" ON public.categories;
DROP POLICY IF EXISTS "Categories delete policy" ON public.categories;

CREATE POLICY "Public categories read only" ON public.categories 
    FOR SELECT USING (true);

-- Revocar escrituras de anon en rollback
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

COMMIT;
