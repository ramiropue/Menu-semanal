-- supabase_v2_stage_6a_rollback.sql
-- ==============================================================================
-- PLAN DE CONTINGENCIA Y ROLLBACK SEGURO: ETAPA 6A (ENDURECIDO)
-- Menú Semanal V2: Reversión de Emergencia de Políticas RLS y Storage
-- ==============================================================================
-- ESTADO: BORRADOR PREPARADO PARA REVISIÓN TÉCNICA (NO EJECUTAR EN SUPABASE REMOTO).
-- ==============================================================================
-- PRINCIPIOS OBLIGATORIOS DE SEGURIDAD Y PRESERVACIÓN:
-- 1. CERO PÉRDIDA DE DATOS: Prohibido estrictamente DROP TABLE, DROP COLUMN o TRUNCATE.
--    Las tablas app_members y shared_state PERMANECEN INTACTAS en la base de datos.
-- 2. CERO RESTAURACIÓN DE ACCESO ANÓNIMO:
--    - En contingencia, NUNCA se vuelve a otorgar acceso al rol anon ni a PUBLIC.
--    - Se ha eliminado cualquier sentencia ejecutable de reapertura pública V1.
-- 3. MODO DE DEGRADACIÓN SEGURA (EMERGENCY AUTHENTICATED FALLBACK):
--    - Si surge una discrepancia inesperada en la resolución de is_app_member(),
--      este script relaja temporalmente la comprobación a cualquier usuario autenticado
--      con sesión válida (auth.uid() IS NOT NULL).
--    - Los usuarios anónimos permanecen 100% bloqueados sin excepción.
--    - public.shared_state mantiene ÚNICAMENTE lectura directa (SELECT);
--      las mutaciones se realizan exclusivamente a través de public.update_shared_state().
-- 4. STORAGE AISLADO:
--    - Las políticas de emergencia en storage.objects aplican exclusivamente al bucket
--      'recipe-images' y requieren auth.uid() IS NOT NULL.
--    - No se altera la configuración public de storage.buckets.
-- 5. HISTORIAL DE REFERENCIA V1 (SOLO TEXTO DOCUMENTAL, NO EJECUTABLE):
--    - Estado V1 anterior: políticas permisivas abiertas para recetas ("Public recipes are
--      viewable by everyone."), categorías ("Public profiles are viewable by everyone.")
--      y storage ("Public Upload/Read/Update/Delete").
--    - Por diseño de seguridad, dicho estado V1 no es restaurable operativamente.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. BLOQUEO TOTAL Y PERMANENTE DEL ROL ANÓNIMO (anon) Y PUBLIC
-- ==============================================================================

REVOKE ALL PRIVILEGES ON TABLE public.recipes FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.categories FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.shared_state FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.app_members FROM anon, PUBLIC;

-- ==============================================================================
-- 2. RETIRADA DE POLÍTICAS BASADAS EN is_app_member()
-- ==============================================================================

DROP POLICY IF EXISTS "Recipes members access" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members select" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members insert" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members update" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members delete" ON public.recipes;

DROP POLICY IF EXISTS "Categories members access" ON public.categories;
DROP POLICY IF EXISTS "Categories members select" ON public.categories;
DROP POLICY IF EXISTS "Categories members insert" ON public.categories;
DROP POLICY IF EXISTS "Categories members update" ON public.categories;
DROP POLICY IF EXISTS "Categories members delete" ON public.categories;

DROP POLICY IF EXISTS "Shared state members select" ON public.shared_state;
DROP POLICY IF EXISTS "Shared state members insert" ON public.shared_state;
DROP POLICY IF EXISTS "Shared state members update" ON public.shared_state;
DROP POLICY IF EXISTS "Shared state members access" ON public.shared_state;

DROP POLICY IF EXISTS "Recipe images member select" ON storage.objects;
DROP POLICY IF EXISTS "Recipe images member insert" ON storage.objects;
DROP POLICY IF EXISTS "Recipe images member update" ON storage.objects;
DROP POLICY IF EXISTS "Recipe images member delete" ON storage.objects;

-- Limpieza de versiones previas de emergencia
DROP POLICY IF EXISTS "Emergency authenticated recipes access" ON public.recipes;
DROP POLICY IF EXISTS "Emergency authenticated categories access" ON public.categories;
DROP POLICY IF EXISTS "Emergency authenticated shared_state select" ON public.shared_state;
DROP POLICY IF EXISTS "Emergency authenticated shared_state insert" ON public.shared_state;
DROP POLICY IF EXISTS "Emergency authenticated shared_state update" ON public.shared_state;
DROP POLICY IF EXISTS "Emergency authenticated storage select" ON storage.objects;
DROP POLICY IF EXISTS "Emergency authenticated storage insert" ON storage.objects;
DROP POLICY IF EXISTS "Emergency authenticated storage update" ON storage.objects;
DROP POLICY IF EXISTS "Emergency authenticated storage delete" ON storage.objects;

-- ==============================================================================
-- 3. POLÍTICAS DE EMERGENCIA EXCLUSIVAS PARA USUARIOS AUTENTICADOS (auth.uid() IS NOT NULL)
-- ==============================================================================

-- A) Recetas: acceso para cualquier usuario autenticado
CREATE POLICY "Emergency authenticated recipes access" ON public.recipes
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- B) Categorías: acceso para cualquier usuario autenticado
CREATE POLICY "Emergency authenticated categories access" ON public.categories
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- C) shared_state: lectura de emergencia para cualquier autenticado; mutación exclusiva vía RPC OCC
-- ==============================================================================
-- NOTA ARQUITECTÓNICA DE ROLLBACK:
-- 1. La aplicación V2 (lib/state/stateAdapter.ts) no realiza escrituras directas sobre
--    public.shared_state; canaliza el 100% de las mutaciones mediante public.update_shared_state().
-- 2. Conceder INSERT/UPDATE directo a authenticated no recuperaría la aplicación si
--    fallase la función RPC, pero sí anularía innecesariamente el control OCC y la
--    validación estricta de payloads en servidor.
-- 3. Por consiguiente, se mantiene el principio de menor privilegio: authenticated
--    posee ÚNICAMENTE permiso SELECT. Las mutaciones directas continúan denegadas (42501).
-- 4. La política de emergencia relaja únicamente la LECTURA (SELECT) a cualquier
--    usuario autenticado con sesión válida (auth.uid() IS NOT NULL).
-- ==============================================================================
REVOKE ALL PRIVILEGES ON TABLE public.shared_state FROM anon, authenticated, PUBLIC;
GRANT SELECT ON TABLE public.shared_state TO authenticated;

CREATE POLICY "Emergency authenticated shared_state select" ON public.shared_state
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

-- D) Storage (recipe-images): acceso para cualquier usuario autenticado
CREATE POLICY "Emergency authenticated storage select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'recipe-images' AND
        auth.uid() IS NOT NULL
    );

CREATE POLICY "Emergency authenticated storage insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'recipe-images' AND
        auth.uid() IS NOT NULL
    );

CREATE POLICY "Emergency authenticated storage update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'recipe-images' AND
        auth.uid() IS NOT NULL
    )
    WITH CHECK (
        bucket_id = 'recipe-images' AND
        auth.uid() IS NOT NULL
    );

CREATE POLICY "Emergency authenticated storage delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'recipe-images' AND
        auth.uid() IS NOT NULL
    );

-- ==============================================================================
-- 4. SEGURIDAD DE app_members
-- ==============================================================================
-- app_members permanece con RLS habilitada y CERO privilegios para authenticated ni anon.
REVOKE ALL PRIVILEGES ON TABLE public.app_members FROM anon, authenticated, PUBLIC;

COMMIT;
