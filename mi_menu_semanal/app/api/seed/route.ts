import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, RECIPES } from '@/data/mockData';

export async function GET() {
  try {
    // 1. Insertar Categorías
    console.log('Insertando categorías...');
    const { error: catError } = await supabase
      .from('categories')
      .upsert(CATEGORIES.map(cat => ({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        is_active: cat.isActive || false
      })));

    if (catError) throw new Error(`Error en categorías: ${catError.message}`);

    // 2. Insertar Recetas
    console.log('Insertando recetas...');
    const { error: recError } = await supabase
      .from('recipes')
      .upsert(RECIPES.map(rec => ({
        id: rec.id,
        title: rec.title,
        image: rec.image,
        tags: rec.tags,
        type: rec.type,
        time: rec.time || null,
        rating: rec.rating || null,
        is_weekly_favorite: rec.isWeeklyFavorite || false,
        servings: rec.servings || null,
        calories: rec.calories || null,
        description: rec.description || null,
        // No asociaremos category_id por defecto ya que los mockData no tienen esa relación
      })));

    if (recError) throw new Error(`Error en recetas: ${recError.message}`);

    return NextResponse.json({ success: true, message: 'Base de datos inicializada correctamente con los datos.' });
  } catch (error: any) {
    console.error('Error durante el seeding:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
