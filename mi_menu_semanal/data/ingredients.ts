export type IngredientCategory = "Verduras" | "Carne" | "Pescado" | "Lácteos" | "Fruta" | "Despensa" | "Otros";

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category: IngredientCategory;
}

export const RECIPE_INGREDIENTS: Record<string, Ingredient[]> = {
  '1': [ // Salmón Glaseado con Cítricos y Espárragos
    { name: "Salmón", quantity: 2, unit: "lomos", category: "Pescado" },
    { name: "Espárragos", quantity: 1, unit: "manojo", category: "Verduras" },
    { name: "Limón", quantity: 2, unit: "unidades", category: "Fruta" },
    { name: "Miel", quantity: 2, unit: "cucharadas", category: "Despensa" }
  ],
  '2': [ // Pasta Primavera al Pesto Casero
    { name: "Pasta", quantity: 400, unit: "g", category: "Despensa" },
    { name: "Salsa Pesto", quantity: 1, unit: "bote", category: "Despensa" },
    { name: "Cebolla", quantity: 1, unit: "unidades", category: "Verduras" },
    { name: "Queso Parmesano", quantity: 100, unit: "g", category: "Lácteos" }
  ],
  '3': [ // Tacos de Ribeye con Salsa de Mango
    { name: "Filete Ribeye", quantity: 2, unit: "filetes", category: "Carne" },
    { name: "Tortillas", quantity: 1, unit: "paquete", category: "Despensa" },
    { name: "Mango", quantity: 1, unit: "unidades", category: "Fruta" },
    { name: "Cebolla", quantity: 1, unit: "unidades", category: "Verduras" }
  ],
  '4': [ // Margherita Napolitana
    { name: "Masa de pizza", quantity: 1, unit: "unidades", category: "Despensa" },
    { name: "Mozzarella Fresca", quantity: 200, unit: "g", category: "Lácteos" },
    { name: "Tomate Triturado", quantity: 1, unit: "lata", category: "Despensa" },
    { name: "Albahaca fresca", quantity: 1, unit: "manojo", category: "Verduras" }
  ],
  '5': [ // Ensalada César con Pollo a la Parrilla
    { name: "Pechuga de Pollo", quantity: 2, unit: "filetes", category: "Carne" },
    { name: "Lechuga Romana", quantity: 1, unit: "unidades", category: "Verduras" },
    { name: "Salsa César", quantity: 1, unit: "bote", category: "Despensa" },
    { name: "Queso Parmesano", quantity: 50, unit: "g", category: "Lácteos" },
    { name: "Picatostes", quantity: 1, unit: "bolsa", category: "Despensa" }
  ],
  '6': [ // Pad Thai de Camarones
    { name: "Fideos de Arroz", quantity: 200, unit: "g", category: "Despensa" },
    { name: "Camarones", quantity: 300, unit: "g", category: "Pescado" },
    { name: "Salsa Pad Thai", quantity: 1, unit: "bote", category: "Despensa" },
    { name: "Cacahuetes", quantity: 50, unit: "g", category: "Despensa" },
    { name: "Limón", quantity: 1, unit: "unidades", category: "Fruta" }
  ],
  '7': [ // Tarta de Queso con Frutos Rojos
    { name: "Queso Crema", quantity: 500, unit: "g", category: "Lácteos" },
    { name: "Galletas María", quantity: 1, unit: "paquete", category: "Despensa" },
    { name: "Mantequilla", quantity: 100, unit: "g", category: "Lácteos" },
    { name: "Frutos Rojos", quantity: 250, unit: "g", category: "Fruta" },
    { name: "Azúcar", quantity: 100, unit: "g", category: "Despensa" }
  ],
  '8': [ // Bowl de Quinoa y Aguacate
    { name: "Quinoa", quantity: 200, unit: "g", category: "Despensa" },
    { name: "Aguacate", quantity: 1, unit: "unidades", category: "Verduras" },
    { name: "Tomates Cherry", quantity: 250, unit: "g", category: "Verduras" },
    { name: "Aceite de Oliva", quantity: 2, unit: "cucharadas", category: "Despensa" }
  ],
  '9': [ // Hamburguesa Clásica con Queso
    { name: "Carne Picada", quantity: 400, unit: "g", category: "Carne" },
    { name: "Pan de Hamburguesa", quantity: 2, unit: "unidades", category: "Despensa" },
    { name: "Queso Cheddar", quantity: 4, unit: "lonchas", category: "Lácteos" },
    { name: "Lechuga", quantity: 1, unit: "unidades", category: "Verduras" },
    { name: "Tomate", quantity: 1, unit: "unidades", category: "Verduras" }
  ],
  '10': [ // Sopa de Tomate Asado
    { name: "Tomates Maduro", quantity: 1, unit: "kg", category: "Verduras" },
    { name: "Cebolla", quantity: 1, unit: "unidades", category: "Verduras" },
    { name: "Ajo", quantity: 2, unit: "dientes", category: "Verduras" },
    { name: "Caldo de Verduras", quantity: 1, unit: "litro", category: "Despensa" }
  ],
  '11': [ // Risotto de Champiñones
    { name: "Arroz Arborio", quantity: 300, unit: "g", category: "Despensa" },
    { name: "Champiñones", quantity: 400, unit: "g", category: "Verduras" },
    { name: "Caldo de Pollo", quantity: 1, unit: "litro", category: "Despensa" },
    { name: "Queso Parmesano", quantity: 100, unit: "g", category: "Lácteos" },
    { name: "Cebolla", quantity: 1, unit: "unidades", category: "Verduras" }
  ],
  '12': [ // Smoothie de Mango y Plátano
    { name: "Mango", quantity: 1, unit: "unidades", category: "Fruta" },
    { name: "Plátano", quantity: 1, unit: "unidades", category: "Fruta" },
    { name: "Leche", quantity: 500, unit: "ml", category: "Lácteos" }
  ],
  '13': [ // Pancakes de Avena con Miel
    { name: "Harina de Avena", quantity: 200, unit: "g", category: "Despensa" },
    { name: "Leche", quantity: 250, unit: "ml", category: "Lácteos" },
    { name: "Huevo", quantity: 2, unit: "unidades", category: "Otros" },
    { name: "Miel", quantity: 3, unit: "cucharadas", category: "Despensa" }
  ],
  '14': [ // Ceviche Peruano de Pescado
    { name: "Pescado Blanco", quantity: 500, unit: "g", category: "Pescado" },
    { name: "Limón", quantity: 6, unit: "unidades", category: "Fruta" },
    { name: "Cebolla Morada", quantity: 1, unit: "unidades", category: "Verduras" },
    { name: "Cilantro", quantity: 1, unit: "manojo", category: "Verduras" }
  ]
};
