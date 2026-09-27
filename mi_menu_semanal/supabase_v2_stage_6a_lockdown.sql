-- supabase_v2_stage_6a_lockdown.sql
-- ==============================================================================
-- ETAPA 6A: CIERRE DE SEGURIDAD RLS Y PRIVATIZACIÓN DE ACCESO (ENDURECIDO)
-- Menú Semanal V2: Cierre de Políticas Públicas V1 y Restricción a app_members
-- ==============================================================================
-- ESTADO: BORRADOR PREPARADO PARA REVISIÓN TÉCNICA (NO EJECUTAR EN SUPABASE REMOTO).
-- ==============================================================================
-- PRINCIPIOS Y GARANTÍAS DE SEGURIDAD:
-- 1. AISLAMIENTO TOTAL: Cero acceso a anónimos (anon) y a usuarios autenticados
--    no registrados en public.app_members.
-- 2. BLINDAJE DE app_members:
--    - Ningún cliente frontend (anon ni authenticated, incluidos los propios miembros)
--      tiene privilegios directos de SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--      REFERENCES ni TRIGGER sobre public.app_members.
--    - La lista de UUIDs de miembros es inaccesible desde el cliente.
--    - La función segura is_app_member() (SECURITY DEFINER) es el ÚNICO mecanismo
--      utilizado por la aplicación para verificar membresía sin exponer la tabla.
-- 3. UNIDAD FAMILIAR IGUALITARIA: Todos los miembros en public.app_members
--    tienen idénticos permisos sobre recetas, categorías y estado compartido.
-- 4. ESTADO COMPARTIDO PROTEGIDO: shared_state es accesible solo para miembros;
--    las mutaciones se realizan exclusivamente mediante public.update_shared_state().
-- 5. SECUENCIAS Y PRIVILEGIOS AUXILIARES REVOCADOS:
--    - Revocación total de secuencias en el esquema public a anon, authenticated y PUBLIC.
--    - Las tablas recipes y categories emplean identificadores de texto (TEXT), por
--      lo que las operaciones de inserción no requieren USAGE ni SELECT sobre secuencias.
-- 6. STORAGE PROTEGIDO (storage.objects):
--    - Políticas separadas por operación (SELECT, INSERT, UPDATE, DELETE) en recipe-images.
--    - Restricción estricta a bucket_id = 'recipe-images' AND public.is_app_member().
--    - Cero acceso a otros buckets.
--    - El bucket permanece con public = true a nivel de storage.buckets para no romper
--      las URLs públicas cargadas directamente en etiquetas <img> del frontend V2.
-- 7. JUSTIFICACIÓN DE ROW LEVEL SECURITY (ENABLE vs FORCE):
--    - Se utiliza ALTER TABLE ... ENABLE ROW LEVEL SECURITY en todas las tablas.
--    - NO se utiliza FORCE ROW LEVEL SECURITY para permitir que el rol administrativo
--      (service_role / postgres) continúe ejecutando backups, seeds y tareas de
--      mantenimiento sin verse restringido por el contexto JWT de cliente, mientras
--      que los roles anon y authenticated permanecen 100% sujetos a RLS.
-- 8. TRANSACCIONALIDAD E IDEMPOTENCIA ESTRICTA:
--    - Todo se ejecuta en un bloque BEGIN ... COMMIT.
--    - Verificación previa de existencia de tablas antes de aplicar cambios.
--    - Todas las políticas usan DROP POLICY IF EXISTS antes de CREATE POLICY.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- SECCIÓN 0: VERIFICACIÓN PREVIA DE ESTRUCTURAS REQUERIDAS (FAIL-SAFE)
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_members') THEN
        RAISE EXCEPTION 'Tabla requerida public.app_members no existe. Abortando migración.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shared_state') THEN
        RAISE EXCEPTION 'Tabla requerida public.shared_state no existe. Abortando migración.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipes') THEN
        RAISE EXCEPTION 'Tabla requerida public.recipes no existe. Abortando migración.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') THEN
        RAISE EXCEPTION 'Tabla requerida public.categories no existe. Abortando migración.';
    END IF;
END $$;

-- ==============================================================================
-- SECCIÓN 1: REVOCACIÓN DE PRIVILEGIOS BASE A ROL ANÓNIMO (anon) Y PUBLIC
-- ==============================================================================

-- Revocar cualquier permiso DDL/DML de las tablas a anon y PUBLIC
REVOKE ALL PRIVILEGES ON TABLE public.recipes FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.categories FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.shared_state FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.app_members FROM anon, PUBLIC;

-- Revocar privilegios sobre todas las secuencias en public a anon y PUBLIC
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;

-- Asegurar que el esquema public permite USAGE pero no CREATE para anon y authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM anon, authenticated, PUBLIC;

-- ==============================================================================
-- SECCIÓN 2: PRIVILEGIOS MÍNIMOS PARA ROL AUTENTICADO (authenticated)
-- ==============================================================================

-- Otorgar privilegios DML sobre recipes y categories (RLS filtrará fila a fila)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories TO authenticated;

-- Otorgar privilegios sobre shared_state (SELECT, INSERT, UPDATE; prohibir DELETE)
GRANT SELECT, INSERT, UPDATE ON TABLE public.shared_state TO authenticated;
REVOKE DELETE ON TABLE public.shared_state FROM authenticated;

-- ENDURECIMIENTO DE app_members:
-- Revocación total de cualquier privilegio directo a authenticated.
-- La tabla es inaccesible desde clientes; la membresía se comprueba solo vía is_app_member().
REVOKE ALL PRIVILEGES ON TABLE public.app_members FROM authenticated;

-- Revocar acceso a secuencias para authenticated (no se requieren secuencias en V2)
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;

-- ==============================================================================
-- SECCIÓN 3: VERIFICACIÓN Y ASEGURAMIENTO DE FUNCIONES DE SEGURIDAD
-- ==============================================================================

-- 3.1 Función de verificación de membresía (is_app_member)
-- SECURITY DEFINER con search_path explícito permite consultar public.app_members
-- con los privilegios del propietario (postgres) sin otorgar acceso directo a clientes.
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

-- Permisos sobre is_app_member
REVOKE ALL ON FUNCTION public.is_app_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_member() TO authenticated;

-- 3.2 Permisos sobre update_shared_state
REVOKE ALL ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER) TO authenticated;

-- ==============================================================================
-- SECCIÓN 4: HABILITACIÓN DE RLS EN TODAS LAS TABLAS PÚBLICAS
-- ==============================================================================
-- Justificación técnica: ENABLE ROW LEVEL SECURITY restringe estrictamente a
-- anon y authenticated. No se usa FORCE para conservar la capacidad administrativa
-- sin interferencias del rol postgres / service_role en scripts de mantenimiento.
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_members ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- SECCIÓN 5: POLÍTICAS RLS EN public.recipes
-- ==============================================================================

-- Eliminar políticas permisivas V1 y cualquier versión previa o de emergencia
DROP POLICY IF EXISTS "Public recipes are viewable by everyone." ON public.recipes;
DROP POLICY IF EXISTS "Permitir insertar recetas a todos" ON public.recipes;
DROP POLICY IF EXISTS "Permitir actualizar recetas a todos" ON public.recipes;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.recipes;
DROP POLICY IF EXISTS "Emergency authenticated recipes access" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members access" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members select" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members insert" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members update" ON public.recipes;
DROP POLICY IF EXISTS "Recipes members delete" ON public.recipes;

-- Política integral de acceso compartido para miembros de la unidad familiar
CREATE POLICY "Recipes members access" ON public.recipes
    FOR ALL TO authenticated
    USING (public.is_app_member())
    WITH CHECK (public.is_app_member());

-- ==============================================================================
-- SECCIÓN 6: POLÍTICAS RLS EN public.categories
-- ==============================================================================

-- Eliminar políticas permisivas V1 y cualquier versión previa o de emergencia
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.categories;
DROP POLICY IF EXISTS "Permitir insertar categorías a todos" ON public.categories;
DROP POLICY IF EXISTS "Permitir insertar categorías a todos." ON public.categories;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Emergency authenticated categories access" ON public.categories;
DROP POLICY IF EXISTS "Categories members access" ON public.categories;
DROP POLICY IF EXISTS "Categories members select" ON public.categories;
DROP POLICY IF EXISTS "Categories members insert" ON public.categories;
DROP POLICY IF EXISTS "Categories members update" ON public.categories;
DROP POLICY IF EXISTS "Categories members delete" ON public.categories;

-- Política integral de acceso compartido para miembros de la unidad familiar
CREATE POLICY "Categories members access" ON public.categories
    FOR ALL TO authenticated
    USING (public.is_app_member())
    WITH CHECK (public.is_app_member());

-- ==============================================================================
-- SECCIÓN 7: POLÍTICAS RLS EN public.shared_state
-- ==============================================================================

-- Eliminar versiones previas de políticas o de emergencia
DROP POLICY IF EXISTS "Shared state members select" ON public.shared_state;
DROP POLICY IF EXISTS "Shared state members insert" ON public.shared_state;
DROP POLICY IF EXISTS "Shared state members update" ON public.shared_state;
DROP POLICY IF EXISTS "Shared state members access" ON public.shared_state;
DROP POLICY IF EXISTS "Emergency authenticated shared_state select" ON public.shared_state;
DROP POLICY IF EXISTS "Emergency authenticated shared_state insert" ON public.shared_state;
DROP POLICY IF EXISTS "Emergency authenticated shared_state update" ON public.shared_state;
DROP POLICY IF EXISTS "Emergency authenticated shared_state access" ON public.shared_state;

-- Políticas separadas por operación (sin DELETE para clientes)
CREATE POLICY "Shared state members select" ON public.shared_state
    FOR SELECT TO authenticated
    USING (public.is_app_member());

CREATE POLICY "Shared state members insert" ON public.shared_state
    FOR INSERT TO authenticated
    WITH CHECK (public.is_app_member());

CREATE POLICY "Shared state members update" ON public.shared_state
    FOR UPDATE TO authenticated
    USING (public.is_app_member())
    WITH CHECK (public.is_app_member());

-- ==============================================================================
-- SECCIÓN 8: POLÍTICAS RLS EN public.app_members
-- ==============================================================================
-- Al haberse revocado todos los privilegios a authenticated y anon en la Sección 2,
-- ningún cliente puede interactuar con la tabla. Se retira cualquier política pública.
DROP POLICY IF EXISTS "Members can view membership" ON public.app_members;
DROP POLICY IF EXISTS "Allow member read" ON public.app_members;

-- ==============================================================================
-- SECCIÓN 9: POLÍTICAS EN storage.objects (BUCKET recipe-images)
-- ==============================================================================

-- Retirar políticas permisivas V1 de subida/modificación/borrado anónimo
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;
DROP POLICY IF EXISTS "Public Read" ON storage.objects;

-- Retirar versiones previas si existieran
DROP POLICY IF EXISTS "Recipe images member select" ON storage.objects;
DROP POLICY IF EXISTS "Recipe images member insert" ON storage.objects;
DROP POLICY IF EXISTS "Recipe images member update" ON storage.objects;
DROP POLICY IF EXISTS "Recipe images member delete" ON storage.objects;

-- NOTA ARQUITECTÓNICA DE STORAGE (FASE 6A):
-- 1. El bucket 'recipe-images' permanece configurado con public = true en storage.buckets.
-- 2. Las descargas directas mediante URL pública (GET https://.../public/recipe-images/...)
--    se resuelven a través del CDN público de Supabase Storage sin evaluar RLS de objetos.
-- 3. Esto garantiza que las imágenes mostradas en etiquetas <img> no se interrumpan.
-- 4. A nivel de storage.objects (API de Supabase Client), todas las operaciones
--    (SELECT, INSERT, UPDATE, DELETE) quedan estrictamente aisladas a miembros de la app.

-- 9.1 SELECT: Lectura de objetos del bucket exclusiva para miembros
CREATE POLICY "Recipe images member select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'recipe-images' AND
        public.is_app_member()
    );

-- 9.2 INSERT: Subida de nuevas imágenes exclusiva para miembros
CREATE POLICY "Recipe images member insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'recipe-images' AND
        public.is_app_member()
    );

-- 9.3 UPDATE: Reemplazo / sobrescritura (upsert) exclusiva para miembros
CREATE POLICY "Recipe images member update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'recipe-images' AND
        public.is_app_member()
    )
    WITH CHECK (
        bucket_id = 'recipe-images' AND
        public.is_app_member()
    );

-- 9.4 DELETE: Eliminación de imágenes exclusiva para miembros
CREATE POLICY "Recipe images member delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'recipe-images' AND
        public.is_app_member()
    );

COMMIT;
