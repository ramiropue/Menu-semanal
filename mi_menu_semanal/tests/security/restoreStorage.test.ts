import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { createRequire } from 'module';

const nodeRequire = createRequire(import.meta.url);
const {
  parseArgs,
  getAnonymizedHost,
  runStorageRestore,
} = nodeRequire('../../scripts/restore_storage.cjs');

describe('Storage Restore Script (scripts/restore_storage.cjs)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Argument Parsing and Default Safety', () => {
    it('defaults to dry-run (execute: false) when --execute is omitted', () => {
      const options = parseArgs([]);
      expect(options.execute).toBe(false);
      expect(options.overwrite).toBe(false);
      expect(options.bucket).toBeNull();
    });

    it('enables real mode only when --execute is explicitly provided', () => {
      const options = parseArgs(['--execute', '--bucket', 'recipe-images']);
      expect(options.execute).toBe(true);
      expect(options.bucket).toBe('recipe-images');
      expect(options.overwrite).toBe(false);
    });

    it('requires explicit --overwrite flag to permit overwriting', () => {
      const options = parseArgs(['--execute', '--bucket', 'recipe-images', '--overwrite']);
      expect(options.overwrite).toBe(true);
    });

    it('supports explicit --dry-run flag', () => {
      const options = parseArgs(['--dry-run', '--bucket', 'recipe-images']);
      expect(options.execute).toBe(false);
    });
  });

  describe('Anonymization Helper', () => {
    it('properly anonymizes project URLs without leaking full host', () => {
      const anon = getAnonymizedHost('https://cazmqxabcdef123456.supabase.co');
      expect(anon).toContain('...');
      expect(anon).not.toEqual('https://cazmqxabcdef123456.supabase.co');
      expect(anon.endsWith('.supabase.co')).toBe(true);
    });

    it('handles invalid URLs safely without throwing', () => {
      const anon = getAnonymizedHost('invalid-url');
      expect(typeof anon).toBe('string');
    });
  });

  describe('Execution Guardrails and Credential Rules', () => {
    it('runs dry-run successfully without requiring ANY credentials or env variables', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const result = await runStorageRestore([]);
      expect(result.execute).toBe(false);
      expect(result.verifiedCount).toBe(34);
    });

    it('fails when --execute is specified without --bucket', async () => {
      await expect(runStorageRestore(['--execute'])).rejects.toThrow(
        /En modo de ejecución real \(--execute\) es OBLIGATORIO especificar explícitamente el bucket con --bucket/
      );
    });

    it('fails in real mode if SUPABASE_SERVICE_ROLE_KEY is missing (never falls back to anon key)', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mockproject.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-that-must-not-be-used';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      // Note: we ensure .env.local doesn't supply a service role key in test env
      const originalCwd = process.cwd();
      try {
        await expect(
          runStorageRestore([
            '--execute',
            '--bucket',
            'recipe-images',
            '--source',
            path.resolve(__dirname, '../../../backups/production_backup_20260921'),
          ])
        ).rejects.toThrow(
          /Variable SUPABASE_SERVICE_ROLE_KEY no configurada.*exclusivamente SUPABASE_SERVICE_ROLE_KEY y NUNCA la clave anon/
        );
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
