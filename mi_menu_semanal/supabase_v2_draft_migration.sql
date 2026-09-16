-- supabase_v2_draft_migration.sql
-- ==============================================================================
-- BORRADOR DE MIGRACIÓN V2 (FASE 1): AUTENTICACIÓN Y AISLAMIENTO POR HOGAR
-- ==============================================================================
-- Este script es un borrador aditivo e idempotente para REVISIÓN.
-- NO SE HA EJECUTADO EN SUPABASE REMOTO.
-- ==============================================================================

BEGIN;

-- 1. Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabla de hogares (Households)
CREATE TABLE IF NOT EXISTS public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Miembros del hogar (Household Members)
CREATE TABLE IF NOT EXISTS public.household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (household_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON public.household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_household ON public.household_members(household_id);

-- 4. Invitaciones al hogar (Household Invitations)
CREATE TABLE IF NOT EXISTS public.household_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.household_invitations(token);

-- 5. Estado del hogar desacoplado (Household State)
-- Sustituye las filas especiales de categories (_PLANNER_STATE_, _FREEZER_STATE_, etc.)
CREATE TABLE IF NOT EXISTS public.household_state (
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    state_key TEXT NOT NULL CHECK (state_key IN ('planner', 'freezer', 'shopping_list', 'favorites')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (household_id, state_key)
);

-- 6. Modificaciones aditivas a la tabla recipes (conservando TEXT id original)
ALTER TABLE public.recipes 
    ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_shared_catalog BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_recipes_household ON public.recipes(household_id);
CREATE INDEX IF NOT EXISTS idx_recipes_catalog ON public.recipes(is_shared_catalog);

-- Clasificar recetas existentes: pasan a ser catálogo global compartido
UPDATE public.recipes 
SET is_shared_catalog = true 
WHERE household_id IS NULL;

-- 7. Modificaciones aditivas a la tabla categories
ALTER TABLE public.categories 
    ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_household ON public.categories(household_id);

-- 8. Funciones de ayuda SECURITY DEFINER (para evitar recursión infinita en políticas RLS)
CREATE OR REPLACE FUNCTION public.is_household_member(h_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = h_id AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(h_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = h_id AND user_id = auth.uid() AND role = 'admin'
    );
$$;

-- 9. Retirada estricta de políticas de escritura anónima de V1
DROP POLICY IF EXISTS "Permitir insertar recetas a todos" ON public.recipes;
DROP POLICY IF EXISTS "Permitir actualizar recetas a todos" ON public.recipes;
DROP POLICY IF EXISTS "Permitir insertar categorías a todos" ON public.categories;

-- Revocar permisos de modificación al rol anon
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

-- 10. Habilitación de RLS
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 11. Políticas RLS: households
DROP POLICY IF EXISTS "Households member select" ON public.households;
CREATE POLICY "Households member select" ON public.households
    FOR SELECT USING (public.is_household_member(id));

DROP POLICY IF EXISTS "Households admin update" ON public.households;
CREATE POLICY "Households admin update" ON public.households
    FOR UPDATE USING (public.is_household_admin(id));

DROP POLICY IF EXISTS "Households admin delete" ON public.households;
CREATE POLICY "Households admin delete" ON public.households
    FOR DELETE USING (public.is_household_admin(id));

-- 12. Políticas RLS: household_members
DROP POLICY IF EXISTS "Household members select" ON public.household_members;
CREATE POLICY "Household members select" ON public.household_members
    FOR SELECT USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS "Household members admin insert" ON public.household_members;
CREATE POLICY "Household members admin insert" ON public.household_members
    FOR INSERT WITH CHECK (
        public.is_household_admin(household_id) OR
        auth.uid() = user_id -- permite registrarse al aceptar invitación
    );

DROP POLICY IF EXISTS "Household members admin update" ON public.household_members;
CREATE POLICY "Household members admin update" ON public.household_members
    FOR UPDATE USING (public.is_household_admin(household_id));

DROP POLICY IF EXISTS "Household members delete" ON public.household_members;
CREATE POLICY "Household members delete" ON public.household_members
    FOR DELETE USING (
        public.is_household_admin(household_id) OR auth.uid() = user_id -- auto-salida
    );

-- 13. Políticas RLS: recipes
DROP POLICY IF EXISTS "Recipes read policy" ON public.recipes;
CREATE POLICY "Recipes read policy" ON public.recipes
    FOR SELECT USING (
        is_shared_catalog = true OR 
        (household_id IS NOT NULL AND public.is_household_member(household_id))
    );

DROP POLICY IF EXISTS "Recipes insert policy" ON public.recipes;
CREATE POLICY "Recipes insert policy" ON public.recipes
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND 
        household_id IS NOT NULL AND 
        public.is_household_member(household_id)
    );

DROP POLICY IF EXISTS "Recipes update policy" ON public.recipes;
CREATE POLICY "Recipes update policy" ON public.recipes
    FOR UPDATE USING (
        household_id IS NOT NULL AND public.is_household_member(household_id)
    );

DROP POLICY IF EXISTS "Recipes delete policy" ON public.recipes;
CREATE POLICY "Recipes delete policy" ON public.recipes
    FOR DELETE USING (
        household_id IS NOT NULL AND public.is_household_member(household_id)
    );

-- 14. Políticas RLS: categories
DROP POLICY IF EXISTS "Categories read policy" ON public.categories;
CREATE POLICY "Categories read policy" ON public.categories
    FOR SELECT USING (
        household_id IS NULL OR public.is_household_member(household_id)
    );

DROP POLICY IF EXISTS "Categories insert policy" ON public.categories;
CREATE POLICY "Categories insert policy" ON public.categories
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND 
        household_id IS NOT NULL AND 
        public.is_household_member(household_id)
    );

DROP POLICY IF EXISTS "Categories update policy" ON public.categories;
CREATE POLICY "Categories update policy" ON public.categories
    FOR UPDATE USING (
        household_id IS NOT NULL AND public.is_household_member(household_id)
    );

DROP POLICY IF EXISTS "Categories delete policy" ON public.categories;
CREATE POLICY "Categories delete policy" ON public.categories
    FOR DELETE USING (
        household_id IS NOT NULL AND public.is_household_member(household_id)
    );

-- 15. Políticas RLS: household_state
DROP POLICY IF EXISTS "Household state access policy" ON public.household_state;
CREATE POLICY "Household state access policy" ON public.household_state
    FOR ALL USING (
        public.is_household_member(household_id)
    ) WITH CHECK (
        public.is_household_member(household_id)
    );

-- 16. Políticas de Storage en bucket privado household-media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'household-media',
    'household-media',
    false, -- Estrictamente privado: sin URLs públicas de CDN
    5242880, -- 5 MB máximo
    ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Revocar subidas anónimas al bucket recipe-images original
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;

-- Acceso a household-media según membresía (path format: "{household_id}/{filename}")
DROP POLICY IF EXISTS "Household media select" ON storage.objects;
CREATE POLICY "Household media select" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'household-media' AND
        public.is_household_member((storage.foldername(name))[1]::uuid)
    );

DROP POLICY IF EXISTS "Household media insert" ON storage.objects;
CREATE POLICY "Household media insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'household-media' AND
        auth.uid() IS NOT NULL AND
        public.is_household_member((storage.foldername(name))[1]::uuid)
    );

DROP POLICY IF EXISTS "Household media delete" ON storage.objects;
CREATE POLICY "Household media delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'household-media' AND
        public.is_household_member((storage.foldername(name))[1]::uuid)
    );

COMMIT;
