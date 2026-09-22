import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Real PostgreSQL Verification of supabase_v2_atomic_update.sql (PGlite)', () => {
  let db: PGlite;

  const memberA_id = 'a0000000-0000-0000-0000-000000000001';
  const nonMember_id = '99999999-9999-9999-9999-999999999999';

  async function asSession(role: string, userId: string | null = null) {
    await db.exec(`SET ROLE ${role};`);
    if (userId) {
      const claims = JSON.stringify({
        sub: userId,
        email: `${userId}@example.com`,
        role: role,
      });
      await db.exec(`SELECT set_config('request.jwt.claims', '${claims}', false);`);
    } else {
      await db.exec(`SELECT set_config('request.jwt.claims', '', false);`);
    }
  }

  beforeEach(async () => {
    db = new PGlite();

    // 1. Setup Auth and Roles
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

      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;

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

      INSERT INTO public.categories (id, name) VALUES
          ('_PLANNER_STATE_', '{"lunes":{"comida":"rec-1"}}'),
          ('_FREEZER_STATE_', '[{"item":"Guisantes"}]'),
          ('_SHOPPING_LIST_STATE_', '[{"item":"Leche"}]');
    `);

    // 2. Setup Stage 4A baseline (app_members, is_app_member, shared_state)
    const stage4aPath = path.resolve(__dirname, '../../supabase_v2_stage_4a_additive.sql');
    const stage4aSql = fs.readFileSync(stage4aPath, 'utf-8');
    await db.exec(stage4aSql);

    // Bootstrap Member A and non-member
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${memberA_id}', 'pareja_a@example.com') ON CONFLICT DO NOTHING;
      INSERT INTO auth.users (id, email) VALUES ('${nonMember_id}', 'intruso@example.com') ON CONFLICT DO NOTHING;
      INSERT INTO public.app_members (user_id) VALUES ('${memberA_id}') ON CONFLICT DO NOTHING;
    `);

    // 3. Ejecutar el script exacto de actualización atómica (sin duplicarlo en el test)
    const atomicSqlPath = path.resolve(__dirname, '../../supabase_v2_atomic_update.sql');
    const atomicSql = fs.readFileSync(atomicSqlPath, 'utf-8');
    await db.exec(atomicSql);
  });

  it('prohibits anon role from executing update_shared_state', async () => {
    await asSession('anon');
    await expect(
      db.query(`SELECT * FROM public.update_shared_state('planner', '{}'::jsonb, 1);`)
    ).rejects.toThrow(/permission denied/i);
  });

  it('prohibits authenticated non-member from modifying shared_state (RLS blocked)', async () => {
    await asSession('authenticated', nonMember_id);
    // RLS en public.shared_state impide que un no-miembro bloquee/actualice filas
    const result = await db.query<{ success: boolean }>(
      `SELECT * FROM public.update_shared_state('planner', '{"lunes":[]}'::jsonb, 1);`
    );
    // Debido a RLS USING (is_app_member()), SELECT FOR UPDATE no encuentra la fila para no-miembros
    expect(result.rows[0].success).toBe(false);
  });

  it('allows authorized member to update shared_state, incrementing version and setting updated_by/updated_at', async () => {
    await asSession('authenticated', memberA_id);

    const payload = { lunes: [{ type: 'COMIDA', recipeId: 'rec-1' }] };
    const res = await db.query<{
      success: boolean;
      current_version: number;
      current_payload: string;
      updated_at: string;
    }>(
      `SELECT * FROM public.update_shared_state('planner', $1::jsonb, 1);`,
      [JSON.stringify(payload)]
    );

    expect(res.rows[0].success).toBe(true);
    expect(res.rows[0].current_version).toBe(2);

    // Verificar en la tabla que version, updated_by y payload coinciden
    const check = await db.query<{ version: number; updated_by: string; payload: unknown }>(
      `SELECT version, updated_by, payload FROM public.shared_state WHERE state_key = 'planner';`
    );
    expect(check.rows[0].version).toBe(2);
    expect(check.rows[0].updated_by).toBe(memberA_id);
    expect(check.rows[0].payload).toEqual(payload);
  });

  it('detects OCC version conflict and returns current server state without updating', async () => {
    await asSession('authenticated', memberA_id);

    // Paso 1: Actualizar a versión 2
    await db.query(`SELECT * FROM public.update_shared_state('freezer', '[]'::jsonb, 1);`);

    // Paso 2: Intentar actualizar esperando versión 1 (obsoleta)
    const conflictRes = await db.query<{
      success: boolean;
      current_version: number;
      current_payload: unknown;
    }>(
      `SELECT * FROM public.update_shared_state('freezer', '[{"id":99}]'::jsonb, 1);`
    );

    expect(conflictRes.rows[0].success).toBe(false);
    expect(conflictRes.rows[0].current_version).toBe(2);
    expect(conflictRes.rows[0].current_payload).toEqual([]);

    // Comprobar que no se modificó
    const check = await db.query<{ version: number; payload: unknown }>(
      `SELECT version, payload FROM public.shared_state WHERE state_key = 'freezer';`
    );
    expect(check.rows[0].version).toBe(2);
    expect(check.rows[0].payload).toEqual([]);
  });

  it('strictly validates JSON types on server: planner must be object, rest must be array', async () => {
    await asSession('authenticated', memberA_id);

    // planner rechaza arrays
    await expect(
      db.query(`SELECT * FROM public.update_shared_state('planner', '[]'::jsonb, 1);`)
    ).rejects.toThrow(/objeto JSON/i);

    // freezer rechaza objetos
    await expect(
      db.query(`SELECT * FROM public.update_shared_state('freezer', '{"id":1}'::jsonb, 1);`)
    ).rejects.toThrow(/array JSON/i);

    // shopping_list rechaza strings
    await expect(
      db.query(`SELECT * FROM public.update_shared_state('shopping_list', '"texto"'::jsonb, 1);`)
    ).rejects.toThrow(/array JSON/i);
  });

  it('strictly validates favorites on server: array of strings only', async () => {
    await asSession('authenticated', memberA_id);

    // favorites rechaza array de números
    await expect(
      db.query(`SELECT * FROM public.update_shared_state('favorites', '[1, 2]'::jsonb, 1);`)
    ).rejects.toThrow(/cadenas de texto/i);

    // favorites rechaza array de objetos
    await expect(
      db.query(`SELECT * FROM public.update_shared_state('favorites', '[{"id":"r1"}]'::jsonb, 1);`)
    ).rejects.toThrow(/cadenas de texto/i);

    // favorites acepta array de strings
    const validFavs = await db.query<{ success: boolean; current_version: number }>(
      `SELECT * FROM public.update_shared_state('favorites', '["rec-1", "rec-2"]'::jsonb, 1);`
    );
    expect(validFavs.rows[0].success).toBe(true);
    expect(validFavs.rows[0].current_version).toBe(2);
  });
});
