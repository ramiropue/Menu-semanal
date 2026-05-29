import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.from('recipes').select('*').limit(1);
  console.log("Recipes columns:", data ? Object.keys(data[0] || {}) : error);

  // Recreate categories
  console.log("Deleting old categories...");
  await supabase.from('categories').delete().neq('id', '0'); // deletes all

  const newCategories = [
    { id: '1', name: 'Favoritas', icon: 'favorite', is_active: true },
    { id: '2', name: 'Entrantes', icon: 'restaurant', is_active: false },
    { id: '3', name: 'Desayuno', icon: 'breakfast_dining', is_active: false },
    { id: '4', name: 'Carne', icon: 'set_meal', is_active: false },
    { id: '5', name: 'Pescado', icon: 'phishing', is_active: false },
    { id: '6', name: 'Ensaladas', icon: 'nutrition', is_active: false },
    { id: '7', name: 'Postres', icon: 'icecream', is_active: false },
  ];

  console.log("Inserting new categories...");
  const { error: insertError } = await supabase.from('categories').insert(newCategories);
  if (insertError) {
    console.error("Error inserting categories:", insertError);
  } else {
    console.log("Categories updated successfully!");
  }
}

run();
