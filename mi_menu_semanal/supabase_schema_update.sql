-- 1. Añadir nuevas columnas a la tabla de recetas
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS ingredients JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS chef_tips TEXT,
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- 2. Crear el Bucket de Storage para las imágenes (si no tienes acceso a la UI de Supabase para hacerlo)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas de Storage para permitir la subida de imágenes
-- Permitir a todo el mundo (anon) subir imágenes (Idealmente esto requeriría autenticación en producción)
CREATE POLICY "Public Upload" 
ON storage.objects FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'recipe-images');

CREATE POLICY "Public Read" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'recipe-images');

CREATE POLICY "Public Update" 
ON storage.objects FOR UPDATE 
TO public 
USING (bucket_id = 'recipe-images');

CREATE POLICY "Public Delete" 
ON storage.objects FOR DELETE 
TO public 
USING (bucket_id = 'recipe-images');
