-- ==============================================================================
-- DRAFT / PREPARADO — NO EJECUTAR REMOTAMENTE HASTA AUTORIZACIÓN EXPRESA
-- Archivo: supabase_v2_atomic_update.sql
-- Objetivo: Función RPC atómica para actualización de shared_state con
--           Control Optimista de Concurrencia (OCC) y aislamiento estricto.
-- ==============================================================================

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
SET search_path = public
AS $$
DECLARE
    v_current_version INTEGER;
    v_current_payload JSONB;
    v_updated_at TIMESTAMPTZ;
BEGIN
    -- Validar que la clave sea válida según la restricción CHECK de shared_state
    IF p_key NOT IN ('planner', 'freezer', 'shopping_list', 'favorites') THEN
        RAISE EXCEPTION 'Clave de estado compartida no permitida: %', p_key;
    END IF;

    -- Bloqueo pesimista de fila durante la transacción para serializar escrituras concurrentes
    SELECT version, payload, shared_state.updated_at
    INTO v_current_version, v_current_payload, v_updated_at
    FROM public.shared_state
    WHERE state_key = p_key
    FOR UPDATE;

    -- Si la fila no existiera (no debería ocurrir tras etapa 4A)
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, NULL::JSONB, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    -- Comprobación estricta de OCC: solo actualiza si la versión coincide con la esperada
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

-- 2. Revocación de privilegios a roles anónimos y públicos
REVOKE ALL PRIVILEGES ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER)
FROM anon, PUBLIC;

-- 3. Concesión exclusiva a usuarios autenticados (quienes además deben pasar RLS)
GRANT EXECUTE ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER)
TO authenticated;

COMMENT ON FUNCTION public.update_shared_state(TEXT, JSONB, INTEGER) IS
'Actualización atómica de shared_state con control optimista de concurrencia (OCC) y verificación de versión.';
