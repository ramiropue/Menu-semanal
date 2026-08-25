-- 1. Añadir columna category_ids (array de textos) para multi-categoría
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS category_ids TEXT[] DEFAULT '{}';

-- 2. Migrar datos existentes de category_id → category_ids
UPDATE recipes 
SET category_ids = ARRAY[category_id] 
WHERE category_id IS NOT NULL AND (category_ids IS NULL OR category_ids = '{}');

-- 3. Añadir columna sort_order a categories si no existe
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 4. Insertar nuevas categorías (Cereales, Comida, Cena)
INSERT INTO categories (id, name, icon, is_active, sort_order) 
VALUES ('cereales', 'Cereales', 'grain', false, 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name, icon, is_active, sort_order) 
VALUES ('comida', 'Comida', 'lunch_dining', false, 11)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name, icon, is_active, sort_order) 
VALUES ('cena', 'Cena', 'nightlife', false, 12)
ON CONFLICT (id) DO NOTHING;
