/**
 * scripts/restore_storage.cjs
 *
 * Secure Storage Restoration Script:
 * - Default behavior is strictly DRY-RUN (no credentials needed, no remote mutation).
 * - Real restoration requires explicit --execute flag.
 * - In real mode (--execute):
 *   * Exclusively uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never ANON_KEY).
 *   * Demands explicit bucket specification via --bucket <name>.
 *   * Shows destination project anonymized (e.g. cazmqx....supabase.co).
 * - Reads storage_inventory.json from the backup directory.
 * - Preserves original filenames.
 * - Verifies SHA-256 hashes of all local binary files against inventory.
 * - Rejects overwriting existing files unless --overwrite is explicitly provided.
 * - Never prints keys, secrets or tokens in output logs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    source: null,
    execute: false,
    overwrite: false,
    bucket: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--execute') {
      options.execute = true;
    } else if (args[i] === '--dry-run') {
      options.execute = false;
    } else if (args[i] === '--overwrite') {
      options.overwrite = true;
    } else if (args[i] === '--source' && args[i + 1]) {
      options.source = args[++i];
    } else if (args[i] === '--bucket' && args[i + 1]) {
      options.bucket = args[++i];
    }
  }

  return options;
}

function getAnonymizedHost(url) {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.length > 18) {
      return `${hostname.slice(0, 6)}...${hostname.slice(-12)}`;
    }
    return `${hostname.slice(0, 4)}...`;
  } catch {
    return '***';
  }
}

async function runStorageRestore(customArgs = null) {
  const options = customArgs ? parseArgs(customArgs) : parseArgs();

  console.log('================================================================');
  console.log('RESTAURACIÓN SEGURA DE STORAGE');
  console.log(`MODO: ${options.execute ? 'EJECUCIÓN REAL (--execute)' : 'DRY-RUN (Simulación y Verificación Sin Mutación)'}`);
  console.log('================================================================\n');

  // 1. Resolve source backup directory
  let backupDir = options.source;
  if (!backupDir) {
    backupDir = path.resolve(__dirname, '../../backups/production_backup_20260921');
  } else {
    backupDir = path.resolve(process.cwd(), backupDir);
  }

  console.log(`✓ Directorio fuente: ${backupDir}`);

  const inventoryPath = path.join(backupDir, 'storage_inventory.json');
  const imagesDir = path.join(backupDir, 'images');

  if (!fs.existsSync(inventoryPath)) {
    throw new Error(`Inventario no encontrado en: ${inventoryPath}`);
  }
  if (!fs.existsSync(imagesDir)) {
    throw new Error(`Directorio de imágenes no encontrado en: ${imagesDir}`);
  }

  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  console.log(`✓ Inventario cargado: ${inventory.length} objetos registrados`);

  // 2. Dry-run safety: Do NOT require or load any credentials in dry-run mode
  let supabase = null;
  if (options.execute) {
    if (!options.bucket) {
      throw new Error(
        'En modo de ejecución real (--execute) es OBLIGATORIO especificar explícitamente el bucket con --bucket <nombre_bucket> (ej: --bucket recipe-images)'
      );
    }

    // Load credentials exclusively from process.env or .env.local
    let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const envFile = path.resolve(__dirname, '../.env.local');
    if ((!supabaseUrl || !serviceRoleKey) && fs.existsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf8');
      const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
      const serviceKeyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/);

      if (urlMatch && !supabaseUrl) supabaseUrl = urlMatch[1].trim();
      if (serviceKeyMatch && !serviceRoleKey) serviceRoleKey = serviceKeyMatch[1].trim();
    }

    if (!supabaseUrl) {
      throw new Error('Variable NEXT_PUBLIC_SUPABASE_URL no configurada para la restauración.');
    }
    if (!serviceRoleKey) {
      throw new Error(
        'Variable SUPABASE_SERVICE_ROLE_KEY no configurada. Por seguridad estricta, la restauración real requiere exclusivamente SUPABASE_SERVICE_ROLE_KEY y NUNCA la clave anon.'
      );
    }

    const hostAnon = getAnonymizedHost(supabaseUrl);
    console.log(`✓ Proyecto Supabase destino: ${hostAnon} (autenticado con SERVICE_ROLE_KEY)`);
    console.log(`✓ Bucket destino especificado: '${options.bucket}'`);
    supabase = createClient(supabaseUrl, serviceRoleKey);
  } else {
    console.log('✓ Modo Dry-Run activo: no se cargan credenciales remotas.');
    if (options.bucket) {
      console.log(`✓ Bucket objetivo simulado: '${options.bucket}'`);
    } else {
      console.log(`✓ Bucket objetivo: [simulación basada en inventario o por defecto 'recipe-images']`);
    }
  }

  // 3. Verify each local binary file against inventory hashes
  console.log('\n--- 1. Verificación Criptográfica de Archivos Locales ---');
  let verifiedCount = 0;
  const verifiedFiles = [];

  for (let i = 0; i < inventory.length; i++) {
    const item = inventory[i];
    const filePath = path.join(imagesDir, item.filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Archivo faltante en disco: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    const calculatedHash = sha256(buffer);

    if (calculatedHash !== item.sha256) {
      throw new Error(
        `DISCREPANCIA DE INTEGRIDAD en ${item.filename}:\n  Esperado: ${item.sha256}\n  Obtenido: ${calculatedHash}`
      );
    }

    if (buffer.length !== item.size_bytes) {
      throw new Error(
        `DISCREPANCIA DE TAMAÑO en ${item.filename}:\n  Esperado: ${item.size_bytes} B\n  Obtenido: ${buffer.length} B`
      );
    }

    verifiedCount++;
    verifiedFiles.push({
      item,
      buffer,
    });
  }

  console.log(`✓ Verificación íntegra: ${verifiedCount}/${inventory.length} archivos validados con hash SHA-256 idéntico.`);

  // 4. Dry-run simulation or Real Upload Execution
  const targetBucket = options.bucket || 'recipe-images';
  console.log(`\n--- 2. ${options.execute ? 'Subida a Bucket Remoto' : 'Simulación de Subida (Dry-Run)'} ---`);

  for (let i = 0; i < verifiedFiles.length; i++) {
    const { item, buffer } = verifiedFiles[i];

    if (!options.execute) {
      console.log(
        `  [DRY-RUN ${i + 1}/${verifiedFiles.length}] Verificado: ${item.filename} ` +
        `(${item.size_bytes} B, ${item.content_type}) -> Listo para bucket '${targetBucket}'`
      );
    } else {
      process.stdout.write(`  [${i + 1}/${verifiedFiles.length}] Subiendo ${item.filename}... `);

      const { data, error } = await supabase.storage
        .from(targetBucket)
        .upload(item.filename, buffer, {
          contentType: item.content_type,
          upsert: options.overwrite,
        });

      if (error) {
        if (error.message.includes('already exists') && !options.overwrite) {
          console.log(`OMITIDO (Ya existe en bucket. Se requiere --overwrite para reemplazar)`);
        } else {
          throw new Error(`Error al subir ${item.filename}: ${error.message}`);
        }
      } else {
        console.log(`OK (Key: ${data.path})`);
      }
    }
  }

  console.log('\n================================================================');
  if (!options.execute) {
    console.log(`VALIDACIÓN DRY-RUN COMPLETADA: ${verifiedCount} OBJETOS LISTOS PARA RESTAURAR.`);
    console.log('No se realizó ninguna mutación en Storage remoto.');
  } else {
    console.log(`RESTAURACIÓN COMPLETADA: ${verifiedCount} OBJETOS PROCESADOS EXITOSAMENTE.`);
  }
  console.log('================================================================\n');

  return { verifiedCount, execute: options.execute };
}

if (require.main === module) {
  runStorageRestore()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ ERROR EN RESTAURACIÓN DE STORAGE:', err.message);
      process.exit(1);
    });
}

module.exports = {
  parseArgs,
  getAnonymizedHost,
  runStorageRestore,
};
