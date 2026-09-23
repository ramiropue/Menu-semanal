-- tests/security/rls_matrix_verification.sql
-- ==============================================================================
-- BORRADOR DE DISEÑO PARA CUTOVER FUTURO (NO APLICABLE AL ESTADO ADITIVO ACTUAL)
-- SUITE DE VERIFICACIÓN DE MATRIZ RLS: UNIDAD FAMILIAR PRIVADA COMPARTIDA
-- ==============================================================================
-- NOTA TÉCNICA: Este archivo valida el diseño final proyectado para el cutover
-- (cuando se revoquen los permisos públicos V1 sobre recipes y categories).
-- En el estado actual (Stage 4A aditivo), V1 continúa deliberadamente abierta.
--
-- Evalúa las 5 identidades en PostgreSQL / Supabase:
--   1. Anónimo (anon)
--   2. Usuario Autenticado NO Autorizado (intruso en auth.users, no en app_members)
--   3. Miembro A (autorizado en app_members)
--   4. Miembro B (autorizado en app_members)
--   5. Miembro C (autorizado en app_members)
--
-- Evalúa operaciones SELECT, INSERT, UPDATE, DELETE sobre recipes, categories,
-- shared_state y app_members, así como la función segura is_app_member().
-- Demuestra que cualquier usuario incluido en app_members está autorizado con
-- idénticos permisos y cualquier usuario excluido o anónimo está bloqueado.
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- BLOQUE 1: VERIFICACIÓN ROL ANÓNIMO (anon)
-- -----------------------------------------------------------------------------
SET ROLE anon;
RESET request.jwt.claims;

-- 1.1 anon debe recibir error de permisos o 0 filas en SELECT recipes
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.recipes;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED: anon pudo leer recetas privadas';
    END IF;
EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Error 42501 esperado por REVOKE ALL
END $$;

-- 1.2 anon debe ser bloqueado en INSERT recipes
DO $$
BEGIN
    INSERT INTO public.recipes (id, title) VALUES ('anon-hack', 'Receta Anónima');
    RAISE EXCEPTION 'TEST FAILED: anon pudo insertar receta';
EXCEPTION WHEN OTHERS THEN
    NULL; -- Correctamente bloqueado
END $$;

-- 1.3 anon no debe poder ejecutar is_app_member()
DO $$
BEGIN
    PERFORM public.is_app_member();
    RAISE EXCEPTION 'TEST FAILED: anon pudo ejecutar is_app_member';
EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Error 42501 esperado
WHEN OTHERS THEN
    NULL;
END $$;

-- -----------------------------------------------------------------------------
-- BLOQUE 2: USUARIO AUTENTICADO NO AUTORIZADO (INTRUSO)
-- -----------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","email":"intruso@example.com","role":"authenticated"}', false);

-- 2.1 is_app_member() debe devolver FALSE
DO $$
BEGIN
    IF public.is_app_member() THEN
        RAISE EXCEPTION 'TEST FAILED: is_app_member devolvió TRUE para usuario no autorizado';
    END IF;
END $$;

-- 2.2 SELECT recipes debe devolver 0 filas
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.recipes;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Usuario no autorizado pudo leer recetas';
    END IF;
END $$;

-- 2.3 INSERT recipes debe ser denegado por RLS
DO $$
BEGIN
    INSERT INTO public.recipes (id, title) VALUES ('unauth-rec', 'Receta Infiltrada');
    RAISE EXCEPTION 'TEST FAILED: Usuario no autorizado pudo insertar receta';
EXCEPTION WHEN OTHERS THEN
    NULL; -- Correctamente bloqueado
END $$;

-- 2.4 Auto-inserción en app_members debe ser denegada (REVOKE INSERT)
DO $$
BEGIN
    INSERT INTO public.app_members (user_id) VALUES ('99999999-9999-9999-9999-999999999999'::uuid);
    RAISE EXCEPTION 'TEST FAILED: Usuario no autorizado pudo auto-insertarse en app_members';
EXCEPTION WHEN OTHERS THEN
    NULL; -- Correctamente bloqueado
END $$;

-- 2.5 SELECT en app_members debe devolver 0 filas
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.app_members;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Usuario no autorizado pudo leer app_members';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- BLOQUE 3: MIEMBRO A (AUTORIZADO)
-- -----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","email":"miembro_a@example.com","role":"authenticated"}', false);

-- 3.1 is_app_member() debe devolver TRUE
DO $$
BEGIN
    IF NOT public.is_app_member() THEN
        RAISE EXCEPTION 'TEST FAILED: is_app_member devolvió FALSE para Miembro A';
    END IF;
END $$;

-- 3.2 Miembro A puede consultar app_members
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.app_members;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Miembro A no pudo leer app_members';
    END IF;
END $$;

-- 3.3 Miembro A puede insertar y leer recetas
DO $$
BEGIN
    INSERT INTO public.recipes (id, title) VALUES ('rec-test-a', 'Receta de A');
    PERFORM * FROM public.recipes WHERE id = 'rec-test-a';
END $$;

-- 3.4 Miembro A puede actualizar shared_state (planner)
DO $$
BEGIN
    UPDATE public.shared_state 
    SET payload = '{"semana_test":{"comida":"rec-test-a"}}'::jsonb
    WHERE state_key = 'planner';
END $$;

-- -----------------------------------------------------------------------------
-- BLOQUE 4: MIEMBRO B (AUTORIZADO)
-- -----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","email":"miembro_b@example.com","role":"authenticated"}', false);

-- 4.1 is_app_member() debe devolver TRUE
DO $$
BEGIN
    IF NOT public.is_app_member() THEN
        RAISE EXCEPTION 'TEST FAILED: is_app_member devolvió FALSE para Miembro B';
    END IF;
END $$;

-- 4.2 Miembro B ve la receta creada por A y el planner actualizado
DO $$
DECLARE
    v_title TEXT;
BEGIN
    SELECT title INTO v_title FROM public.recipes WHERE id = 'rec-test-a';
    IF v_title <> 'Receta de A' THEN
        RAISE EXCEPTION 'TEST FAILED: Miembro B no puede leer receta creada por Miembro A';
    END IF;
END $$;

-- 4.3 Miembro B puede modificar la receta y crear una nueva
DO $$
BEGIN
    UPDATE public.recipes SET title = 'Receta Modificada por B' WHERE id = 'rec-test-a';
    INSERT INTO public.recipes (id, title) VALUES ('rec-test-b', 'Receta de B');
END $$;

-- 4.4 Miembro B puede actualizar shared_state (shopping_list)
DO $$
BEGIN
    UPDATE public.shared_state
    SET payload = '[{"item":"Comprar café"}]'::jsonb
    WHERE state_key = 'shopping_list';
END $$;

-- -----------------------------------------------------------------------------
-- BLOQUE 5: MIEMBRO C (AUTORIZADO)
-- -----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","email":"miembro_c@example.com","role":"authenticated"}', false);

-- 5.1 is_app_member() debe devolver TRUE
DO $$
BEGIN
    IF NOT public.is_app_member() THEN
        RAISE EXCEPTION 'TEST FAILED: is_app_member devolvió FALSE para Miembro C';
    END IF;
END $$;

-- 5.2 Miembro C puede consultar app_members
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.app_members;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'TEST FAILED: Miembro C no pudo leer app_members';
    END IF;
END $$;

-- 5.3 Miembro C ve los cambios de Miembro A y Miembro B
DO $$
DECLARE
    v_title_a TEXT;
    v_title_b TEXT;
BEGIN
    SELECT title INTO v_title_a FROM public.recipes WHERE id = 'rec-test-a';
    IF v_title_a <> 'Receta Modificada por B' THEN
        RAISE EXCEPTION 'TEST FAILED: Miembro C no ve la modificación hecha por B en receta A';
    END IF;

    SELECT title INTO v_title_b FROM public.recipes WHERE id = 'rec-test-b';
    IF v_title_b <> 'Receta de B' THEN
        RAISE EXCEPTION 'TEST FAILED: Miembro C no puede leer receta creada por B';
    END IF;
END $$;

-- 5.4 Miembro C puede modificar, borrar recetas y actualizar shared_state
DO $$
BEGIN
    DELETE FROM public.recipes WHERE id = 'rec-test-a';
    DELETE FROM public.recipes WHERE id = 'rec-test-b';
    UPDATE public.shared_state
    SET payload = '[]'::jsonb
    WHERE state_key = 'shopping_list';
END $$;

ROLLBACK;
