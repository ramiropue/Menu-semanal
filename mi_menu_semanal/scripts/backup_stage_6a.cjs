/* eslint-disable */
/**
 * scripts/backup_stage_6a.cjs
 *
 * Etapa 6A-1: Backup Previo al Lockdown y Verificación de Recuperación.
 *
 * Principios de Seguridad:
 * - Requiere exclusivamente SUPABASE_SERVICE_ROLE_KEY desde entorno local (.env.local o process.env).
 * - Rechaza terminantemente NEXT_PUBLIC_SUPABASE_ANON_KEY para el respaldo administrativo.
 * - Cero credenciales en logs, manifiesto o consola.
 * - Muestra el host de Supabase anonimizado (cazmq***.supabase.co).
 * - Aborta inmediatamente si el proyecto no coincide con cazmqxoignkpskmcuxyg.
 * - Directorio versionado en backups/stage_6a_pre_lockdown_YYYYMMDD_HHMMSS/
 * - Verifica mediante git check-ignore que el directorio esté 100% ignorado.
 * - Los identificadores y datos de app_members permanecen estrictamente en el backup ignorado;
 *   en consola y reportes sólo se muestra el conteo.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const EXPECTED_PROJECT_REF = 'cazmqxoignkpskmcuxyg';
const EXPECTED_DOMAIN_SUFFIX = 'supabase.co';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function anonymizeHost(hostname) {
  if (!hostname) return '***';
  if (hostname.length > 18) {
    return `${hostname.slice(0, 5)}***.${hostname.split('.').slice(-2).join('.')}`;
  }
  return `${hostname.slice(0, 3)}***`;
}

function loadEnvCredentials() {
  const envFile = path.resolve(__dirname, '../.env.local');
  let envContent = '';
  if (fs.existsSync(envFile)) {
    envContent = fs.readFileSync(envFile, 'utf8');
  }

  function getVar(name) {
    if (process.env[name] && process.env[name].trim().length > 0) {
      return process.env[name].trim();
    }
    const match = envContent.match(new RegExp(`(?:^|\\r?\\n)${name}\\s*=\\s*["']?([^\\r\\n"']+)["']?`));
    return match ? match[1].trim() : null;
  }

  const supabaseUrl = getVar('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = getVar('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL no encontrada en .env.local ni en el entorno.');
  }

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no encontrada.\n' +
      'Por seguridad estricta, la Etapa 6A-1 rechaza NEXT_PUBLIC_SUPABASE_ANON_KEY para el respaldo administrativo.\n' +
      'Por favor, añade SUPABASE_SERVICE_ROLE_KEY en tu archivo .env.local (sin compartirla en el chat):\n' +
      'SUPABASE_SERVICE_ROLE_KEY=<service_role_key_del_dashboard>\n' +
      'Obtenla en Supabase Dashboard > Project Settings > API > Project API keys > service_role.'
    );
  }

  // Validar proyecto de destino
  let urlObj;
  try {
    urlObj = new URL(supabaseUrl);
  } catch (err) {
    throw new Error(`URL de Supabase inválida: ${supabaseUrl}`);
  }

  const hostParts = urlObj.hostname.split('.');
  const projectRef = hostParts[0];

  if (projectRef !== EXPECTED_PROJECT_REF) {
    throw new Error(
      `ABORTANDO: El proyecto destino '${projectRef}' no coincide con el proyecto esperado '${EXPECTED_PROJECT_REF}'.`
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    hostname: urlObj.hostname,
    projectRef,
  };
}

function verifyGitIgnore(targetPath) {
  try {
    const stdout = execSync(`git check-ignore "${targetPath}"`, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    if (!stdout.trim()) {
      throw new Error(`El directorio ${targetPath} NO está ignorado por Git.`);
    }
  } catch (err) {
    throw new Error(
      `Verificación de git check-ignore falló para ${targetPath}. Asegúrate de que backups/ esté en .gitignore.`
    );
  }
}

const GIT_SHA_REGEX = /^[0-9a-f]{40}$/i;

function validateProductionCommit(commitHash) {
  if (!commitHash || typeof commitHash !== 'string' || !GIT_SHA_REGEX.test(commitHash.trim())) {
    throw new Error(
      `ABORTANDO: Commit de producción inválido o desconocido ('${commitHash}'). Se requiere un SHA Git completo de 40 caracteres hexadecimales.`
    );
  }
  return commitHash.trim();
}

function validateGitState(options = {}) {
  const rootDir = options.cwd || path.resolve(__dirname, '..');
  const runGit = options.runGit || ((cmd) => execSync(cmd, { cwd: rootDir, encoding: 'utf8' }).trim());

  // 1. Obtener HEAD y validar SHA de 40 caracteres
  let headCommit;
  try {
    headCommit = runGit('git rev-parse HEAD');
  } catch (err) {
    headCommit = 'unknown';
  }
  validateProductionCommit(headCommit);

  // 2. Verificar árbol de trabajo limpio
  let statusOut = '';
  try {
    statusOut = runGit('git status --porcelain');
  } catch (err) {
    throw new Error(`ABORTANDO: Error al verificar estado de Git: ${err.message}`);
  }

  if (statusOut.length > 0 && !options.allowDirty) {
    throw new Error('ABORTANDO: El árbol de trabajo de Git no está limpio. Hay cambios sin confirmar o archivos no rastreados.');
  }

  // 3. Resolver origin/main y verificar que coincida con HEAD
  let originMainCommit;
  try {
    originMainCommit = runGit('git rev-parse origin/main');
  } catch (err) {
    originMainCommit = 'unknown';
  }

  if (!originMainCommit || !GIT_SHA_REGEX.test(originMainCommit)) {
    throw new Error(
      `ABORTANDO: No se pudo resolver 'origin/main' o el SHA es inválido ('${originMainCommit}'). Ejecuta 'git fetch origin main'.`
    );
  }

  if (headCommit !== originMainCommit && !options.allowMismatch) {
    throw new Error(
      `ABORTANDO: HEAD ('${headCommit}') no coincide con origin/main ('${originMainCommit}'). El backup previo al lockdown debe realizarse exactamente sobre el commit publicado en producción.`
    );
  }

  // 4. Exigir rama local 'main' o ejecución explícitamente autorizada desde el commit de producción
  let currentBranch = '';
  try {
    currentBranch = runGit('git rev-parse --abbrev-ref HEAD');
  } catch (err) {
    currentBranch = 'unknown';
  }

  const isMain = currentBranch === 'main';
  const isExplicitlyAuthorized =
    Boolean(options.allowCustomBranch) ||
    process.env.STAGE6A_ALLOW_NON_MAIN === '1' ||
    process.env.STAGE6A_ALLOW_PROD_COMMIT === '1';

  if (!isMain && !isExplicitlyAuthorized) {
    throw new Error(
      `ABORTANDO: La rama actual es '${currentBranch}'. Se exige ejecutar el backup desde la rama 'main' (o autorizar explícitamente mediante STAGE6A_ALLOW_NON_MAIN=1 si HEAD coincide con origin/main).`
    );
  }

  return {
    headCommit,
    originMainCommit,
    currentBranch,
  };
}

function getCommitHash(ref = 'HEAD') {
  try {
    return execSync(`git rev-parse ${ref}`, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function sqlEscape(val, colName) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (colName === 'payload' || colName === 'ingredients' || colName === 'steps') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return `ARRAY[]::text[]`;
    const elements = val.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');
    return `ARRAY[${elements}]::text[]`;
  }
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function runStage6aBackup(options = {}) {
  console.log('================================================================');
  console.log('ETAPA 6A-1: BACKUP PREVIO AL LOCKDOWN (SOLO LECTURA Y DESCARGA)');
  console.log('================================================================\n');

  // 1. Cargar credenciales y validar proyecto
  const creds = loadEnvCredentials();
  console.log(`✓ Proyecto destino verificado: ${anonymizeHost(creds.hostname)}`);
  console.log(`✓ Credencial service_role cargada localmente sin exposición`);

  // 2. Validar estado y trazabilidad estricta de Git (HEAD, origin/main, rama limpia)
  const gitState = validateGitState(options);
  console.log(`✓ Trazabilidad Git verificada: commit ${gitState.headCommit} (rama: ${gitState.currentBranch})`);

  // 3. Preparar directorio de backup versionado
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestampStr = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const backupDirName = `stage_6a_pre_lockdown_${timestampStr}`;

  const baseBackupsDir = path.resolve(__dirname, '../backups');
  if (!fs.existsSync(baseBackupsDir)) {
    fs.mkdirSync(baseBackupsDir, { recursive: true, mode: 0o700 });
  }

  // Verificar que backups/ esté ignorado
  verifyGitIgnore(baseBackupsDir);
  console.log(`✓ Verificado: directorio backups/ ignorado por Git (git check-ignore)`);

  const backupDir = path.join(baseBackupsDir, backupDirName);
  const dataDir = path.join(backupDir, 'data');
  const catalogDir = path.join(backupDir, 'catalog');
  const storageDir = path.join(backupDir, 'storage', 'recipe-images');

  [backupDir, dataDir, catalogDir, storageDir].forEach((d) => {
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  });

  console.log(`✓ Directorio de backup creado: backups/${backupDirName}/`);

  // 3. Crear cliente Supabase con service_role
  const supabase = createClient(creds.supabaseUrl, creds.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fileManifest = {};
  function trackFile(relativePath, buffer) {
    const fullPath = path.join(backupDir, relativePath);
    fs.writeFileSync(fullPath, buffer, { mode: 0o600 });
    fileManifest[relativePath] = {
      size: buffer.length,
      sha256: sha256(buffer),
    };
  }

  // 4. Exportar Tablas de Datos
  console.log('\n--- 1. Extracción de Datos de Producción (Data Backup) ---');

  // 4.1 recipes
  const { data: recipes, error: rErr } = await supabase
    .from('recipes')
    .select('*')
    .order('id');
  if (rErr) throw new Error(`Error exportando recipes: ${rErr.message}`);
  console.log(`✓ recipes exportadas: ${recipes.length} filas (referencia: 35)`);

  trackFile('data/recipes.json', Buffer.from(JSON.stringify(recipes, null, 2), 'utf8'));

  const recipeCols = recipes.length > 0 ? Object.keys(recipes[0]) : ['id', 'title'];
  let recipesSql = `-- recipes_backup.sql (${recipes.length} filas) - ${now.toISOString()}\n`;
  recipesSql += `INSERT INTO public.recipes (${recipeCols.join(', ')}) VALUES\n`;
  recipesSql += recipes
    .map((r) => `  (${recipeCols.map((col) => sqlEscape(r[col], col)).join(', ')})`)
    .join(',\n');
  recipesSql += `\nON CONFLICT (id) DO NOTHING;\n`;
  trackFile('data/recipes.sql', Buffer.from(recipesSql, 'utf8'));

  // 4.2 categories
  const { data: categories, error: cErr } = await supabase
    .from('categories')
    .select('*')
    .order('id');
  if (cErr) throw new Error(`Error exportando categories: ${cErr.message}`);
  console.log(`✓ categories exportadas: ${categories.length} filas (referencia: 14)`);

  trackFile('data/categories.json', Buffer.from(JSON.stringify(categories, null, 2), 'utf8'));

  const catCols = categories.length > 0 ? Object.keys(categories[0]) : ['id', 'name'];
  let catSql = `-- categories_backup.sql (${categories.length} filas) - ${now.toISOString()}\n`;
  catSql += `INSERT INTO public.categories (${catCols.join(', ')}) VALUES\n`;
  catSql += categories
    .map((c) => `  (${catCols.map((col) => sqlEscape(c[col], col)).join(', ')})`)
    .join(',\n');
  catSql += `\nON CONFLICT (id) DO NOTHING;\n`;
  trackFile('data/categories.sql', Buffer.from(catSql, 'utf8'));

  // 4.3 shared_state
  const { data: sharedState, error: sErr } = await supabase
    .from('shared_state')
    .select('*')
    .order('state_key');
  if (sErr) throw new Error(`Error exportando shared_state: ${sErr.message}`);
  console.log(`✓ shared_state exportado: ${sharedState.length} filas (referencia: 4)`);

  trackFile('data/shared_state.json', Buffer.from(JSON.stringify(sharedState, null, 2), 'utf8'));

  const ssCols = sharedState.length > 0 ? Object.keys(sharedState[0]) : ['state_key', 'payload', 'version'];
  let ssSql = `-- shared_state_backup.sql (${sharedState.length} filas) - ${now.toISOString()}\n`;
  ssSql += `INSERT INTO public.shared_state (${ssCols.join(', ')}) VALUES\n`;
  ssSql += sharedState
    .map((s) => `  (${ssCols.map((col) => sqlEscape(s[col], col)).join(', ')})`)
    .join(',\n');
  ssSql += `\nON CONFLICT (state_key) DO UPDATE SET\n`;
  ssSql += `  payload = EXCLUDED.payload,\n  version = EXCLUDED.version,\n  updated_at = EXCLUDED.updated_at,\n  updated_by = EXCLUDED.updated_by;\n`;
  trackFile('data/shared_state.sql', Buffer.from(ssSql, 'utf8'));

  // 4.4 app_members (datos sensibles: NO imprimir filas ni UUIDs en consola)
  const { data: appMembers, error: mErr } = await supabase
    .from('app_members')
    .select('*')
    .order('user_id');
  if (mErr) throw new Error(`Error exportando app_members: ${mErr.message}`);
  console.log(`✓ app_members exportado: ${appMembers.length} registros (identificadores protegidos; referencia: 3)`);

  trackFile('data/app_members.json', Buffer.from(JSON.stringify(appMembers, null, 2), 'utf8'));

  let membersSql = `-- app_members_backup.sql (${appMembers.length} registros) - ${now.toISOString()}\n`;
  membersSql += `-- Contenido protegido bajo git-ignore\n`;
  membersSql += `INSERT INTO public.app_members (user_id, created_at) VALUES\n`;
  membersSql += appMembers
    .map((m) => `  (${sqlEscape(m.user_id, 'user_id')}, ${sqlEscape(m.created_at, 'created_at')})`)
    .join(',\n');
  membersSql += `\nON CONFLICT (user_id) DO NOTHING;\n`;
  trackFile('data/app_members.sql', Buffer.from(membersSql, 'utf8'));

  // 5. Configuración y Catálogo (Catalog Snapshot)
  console.log('\n--- 2. Snapshot de Configuración y Catálogo (Catalog Backup) ---');

  // 5.1 Información de Buckets de Storage
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) console.warn(`Aviso al listar buckets: ${bErr.message}`);
  const bucketInfo = (buckets || []).filter((b) => b.id === 'recipe-images');

  const catalogSnapshot = {
    captured_at_utc: now.toISOString(),
    project_ref_anonymized: anonymizeHost(creds.hostname),
    storage_buckets: bucketInfo,
    tables: {
      recipes: { row_count: recipes.length, columns: recipeCols },
      categories: { row_count: categories.length, columns: catCols },
      shared_state: { row_count: sharedState.length, columns: ssCols },
      app_members: { row_count: appMembers.length, columns: ['user_id', 'created_at'] },
    },
    note: 'Consultas de catálogo e introspección detallada disponibles en catalog/catalog_introspection.sql',
  };

  trackFile('catalog/schema_snapshot.json', Buffer.from(JSON.stringify(catalogSnapshot, null, 2), 'utf8'));

  // Copiar script de introspección de catálogo SQL
  const introspectionSrc = path.resolve(__dirname, 'inspect_schema_readonly_stage6a.sql');
  if (fs.existsSync(introspectionSrc)) {
    const introspectionContent = fs.readFileSync(introspectionSrc);
    trackFile('catalog/catalog_introspection.sql', introspectionContent);
    console.log(`✓ Snapshot de catálogo e introspección SQL guardados en catalog/`);
  }

  // 6. Backup de Storage (recipe-images)
  console.log('\n--- 3. Extracción de Objetos de Storage (recipe-images) ---');

  const { data: storageList, error: slErr } = await supabase.storage
    .from('recipe-images')
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

  if (slErr) throw new Error(`Error listando objetos de recipe-images: ${slErr.message}`);

  const storageItems = (storageList || []).filter((item) => item.name && !item.name.endsWith('/'));
  console.log(`✓ Objetos encontrados en recipe-images: ${storageItems.length} (referencia: 34)`);

  const storageManifest = [];
  let totalDownloadedBytes = 0;

  for (const item of storageItems) {
    const { data: blob, error: dErr } = await supabase.storage
      .from('recipe-images')
      .download(item.name);

    if (dErr) {
      throw new Error(`Error descargando objeto ${item.name}: ${dErr.message}`);
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      throw new Error(`DISCREPANCIA: El objeto de storage ${item.name} se descargó vacío (0 bytes).`);
    }

    totalDownloadedBytes += buffer.length;
    const itemSha = sha256(buffer);
    const relPath = `storage/recipe-images/${item.name}`;

    trackFile(relPath, buffer);

    storageManifest.push({
      name: item.name,
      size: buffer.length,
      mime_type: blob.type || item.metadata?.mimetype || 'application/octet-stream',
      last_modified: item.updated_at || item.created_at || null,
      sha256: itemSha,
    });
  }

  trackFile('storage/storage_manifest.json', Buffer.from(JSON.stringify(storageManifest, null, 2), 'utf8'));
  console.log(`✓ Descargados ${storageItems.length} objetos binarios válidos (${(totalDownloadedBytes / (1024 * 1024)).toFixed(2)} MB)`);

  // 7. Clasificación y Correspondencia de Imágenes
  console.log('\n--- 4. Análisis de Correspondencia de Imágenes ---');
  const downloadedNames = new Set(storageItems.map((i) => i.name));
  const referencedNames = new Set();
  const externalImages = [];
  const missingImages = [];

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

  const orphanedImages = storageItems.filter((item) => !referencedNames.has(item.name)).map((i) => i.name);
  const presentReferencedCount = storageItems.filter((item) => referencedNames.has(item.name)).length;

  console.log(`  - Imágenes presentes y referenciadas: ${presentReferencedCount}`);
  console.log(`  - Objetos en bucket huérfanos (no referenciados): ${orphanedImages.length}`);
  console.log(`  - Referencias a objetos ausentes: ${missingImages.length}`);
  console.log(`  - Imágenes externas (p. ej. Unsplash): ${externalImages.length}`);

  const imageAnalysis = {
    present_and_referenced: presentReferencedCount,
    orphaned_count: orphanedImages.length,
    orphaned_files: orphanedImages,
    missing_count: missingImages.length,
    missing_files: missingImages,
    external_count: externalImages.length,
    external_files: externalImages,
  };
  trackFile('storage/image_correspondence.json', Buffer.from(JSON.stringify(imageAnalysis, null, 2), 'utf8'));

  // 8. Manifiesto Global
  console.log('\n--- 5. Generación de Manifiesto Global ---');
  const prodCommit = gitState.headCommit;
  const currentBranchCommit = gitState.headCommit;

  const manifest = {
    manifest_format_version: '1.0.0',
    stage: '6A-1',
    timestamp_utc: now.toISOString(),
    project_ref_anonymized: anonymizeHost(creds.hostname),
    production_commit: prodCommit,
    security_branch_commit: currentBranchCommit,
    counts: {
      recipes: { obtained: recipes.length, reference: 35 },
      categories: { obtained: categories.length, reference: 14 },
      shared_state: { obtained: sharedState.length, reference: 4 },
      app_members: { obtained: appMembers.length, reference: 3 },
      storage_objects: { obtained: storageItems.length, reference: 34 },
      external_images: { obtained: externalImages.length, reference: 1 },
    },
    total_files: Object.keys(fileManifest).length,
    total_storage_bytes: totalDownloadedBytes,
    files: fileManifest,
    verification: {
      status: 'PENDING_VERIFY_SCRIPT',
    },
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), manifestBuffer, { mode: 0o600 });
  const manifestSha = sha256(manifestBuffer);

  console.log(`✓ Manifiesto generado: backups/${backupDirName}/manifest.json`);
  console.log(`✓ SHA-256 del manifiesto: ${manifestSha}`);

  return {
    backupDir,
    backupDirName,
    manifestSha,
    counts: manifest.counts,
    totalFiles: manifest.total_files,
    totalStorageBytes: totalDownloadedBytes,
    imageAnalysis,
  };
}

if (require.main === module) {
  runStage6aBackup()
    .then((res) => {
      console.log('\n================================================================');
      console.log('BACKUP 6A-1 COMPLETADO EXITOSAMENTE');
      console.log(`Ruta: ${res.backupDir}`);
      console.log(`SHA-256: ${res.manifestSha}`);
      console.log('================================================================');
    })
    .catch((err) => {
      console.error('\n[FATAL ERROR]:', err.message);
      process.exit(1);
    });
}

module.exports = {
  runStage6aBackup,
  loadEnvCredentials,
  verifyGitIgnore,
  anonymizeHost,
  sha256,
  getCommitHash,
  validateProductionCommit,
  validateGitState,
};
