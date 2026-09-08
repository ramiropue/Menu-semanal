import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

// Directorio para almacenar imágenes subidas
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// POST /api/upload — Subir imagen al servidor local
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó ningún archivo" },
        { status: 400 }
      );
    }

    // Crear directorio de uploads si no existe
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Generar nombre único
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Escribir archivo
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Devolver URL pública
    const publicUrl = `/uploads/${fileName}`;

    return NextResponse.json({ publicUrl });
  } catch (error: any) {
    console.error("Error uploading file:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
