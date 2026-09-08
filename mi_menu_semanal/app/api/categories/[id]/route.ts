import { NextResponse } from "next/server";
import db from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

// GET /api/categories/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM categories WHERE id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error: any) {
    console.error("Error fetching category:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/categories/[id] — Actualizar categoría (nombre, icono, sort_order, etc.)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const fields: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      fields.push("name = ?");
      values.push(body.name);
    }
    if (body.icon !== undefined) {
      fields.push("icon = ?");
      values.push(body.icon);
    }
    if (body.sort_order !== undefined) {
      fields.push("sort_order = ?");
      values.push(body.sort_order);
    }
    if (body.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(body.is_active ? 1 : 0);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    values.push(id);
    await db.query(
      `UPDATE categories SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating category:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/categories/[id] — Eliminar categoría
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Desasociar recetas que tengan esta categoría
    await db.query(`UPDATE recipes SET category_id = NULL WHERE category_id = ?`, [id]);

    const [result] = await db.query<ResultSetHeader>(
      `DELETE FROM categories WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting category:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
