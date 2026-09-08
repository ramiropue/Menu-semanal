import { NextResponse } from "next/server";
import db from "@/lib/db";
import { RowDataPacket } from "mysql2";

// GET /api/recipes — Lista todas las recetas
export async function GET() {
  try {
    const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM recipes ORDER BY id");
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching recipes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/recipes — Crear nueva receta
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      id,
      title,
      image,
      tags,
      type,
      time,
      rating,
      is_weekly_favorite,
      is_favorite,
      servings,
      calories,
      description,
      category_id,
      category_ids,
      ingredients,
      steps,
      chef_tips,
      is_draft,
    } = body;

    if (!id || !title || !image) {
      return NextResponse.json(
        { error: "Los campos id, title e image son obligatorios" },
        { status: 400 }
      );
    }

    await db.query(
      `INSERT INTO recipes 
        (id, title, image, tags, type, time, rating, is_weekly_favorite, is_favorite, servings, calories, description, category_id, category_ids, ingredients, steps, chef_tips, is_draft)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        image,
        JSON.stringify(tags || []),
        type || "standard",
        time || null,
        rating || null,
        is_weekly_favorite ? 1 : 0,
        is_favorite ? 1 : 0,
        servings || null,
        calories || null,
        description || null,
        category_id || null,
        JSON.stringify(category_ids || []),
        JSON.stringify(ingredients || []),
        JSON.stringify(steps || []),
        chef_tips || null,
        is_draft ? 1 : 0,
      ]
    );

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("Error creating recipe:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
