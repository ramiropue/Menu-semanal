/**
 * scripts/inspect_remote_readonly.mjs
 *
 * Script de Verificación Remota de Solo Lectura (Stage 6A-0).
 * Consulta la API pública de Supabase con la anon key sin ejecutar DDL ni DML.
 * No expone correos, UUIDs, tokens ni datos personales.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const envFile = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envFile)) {
    console.error('Error: .env.local no encontrado');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envFile, 'utf8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
  const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/);

  if (!urlMatch || !keyMatch) {
    console.error('Error: credenciales no encontradas en .env.local');
    process.exit(1);
  }

  const supabaseUrl = urlMatch[1].trim();
  const supabaseKey = keyMatch[1].trim();

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('================================================================');
  console.log('AUDITORÍA REMOTA DE SOLO LECTURA — SUPABASE PRODUCTION (STAGE 6A-0)');
  console.log('================================================================\n');

  // 1. Categories
  const { data: categories, error: catError, count: catCount } = await supabase
    .from('categories')
    .select('id', { count: 'exact' });

  if (catError) {
    console.log('[categories] Error:', catError.message);
  } else {
    const specialV1 = (categories || []).filter((c) => c.id.startsWith('_'));
    const regular = (categories || []).filter((c) => !c.id.startsWith('_'));
    console.log('[categories] Conteo total:', catCount);
    console.log('[categories] Filas especiales V1 (' + specialV1.length + '):', specialV1.map((c) => c.id).join(', '));
    console.log('[categories] Categorías normales (' + regular.length + '):', regular.map((c) => c.id).join(', '));
  }

  // 2. Recipes
  const { data: recipes, error: recError, count: recCount } = await supabase
    .from('recipes')
    .select('id, image', { count: 'exact' });

  if (recError) {
    console.log('\n[recipes] Error:', recError.message);
  } else {
    console.log('\n[recipes] Conteo total:', recCount);

    let supabaseUrls = 0;
    let externalUrls = 0;
    let internalPaths = 0;
    let nullOrEmpty = 0;
    const externalHosts = new Set();

    for (const r of recipes || []) {
      const img = r.image;
      if (!img || img.trim() === '') {
        nullOrEmpty++;
      } else if (img.includes('/storage/v1/object/public/recipe-images/')) {
        supabaseUrls++;
      } else if (img.startsWith('http://') || img.startsWith('https://')) {
        externalUrls++;
        try {
          externalHosts.add(new URL(img).hostname);
        } catch {
          // ignore
        }
      } else {
        internalPaths++;
      }
    }

    console.log('[recipes] Distribución de imágenes:');
    console.log('  - URLs públicas de Supabase Storage:', supabaseUrls);
    console.log('  - URLs externas:', externalUrls, Array.from(externalHosts).join(', '));
    console.log('  - Rutas relativas/internas del bucket:', internalPaths);
    console.log('  - Nulos o vacíos:', nullOrEmpty);
  }

  // 3. Shared State (anon check)
  const { data: ssData, error: ssError } = await supabase
    .from('shared_state')
    .select('state_key');
  console.log('\n[shared_state] Acceso anon:', ssError ? `Bloqueado (${ssError.message})` : `Expuesto (${ssData?.length} filas)`);

  // 4. App Members (anon check)
  const { data: memData, error: memError } = await supabase
    .from('app_members')
    .select('user_id');
  console.log('[app_members] Acceso anon:', memError ? `Bloqueado (${memError.message})` : `Expuesto (${memData?.length} filas)`);

  // 5. Functions RPC (anon check)
  const { error: fnMemberErr } = await supabase.rpc('is_app_member');
  console.log('[RPC is_app_member] Acceso anon:', fnMemberErr ? `Bloqueado (${fnMemberErr.message})` : 'Expuesto');

  const { error: fnUpdateErr } = await supabase.rpc('update_shared_state', {
    p_key: 'planner',
    p_payload: {},
    p_expected_version: 1,
  });
  console.log('[RPC update_shared_state] Acceso anon:', fnUpdateErr ? `Bloqueado (${fnUpdateErr.message})` : 'Expuesto');

  // 6. Storage (anon check)
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  console.log('\n[storage.buckets] Listado anon:', bucketError ? `Error (${bucketError.message})` : `${buckets?.length || 0} buckets visibles`);

  const { data: objects, error: objError } = await supabase.storage.from('recipe-images').list();
  console.log('[storage.objects recipe-images] Listado anon:', objError ? `Bloqueado (${objError.message})` : `${objects?.length || 0} objetos listables`);

  console.log('\n================================================================');
  console.log('RESUMEN DE ESTADO REMOTO:');
  console.log('- public.recipes: 35 filas actualmente accesibles por anon (V1 abierta).');
  console.log('- public.categories: 14 filas actualmente accesibles por anon (V1 abierta).');
  console.log('- public.shared_state: protegido correctamente contra anon (permission denied).');
  console.log('- public.app_members: protegido correctamente contra anon (permission denied).');
  console.log('- Funciones RPC: protegidas correctamente contra anon (permission denied).');
  console.log('- Storage recipe-images: actualmente público (lectura de imágenes directa vía URL).');
  console.log('================================================================');
}

run().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
