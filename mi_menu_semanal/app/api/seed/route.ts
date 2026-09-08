import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { CATEGORIES, RECIPES } from '@/data/mockData';

export async function GET() {
  try {
    // 1. Insertar Categorías
    console.log('Insertando categorías...');
    for (const cat of CATEGORIES) {
      await db.query(
        `INSERT INTO categories (id, name, icon, is_active) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), icon=VALUES(icon)`,
        [cat.id, cat.name, cat.icon, cat.isActive ? 1 : 0]
      );
    }

    // 2. Insertar Recetas
    console.log('Insertando recetas...');
    for (const rec of RECIPES) {
      await db.query(
        `INSERT INTO recipes (id, title, image, tags, type, time, rating, is_weekly_favorite, servings, calories, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title=VALUES(title)`,
        [
          rec.id,
          rec.title,
          rec.image,
          JSON.stringify(rec.tags || []),
          rec.type || 'standard',
          rec.time || null,
          rec.rating || null,
          rec.isWeeklyFavorite ? 1 : 0,
          rec.servings || null,
          rec.calories || null,
          rec.description || null,
        ]
      );
    }

    return NextResponse.json({ success: true, message: 'Base de datos inicializada correctamente con los datos.' });
  } catch (error: any) {
    console.error('Error durante el seeding:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
