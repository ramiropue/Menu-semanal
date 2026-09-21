-- supabase_v2_draft_migration.sql
-- ==============================================================================
-- BORRADOR DE MIGRACIÓN V2 (FASE 1): APLICACIÓN PRIVADA COMPARTIDA (DOS MIEMBROS)
-- ==============================================================================
-- Estado: BORRADOR DE DISEÑO PARA REVISIÓN TÉCNICA (NO EJECUTADO EN REMOTO).
-- ==============================================================================
-- PRINCIPIOS DE ARQUITECTURA:
-- 1. Alcance: Aplicación 100% privada para dos personas (pareja) con permisos idénticos.
-- 2. Eliminación de complejidad innecesaria: Sin households, household_members,
--    invitaciones, roles admin/member ni catálogos públicos.
-- 3. Autorización mínima: Tabla app_members y función segura is_app_member().
-- 4. Estado compartido: Tabla shared_state sustituye las 4 filas especiales de categories.
-- 5. Privacidad estricta: RLS activo en todo; anon y usuarios no autorizados = 0 permisos.
-- 6. Storage privado: bucket no público con acceso restringido a app_members.
-- ==============================================================================

BEGIN;

-- 1. Tabla de Autorización Mínima (app_members)
-- Solo almacena los user_id de las dos cuentas autorizadas.
-- Gestión exclusivamente administrativa (SQL Editor / Service Role); ningún cliente puede insertar/modificar.
CREATE TABLE IF NOT EXISTS public.app_members (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Función Segura de Verificación de Membresía
-- Utiliza SECURITY DEFINER con search_path explícito y permisos mínimos.
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

-- Permisos mínimos estrictos sobre la función
REVOKE ALL ON FUNCTION public.is_app_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_app_member() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_app_member() TO authenticated;

-- 3. Tabla de Estado Compartido (shared_state)
-- Desacopla y reemplaza las filas especiales _PLANNER_STATE_, _FREEZER_STATE_, etc.
CREATE TABLE IF NOT EXISTS public.shared_state (
    state_key TEXT PRIMARY KEY CHECK (state_key IN ('planner', 'freezer', 'shopping_list', 'favorites')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 4. Modificaciones Aditivas a recipes y categories (Sin columnas de hogares ni catálogo)
ALTER TABLE public.recipes
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 5. Migración No Destructiva de las 4 Filas Especiales a shared_state
-- NOTA: Las filas originales en public.categories SE CONSERVAN INTACTAS como respaldo de auditoría.
INSERT INTO public.shared_state (state_key, payload, version, updated_at)
SELECT
    'planner',
    CASE WHEN c.name IS NULL OR trim(c.name) = '' THEN '{}'::jsonb ELSE c.name::jsonb END,
    1,
    now()
FROM public.categories c WHERE c.id = '_PLANNER_STATE_'
ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload;

INSERT INTO public.shared_state (state_key, payload, version, updated_at)
SELECT
    'freezer',
    CASE WHEN c.name IS NULL OR trim(c.name) = '' THEN '[]'::jsonb ELSE c.name::jsonb END,
    1,
    now()
FROM public.categories c WHERE c.id = '_FREEZER_STATE_'
ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload;

INSERT INTO public.shared_state (state_key, payload, version, updated_at)
SELECT
    'shopping_list',
    CASE WHEN c.name IS NULL OR trim(c.name) = '' THEN '[]'::jsonb ELSE c.name::jsonb END,
    1,
    now()
FROM public.categories c WHERE c.id = '_SHOPPING_LIST_STATE_'
ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload;

INSERT INTO public.shared_state (state_key, payload, version, updated_at)
SELECT
    'favorites',
    CASE WHEN c.name IS NULL OR trim(c.name) = '' THEN '[]'::jsonb ELSE c.name::jsonb END,
    1,
    now()
FROM public.categories c WHERE c.id = '_FAVORITES_STATE_'
ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload;

-- 6. Retirada Explícita de Políticas V1 y Revocación de Permisos (GRANT/REVOKE)
DROP POLICY IF EXISTS "Public recipes are viewable by everyone." ON public.recipes;
DROP POLICY IF EXISTS "Permitir insertar recetas a todos" ON public.recipes;
DROP POLICY IF EXISTS "Permitir actualizar recetas a todos" ON public.recipes;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.categories;
DROP POLICY IF EXISTS "Permitir insertar categorías a todos" ON public.categories;
DROP POLICY IF EXISTS "Permitir insertar categorías a todos." ON public.categories;
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;

-- Revocar acceso completo al rol anónimo en tablas V1
REVOKE ALL ON TABLE public.recipes FROM anon;
REVOKE ALL ON TABLE public.categories FROM anon;

-- Revocaciones explícitas estrictas sobre las tablas nuevas
REVOKE ALL PRIVILEGES ON TABLE public.app_members
FROM anon, authenticated, PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE public.shared_state
FROM anon, authenticated, PUBLIC;

-- Otorgar permisos base al rol authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.app_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.shared_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipes, public.categories TO authenticated;

-- 7. Habilitación de Row Level Security (RLS)
ALTER TABLE public.app_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 8. Políticas RLS: app_members
-- Solo los miembros autorizados pueden ver la lista de membresía
DROP POLICY IF EXISTS "Members can view membership" ON public.app_members;
CREATE POLICY "Members can view membership" ON public.app_members
    FOR SELECT TO authenticated
    USING (public.is_app_member());

-- 9. Políticas RLS: shared_state
-- Ambos miembros autorizados tienen acceso total compartido (CRUD)
DROP POLICY IF EXISTS "Shared state members access" ON public.shared_state;
CREATE POLICY "Shared state members access" ON public.shared_state
    FOR ALL TO authenticated
    USING (public.is_app_member())
    WITH CHECK (public.is_app_member());

-- 10. Políticas RLS: recipes
-- Ambos miembros autorizados tienen acceso total compartido (CRUD)
DROP POLICY IF EXISTS "Recipes members access" ON public.recipes;
CREATE POLICY "Recipes members access" ON public.recipes
    FOR ALL TO authenticated
    USING (public.is_app_member())
    WITH CHECK (public.is_app_member());

-- 11. Políticas RLS: categories
-- Ambos miembros autorizados tienen acceso total compartido (CRUD)
DROP POLICY IF EXISTS "Categories members access" ON public.categories;
CREATE POLICY "Categories members access" ON public.categories
    FOR ALL TO authenticated
    USING (public.is_app_member())
    WITH CHECK (public.is_app_member());

-- 12. Configuración y Políticas de Storage (Privado)
-- Asegurar que el bucket recipe-images sea privado y tenga cuotas estrictas
UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880, -- 5 MB máximo
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'recipe-images';

-- Políticas de Storage en storage.objects para miembros de la app
DROP POLICY IF EXISTS "Recipe images member select" ON storage.objects;
CREATE POLICY "Recipe images member select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'recipe-images' AND public.is_app_member());

DROP POLICY IF EXISTS "Recipe images member insert" ON storage.objects;
CREATE POLICY "Recipe images member insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'recipe-images' AND
        public.is_app_member()
    );

DROP POLICY IF EXISTS "Recipe images member update" ON storage.objects;
CREATE POLICY "Recipe images member update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'recipe-images' AND public.is_app_member());

DROP POLICY IF EXISTS "Recipe images member delete" ON storage.objects;
CREATE POLICY "Recipe images member delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'recipe-images' AND public.is_app_member());

COMMIT;
