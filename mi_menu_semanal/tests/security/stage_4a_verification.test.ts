import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Stage 4A Additive Migration Verification', () => {
  let db: PGlite;

  const userA_id = 'a0000000-0000-0000-0000-000000000001'; // Miembro A (Pareja 1)
  const userB_id = 'b0000000-0000-0000-0000-000000000002'; // Miembro B (Pareja 2)
  const userUnauth_id = '99999999-9999-9999-9999-999999999999'; // Usuario Autenticado NO Autorizado

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

    // 1. Setup Postgres roles and Supabase Auth simulation
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
      END
      $$;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
          SELECT coalesce(
              nullif(current_setting('request.jwt.claim.sub', true), ''),
              (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
          )::uuid;
      $$;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
          SELECT coalesce(
              nullif(current_setting('request.jwt.claims', true), '')::jsonb,
              '{}'::jsonb
          );
      $$;

      -- 2. Legacy V1 tables and permissions (Production state)
      CREATE TABLE IF NOT EXISTS public.recipes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          is_draft BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_active BOOLEAN DEFAULT true,
          sort_order INTEGER DEFAULT 0
      );

      ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

      -- Legacy V1 policies
      CREATE POLICY "Public recipes are viewable by everyone." ON public.recipes FOR SELECT USING (true);
      CREATE POLICY "Permitir insertar recetas a todos" ON public.recipes FOR INSERT WITH CHECK (true);
      CREATE POLICY "Public profiles are viewable by everyone." ON public.categories FOR SELECT USING (true);
      CREATE POLICY "Permitir insertar categorías a todos" ON public.categories FOR INSERT WITH CHECK (true);

      GRANT ALL ON TABLE public.recipes TO anon, authenticated;
      GRANT ALL ON TABLE public.categories TO anon, authenticated;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;

      -- Simulate Supabase default table privileges (new tables in public get ALL for anon & authenticated)
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

      -- Initial V1 Production Data:
      -- EXACT PRODUCTION STATE: Contains planner, freezer, and shopping_list, but NO _FAVORITES_STATE_
      INSERT INTO public.recipes (id, title) VALUES
          ('rec-1', 'Lasaña de Verduras Casera'),
          ('rec-2', 'Salmón al Horno con Patatas');

      INSERT INTO public.categories (id, name) VALUES
          ('cat-1', 'Cenas'),
          ('cat-2', 'Comidas Rápidas'),
          ('_PLANNER_STATE_', '{"lunes":{"comida":"rec-1"}}'),
          ('_FREEZER_STATE_', '[{"item":"Guisantes"}]'),
          ('_SHOPPING_LIST_STATE_', '[{"item":"Leche"}]');

      -- Auth users
      INSERT INTO auth.users (id, email) VALUES
          ('${userA_id}', 'pareja_a@example.com'),
          ('${userB_id}', 'pareja_b@example.com'),
          ('${userUnauth_id}', 'intruso@example.com');
    `);

    // 3. Load and execute the exact Stage 4A SQL file
    const stage4aSqlPath = path.resolve(__dirname, '../../supabase_v2_stage_4a_additive.sql');
    let sqlContent = fs.readFileSync(stage4aSqlPath, 'utf8');

    // Bootstrap the two authorized test members
    sqlContent = sqlContent.replace(
      /-- INSERT INTO public\.app_members \(user_id\) VALUES[\s\S]*?-- ON CONFLICT \(user_id\) DO NOTHING;/g,
      `INSERT INTO public.app_members (user_id) VALUES ('${userA_id}'), ('${userB_id}') ON CONFLICT (user_id) DO NOTHING;`
    );

    await db.exec(sqlContent);
  });

  // Test 1: All 4 keys created even if _FAVORITES_STATE_ is missing
  it('1. Crea las cuatro claves en shared_state aunque falte _FAVORITES_STATE_ en categories (favorites inicializado con [])', async () => {
    // Check that categories does NOT have _FAVORITES_STATE_
    const catCheck = await db.query(`SELECT id FROM public.categories WHERE id = '_FAVORITES_STATE_';`);
    expect(catCheck.rows.length).toBe(0);

    // As Miembro A, read shared_state
    await asSession('authenticated', userA_id);
    const result = await db.query<{ state_key: string; payload: unknown }>(
      `SELECT state_key, payload FROM public.shared_state ORDER BY state_key;`
    );

    expect(result.rows.length).toBe(4);
    const keys = result.rows.map((r) => r.state_key);
    expect(keys).toEqual(['favorites', 'freezer', 'planner', 'shopping_list']);

    const favoritesRow = result.rows.find((r) => r.state_key === 'favorites');
    expect(favoritesRow?.payload).toEqual([]);

    const plannerRow = result.rows.find((r) => r.state_key === 'planner');
    expect(plannerRow?.payload).toEqual({ lunes: { comida: 'rec-1' } });

    const freezerRow = result.rows.find((r) => r.state_key === 'freezer');
    expect(freezerRow?.payload).toEqual([{ item: 'Guisantes' }]);

    const shoppingRow = result.rows.find((r) => r.state_key === 'shopping_list');
    expect(shoppingRow?.payload).toEqual([{ item: 'Leche' }]);
  });

  // Test 2: Repeating 4A does NOT overwrite subsequent user modifications
  it('2. Repetir 4A no sobrescribe un valor posterior de shared_state (ON CONFLICT DO NOTHING)', async () => {
    await asSession('authenticated', userA_id);

    // Miembro A updates planner with new week data
    const modifiedPayload = { semana_2: { martes: 'rec-2' } };
    await db.query(
      `UPDATE public.shared_state SET payload = $1, version = 2 WHERE state_key = 'planner';`,
      [JSON.stringify(modifiedPayload)]
    );

    // Verify it was updated
    const checkBefore = await db.query<{ payload: unknown; version: number }>(
      `SELECT payload, version FROM public.shared_state WHERE state_key = 'planner';`
    );
    expect(checkBefore.rows[0].payload).toEqual(modifiedPayload);
    expect(checkBefore.rows[0].version).toBe(2);

    // Now re-run the exact Stage 4A SQL script
    const stage4aSqlPath = path.resolve(__dirname, '../../supabase_v2_stage_4a_additive.sql');
    let sqlContent = fs.readFileSync(stage4aSqlPath, 'utf8');
    sqlContent = sqlContent.replace(
      /-- INSERT INTO public\.app_members \(user_id\) VALUES[\s\S]*?-- ON CONFLICT \(user_id\) DO NOTHING;/g,
      `INSERT INTO public.app_members (user_id) VALUES ('${userA_id}'), ('${userB_id}') ON CONFLICT (user_id) DO NOTHING;`
    );

    await asSession('postgres'); // Run migration as superuser/postgres
    await db.exec(sqlContent);

    // Verify planner payload is STILL the user-modified payload, NOT overwritten
    await asSession('authenticated', userA_id);
    const checkAfter = await db.query<{ payload: unknown; version: number }>(
      `SELECT payload, version FROM public.shared_state WHERE state_key = 'planner';`
    );
    expect(checkAfter.rows[0].payload).toEqual(modifiedPayload);
    expect(checkAfter.rows[0].version).toBe(2);
  });

  // Test 3: anon and unauthorized authenticated cannot access new tables
  it('3. anon y un autenticado no autorizado no acceden a las tablas nuevas (42501 o 0 filas por RLS)', async () => {
    // 3A. Rol anon
    await asSession('anon');

    // anon SELECT on app_members: fails with 42501
    await expect(db.query(`SELECT * FROM public.app_members;`)).rejects.toThrow();

    // anon SELECT on shared_state: fails with 42501
    await expect(db.query(`SELECT * FROM public.shared_state;`)).rejects.toThrow();

    // anon INSERT on shared_state: fails with 42501
    await expect(
      db.query(`INSERT INTO public.shared_state (state_key, payload) VALUES ('planner', '{}');`)
    ).rejects.toThrow();

    // anon EXECUTE on is_app_member(): fails with 42501
    await expect(db.query(`SELECT public.is_app_member();`)).rejects.toThrow();

    // 3B. Usuario autenticado NO autorizado
    await asSession('authenticated', userUnauth_id, 'intruso@example.com');

    // is_app_member returns false
    const memberCheck = await db.query<{ is_app_member: boolean }>(`SELECT public.is_app_member();`);
    expect(memberCheck.rows[0].is_app_member).toBe(false);

    // SELECT on app_members returns 0 rows (RLS blocks)
    const membersRes = await db.query(`SELECT * FROM public.app_members;`);
    expect(membersRes.rows.length).toBe(0);

    // SELECT on shared_state returns 0 rows (RLS blocks)
    const stateRes = await db.query(`SELECT * FROM public.shared_state;`);
    expect(stateRes.rows.length).toBe(0);

    // INSERT on app_members fails with 42501 (privilege revoked)
    await expect(
      db.query(`INSERT INTO public.app_members (user_id) VALUES ('${userUnauth_id}');`)
    ).rejects.toThrow();

    // INSERT on shared_state fails (RLS WITH CHECK blocks)
    await expect(
      db.query(`INSERT INTO public.shared_state (state_key, payload) VALUES ('planner', '{"hack":true}');`)
    ).rejects.toThrow();

    // UPDATE on shared_state affects 0 rows
    const updateRes = await db.query(
      `UPDATE public.shared_state SET payload = '{"hack":true}' WHERE state_key = 'planner';`
    );
    expect(updateRes.affectedRows).toBe(0);
  });

  // Test 4: Members CANNOT delete rows from shared_state
  it('4. Los miembros no pueden borrar filas de shared_state (DELETE revocado explícitamente, error 42501)', async () => {
    await asSession('authenticated', userA_id);

    // Member A attempts to DELETE a state row
    let errorCaught: { code?: string } | null = null;
    try {
      await db.query(`DELETE FROM public.shared_state WHERE state_key = 'planner';`);
    } catch (err) {
      errorCaught = err as { code?: string };
    }

    expect(errorCaught).not.toBeNull();
    // PostgreSQL error code 42501: permission denied for table shared_state
    expect(errorCaught?.code).toBe('42501');

    // Verify that the row still exists
    const checkRes = await db.query(`SELECT state_key FROM public.shared_state WHERE state_key = 'planner';`);
    expect(checkRes.rows.length).toBe(1);

    // Member B also cannot DELETE
    await asSession('authenticated', userB_id);
    let errorB: { code?: string } | null = null;
    try {
      await db.query(`DELETE FROM public.shared_state WHERE state_key = 'favorites';`);
    } catch (err) {
      errorB = err as { code?: string };
    }
    expect(errorB).not.toBeNull();
    expect(errorB?.code).toBe('42501');
  });

  // Test 5: V1 continues working without interruption
  it('5. La V1 continúa funcionando sin cambios (SELECT e INSERT anónimos intactos en recipes y categories)', async () => {
    await asSession('anon');

    // 1. anon can SELECT recipes
    const recipesRes = await db.query<{ id: string; title: string }>(
      `SELECT id, title FROM public.recipes ORDER BY id;`
    );
    expect(recipesRes.rows.length).toBe(2);
    expect(recipesRes.rows[0].title).toBe('Lasaña de Verduras Casera');

    // 2. anon can INSERT recipes (existing V1 public policy intact)
    await db.query(`INSERT INTO public.recipes (id, title) VALUES ('rec-v1-anon', 'Tacos Vegetarianos');`);
    const insertCheck = await db.query(`SELECT id FROM public.recipes WHERE id = 'rec-v1-anon';`);
    expect(insertCheck.rows.length).toBe(1);

    // 3. anon can SELECT categories (normal categories and legacy state rows remain readable by V1)
    const catRes = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.categories ORDER BY id;`
    );
    expect(catRes.rows.length).toBe(5);
    const catIds = catRes.rows.map((c) => c.id);
    expect(catIds).toContain('cat-1');
    expect(catIds).toContain('_PLANNER_STATE_');
    expect(catIds).toContain('_FREEZER_STATE_');
    expect(catIds).toContain('_SHOPPING_LIST_STATE_');

    // 4. anon can INSERT categories (existing V1 public policy intact)
    await db.query(`INSERT INTO public.categories (id, name) VALUES ('cat-v1-anon', 'Postres');`);
    const catInsertCheck = await db.query(`SELECT id FROM public.categories WHERE id = 'cat-v1-anon';`);
    expect(catInsertCheck.rows.length).toBe(1);
  });

  // Test 6: Exact least-privilege grants verification
  it('6. authenticated termina exactamente con privilegios mínimos (app_members: SELECT; shared_state: SELECT, INSERT, UPDATE) y anon/PUBLIC sin privilegios', async () => {
    const privsRes = await db.query<{ grantee: string; table_name: string; privilege_type: string }>(`
      SELECT grantee, table_name, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name IN ('app_members', 'shared_state')
      ORDER BY table_name, grantee, privilege_type;
    `);

    // 1. Check app_members privileges
    const appMembersPrivs = privsRes.rows.filter((r) => r.table_name === 'app_members');
    const authAppMembersPrivs = appMembersPrivs
      .filter((r) => r.grantee === 'authenticated')
      .map((r) => r.privilege_type)
      .sort();
    expect(authAppMembersPrivs).toEqual(['SELECT']);

    const anonAppMembersPrivs = appMembersPrivs.filter((r) => r.grantee === 'anon' || r.grantee === 'PUBLIC');
    expect(anonAppMembersPrivs.length).toBe(0);

    // 2. Check shared_state privileges
    const sharedStatePrivs = privsRes.rows.filter((r) => r.table_name === 'shared_state');
    const authSharedStatePrivs = sharedStatePrivs
      .filter((r) => r.grantee === 'authenticated')
      .map((r) => r.privilege_type)
      .sort();
    expect(authSharedStatePrivs).toEqual(['INSERT', 'SELECT', 'UPDATE']);

    // Explicit verification: NO DELETE, TRUNCATE, TRIGGER, or REFERENCES
    expect(authSharedStatePrivs).not.toContain('DELETE');
    expect(authSharedStatePrivs).not.toContain('TRUNCATE');
    expect(authSharedStatePrivs).not.toContain('TRIGGER');
    expect(authSharedStatePrivs).not.toContain('REFERENCES');

    const anonSharedStatePrivs = sharedStatePrivs.filter((r) => r.grantee === 'anon' || r.grantee === 'PUBLIC');
    expect(anonSharedStatePrivs.length).toBe(0);
  });
});
