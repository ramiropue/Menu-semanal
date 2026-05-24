-- Crear tabla de Categorías
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false
);

-- Crear tabla de Recetas
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  image TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  type TEXT NOT NULL CHECK (type IN ('featured', 'standard', 'horizontal')),
  time TEXT,
  rating NUMERIC(2, 1),
  is_weekly_favorite BOOLEAN DEFAULT false,
  servings INTEGER,
  calories INTEGER,
  description TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL
);

-- Opcional: Crear políticas de seguridad (RLS - Row Level Security)
-- Permite lectura pública a todos
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone." ON categories FOR SELECT USING (true);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public recipes are viewable by everyone." ON recipes FOR SELECT USING (true);
