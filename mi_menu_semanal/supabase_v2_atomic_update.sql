-- ==============================================================================
-- DRAFT / PREPARADO — NO EJECUTAR REMOTAMENTE HASTA AUTORIZACIÓN EXPRESA
-- Archivo: supabase_v2_atomic_update.sql
-- Objetivo: Función RPC atómica para actualización de shared_state con
--           Control Optimista de Concurrencia (OCC), validación en servidor,
--           aislamiento estricto (SECURITY INVOKER) y verificación temprana
--           de membresía.
-- ==============================================================================

BEGIN;

-- 1. Definición de la función de actualización atómica
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
SECURITY INVOKER -- Ejecuta con los permisos del llamador para respetar RLS (is_app_member)
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_version INTEGER;
    v_current_payload JSONB;
    v_updated_at TIMESTAMPTZ;
    v_elem JSONB;
BEGIN
    -- 0. Comprobación estricta de membresía antes de validar el payload o consultar la fila
    IF NOT public.is_app_member() THEN
        RAISE EXCEPTION 'Usuario no autorizado para modificar shared_state'
            USING ERRCODE = '42501';
    END IF;

    -- 1. Validar que la clave sea válida según la restricción de shared_state
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

-- 2. Revocación explícita a todos los roles antes de conceder privilegios mínimos
REVOKE ALL PRIVILEGES ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER)
FROM PUBLIC, anon, authenticated;

-- 3. Concesión exclusiva a usuarios autenticados (quienes además deben superar RLS)
GRANT EXECUTE ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER)
TO authenticated;

COMMENT ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER) IS
'Actualización atómica de shared_state con control optimista de concurrencia (OCC), verificación temprana de membresía y validación de tipos JSON en servidor.';

COMMIT;
