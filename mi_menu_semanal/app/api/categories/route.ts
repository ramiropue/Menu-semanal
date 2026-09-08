import { NextResponse } from "next/server";
import db from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

// IDs internos que se usaban como hack en Supabase para almacenar estado
const INTERNAL_IDS = [
  "_PLANNER_STATE_",
  "_FREEZER_STATE_",
  "_SHOPPING_LIST_STATE_",
  "_FAVORITES_STATE_",
];

// GET /api/categories — Lista categorías (excluyendo las internas de estado)
export async function GET() {
  try {
    const placeholders = INTERNAL_IDS.map(() => "?").join(",");
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM categories WHERE id NOT IN (${placeholders}) ORDER BY sort_order, id`,
      INTERNAL_IDS
    );

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/categories — Crear nueva categoría
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, icon, is_active, sort_order } = body;

    const catId = id || Date.now().toString();
    const catIcon = icon || "restaurant";
    const catIsActive = is_active ? 1 : 0;
    const catSortOrder = typeof sort_order === "number" ? sort_order : 0;

    await db.query<ResultSetHeader>(
      `INSERT INTO categories (id, name, icon, is_active, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [catId, name, catIcon, catIsActive, catSortOrder]
    );

    return NextResponse.json({
      id: catId,
      name,
      icon: catIcon,
      is_active: Boolean(catIsActive),
      sort_order: catSortOrder,
    }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/categories — Reordenar categorías en lote
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const items: Array<{ id: string; sort_order: number }> = Array.isArray(body) ? body : body.items;

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "Se espera un array o { items: [...] }" }, { status: 400 });
    }

    for (const item of items) {
      await db.query(
        `UPDATE categories SET sort_order = ? WHERE id = ?`,
        [item.sort_order, item.id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating categories order:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
