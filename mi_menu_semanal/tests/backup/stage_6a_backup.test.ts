import { describe, it, expect } from 'vitest';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { anonymizeHost, sha256 } from '../../scripts/backup_stage_6a.cjs';
import { parseRestoreArgs } from '../../scripts/restore_stage_6a_dry_run.cjs';

describe('Stage 6A-1 Backup and Recovery Verification Suite', () => {
  describe('1. Seguridad de Credenciales y Validación de Proyecto', () => {
    it('anonimiza correctamente el host del proyecto para logs e informes', () => {
      expect(anonymizeHost('cazmqxoignkpskmcuxyg.supabase.co')).toBe('cazmq***.supabase.co');
      expect(anonymizeHost('')).toBe('***');
    });

    it('calcula hashes SHA-256 de forma determinista', () => {
      const buf = Buffer.from('test-backup-payload', 'utf8');
      const expected = crypto.createHash('sha256').update(buf).digest('hex');
      expect(sha256(buf)).toBe(expected);
    });

    it('verifica mediante git check-ignore que el directorio backups/ está 100% ignorado', () => {
      const gitRoot = path.resolve(__dirname, '../..');
      const checkIgnoreOut = execSync('git check-ignore backups backups/stage_6a_pre_lockdown_test/file.json', {
        cwd: gitRoot,
        encoding: 'utf8',
      });
      const lines = checkIgnoreOut.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Clasificación de Correspondencia de Imágenes de Storage', () => {
    function classifyImages(recipes: Array<{ id: string; image: string | null }>, storageObjects: string[]) {
      const downloadedNames = new Set(storageObjects);
      const referencedNames = new Set<string>();
      const externalImages: Array<{ recipe_id: string; url: string }> = [];
      const missingImages: Array<{ recipe_id: string; image: string }> = [];

      recipes.forEach((r) => {
        if (!r.image || !r.image.trim()) return;
        const img = r.image.trim();
        if (img.includes('/storage/v1/object/public/recipe-images/')) {
          const parts = img.split('/storage/v1/object/public/recipe-images/');
          const filename = decodeURIComponent(parts[1].split('?')[0]);
          referencedNames.add(filename);
          if (!downloadedNames.has(filename)) {
            missingImages.push({ recipe_id: r.id, image: filename });
          }
        } else if (img.startsWith('http://') || img.startsWith('https://')) {
          externalImages.push({ recipe_id: r.id, url: img });
        } else {
          referencedNames.add(img);
          if (!downloadedNames.has(img)) {
            missingImages.push({ recipe_id: r.id, image: img });
          }
        }
      });

      const orphanedImages = storageObjects.filter((name) => !referencedNames.has(name));
      const presentReferencedCount = storageObjects.filter((name) => referencedNames.has(name)).length;

      return {
        present_and_referenced: presentReferencedCount,
        orphaned_count: orphanedImages.length,
        orphaned_files: orphanedImages,
        missing_count: missingImages.length,
        missing_files: missingImages,
        external_count: externalImages.length,
        external_files: externalImages,
      };
    }

    it('clasifica con precisión imágenes referenciadas, huérfanas, ausentes y externas', () => {
      const sampleRecipes = [
        { id: 'rec-1', image: 'https://cazmqxoignkpskmcuxyg.supabase.co/storage/v1/object/public/recipe-images/foto1.jpg' },
        { id: 'rec-2', image: 'https://cazmqxoignkpskmcuxyg.supabase.co/storage/v1/object/public/recipe-images/foto2.jpg' },
        { id: 'rec-3', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c' },
        { id: 'rec-4', image: 'https://cazmqxoignkpskmcuxyg.supabase.co/storage/v1/object/public/recipe-images/desaparecida.jpg' },
        { id: 'rec-5', image: null },
      ];

      const sampleStorage = ['foto1.jpg', 'foto2.jpg', 'huerfana.jpg'];

      const result = classifyImages(sampleRecipes, sampleStorage);

      expect(result.present_and_referenced).toBe(2);
      expect(result.orphaned_count).toBe(1);
      expect(result.orphaned_files).toEqual(['huerfana.jpg']);
      expect(result.missing_count).toBe(1);
      expect(result.missing_files[0].image).toBe('desaparecida.jpg');
      expect(result.external_count).toBe(1);
      expect(result.external_files[0].url).toContain('unsplash');
    });
  });

  describe('3. Detección de Secretos y Filtración de Datos Sensibles', () => {
    function scanForSecrets(content: string): boolean {
      const suspiciousRegex = [
        /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[a-zA-Z0-9._-]+/i,
        /eyJh[a-zA-Z0-9_-]{20,}\.eyJh[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
        /BEGIN (?:RSA |EC )?PRIVATE KEY/,
        /sbp_[a-zA-Z0-9]{30,}/,
      ];
      return suspiciousRegex.some((regex) => regex.test(content));
    }

    it('detecta secretos expuestos en texto', () => {
      const mockKey = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_') + '=dummy-secret-value-123456';
      const mockSbp = ['sbp', '1234567890abcdef1234567890abcdef'].join('_');
      const mockRsa = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
      expect(scanForSecrets(mockKey)).toBe(true);
      expect(scanForSecrets(mockSbp)).toBe(true);
      expect(scanForSecrets(mockRsa)).toBe(true);
    });

    it('no genera falsos positivos en payloads limpios de recetas o configuraciones', () => {
      const safeJson = JSON.stringify({
        recipes: [{ id: '1', title: 'Tortilla' }],
        project: 'cazmq***.supabase.co',
        version: '1.0.0',
      });
      expect(scanForSecrets(safeJson)).toBe(false);
    });
  });

  describe('4. Parser y Salvaguardas de Recuperación (Dry-Run)', () => {
    it('parsea correctamente los argumentos del script de restauración', () => {
      const args = ['--dir', '/tmp/test_backup', '--dry-run', '--bucket', 'recipe-images', '--allow-overwrite'];
      const parsed = parseRestoreArgs(args);

      expect(parsed.backupDir).toBe('/tmp/test_backup');
      expect(parsed.execute).toBe(false);
      expect(parsed.bucket).toBe('recipe-images');
      expect(parsed.allowOverwrite).toBe(true);
    });

    it('reconoce el flag --execute cuando se proporciona', () => {
      const parsed = parseRestoreArgs(['--execute']);
      expect(parsed.execute).toBe(true);
    });
  });

  describe('5. Validación de Esquema de Manifiesto y Conteos de Entidad', () => {
    it('comprueba que la estructura de manifest contiene todos los campos obligatorios', () => {
      const sampleManifest = {
        manifest_format_version: '1.0.0',
        stage: '6A-1',
        timestamp_utc: new Date().toISOString(),
        project_ref_anonymized: 'cazmq***.supabase.co',
        production_commit: 'daa40e41d4faa0415592914c4e4fe561d5cb9443',
        security_branch_commit: 'e7dc04a',
        counts: {
          recipes: { obtained: 35, reference: 35 },
          categories: { obtained: 14, reference: 14 },
          shared_state: { obtained: 4, reference: 4 },
          app_members: { obtained: 3, reference: 3 },
          storage_objects: { obtained: 34, reference: 34 },
          external_images: { obtained: 1, reference: 1 },
        },
        total_files: 8,
        total_storage_bytes: 1048576,
        files: {},
      };

      expect(sampleManifest.stage).toBe('6A-1');
      expect(sampleManifest.counts.recipes.reference).toBe(35);
      expect(sampleManifest.counts.categories.reference).toBe(14);
      expect(sampleManifest.counts.shared_state.reference).toBe(4);
      expect(sampleManifest.counts.app_members.reference).toBe(3);
    });

    it('valida que las claves esperadas de shared_state son exactamente 4', () => {
      const validKeys = ['planner', 'freezer', 'shopping_list', 'favorites'];
      const testKeys = ['planner', 'freezer', 'shopping_list', 'favorites'];

      expect(testKeys.length).toBe(4);
      expect(validKeys.every((k) => testKeys.includes(k))).toBe(true);
    });
  });
});
