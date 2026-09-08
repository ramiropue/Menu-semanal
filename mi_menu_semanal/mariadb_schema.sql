-- ============================================================
-- Esquema MariaDB para Mi Menú Semanal
-- Migrado desde PostgreSQL/Supabase
-- ============================================================

-- Tabla de categorías
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(255) NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  icon VARCHAR(100) NOT NULL DEFAULT 'restaurant',
  is_active TINYINT(1) DEFAULT 0,
  sort_order INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de recetas
CREATE TABLE IF NOT EXISTS recipes (
  id VARCHAR(255) NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  image TEXT NOT NULL,
  tags JSON DEFAULT NULL,
  type ENUM('featured', 'standard', 'horizontal') NOT NULL DEFAULT 'standard',
  time VARCHAR(50) DEFAULT NULL,
  rating DECIMAL(2,1) DEFAULT NULL,
  is_weekly_favorite TINYINT(1) DEFAULT 0,
  is_favorite TINYINT(1) DEFAULT 0,
  servings INT DEFAULT NULL,
  calories INT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  category_id VARCHAR(255) DEFAULT NULL,
  category_ids JSON DEFAULT NULL,
  ingredients JSON DEFAULT NULL,
  steps JSON DEFAULT NULL,
  chef_tips TEXT DEFAULT NULL,
  is_draft TINYINT(1) DEFAULT 0,
  CONSTRAINT fk_recipe_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de estado sincronizado (reemplaza el hack de guardar estado en categories)
CREATE TABLE IF NOT EXISTS app_state (
  id VARCHAR(255) NOT NULL PRIMARY KEY,
  state_data LONGTEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
