import { NextResponse } from "next/server";
import db from "@/lib/db";
import { RowDataPacket } from "mysql2";

// GET /api/state/[key] — Leer estado sincronizado
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT state_data FROM app_state WHERE id = ?",
      [key]
    );

    if (rows.length === 0 || !rows[0].state_data) {
      return NextResponse.json(null);
    }

    try {
      const parsed = JSON.parse(rows[0].state_data);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(rows[0].state_data);
    }
  } catch (error: any) {
    console.error("Error fetching state:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/state/[key] — Guardar estado sincronizado
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const body = await request.json();
    const stateData = JSON.stringify(body);

    await db.query(
      `INSERT INTO app_state (id, state_data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE state_data = VALUES(state_data)`,
      [key, stateData]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving state:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
