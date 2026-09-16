-- scripts/inspect_schema_readonly.sql
-- ==============================================================================
-- Script de Introspección SOLO LECTURA para Supabase
-- Permite comparar el esquema y las políticas versionadas con las reales en producción.
-- NO MODIFICA DATOS, NO EJECUTA DDL Y NO MUESTRA DATOS PRIVADOS NI SECRETOS.
-- ==============================================================================

-- 1. Tablas y columnas públicas
SELECT 
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- 2. Estado de Row Level Security (RLS) en tablas públicas
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 3. Políticas RLS actualmente activas (en public y storage)
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

-- 4. Buckets de Storage configurados y sus restricciones
SELECT 
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 5. Conteo agregado de filas (verifica volumen sin exponer filas)
SELECT 'recipes' AS table_name, count(*) AS total_rows FROM public.recipes
UNION ALL
SELECT 'categories', count(*) FROM public.categories;
