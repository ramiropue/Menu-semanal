import { NextResponse } from "next/server";
import db from "@/lib/db";
import { RowDataPacket } from "mysql2";

// GET /api/recipes/[id] — Detalle de receta con categoría
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT r.*, c.name AS category_name, c.icon AS category_icon
       FROM recipes r
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    // Construir el objeto categories para compatibilidad con el frontend
    const recipe = rows[0];
    if (recipe.category_name) {
      recipe.categories = {
        name: recipe.category_name,
        icon: recipe.category_icon,
      };
    }
    delete recipe.category_name;
    delete recipe.category_icon;

    return NextResponse.json(recipe);
  } catch (error: any) {
    console.error("Error fetching recipe:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/recipes/[id] — Actualizar receta
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Construir dinámicamente la query de UPDATE solo con los campos proporcionados
    const fields: string[] = [];
    const values: any[] = [];

    const mapping: Record<string, (v: any) => any> = {
      title: (v) => v,
      image: (v) => v,
      tags: (v) => JSON.stringify(v || []),
      type: (v) => v,
      time: (v) => v || null,
      rating: (v) => v || null,
      is_weekly_favorite: (v) => (v ? 1 : 0),
      is_favorite: (v) => (v ? 1 : 0),
      servings: (v) => v || null,
      calories: (v) => v || null,
      description: (v) => v || null,
      category_id: (v) => v || null,
      category_ids: (v) => JSON.stringify(v || []),
      ingredients: (v) => JSON.stringify(v || []),
      steps: (v) => JSON.stringify(v || []),
      chef_tips: (v) => v || null,
      is_draft: (v) => (v ? 1 : 0),
    };

    for (const [key, transform] of Object.entries(mapping)) {
      if (key in body) {
        fields.push(`${key} = ?`);
        values.push(transform(body[key]));
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    values.push(id);

    await db.query(
      `UPDATE recipes SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("Error updating recipe:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/recipes/[id] — Eliminar receta
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.query("DELETE FROM recipes WHERE id = ?", [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting recipe:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
