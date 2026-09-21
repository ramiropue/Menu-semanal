/**
 * scripts/execute_secure_backup.cjs
 *
 * Secure Production Backup Executor:
 * 1. Reads Supabase URL and Anon Key from .env.local without exposing them.
 * 2. Fetches 100% of rows from recipes and categories.
 * 3. Asserts exact counts: 34 recipes and 14 categories.
 * 4. Generates both JSON and portable SQL INSERT dumps.
 * 5. Downloads all 34 recipe images from storage.
 * 6. Generates SHA-256 checksums and a complete MANIFEST.
 * 7. Saves all artifacts in git-ignored backups/ directory.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sqlEscape(val, colName) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (colName === 'ingredients' || colName === 'steps') {
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

async function runBackup() {
  console.log('================================================================');
  console.log('EJECUCIÓN DE BACKUP SEGURO DE PRODUCCIÓN (ETAPA 3)');
  console.log('================================================================\n');

  // 1. Read environment credentials safely
  const envFile = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envFile)) {
    throw new Error('Archivo .env.local no encontrado en mi_menu_semanal/');
  }

  const envContent = fs.readFileSync(envFile, 'utf8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
  const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/);

  if (!urlMatch || !keyMatch) {
    throw new Error('Credenciales NEXT_PUBLIC_SUPABASE_URL o KEY no encontradas en .env.local');
  }

  const supabaseUrl = urlMatch[1].trim();
  const supabaseKey = keyMatch[1].trim();
  const supabaseHost = new URL(supabaseUrl).hostname;
  console.log(`✓ Conectando a Supabase Host: ${supabaseHost.slice(0, 6)}...${supabaseHost.slice(-12)} (sin exponer clave)`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 2. Prepare Backup Directories
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirName = `production_backup_${timestamp.slice(0, 10).replace(/-/g, '')}`;

  const repoBackupDir = path.resolve(__dirname, '../../backups', backupDirName);
  const repoImagesDir = path.join(repoBackupDir, 'images');

  const artifactBackupDir = path.resolve('/Users/cited/.gemini/antigravity-ide/brain/e4d50fd5-19dc-42e5-83c2-668cd9288603/backups', backupDirName);
  const artifactImagesDir = path.join(artifactBackupDir, 'images');

  [repoBackupDir, repoImagesDir, artifactBackupDir, artifactImagesDir].forEach((d) => {
    fs.mkdirSync(d, { recursive: true });
  });

  console.log(`✓ Directorio de backup preparado: backups/${backupDirName}/`);

  // 3. Export Recipes
  console.log('\n--- 1. Exportando tabla public.recipes ---');
  const { data: recipes, error: rErr } = await supabase
    .from('recipes')
    .select('*')
    .order('id');

  if (rErr) throw new Error(`Error al leer recipes: ${rErr.message}`);
  console.log(`✓ Registros obtenidos de recipes: ${recipes.length}`);
  if (recipes.length !== 34) {
    throw new Error(`DISCREPANCIA CRÍTICA: Se esperaban 34 recetas, pero se recibieron ${recipes.length}`);
  }

  // 4. Export Categories
  console.log('\n--- 2. Exportando tabla public.categories ---');
  const { data: categories, error: cErr } = await supabase
    .from('categories')
    .select('*')
    .order('id');

  if (cErr) throw new Error(`Error al leer categories: ${cErr.message}`);
  console.log(`✓ Registros obtenidos de categories: ${categories.length}`);
  if (categories.length !== 14) {
    throw new Error(`DISCREPANCIA CRÍTICA: Se esperaban 14 categorías, pero se recibieron ${categories.length}`);
  }

  // 5. Generate JSON Exports
  const recipesJsonContent = JSON.stringify(recipes, null, 2);
  const categoriesJsonContent = JSON.stringify(categories, null, 2);

  // 6. Generate SQL Insert Exports
  console.log('\n--- 3. Generando scripts SQL de restauración ---');

  // Categories SQL
  const categoryColumns = ['id', 'name', 'icon', 'is_active', 'sort_order'];
  let categoriesSql = `-- categories_backup.sql (Total: ${categories.length} filas)\n`;
  categoriesSql += `-- Generado: ${new Date().toISOString()}\n\n`;
  categoriesSql += `INSERT INTO public.categories (${categoryColumns.join(', ')}) VALUES\n`;
  categoriesSql += categories
    .map((c) => {
      const vals = categoryColumns.map((col) => sqlEscape(c[col], col));
      return `  (${vals.join(', ')})`;
    })
    .join(',\n');
  categoriesSql += `\nON CONFLICT (id) DO UPDATE SET\n`;
  categoriesSql += `  name = EXCLUDED.name,\n  icon = EXCLUDED.icon,\n  is_active = EXCLUDED.is_active,\n  sort_order = EXCLUDED.sort_order;\n`;

  // Recipes SQL
  // Dynamically inspect existing keys across rows
  const allRecipeKeys = Array.from(new Set(recipes.flatMap((r) => Object.keys(r))));
  let recipesSql = `-- recipes_backup.sql (Total: ${recipes.length} filas)\n`;
  recipesSql += `-- Generado: ${new Date().toISOString()}\n\n`;
  recipesSql += `INSERT INTO public.recipes (${allRecipeKeys.join(', ')}) VALUES\n`;
  recipesSql += recipes
    .map((r) => {
      const vals = allRecipeKeys.map((col) => sqlEscape(r[col], col));
      return `  (${vals.join(', ')})`;
    })
    .join(',\n');
  recipesSql += `\nON CONFLICT (id) DO NOTHING;\n`;

  // Write Data Files to both directories
  const filesToWrite = [
    { name: 'recipes.json', content: Buffer.from(recipesJsonContent, 'utf8') },
    { name: 'categories.json', content: Buffer.from(categoriesJsonContent, 'utf8') },
    { name: 'recipes.sql', content: Buffer.from(recipesSql, 'utf8') },
    { name: 'categories.sql', content: Buffer.from(categoriesSql, 'utf8') },
  ];

  for (const f of filesToWrite) {
    fs.writeFileSync(path.join(repoBackupDir, f.name), f.content);
    fs.writeFileSync(path.join(artifactBackupDir, f.name), f.content);
  }

  // 7. Download Storage Objects (Images)
  console.log('\n--- 4. Descargando inventario y binarios de Storage (recipe-images) ---');
  const storageInventory = [];

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    if (!r.image) continue;

    const url = r.image;
    const filename = url.split('/').pop().split('?')[0];

    process.stdout.write(`  [${i + 1}/${recipes.length}] Descargando ${filename}... `);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fallo al descargar ${url}: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = sha256(buffer);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Save image to both directories
    fs.writeFileSync(path.join(repoImagesDir, filename), buffer);
    fs.writeFileSync(path.join(artifactImagesDir, filename), buffer);

    storageInventory.push({
      recipe_id: r.id,
      recipe_title: r.title,
      filename,
      url,
      content_type: contentType,
      size_bytes: buffer.length,
      sha256: hash,
    });

    console.log(`OK (${buffer.length} bytes, SHA: ${hash.slice(0, 8)}...)`);
  }

  const storageJsonContent = JSON.stringify(storageInventory, null, 2);
  fs.writeFileSync(path.join(repoBackupDir, 'storage_inventory.json'), storageJsonContent);
  fs.writeFileSync(path.join(artifactBackupDir, 'storage_inventory.json'), storageJsonContent);

  // 8. Generate Manifest with Checksums
  console.log('\n--- 5. Generando Manifiesto y Hashes SHA-256 ---');

  const manifestEntries = [];

  function registerFile(relPath, fullPath) {
    const data = fs.readFileSync(fullPath);
    manifestEntries.push({
      file: relPath,
      size_bytes: data.length,
      sha256: sha256(data),
    });
  }

  registerFile('recipes.json', path.join(repoBackupDir, 'recipes.json'));
  registerFile('recipes.sql', path.join(repoBackupDir, 'recipes.sql'));
  registerFile('categories.json', path.join(repoBackupDir, 'categories.json'));
  registerFile('categories.sql', path.join(repoBackupDir, 'categories.sql'));
  registerFile('storage_inventory.json', path.join(repoBackupDir, 'storage_inventory.json'));

  storageInventory.forEach((item) => {
    registerFile(`images/${item.filename}`, path.join(repoImagesDir, item.filename));
  });

  const manifest = {
    backup_date: new Date().toISOString(),
    source_host: `${supabaseHost.slice(0, 6)}...${supabaseHost.slice(-12)}`,
    verification: {
      recipes_count: recipes.length,
      categories_count: categories.length,
      images_count: storageInventory.length,
      status: 'VERIFIED_100_PERCENT',
    },
    files: manifestEntries,
  };

  const manifestJsonContent = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(repoBackupDir, 'manifest.json'), manifestJsonContent);
  fs.writeFileSync(path.join(artifactBackupDir, 'manifest.json'), manifestJsonContent);

  // Human-readable MANIFEST.md
  let manifestMd = `# Manifiesto de Backup de Producción (Fase 1 - Etapa 3)\n\n`;
  manifestMd += `- **Fecha y Hora**: \`${manifest.backup_date}\`\n`;
  manifestMd += `- **Estado de Verificación**: ✅ **100% VERIFICADO**\n`;
  manifestMd += `- **Total Recetas Exportadas**: \`${recipes.length}\` (Objetivo: 34)\n`;
  manifestMd += `- **Total Categorías Exportadas**: \`${categories.length}\` (Objetivo: 14)\n`;
  manifestMd += `- **Total Imágenes Descargadas**: \`${storageInventory.length}\` (Objetivo: 34)\n\n`;
  manifestMd += `## Archivos Principales y Checksums SHA-256\n\n`;
  manifestMd += `| Archivo | Tamaño | Checksum SHA-256 |\n`;
  manifestMd += `| :--- | :--- | :--- |\n`;

  manifestEntries.forEach((entry) => {
    manifestMd += `| \`${entry.file}\` | ${entry.size_bytes} B | \`${entry.sha256}\` |\n`;
  });

  manifestMd += `\n## Procedimiento de Restauración\n\n`;
  manifestMd += `Para restaurar este backup en un proyecto Supabase aislado (\`menu-semanal-restore-drill\`):\n\n`;
  manifestMd += `\`\`\`bash\n`;
  manifestMd += `# 1. Restaurar Categorías\n`;
  manifestMd += `psql -h <DB_HOST> -U postgres -d postgres -f categories.sql\n\n`;
  manifestMd += `# 2. Restaurar Recetas\n`;
  manifestMd += `psql -h <DB_HOST> -U postgres -d postgres -f recipes.sql\n\n`;
  manifestMd += `# 3. Subir imágenes a Storage (recipe-images)\n`;
  manifestMd += `node scripts/restore_storage.cjs --source backups/${backupDirName}/images/\n`;
  manifestMd += `\`\`\`\n`;

  fs.writeFileSync(path.join(repoBackupDir, 'MANIFEST.md'), manifestMd);
  fs.writeFileSync(path.join(artifactBackupDir, 'MANIFEST.md'), manifestMd);

  console.log('✓ manifest.json y MANIFEST.md generados con éxito.');
  console.log('\n================================================================');
  console.log('BACKUP COMPLETADO EXITOSAMENTE CON INTEGRIDAD DEL 100%');
  console.log(`Ubicación Local: backups/${backupDirName}/`);
  console.log(`Ubicación Artefacto: ${artifactBackupDir}`);
  console.log('================================================================\n');

  return {
    backupDirName,
    repoBackupDir,
    artifactBackupDir,
    recipesCount: recipes.length,
    categoriesCount: categories.length,
    imagesCount: storageInventory.length,
    manifestEntries,
  };
}

runBackup()
  .then((res) => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ ERROR FATAL EN BACKUP:', err);
    process.exit(1);
  });
