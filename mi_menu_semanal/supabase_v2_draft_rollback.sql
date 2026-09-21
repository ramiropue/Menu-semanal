-- supabase_v2_draft_rollback.sql
-- ==============================================================================
-- PLAN DE CONTINGENCIA Y ROLLBACK SEGURO V2: APLICACIÓN PRIVADA PARA DOS
-- ==============================================================================
-- Estado: BORRADOR DE DISEÑO PARA REVISIÓN TÉCNICA (NO EJECUTADO EN REMOTO).
-- ==============================================================================
-- PRINCIPIOS OBLIGATORIOS DE SEGURIDAD Y PRESERVACIÓN:
-- 1. CERO PÉRDIDA DE DATOS: Prohibido estrictamente DROP TABLE ... CASCADE o DROP COLUMN.
--    Las tablas app_members y shared_state PERMANECEN INTACTAS en la base de datos.
-- 2. CERO RESTAURACIÓN DE ESCRITURA O LECTURA ANÓNIMA: En contingencia, NUNCA se vuelve
--    a abrir acceso público (anon) a las recetas ni a las categorías.
-- 3. MODO DE DEGRADACIÓN SEGURA: Si se requiere relajar temporalmente RLS durante una
--    reversión de código frontend, las políticas de emergencia se conceden EXCLUSIVAMENTE
--    al rol authenticated; anon permanece 100% bloqueado.
-- 4. DISASTER RECOVERY: Ante cualquier inconsistencia crítica, el backup previo se restaura
--    PRIMERO en un proyecto Supabase aislado de staging (menu-semanal-restore-drill) antes
--    de tocar producción.
-- ==============================================================================

-- ==============================================================================
-- SECCIÓN A: SCRIPT SQL DE DEGRADACIÓN SEGURA (EMERGENCY AUTHENTICATED FALLBACK)
-- ==============================================================================
BEGIN;

-- 1. PRESERVACIÓN ESTRUCTURAL:
-- public.app_members y public.shared_state se mantienen sin alteraciones.
-- Las columnas añadidas en recipes se conservan.

-- 2. POLÍTICAS DE EMERGENCIA SOLO PARA USUARIOS AUTENTICADOS:
-- Desactivar políticas que dependan de is_app_member() si se necesitara operar temporalmente
DROP POLICY IF EXISTS "Recipes members access" ON public.recipes;
DROP POLICY IF EXISTS "Categories members access" ON public.categories;
DROP POLICY IF EXISTS "Shared state members access" ON public.shared_state;

-- Permitir temporalmente acceso total a cualquier usuario autenticado (NUNCA a anónimos)
CREATE POLICY "Emergency authenticated recipes access" ON public.recipes
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Emergency authenticated categories access" ON public.categories
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Emergency authenticated shared_state access" ON public.shared_state
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- Bloqueo absoluto y permanente de anon
REVOKE ALL ON TABLE public.recipes FROM anon;
REVOKE ALL ON TABLE public.categories FROM anon;
REVOKE ALL ON TABLE public.app_members FROM anon;
REVOKE ALL ON TABLE public.shared_state FROM anon;

COMMIT;

-- ==============================================================================
-- SECCIÓN B: PROTOCOLO DE RECUPERACIÓN DE DESASTRES (DISASTER RECOVERY)
-- ==============================================================================
-- 1. Verificación de hash SHA-256 del dump tomado antes de la migración:
--    $ shasum -a 256 backup_pre_v2_data_*.sql
--
-- 2. Restauración en proyecto de staging aislado (NUNCA directo en prod):
--    Crear proyecto: "menu-semanal-restore-drill"
--    $ psql -h db.restore-project.supabase.co -U postgres -d postgres -f backup_pre_v2_schema_*.sql
--    $ psql -h db.restore-project.supabase.co -U postgres -d postgres -f backup_pre_v2_data_*.sql
--
-- 3. Verificación de conteo e integridad:
--    SELECT count(*) FROM public.recipes;
--    SELECT count(*) FROM public.categories;
--    SELECT name FROM public.categories WHERE id = '_PLANNER_STATE_';
--
-- 4. Conmutación en Netlify únicamente tras comprobar el 100% de los datos en staging.
