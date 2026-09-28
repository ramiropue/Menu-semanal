-- supabase_v2_stage_6a_lockdown.sql
-- ==============================================================================
-- ETAPA 6A: CIERRE DE SEGURIDAD RLS Y PRIVATIZACIÓN DE ACCESO (FINAL HARDENED)
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
-- 3. MUTACIÓN EXCLUSIVA DE shared_state VÍA RPC ATÓMICO (OCC):
--    - authenticated tiene ÚNICAMENTE privilegio SELECT sobre public.shared_state.
--    - Se revocan totalmente INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES y TRIGGER
--      sobre shared_state a authenticated, anon y PUBLIC.
--    - La función public.update_shared_state() se convierte en SECURITY DEFINER
--      con search_path fijo (public, pg_temp), validación estricta de tipos JSON,
--      lista cerrada de claves, verificación de membresía y control optimista de versión.
--    - Cualquier intento de INSERT/UPDATE directo a shared_state devuelve 42501.
-- 4. UNIDAD FAMILIAR IGUALITARIA: Todos los miembros en public.app_members
--    tienen idénticos permisos sobre recetas, categorías y estado compartido.
-- 5. ALCANCE DE SECUENCIAS:
--    - Las tablas recipes y categories emplean identificadores TEXT generados en cliente;
--      no requieren secuencias. No se alteran secuencias ajenas al alcance.
-- 6. STORAGE PROTEGIDO (storage.objects):
--    - Políticas separadas por operación (SELECT, INSERT, UPDATE, DELETE) en recipe-images.
--    - Restricción estricta a bucket_id = 'recipe-images' AND public.is_app_member().
--    - Cero acceso a otros buckets.
--    - El bucket permanece con public = true a nivel de storage.buckets para no romper
--      las URLs públicas cargadas directamente en etiquetas <img> del frontend V2.
-- 7. JUSTIFICACIÓN TÉCNICA DE ROW LEVEL SECURITY (ENABLE vs FORCE):
--    - Los roles de cliente en Supabase ('anon' y 'authenticated') no son propietarios
--      de las tablas (el propietario es 'postgres') y no poseen el atributo BYPASSRLS.
--    - Por consiguiente, ENABLE ROW LEVEL SECURITY es 100% suficiente y estricto.
--    - Los roles administrativos con BYPASSRLS ('service_role', 'supabase_admin')
--      eluden RLS nativamente en PostgreSQL.
--    - Se omite FORCE ROW LEVEL SECURITY para no imponer filtrado RLS involuntario
--      al propietario ('postgres') en scripts de mantenimiento y migraciones administrativas.
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

-- Asegurar que el esquema public permite USAGE pero no CREATE para anon y authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM anon, authenticated, PUBLIC;

-- ==============================================================================
-- SECCIÓN 2: PRIVILEGIOS MÍNIMOS PARA ROL AUTENTICADO (authenticated)
-- ==============================================================================

-- Otorgar privilegios DML sobre recipes y categories (RLS filtrará fila a fila)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories TO authenticated;

-- ENDURECIMIENTO DE shared_state:
-- authenticated tiene ÚNICAMENTE privilegio SELECT sobre public.shared_state.
-- Prohibición absoluta de INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES y TRIGGER.
-- Cualquier mutación directa desde cliente resultará en error 42501.
REVOKE ALL PRIVILEGES ON TABLE public.shared_state FROM anon, authenticated, PUBLIC;
GRANT SELECT ON TABLE public.shared_state TO authenticated;

-- ENDURECIMIENTO DE app_members:
-- Revocación total de cualquier privilegio directo a authenticated, anon y PUBLIC.
-- La tabla es inaccesible desde clientes; la membresía se comprueba solo vía is_app_member().
REVOKE ALL PRIVILEGES ON TABLE public.app_members FROM anon, authenticated, PUBLIC;

-- ==============================================================================
-- SECCIÓN 3: FUNCIONES DE SEGURIDAD (is_app_member Y update_shared_state)
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

-- 3.2 Función de actualización atómica de shared_state con OCC (update_shared_state)
-- Convertida en SECURITY DEFINER para permitir la actualización de public.shared_state
-- sin conceder privilegios directos de UPDATE/INSERT al rol authenticated.
CREATE OR REPLACE FUNCTION public.update_shared_state(
    p_key TEXT,
    p_payload JSONB,
    p_expected_version INTEGER
)
RETURNS TABLE (
    success BOOLEAN,
    current_version INTEGER,
    current_payload JSONB,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER -- Ejecuta con privilegios del propietario (postgres) para actualizar shared_state
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_version INTEGER;
    v_current_payload JSONB;
    v_updated_at TIMESTAMPTZ;
    v_elem JSONB;
BEGIN
    -- 0. Comprobación estricta de membresía antes de procesar el payload o consultar la fila
    IF NOT public.is_app_member() THEN
        RAISE EXCEPTION 'Usuario no autorizado para modificar shared_state'
            USING ERRCODE = '42501';
    END IF;

    -- 1. Validar lista cerrada de claves permitidas
    IF p_key NOT IN ('planner', 'freezer', 'shopping_list', 'favorites') THEN
        RAISE EXCEPTION 'Clave de estado compartida no permitida: %', p_key;
    END IF;

    -- 2. Validación estricta de payloads en servidor
    IF p_payload IS NULL THEN
        RAISE EXCEPTION 'El payload no puede ser NULL para la clave: %', p_key;
    END IF;

    IF p_key = 'planner' THEN
        IF jsonb_typeof(p_payload) <> 'object' THEN
            RAISE EXCEPTION 'El payload para planner debe ser un objeto JSON (recibido %)', jsonb_typeof(p_payload);
        END IF;
    ELSE
        -- freezer, shopping_list y favorites deben ser arrays
        IF jsonb_typeof(p_payload) <> 'array' THEN
            RAISE EXCEPTION 'El payload para % debe ser un array JSON (recibido %)', p_key, jsonb_typeof(p_payload);
        END IF;

        -- favorites exige que cada elemento sea una cadena de texto (string)
        IF p_key = 'favorites' THEN
            FOR v_elem IN SELECT * FROM jsonb_array_elements(p_payload) LOOP
                IF jsonb_typeof(v_elem) <> 'string' THEN
                    RAISE EXCEPTION 'Todos los elementos de favorites deben ser cadenas de texto (recibido %)', jsonb_typeof(v_elem);
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 3. Bloqueo pesimista de fila durante la transacción para serializar escrituras concurrentes
    SELECT version, payload, shared_state.updated_at
    INTO v_current_version, v_current_payload, v_updated_at
    FROM public.shared_state
    WHERE state_key = p_key
    FOR UPDATE;

    -- Si la fila no existiera (error controlado P0002 en vez de falso conflicto)
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró la fila de estado compartido para la clave: %', p_key
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. Comprobación estricta de OCC: solo actualiza si la versión coincide con la esperada
    IF v_current_version = p_expected_version THEN
        UPDATE public.shared_state
        SET payload = p_payload,
            version = v_current_version + 1,
            updated_at = now(),
            updated_by = auth.uid()
        WHERE state_key = p_key
        RETURNING version, payload, shared_state.updated_at
        INTO v_current_version, v_current_payload, v_updated_at;

        RETURN QUERY SELECT TRUE, v_current_version, v_current_payload, v_updated_at;
    ELSE
        -- Conflicto detectado: versión remota es distinta a la esperada.
        -- Retorna success = FALSE junto con la versión y payload actuales para resolución del cliente.
        RETURN QUERY SELECT FALSE, v_current_version, v_current_payload, v_updated_at;
    END IF;
END;
$$;

-- Permisos sobre update_shared_state
REVOKE ALL PRIVILEGES ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER) TO authenticated;

-- ==============================================================================
-- SECCIÓN 4: HABILITACIÓN DE RLS EN TODAS LAS TABLAS PÚBLICAS
-- ==============================================================================
-- Justificación técnica de RLS (ENABLE vs FORCE):
-- 1. En Supabase, las conexiones de clientes se ejecutan como los roles de base
--    de datos 'anon' o 'authenticated'. Ninguno de estos roles es propietario
--    de las tablas (el propietario es 'postgres'), y ninguno posee el atributo BYPASSRLS.
-- 2. Por tanto, ENABLE ROW LEVEL SECURITY es 100% suficiente y estricto para
--    hacer cumplir las políticas RLS en todas las consultas de la aplicación.
-- 3. Los roles con atributo BYPASSRLS (como 'service_role' o 'supabase_admin')
--    eluden RLS por diseño nativo de PostgreSQL, independientemente de que se
--    aplique ENABLE o FORCE.
-- 4. La cláusula FORCE ROW LEVEL SECURITY sólo alteraría el comportamiento para
--    el propietario de la tabla ('postgres') cuando opere sin BYPASSRLS. Omitir FORCE
--    evita que scripts de mantenimiento, migraciones o funciones administrativas
--    sufran bloqueos o filtrados inesperados por falta de contexto JWT, sin reducir
--    en absoluto la seguridad de 'anon' y 'authenticated'.
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

-- Política exclusiva de lectura para miembros:
-- Las mutaciones quedan prohibidas a nivel de tabla (REVOKE DML) y se realizan
-- exclusivamente a través de la función SECURITY DEFINER public.update_shared_state().
CREATE POLICY "Shared state members select" ON public.shared_state
    FOR SELECT TO authenticated
    USING (public.is_app_member());

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
