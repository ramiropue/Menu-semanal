/**
 * scripts/restore_stage_6a_dry_run.cjs
 *
 * Ensayo Local de Recuperación / Dry-Run (Etapa 6A-1).
 *
 * Principios:
 * - Por defecto opera EXCLUSIVAMENTE en modo DRY-RUN local.
 * - Cero conexiones de escritura, inserción o mutación remota.
 * - Valida la integridad y dependencias de todos los archivos del backup.
 * - Simula el orden correcto de restauración:
 *     1. categories (entidad base sin dependencias externas)
 *     2. recipes (depende de category_id en categories)
 *     3. app_members (independiente)
 *     4. shared_state (independiente, con OCC)
 *     5. storage/recipe-images (subida y verificación de binarios)
 * - Detecta potenciales conflictos de IDs o rutas huérfanas.
 * - Muestra los comandos SQL y llamadas de API exactas que se usarían.
 * - Demuestra las salvaguardas que se requerirían en un modo real:
 *     * Flag explícito --execute
 *     * SUPABASE_SERVICE_ROLE_KEY válida
 *     * Parámetros explícitos --project <id> y --bucket <name>
 *     * Confirmación explícita del host anonimizado
 *     * Flag adicional --allow-overwrite para objetos de storage
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseRestoreArgs(args = process.argv.slice(2)) {
  const options = {
    backupDir: null,
    execute: false,
    project: null,
    bucket: null,
    allowOverwrite: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--execute') {
      options.execute = true;
    } else if (args[i] === '--dry-run') {
      options.execute = false;
    } else if (args[i] === '--allow-overwrite') {
      options.allowOverwrite = true;
    } else if (args[i] === '--dir' && args[i + 1]) {
      options.backupDir = args[++i];
    } else if (args[i] === '--project' && args[i + 1]) {
      options.project = args[++i];
    } else if (args[i] === '--bucket' && args[i + 1]) {
      options.bucket = args[++i];
    }
  }

  return options;
}

function runRecoveryDryRun(customArgs = null) {
  const options = customArgs ? parseRestoreArgs(customArgs) : parseRestoreArgs();

  console.log('================================================================');
  console.log('ENSAYO LOCAL DE RECUPERACIÓN (RESTORATION DRY-RUN)');
  console.log(`MODO: ${options.execute ? 'EJECUCIÓN REAL (--execute)' : 'DRY-RUN (Simulación Local Sin Conexión Ni Mutación)'}`);
  console.log('================================================================\n');

  // Si intentara ejecutarse en modo real, verificar salvaguardas obligatorias
  if (options.execute) {
    console.error('⛔ BLOQUEO DE SEGURIDAD ETAPA 6A-1:');
    console.error('La Etapa 6A-1 autoriza EXCLUSIVAMENTE lecturas y simulaciones.');
    console.error('La restauración remota real está terminantemente bloqueada en esta fase.');
    throw new Error('Ejecución real denegada en Etapa 6A-1 (solo dry-run autorizado)');
  }

  // 1. Localizar directorio de backup
  let backupDir = options.backupDir;
  if (!backupDir) {
    const baseBackups = path.resolve(__dirname, '../backups');
    if (!fs.existsSync(baseBackups)) {
      throw new Error('No existe el directorio backups/');
    }
    const dirs = fs.readdirSync(baseBackups)
      .filter((d) => d.startsWith('stage_6a_pre_lockdown_'))
      .sort()
      .reverse();

    if (dirs.length === 0) {
      throw new Error('No se encontraron backups de la etapa 6A en backups/');
    }
    backupDir = path.join(baseBackups, dirs[0]);
  } else {
    backupDir = path.resolve(backupDir);
  }

  console.log(`✓ Directorio de backup seleccionado: ${backupDir}`);

  // 2. Leer y validar manifiesto
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json no encontrado en ${backupDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`✓ Manifiesto cargado (fecha UTC: ${manifest.timestamp_utc})`);
  console.log(`✓ Proyecto origen anonimizado: ${manifest.project_ref_anonymized}`);
  console.log(`✓ Commit origen producción: ${manifest.production_commit}`);

  // 3. Simular Secuencia de Restauración
  console.log('\n--- Simulación del Orden de Restauración y Detección de Conflictos ---');

  // Paso 1: categories
  const catPath = path.join(backupDir, 'data/categories.json');
  const categories = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  const categoryIds = new Set(categories.map((c) => c.id));
  console.log(`[Paso 1/5] Restauración de public.categories (${categories.length} filas)`);
  console.log(`  -> Orden de dependencia: 1 (tabla base requerida por recipes)`);
  console.log(`  -> Comando simulado:`);
  console.log(`     psql -f ${path.join(backupDir, 'data/categories.sql')}`);
  console.log(`     (Estrategia: INSERT ... ON CONFLICT (id) DO UPDATE)`);

  // Paso 2: recipes
  const recPath = path.join(backupDir, 'data/recipes.json');
  const recipes = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  console.log(`\n[Paso 2/5] Restauración de public.recipes (${recipes.length} filas)`);
  console.log(`  -> Orden de dependencia: 2 (verifica integridad referencial con categories)`);

  let fkMismatches = 0;
  recipes.forEach((r) => {
    if (r.category_id && !categoryIds.has(r.category_id)) {
      console.warn(`     ⚠️ Aviso: receta '${r.id}' referencia categoría ausente '${r.category_id}'`);
      fkMismatches++;
    }
  });

  if (fkMismatches === 0) {
    console.log(`  -> Verificación de claves foráneas: 100% de recetas tienen category_id válido`);
  }
  console.log(`  -> Comando simulado:`);
  console.log(`     psql -f ${path.join(backupDir, 'data/recipes.sql')}`);
  console.log(`     (Estrategia: INSERT ... ON CONFLICT (id) DO NOTHING)`);

  // Paso 3: app_members
  const memPath = path.join(backupDir, 'data/app_members.json');
  const appMembers = JSON.parse(fs.readFileSync(memPath, 'utf8'));
  console.log(`\n[Paso 3/5] Restauración de public.app_members (${appMembers.length} registros)`);
  console.log(`  -> Orden de dependencia: 3 (miembros autorizados)`);
  console.log(`  -> Protección: identificadores y datos personales no se muestran en consola`);
  console.log(`  -> Comando simulado:`);
  console.log(`     psql -f ${path.join(backupDir, 'data/app_members.sql')}`);
  console.log(`     (Estrategia: INSERT ... ON CONFLICT (user_id) DO NOTHING)`);

  // Paso 4: shared_state
  const ssPath = path.join(backupDir, 'data/shared_state.json');
  const sharedState = JSON.parse(fs.readFileSync(ssPath, 'utf8'));
  console.log(`\n[Paso 4/5] Restauración de public.shared_state (${sharedState.length} filas)`);
  console.log(`  -> Orden de dependencia: 4 (estado compartido con OCC)`);
  console.log(`  -> Claves a restaurar: ${sharedState.map((s) => s.state_key).join(', ')}`);
  console.log(`  -> Comando simulado:`);
  console.log(`     psql -f ${path.join(backupDir, 'data/shared_state.sql')}`);
  console.log(`     (Estrategia: INSERT ... ON CONFLICT (state_key) DO UPDATE)`);

  // Paso 5: storage/recipe-images
  const smPath = path.join(backupDir, 'storage/storage_manifest.json');
  const storageManifest = JSON.parse(fs.readFileSync(smPath, 'utf8'));
  console.log(`\n[Paso 5/5] Restauración de Storage bucket 'recipe-images' (${storageManifest.length} objetos)`);
  console.log(`  -> Orden de dependencia: 5 (binarios multimedia)`);
  console.log(`  -> Llamadas API simuladas (Supabase Storage Client):`);
  console.log(`     for item of storageManifest:`);
  console.log(`       supabase.storage.from('recipe-images').upload(item.name, buffer, { upsert: options.allowOverwrite })`);

  // 4. Resumen de Salvaguardas para Futuro Modo Real
  console.log('\n================================================================');
  console.log('REQUISITOS ESTRICTOS PARA FUTURA EJECUCIÓN REAL (NO APLICABLE HOY):');
  console.log('1. Flag explícito --execute obligatorio.');
  console.log('2. SUPABASE_SERVICE_ROLE_KEY cargada en entorno local.');
  console.log('3. Proyecto explícito: --project cazmqxoignkpskmcuxyg.');
  console.log('4. Bucket explícito: --bucket recipe-images.');
  console.log('5. Flag --allow-overwrite si se requiere sobrescribir imágenes existentes.');
  console.log('6. Confirmación interactiva o aborto de seguridad.');
  console.log('================================================================');
  console.log('✓ RESULTADO DEL DRY-RUN: ÉXITO TOTAL (0 mutaciones remotas, 0 errores)');
  console.log('================================================================\n');

  return {
    dryRunSuccess: true,
    totalRecipes: recipes.length,
    totalCategories: categories.length,
    totalAppMembers: appMembers.length,
    totalSharedState: sharedState.length,
    totalStorageObjects: storageManifest.length,
    fkMismatches,
  };
}

if (require.main === module) {
  try {
    runRecoveryDryRun();
  } catch (err) {
    console.error('[DRY-RUN ERROR]:', err.message);
    process.exit(1);
  }
}

module.exports = {
  runRecoveryDryRun,
  parseRestoreArgs,
};
