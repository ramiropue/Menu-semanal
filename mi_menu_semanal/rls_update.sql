-- Permitir a cualquier usuario insertar datos en la tabla de recetas
CREATE POLICY "Permitir insertar recetas a todos" 
ON recipes 
FOR INSERT 
WITH CHECK (true);

-- Permitir a cualquier usuario actualizar recetas (opcional, útil para el futuro)
CREATE POLICY "Permitir actualizar recetas a todos" 
ON recipes 
FOR UPDATE 
USING (true);

-- (Opcional) Hacer lo mismo para las categorías por si alguna vez quieres crearlas desde la web
CREATE POLICY "Permitir insertar categorías a todos" 
ON categories 
FOR INSERT 
WITH CHECK (true);
