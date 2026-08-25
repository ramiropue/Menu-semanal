// Script to run multi-category migration against Supabase
// Usage: npx tsx scripts/migrate_multi_categories.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cazmqxoignkpskmcuxyg.supabase.co';
const supabaseKey = 'sb_publishable_gNYdfOYjNpA68P3huuoUAw_Sfm7kER_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🔄 Running multi-category migration...');

  // 1. Check if category_ids column exists by trying to query it
  const { data: testData, error: testError } = await supabase
    .from('recipes')
    .select('id, category_id, category_ids')
    .limit(1);

  if (testError && testError.message.includes('category_ids')) {
    console.log('⚠️  category_ids column does not exist yet.');
    console.log('   Please run this SQL in the Supabase Dashboard SQL Editor:');
    console.log('');
    console.log('   ALTER TABLE recipes ADD COLUMN IF NOT EXISTS category_ids TEXT[] DEFAULT \'{}\';');
    console.log('');
    console.log('   Then re-run this script.');
    process.exit(1);
  }

  // 2. Migrate existing category_id to category_ids
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, category_id, category_ids');

  if (recipes) {
    let migrated = 0;
    for (const r of recipes) {
      if (r.category_id && (!r.category_ids || r.category_ids.length === 0)) {
        await supabase
          .from('recipes')
          .update({ category_ids: [r.category_id] })
          .eq('id', r.id);
        migrated++;
      }
    }
    console.log(`✅ Migrated ${migrated} recipes from category_id → category_ids`);
  }

  // 3. Insert new categories
  const newCategories = [
    { id: 'cereales', name: 'Cereales', icon: 'grain', is_active: false, sort_order: 10 },
    { id: 'comida', name: 'Comida', icon: 'lunch_dining', is_active: false, sort_order: 11 },
    { id: 'cena', name: 'Cena', icon: 'nightlife', is_active: false, sort_order: 12 },
  ];

  for (const cat of newCategories) {
    const { error } = await supabase.from('categories').upsert(cat, { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      console.error(`❌ Error inserting category ${cat.name}:`, error.message);
    } else {
      console.log(`✅ Category "${cat.name}" ready`);
    }
  }

  console.log('🎉 Migration complete!');
}

migrate().catch(console.error);
