-- scripts/inspect_schema_readonly_stage6a.sql
-- ==============================================================================
-- ETAPA 6A-0: INTROSPECCIÓN REMOTA DE SOLO LECTURA (READ ONLY)
-- Menú Semanal V2: Auditoría de Seguridad de Supabase y Preparación de Cierre RLS
-- ==============================================================================
-- INSTRUCCIONES DE USO:
-- Ejecutar este script directamente en el SQL Editor de Supabase (Dashboard -> SQL Editor).
-- Este archivo contiene EXCLUSIVAMENTE consultas SELECT de metadatos de catálogo.
-- GARANTÍAS:
-- 1. CERO DDL / DML: No modifica, no crea, no borra tablas, políticas ni datos.
-- 2. CERO EXPOSICIÓN DE PRIVACIDAD: No expone correos, UUIDs, tokens ni datos personales.
-- 3. SOLO LECTURA: 100% seguro de ejecutar en producción.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLAS PÚBLICAS EXISTENTES
-- ------------------------------------------------------------------------------
SELECT
    table_schema,
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ------------------------------------------------------------------------------
-- 2. COLUMNAS, TIPOS, NULABILIDAD Y VALORES POR DEFECTO
-- ------------------------------------------------------------------------------
SELECT
    table_name,
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('recipes', 'categories', 'app_members', 'shared_state')
ORDER BY table_name, ordinal_position;

-- ------------------------------------------------------------------------------
-- 3. CONSTRAINTS, CLAVES PRIMARIAS, FORÁNEAS Y CHECKS
-- ------------------------------------------------------------------------------
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    rc.update_rule,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
    AND rc.constraint_schema = tc.table_schema
LEFT JOIN information_schema.check_constraints cc
    ON cc.constraint_name = tc.constraint_name
    AND cc.constraint_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('recipes', 'categories', 'app_members', 'shared_state')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ------------------------------------------------------------------------------
-- 4. ÍNDICES EXISTENTES
-- ------------------------------------------------------------------------------
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('recipes', 'categories', 'app_members', 'shared_state')
ORDER BY tablename, indexname;

-- ------------------------------------------------------------------------------
-- 5. ESTADO DE ROW LEVEL SECURITY (RLS) POR TABLA
-- ------------------------------------------------------------------------------
SELECT
    c.relname AS tablename,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- ------------------------------------------------------------------------------
-- 6. POLÍTICAS RLS ACTIVAS EN SCHEMAS PUBLIC Y STORAGE
-- ------------------------------------------------------------------------------
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual AS using_expression,
    with_check AS check_expression
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- ------------------------------------------------------------------------------
-- 7. PRIVILEGIOS EFECTIVOS DE TABLA POR ROL
-- (anon, authenticated, PUBLIC, service_role)
-- ------------------------------------------------------------------------------
SELECT
    grantee,
    table_schema,
    table_name,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('recipes', 'categories', 'app_members', 'shared_state')
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'service_role', 'postgres')
ORDER BY table_name, grantee, privilege_type;

-- ------------------------------------------------------------------------------
-- 8. PRIVILEGIOS POR DEFECTO DEL ESQUEMA PUBLIC
-- ------------------------------------------------------------------------------
SELECT
    pg_get_userbyid(d.defaclrole) AS granter,
    CASE d.defaclobjtype
        WHEN 'r' THEN 'tables'
        WHEN 'S' THEN 'sequences'
        WHEN 'f' THEN 'functions'
        WHEN 'T' THEN 'types'
        WHEN 's' THEN 'schemas'
    END AS object_type,
    n.nspname AS schema_name,
    d.defaclacl AS acl_entries
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' OR d.defaclnamespace = 0;

-- ------------------------------------------------------------------------------
-- 8B. SECUENCIAS EXISTENTES Y PRIVILEGIOS AUXILIARES EN EL ESQUEMA PUBLIC
-- ------------------------------------------------------------------------------
-- Listado de secuencias en public
SELECT
    sequence_schema,
    sequence_name,
    data_type,
    start_value,
    minimum_value,
    maximum_value,
    increment
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

-- Columnas de tablas públicas que utilizan nextval() como valor por defecto
SELECT
    table_name,
    column_name,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_default LIKE 'nextval(%'
ORDER BY table_name, column_name;

-- Privilegios de uso sobre secuencias en public
SELECT
    grantee,
    object_schema,
    object_name AS sequence_name,
    privilege_type
FROM information_schema.usage_privileges
WHERE object_schema = 'public'
  AND object_type = 'SEQUENCE'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'service_role', 'postgres')
ORDER BY sequence_name, grantee;

-- ------------------------------------------------------------------------------
-- 9. ESPECIFICACIÓN Y PERMISOS DE FUNCIONES: is_app_member y update_shared_state
-- ------------------------------------------------------------------------------
SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_userbyid(p.proowner) AS function_owner,
    p.prosecdef AS is_security_definer,
    p.provolatile AS volatility,
    proconfig AS search_path_config,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_app_member', 'update_shared_state');

-- Permisos EXECUTE sobre funciones
SELECT
    routine_schema,
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('is_app_member', 'update_shared_state')
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'service_role')
ORDER BY routine_name, grantee;

-- ------------------------------------------------------------------------------
-- 10. ESTADO Y CONFIGURACIÓN DEL BUCKET 'recipe-images'
-- ------------------------------------------------------------------------------
SELECT
    id,
    name,
    owner,
    public,
    file_size_limit,
    allowed_mime_types,
    created_at,
    updated_at
FROM storage.buckets
WHERE id = 'recipe-images';

-- Políticas de Storage sobre storage.objects
SELECT
    policyname,
    permissive,
    roles,
    cmd,
    qual AS using_expression,
    with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- ------------------------------------------------------------------------------
-- 11. CONTEOS ACTUALES DE FILAS Y OBJETOS (SIN EXPOSICIÓN DE CONTENIDO PRIVADO)
-- ------------------------------------------------------------------------------
SELECT 'public.recipes' AS resource_name, count(*) AS total_count FROM public.recipes
UNION ALL
SELECT 'public.categories', count(*) FROM public.categories
UNION ALL
SELECT 'public.app_members', count(*) FROM public.app_members
UNION ALL
SELECT 'public.shared_state', count(*) FROM public.shared_state
UNION ALL
SELECT 'storage.objects (recipe-images)', count(*) FROM storage.objects WHERE bucket_id = 'recipe-images';

-- ------------------------------------------------------------------------------
-- 12. DISTRIBUCIÓN DE REFERENCIAS A IMÁGENES EN public.recipes
-- ------------------------------------------------------------------------------
SELECT
    count(*) AS total_recipes,
    count(*) FILTER (WHERE image IS NULL OR trim(image) = '') AS null_or_empty_count,
    count(*) FILTER (WHERE image LIKE '%/storage/v1/object/public/recipe-images/%') AS supabase_full_url_count,
    count(*) FILTER (WHERE (image LIKE 'http://%' OR image LIKE 'https://%') AND image NOT LIKE '%/storage/v1/object/public/recipe-images/%') AS external_url_count,
    count(*) FILTER (WHERE image IS NOT NULL AND trim(image) <> '' AND image NOT LIKE 'http://%' AND image NOT LIKE 'https://%') AS internal_path_count
FROM public.recipes;

-- ------------------------------------------------------------------------------
-- 13. FILAS V1 ESPECIALES EN categories (SOLO ID Y CONTEO, SIN PAYLOADS)
-- ------------------------------------------------------------------------------
SELECT
    id,
    count(*) AS occurrences
FROM public.categories
WHERE id LIKE '_%_STATE_'
GROUP BY id
ORDER BY id;
