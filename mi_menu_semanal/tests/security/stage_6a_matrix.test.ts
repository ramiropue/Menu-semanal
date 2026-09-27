import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Stage 6A Supabase Lockdown Security Matrix Verification (Hardened)', () => {
  let db: PGlite;

  const memberA_id = 'a0000000-0000-0000-0000-000000000001';
  const memberB_id = 'b0000000-0000-0000-0000-000000000002';
  const memberC_id = 'c0000000-0000-0000-0000-000000000003';
  const intruder_id = '99999999-9999-9999-9999-999999999999';

  async function asSession(role: string, userId: string | null = null, email: string | null = null) {
    await db.exec(`SET ROLE ${role};`);
    if (userId) {
      const claims = JSON.stringify({
        sub: userId,
        email: email || `${userId}@example.com`,
        role: role,
      });
      await db.exec(`SELECT set_config('request.jwt.claims', '${claims}', false);`);
    } else {
      await db.exec(`SELECT set_config('request.jwt.claims', '', false);`);
    }
  }

  beforeEach(async () => {
    db = new PGlite();

    // 1. Setup Auth and Postgres roles
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE,
          created_at TIMESTAMPTZ DEFAULT now()
      );

      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
              CREATE ROLE anon;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
              CREATE ROLE authenticated;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
              CREATE ROLE service_role;
          END IF;
      END
      $$;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
          SELECT coalesce(
              nullif(current_setting('request.jwt.claim.sub', true), ''),
              (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
          )::uuid;
      $$;

      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;

      -- 2. Storage simulation
      CREATE SCHEMA IF NOT EXISTS storage;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated;
      CREATE TABLE IF NOT EXISTS storage.buckets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          owner UUID,
          public BOOLEAN DEFAULT false,
          file_size_limit BIGINT,
          allowed_mime_types TEXT[],
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          bucket_id TEXT REFERENCES storage.buckets(id),
          name TEXT,
          owner UUID,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          last_accessed_at TIMESTAMPTZ DEFAULT now(),
          metadata JSONB
      );
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON storage.objects TO authenticated, service_role;

      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES
          ('recipe-images', 'recipe-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
          ('other-bucket', 'other-bucket', false, 5242880, ARRAY['image/jpeg'])
      ON CONFLICT (id) DO NOTHING;

      -- 3. Base public tables (IDs are client-generated TEXT, zero sequence dependency)

      CREATE TABLE IF NOT EXISTS public.recipes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          image TEXT,
          category_id TEXT,
          is_draft BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT,
          sort_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS public.app_members (
          user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.shared_state (
          state_key TEXT PRIMARY KEY CHECK (state_key IN ('planner', 'freezer', 'shopping_list', 'favorites')),
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
      );

      -- Populate initial data
      INSERT INTO auth.users (id, email) VALUES
          ('${memberA_id}', 'member_a@example.com'),
          ('${memberB_id}', 'member_b@example.com'),
          ('${memberC_id}', 'member_c@example.com'),
          ('${intruder_id}', 'intruder@example.com');

      INSERT INTO public.app_members (user_id) VALUES
          ('${memberA_id}'),
          ('${memberB_id}'),
          ('${memberC_id}');

      INSERT INTO public.categories (id, name, sort_order) VALUES
          ('cat-1', 'Comida', 1),
          ('_PLANNER_STATE_', '{"legacy": true}', 99);

      INSERT INTO public.recipes (id, title, image) VALUES
          ('rec-initial-1', 'Tortilla de Patatas', 'https://cazmqxoignkpskmcuxyg.supabase.co/storage/v1/object/public/recipe-images/sample.jpg');

      INSERT INTO public.shared_state (state_key, payload, version) VALUES
          ('planner', '{"lun": "rec-initial-1"}'::jsonb, 1),
          ('freezer', '[]'::jsonb, 1),
          ('shopping_list', '[]'::jsonb, 1),
          ('favorites', '[]'::jsonb, 1);

      INSERT INTO storage.objects (bucket_id, name) VALUES
          ('recipe-images', 'sample.jpg'),
          ('other-bucket', 'confidential.pdf');
    `);

    // Load atomic update RPC
    const atomicSql = fs.readFileSync(path.resolve(__dirname, '../../supabase_v2_atomic_update.sql'), 'utf8');
    await db.exec(atomicSql);

    // Apply the Stage 6A hardened lockdown migration
    const lockdownSql = fs.readFileSync(path.resolve(__dirname, '../../supabase_v2_stage_6a_lockdown.sql'), 'utf8');
    await db.exec(lockdownSql);
  });

  // ---------------------------------------------------------------------------
  // 1. ROL ANÓNIMO (anon)
  // ---------------------------------------------------------------------------
  describe('Rol Anónimo (anon)', () => {
    beforeEach(async () => {
      await asSession('anon');
    });

    it('bloquea SELECT en public.recipes con error 42501 (insufficient_privilege)', async () => {
      await expect(db.query('SELECT * FROM public.recipes')).rejects.toThrow();
    });

    it('bloquea INSERT en public.recipes con error 42501', async () => {
      await expect(
        db.query("INSERT INTO public.recipes (id, title) VALUES ('anon-hack', 'Receta Anónima')")
      ).rejects.toThrow();
    });

    it('bloquea UPDATE en public.recipes con error 42501', async () => {
      await expect(
        db.query("UPDATE public.recipes SET title = 'Hacked' WHERE id = 'rec-initial-1'")
      ).rejects.toThrow();
    });

    it('bloquea DELETE en public.recipes con error 42501', async () => {
      await expect(
        db.query("DELETE FROM public.recipes WHERE id = 'rec-initial-1'")
      ).rejects.toThrow();
    });

    it('bloquea SELECT en public.categories con error 42501', async () => {
      await expect(db.query('SELECT * FROM public.categories')).rejects.toThrow();
    });

    it('bloquea SELECT en public.shared_state con error 42501', async () => {
      await expect(db.query('SELECT * FROM public.shared_state')).rejects.toThrow();
    });

    it('bloquea INSERT directo en public.shared_state con error 42501', async () => {
      await expect(
        db.query("INSERT INTO public.shared_state (state_key, payload) VALUES ('planner', '{}'::jsonb)")
      ).rejects.toThrow();
    });

    it('bloquea UPDATE directo en public.shared_state con error 42501', async () => {
      await expect(
        db.query("UPDATE public.shared_state SET payload = '{}'::jsonb WHERE state_key = 'planner'")
      ).rejects.toThrow();
    });

    it('bloquea DELETE directo en public.shared_state con error 42501', async () => {
      await expect(
        db.query("DELETE FROM public.shared_state WHERE state_key = 'planner'")
      ).rejects.toThrow();
    });

    it('bloquea SELECT en public.app_members con error 42501', async () => {
      await expect(db.query('SELECT * FROM public.app_members')).rejects.toThrow();
    });

    it('bloquea ejecución de is_app_member() con error 42501', async () => {
      await expect(db.query('SELECT public.is_app_member()')).rejects.toThrow();
    });

    it('bloquea ejecución de update_shared_state() con error 42501', async () => {
      await expect(
        db.query("SELECT * FROM public.update_shared_state('planner', '{}'::jsonb, 1)")
      ).rejects.toThrow();
    });

    it('bloquea subida de objetos en storage.objects', async () => {
      await expect(
        db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('recipe-images', 'anon.jpg')")
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. USUARIO AUTENTICADO NO MIEMBRO (Intruso)
  // ---------------------------------------------------------------------------
  describe('Usuario Autenticado NO Miembro', () => {
    beforeEach(async () => {
      await asSession('authenticated', intruder_id, 'intruder@example.com');
    });

    it('is_app_member() devuelve FALSE sin errores', async () => {
      const res = await db.query<{ is_app_member: boolean }>('SELECT public.is_app_member()');
      expect(res.rows[0].is_app_member).toBe(false);
    });

    it('SELECT en recipes devuelve exactamente 0 filas', async () => {
      const res = await db.query('SELECT * FROM public.recipes');
      expect(res.rows.length).toBe(0);
    });

    it('INSERT en recipes es denegado por RLS WITH CHECK', async () => {
      await expect(
        db.query("INSERT INTO public.recipes (id, title) VALUES ('intruder-1', 'Receta Intruso')")
      ).rejects.toThrow();
    });

    it('UPDATE en recipes no afecta ninguna fila', async () => {
      const res = await db.query("UPDATE public.recipes SET title = 'Hacked' WHERE id = 'rec-initial-1'");
      expect(res.affectedRows).toBe(0);
    });

    it('DELETE en recipes no afecta ninguna fila', async () => {
      const res = await db.query("DELETE FROM public.recipes WHERE id = 'rec-initial-1'");
      expect(res.affectedRows).toBe(0);
    });

    it('SELECT en categories devuelve exactamente 0 filas', async () => {
      const res = await db.query('SELECT * FROM public.categories');
      expect(res.rows.length).toBe(0);
    });

    it('SELECT en shared_state devuelve exactamente 0 filas por RLS', async () => {
      const res = await db.query('SELECT * FROM public.shared_state');
      expect(res.rows.length).toBe(0);
    });

    it('INSERT directo en shared_state es denegado con error 42501 (sin privilegios de tabla)', async () => {
      await expect(
        db.query("INSERT INTO public.shared_state (state_key, payload) VALUES ('planner', '{}'::jsonb)")
      ).rejects.toThrow();
    });

    it('UPDATE directo en shared_state es denegado con error 42501 (sin privilegios de tabla)', async () => {
      await expect(
        db.query("UPDATE public.shared_state SET payload = '{}'::jsonb WHERE state_key = 'planner'")
      ).rejects.toThrow();
    });

    it('DELETE directo en shared_state es denegado con error 42501 (sin privilegios de tabla)', async () => {
      await expect(
        db.query("DELETE FROM public.shared_state WHERE state_key = 'planner'")
      ).rejects.toThrow();
    });

    it('update_shared_state() RPC lanza excepción 42501 (Usuario no autorizado)', async () => {
      await expect(
        db.query("SELECT * FROM public.update_shared_state('planner', '{}'::jsonb, 1)")
      ).rejects.toThrow(/Usuario no autorizado/);
    });

    it('SELECT en app_members es denegado con error 42501 (privilegios revocados a authenticated)', async () => {
      await expect(db.query('SELECT * FROM public.app_members')).rejects.toThrow();
    });

    it('Auto-inserción en app_members es denegada con error 42501', async () => {
      await expect(
        db.query(`INSERT INTO public.app_members (user_id) VALUES ('${intruder_id}')`)
      ).rejects.toThrow();
    });

    it('storage.objects INSERT en recipe-images es denegado por RLS', async () => {
      await expect(
        db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('recipe-images', 'hack.jpg')")
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MIEMBROS AUTORIZADOS (A, B, C) - PARIDAD, MUTACIÓN RESTRINGIDA Y RPC OCC
  // ---------------------------------------------------------------------------
  describe('Miembros Autorizados (Unidad Familiar Privada)', () => {
    it('Miembro A: SELECT permitido, mutación directa denegada (42501), RPC atómica permitida', async () => {
      await asSession('authenticated', memberA_id, 'member_a@example.com');

      // 1. is_app_member() funciona vía SECURITY DEFINER
      const memberCheck = await db.query<{ is_app_member: boolean }>('SELECT public.is_app_member()');
      expect(memberCheck.rows[0].is_app_member).toBe(true);

      // 2. Consulta directa a app_members es DENEGADA (42501)
      await expect(db.query('SELECT * FROM public.app_members')).rejects.toThrow();

      // 3. Mutación en app_members es DENEGADA (42501)
      await expect(
        db.query(`INSERT INTO public.app_members (user_id) VALUES ('${intruder_id}')`)
      ).rejects.toThrow();

      // 4. Consulta y creación de recetas funciona SIN secuencias (ID de texto cliente)
      const recs = await db.query('SELECT * FROM public.recipes');
      expect(recs.rows.length).toBeGreaterThanOrEqual(1);

      await db.query("INSERT INTO public.recipes (id, title) VALUES ('rec-a-1', 'Gazpacho de Miembro A')");
      const checkA = await db.query<{ title: string }>("SELECT title FROM public.recipes WHERE id = 'rec-a-1'");
      expect(checkA.rows[0].title).toBe('Gazpacho de Miembro A');

      // 5. SELECT sobre public.shared_state PERMITIDO
      const stateRows = await db.query<{ state_key: string; version: number }>(
        "SELECT state_key, version FROM public.shared_state WHERE state_key = 'planner'"
      );
      expect(stateRows.rows.length).toBe(1);
      expect(stateRows.rows[0].version).toBe(1);

      // 6. Mutaciones directas sobre public.shared_state DENEGADAS con 42501
      await expect(
        db.query("INSERT INTO public.shared_state (state_key, payload) VALUES ('planner', '{}'::jsonb)")
      ).rejects.toThrow();

      await expect(
        db.query("UPDATE public.shared_state SET payload = '{\"hacked\": true}'::jsonb WHERE state_key = 'planner'")
      ).rejects.toThrow();

      await expect(
        db.query("DELETE FROM public.shared_state WHERE state_key = 'planner'")
      ).rejects.toThrow();

      // 7. Actualización atómica de shared_state exclusivamente vía RPC
      const rpcRes = await db.query<{ success: boolean; current_version: number; current_payload: unknown }>(
        "SELECT * FROM public.update_shared_state('planner', '{\"lun\": \"rec-a-1\"}'::jsonb, 1)"
      );
      expect(rpcRes.rows[0].success).toBe(true);
      expect(rpcRes.rows[0].current_version).toBe(2);
      expect(rpcRes.rows[0].current_payload).toEqual({ lun: 'rec-a-1' });

      // 8. Subir imagen a recipe-images
      await db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('recipe-images', 'gazpacho.jpg')");
      const imgRes = await db.query<{ name: string }>("SELECT name FROM storage.objects WHERE bucket_id = 'recipe-images'");
      expect(imgRes.rows.some((r) => r.name === 'gazpacho.jpg')).toBe(true);
    });

    it('Miembro B: paridad total, mutación directa denegada, mutación RPC permitida', async () => {
      // Setup estado previo como A
      await asSession('authenticated', memberA_id, 'member_a@example.com');
      await db.query("INSERT INTO public.recipes (id, title) VALUES ('rec-shared-1', 'Receta Base')");

      // Conmutar a Miembro B
      await asSession('authenticated', memberB_id, 'member_b@example.com');
      const memberCheck = await db.query<{ is_app_member: boolean }>('SELECT public.is_app_member()');
      expect(memberCheck.rows[0].is_app_member).toBe(true);

      // B tampoco puede listar app_members
      await expect(db.query('SELECT * FROM public.app_members')).rejects.toThrow();

      // B ve la receta creada por A y la modifica
      const readRes = await db.query<{ title: string }>("SELECT title FROM public.recipes WHERE id = 'rec-shared-1'");
      expect(readRes.rows[0].title).toBe('Receta Base');

      await db.query("UPDATE public.recipes SET title = 'Receta Modificada por B' WHERE id = 'rec-shared-1'");
      const modRes = await db.query<{ title: string }>("SELECT title FROM public.recipes WHERE id = 'rec-shared-1'");
      expect(modRes.rows[0].title).toBe('Receta Modificada por B');

      // B tiene SELECT sobre shared_state pero mutación directa denegada
      const stateB = await db.query('SELECT * FROM public.shared_state');
      expect(stateB.rows.length).toBe(4);

      await expect(
        db.query("UPDATE public.shared_state SET payload = '[]'::jsonb WHERE state_key = 'shopping_list'")
      ).rejects.toThrow();

      // B actualiza shopping_list vía RPC con OCC
      const rpcRes = await db.query<{ success: boolean; current_version: number }>(
        "SELECT * FROM public.update_shared_state('shopping_list', '[{\"item\": \"Tomates\"}]'::jsonb, 1)"
      );
      expect(rpcRes.rows[0].success).toBe(true);
      expect(rpcRes.rows[0].current_version).toBe(2);
    });

    it('Miembro C: permisos idénticos, mutación directa denegada, bloqueo de app_members', async () => {
      await asSession('authenticated', memberC_id, 'member_c@example.com');

      const memberCheck = await db.query<{ is_app_member: boolean }>('SELECT public.is_app_member()');
      expect(memberCheck.rows[0].is_app_member).toBe(true);

      // C tampoco puede listar app_members
      await expect(db.query('SELECT * FROM public.app_members')).rejects.toThrow();

      // NO puede insertar ni borrar en app_members
      await expect(
        db.query(`INSERT INTO public.app_members (user_id) VALUES ('${intruder_id}')`)
      ).rejects.toThrow();

      await expect(
        db.query(`DELETE FROM public.app_members WHERE user_id = '${memberA_id}'`)
      ).rejects.toThrow();

      // C no puede mutar directamente shared_state
      await expect(
        db.query("UPDATE public.shared_state SET payload = '[]'::jsonb WHERE state_key = 'favorites'")
      ).rejects.toThrow();

      // C actualiza favorites vía RPC con OCC
      const rpcRes = await db.query<{ success: boolean; current_version: number }>(
        "SELECT * FROM public.update_shared_state('favorites', '[\"rec-initial-1\"]'::jsonb, 1)"
      );
      expect(rpcRes.rows[0].success).toBe(true);
      expect(rpcRes.rows[0].current_version).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 3.1 CONTRATOS DE update_shared_state() (OCC, TIPADO, ATOMICIDAD, DEFINER)
  // ---------------------------------------------------------------------------
  describe('Contratos de update_shared_state() (OCC, Tipos, Atomicidad y Metadatos)', () => {
    it('verifica en el catálogo que la función tiene SECURITY DEFINER, search_path fijo y propietario postgres', async () => {
      await db.exec('SET ROLE postgres;');
      await db.exec("SELECT set_config('request.jwt.claims', '', false);");

      const procInfo = await db.query<{
        prosecdef: boolean;
        proconfig: string[] | null;
        owner_name: string;
      }>(`
        SELECT p.prosecdef, p.proconfig, r.rolname as owner_name
        FROM pg_proc p
        JOIN pg_roles r ON p.proowner = r.oid
        WHERE p.proname = 'update_shared_state';
      `);

      expect(procInfo.rows.length).toBe(1);
      expect(procInfo.rows[0].prosecdef).toBe(true); // SECURITY DEFINER
      expect(procInfo.rows[0].owner_name).toBe('postgres'); // Propietario administrativo controlado
      const configStr = (procInfo.rows[0].proconfig || []).join(',');
      expect(configStr).toContain('search_path=public, pg_temp'); // search_path seguro
    });

    it('verifica permisos exactos en catálogo: anon = sin execute, authenticated = con execute', async () => {
      await db.exec('SET ROLE postgres;');
      await db.exec("SELECT set_config('request.jwt.claims', '', false);");

      const privCheck = await db.query<{
        anon_exec: boolean;
        auth_exec: boolean;
      }>(`
        SELECT
          has_function_privilege('anon', 'public.update_shared_state(text,jsonb,integer)', 'EXECUTE') as anon_exec,
          has_function_privilege('authenticated', 'public.update_shared_state(text,jsonb,integer)', 'EXECUTE') as auth_exec;
      `);

      expect(privCheck.rows[0].anon_exec).toBe(false);
      expect(privCheck.rows[0].auth_exec).toBe(true);
    });

    it('actualización con versión esperada correcta incrementa la versión una sola vez', async () => {
      await asSession('authenticated', memberA_id, 'member_a@example.com');

      // Estado inicial freezer tiene versión 1
      const initial = await db.query<{ version: number }>(
        "SELECT version FROM public.shared_state WHERE state_key = 'freezer'"
      );
      expect(initial.rows[0].version).toBe(1);

      // Actualizar con versión esperada 1
      const res = await db.query<{ success: boolean; current_version: number }>(
        "SELECT * FROM public.update_shared_state('freezer', '[{\"item\": \"Pollo congelado\"}]'::jsonb, 1)"
      );

      expect(res.rows[0].success).toBe(true);
      expect(res.rows[0].current_version).toBe(2);

      // Verificación directa en tabla de que la versión es exactamente 2
      const after = await db.query<{ version: number; payload: unknown }>(
        "SELECT version, payload FROM public.shared_state WHERE state_key = 'freezer'"
      );
      expect(after.rows[0].version).toBe(2);
      expect(after.rows[0].payload).toEqual([{ item: 'Pollo congelado' }]);
    });

    it('versión obsoleta produce conflicto (success = false) sin modificar el payload ni la versión', async () => {
      await asSession('authenticated', memberA_id, 'member_a@example.com');

      // Avanzamos 'freezer' a versión 2
      await db.query(
        "SELECT * FROM public.update_shared_state('freezer', '[{\"item\": \"Helado\"}]'::jsonb, 1)"
      );

      // Ahora otro cliente con versión obsoleta (esperando 1 en vez de 2) intenta actualizar
      const conflictRes = await db.query<{
        success: boolean;
        current_version: number;
        current_payload: unknown;
      }>(
        "SELECT * FROM public.update_shared_state('freezer', '[{\"item\": \"Sobrescritura Inválida\"}]'::jsonb, 1)"
      );

      // Debe retornar success = false con la versión actual (2) y payload actual intacto
      expect(conflictRes.rows[0].success).toBe(false);
      expect(conflictRes.rows[0].current_version).toBe(2);
      expect(conflictRes.rows[0].current_payload).toEqual([{ item: 'Helado' }]);

      // Verificar en la tabla que NO cambió la versión ni el payload
      const checkState = await db.query<{ version: number; payload: unknown }>(
        "SELECT version, payload FROM public.shared_state WHERE state_key = 'freezer'"
      );
      expect(checkState.rows[0].version).toBe(2);
      expect(checkState.rows[0].payload).toEqual([{ item: 'Helado' }]);
    });

    it('rechaza claves desconocidas ajenas a la lista cerrada permitida', async () => {
      await asSession('authenticated', memberA_id, 'member_a@example.com');

      await expect(
        db.query("SELECT * FROM public.update_shared_state('clave_maliciosa', '{}'::jsonb, 1)")
      ).rejects.toThrow(/Clave de estado compartida no permitida/);
    });

    it('rechaza payloads inválidos según el tipo exigido por clave', async () => {
      await asSession('authenticated', memberA_id, 'member_a@example.com');

      // planner exige objeto JSON, no array
      await expect(
        db.query("SELECT * FROM public.update_shared_state('planner', '[]'::jsonb, 1)")
      ).rejects.toThrow(/El payload para planner debe ser un objeto JSON/);

      // shopping_list exige array, no objeto
      await expect(
        db.query("SELECT * FROM public.update_shared_state('shopping_list', '{\"item\": 1}'::jsonb, 1)")
      ).rejects.toThrow(/El payload para shopping_list debe ser un array JSON/);

      // favorites exige array de strings
      await expect(
        db.query("SELECT * FROM public.update_shared_state('favorites', '[123, 456]'::jsonb, 1)")
      ).rejects.toThrow(/Todos los elementos de favorites deben ser cadenas de texto/);
    });

    it('fallo dentro de la función o transacción no produce actualización parcial ni incrementa versión', async () => {
      await asSession('authenticated', memberA_id, 'member_a@example.com');

      // Comprobar estado inicial de favorites
      const initFav = await db.query<{ version: number; payload: unknown }>(
        "SELECT version, payload FROM public.shared_state WHERE state_key = 'favorites'"
      );
      const initVer = initFav.rows[0].version;

      // Intentar actualización con payload que contiene un elemento inválido en medio
      await expect(
        db.query("SELECT * FROM public.update_shared_state('favorites', '[\"rec-1\", 999]'::jsonb, 1)")
      ).rejects.toThrow(/Todos los elementos de favorites deben ser cadenas de texto/);

      // Verificar que el estado no sufrió mutación parcial
      const postFav = await db.query<{ version: number; payload: unknown }>(
        "SELECT version, payload FROM public.shared_state WHERE state_key = 'favorites'"
      );
      expect(postFav.rows[0].version).toBe(initVer);
      expect(postFav.rows[0].payload).toEqual(initFav.rows[0].payload);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. AISLAMIENTO ESTRICTO DE STORAGE (recipe-images vs other-bucket)
  // ---------------------------------------------------------------------------
  describe('Aislamiento de Storage (recipe-images vs other-bucket)', () => {
    it('Miembro A puede realizar CRUD completo en recipe-images', async () => {
      await asSession('authenticated', memberA_id, 'member_a@example.com');

      // INSERT en recipe-images
      await db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('recipe-images', 'foto-1.jpg')");

      // SELECT en recipe-images
      const selRes = await db.query<{ name: string }>(
        "SELECT name FROM storage.objects WHERE bucket_id = 'recipe-images' AND name = 'foto-1.jpg'"
      );
      expect(selRes.rows.length).toBe(1);

      // UPDATE en recipe-images (simulación de upsert/reemplazo)
      const updRes = await db.query(
        "UPDATE storage.objects SET metadata = '{\"updated\": true}'::jsonb WHERE bucket_id = 'recipe-images' AND name = 'foto-1.jpg'"
      );
      expect(updRes.affectedRows).toBe(1);

      // DELETE en recipe-images
      const delRes = await db.query(
        "DELETE FROM storage.objects WHERE bucket_id = 'recipe-images' AND name = 'foto-1.jpg'"
      );
      expect(delRes.affectedRows).toBe(1);
    });

    it('Miembro A tiene acceso DENEGADO a cualquier otro bucket (other-bucket)', async () => {
      await asSession('authenticated', memberA_id, 'member_a@example.com');

      // INSERT en other-bucket es bloqueado por RLS WITH CHECK
      await expect(
        db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('other-bucket', 'infiltrado.jpg')")
      ).rejects.toThrow();

      // SELECT en other-bucket devuelve exactamente 0 filas
      const selOther = await db.query("SELECT * FROM storage.objects WHERE bucket_id = 'other-bucket'");
      expect(selOther.rows.length).toBe(0);

      // UPDATE en other-bucket no afecta ninguna fila
      const updOther = await db.query(
        "UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'other-bucket'"
      );
      expect(updOther.affectedRows).toBe(0);

      // DELETE en other-bucket no afecta ninguna fila
      const delOther = await db.query(
        "DELETE FROM storage.objects WHERE bucket_id = 'other-bucket'"
      );
      expect(delOther.affectedRows).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. SERVICE ROLE (Capacidad Administrativa de Servidor)
  // ---------------------------------------------------------------------------
  describe('Service Role (Capacidad Administrativa de Servidor)', () => {
    it('service_role / postgres tiene acceso total para mantenimiento y alta de usuarios', async () => {
      await db.exec('SET ROLE postgres;');
      await db.exec("SELECT set_config('request.jwt.claims', '', false);");

      // Superuser / service_role SÍ puede consultar y modificar app_members
      const newUserId = 'd0000000-0000-0000-0000-000000000004';
      await db.query(`INSERT INTO auth.users (id, email) VALUES ('${newUserId}', 'new_member@example.com')`);
      await db.query(`INSERT INTO public.app_members (user_id) VALUES ('${newUserId}')`);

      const res = await db.query<{ count: string | number }>('SELECT count(*) FROM public.app_members');
      expect(Number(res.rows[0].count)).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. IDEMPOTENCIA Y VERIFICACIÓN DE ROLLBACK SEGURO
  // ---------------------------------------------------------------------------
  describe('Idempotencia de Lockdown y Rollback Seguro', () => {
    it('la migración de lockdown es 100% idempotente (puede ejecutarse dos veces sin error)', async () => {
      await db.exec('SET ROLE postgres;');
      await db.exec("SELECT set_config('request.jwt.claims', '', false);");
      const lockdownSql = fs.readFileSync(path.resolve(__dirname, '../../supabase_v2_stage_6a_lockdown.sql'), 'utf8');
      await expect(db.exec(lockdownSql)).resolves.not.toThrow();
    });

    it('el bucket recipe-images permanece con public = true tras lockdown', async () => {
      const bucketCheck = await db.query<{ public: boolean }>(
        "SELECT public FROM storage.buckets WHERE id = 'recipe-images'"
      );
      expect(bucketCheck.rows[0].public).toBe(true);
    });

    it('el rollback seguro mantiene el bloqueo de anon y relaja exclusivamente a authenticated', async () => {
      await db.exec('SET ROLE postgres;');
      await db.exec("SELECT set_config('request.jwt.claims', '', false);");
      const rollbackSql = fs.readFileSync(path.resolve(__dirname, '../../supabase_v2_stage_6a_rollback.sql'), 'utf8');
      await db.exec(rollbackSql);

      // 1. anon sigue 100% bloqueado
      await asSession('anon');
      await expect(db.query('SELECT * FROM public.recipes')).rejects.toThrow();
      await expect(db.query('SELECT * FROM public.categories')).rejects.toThrow();
      await expect(db.query('SELECT * FROM public.shared_state')).rejects.toThrow();
      await expect(db.query('SELECT * FROM public.app_members')).rejects.toThrow();

      // 2. authenticated no-miembro tiene acceso de emergencia
      await asSession('authenticated', intruder_id, 'intruder@example.com');
      const res = await db.query('SELECT * FROM public.recipes');
      expect(res.rows.length).toBeGreaterThanOrEqual(1);

      // 3. app_members sigue bloqueado para authenticated en rollback
      await expect(db.query('SELECT * FROM public.app_members')).rejects.toThrow();

      // 4. recipe-images sigue teniendo public = true
      await db.exec('SET ROLE postgres;');
      const bucketCheck = await db.query<{ public: boolean }>(
        "SELECT public FROM storage.buckets WHERE id = 'recipe-images'"
      );
      expect(bucketCheck.rows[0].public).toBe(true);

      // 5. Re-aplicar lockdown vuelve a cerrar el acceso
      await db.exec("SELECT set_config('request.jwt.claims', '', false);");
      const lockdownSql = fs.readFileSync(path.resolve(__dirname, '../../supabase_v2_stage_6a_lockdown.sql'), 'utf8');
      await db.exec(lockdownSql);

      // Ahora el no-miembro vuelve a estar bloqueado
      await asSession('authenticated', intruder_id, 'intruder@example.com');
      const resAfter = await db.query('SELECT * FROM public.recipes');
      expect(resAfter.rows.length).toBe(0);
    });
  });
});
