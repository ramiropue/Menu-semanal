-- 1. Añadir is_favorite a recipes si no existe
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- 2. Limpiar e insertar nuevas categorías
TRUNCATE TABLE public.categories;

INSERT INTO public.categories (id, name, icon, is_active) VALUES 
('1', 'Favoritas', 'favorite', true),
('2', 'Entrantes', 'restaurant', false),
('3', 'Desayuno', 'breakfast_dining', false),
('4', 'Carne', 'set_meal', false),
('5', 'Pescado', 'phishing', false),
('6', 'Ensaladas', 'nutrition', false),
('7', 'Postres', 'icecream', false);
