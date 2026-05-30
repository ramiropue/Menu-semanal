export type Category = {
  id: string;
  name: string;
  icon: string;
  isActive?: boolean;
};

export type Recipe = {
  id: string;
  title: string;
  image: string;
  tags: string[];
  type: "featured" | "standard" | "horizontal";
  time?: string;
  rating?: number;
  isWeeklyFavorite?: boolean;
  is_favorite?: boolean;
  servings?: number;
  calories?: number;
  description?: string;
  category_id?: string;
};

export const CATEGORIES: Category[] = [
  { id: "1", name: "Entradas", icon: "restaurant" },
  { id: "2", name: "Fuertes", icon: "dinner_dining", isActive: true },
  { id: "3", name: "Postres", icon: "icecream" },
  { id: "4", name: "Ensaladas", icon: "nutrition" },
  { id: "5", name: "Desayuno", icon: "breakfast_dining" },
  { id: "6", name: "Bebidas", icon: "local_bar" },
];

export const RECIPES: Recipe[] = [
  {
    id: "1",
    title: "Salmón Glaseado con Cítricos y Espárragos",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDVvopcmOULdHFzRiaiHCtR-zoSOpkSaCh4_DciCittRTPC-NtixGwjDlbjmPNhYdWS9acNCEEeaW1QK2wFFZcWFuLY317G7A26NvsLq6pkuwPZZckKRz-xMrfh1Q7QqhbNikkjEkjG6PGDGm4oSnPQNTJHxrq7NsBJ2OVQnIMIjuyjfHP6Xac6wfE8W108uKjvqsj9oglYJ8fDz3GfGF_95r9wFgdMshqpk9PTi4vwaSnJjfojx787Etafge5mIy3di8oVmE0u2eQ",
    tags: ["Saludable", "CenaRápida"],
    type: "featured",
    time: "25 min",
    rating: 4.9,
  },
  {
    id: "2",
    title: "Pasta Primavera al Pesto Casero",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDZyyZ-bh7319x54e70yBzIZMlm_a6LrxlBuOXN3fdXhi3sozW2jFchgZax2DaDZSgI4jBeuIGDn6V45EElkj4i9wk2EgN0tU_cw8MfvmkfiNrJkavN2AALgk5LMSU48AFXFkldkuOLE9EAsoET9fK2oY0Jhq3tmz_BVUFOXrywwwj2Ws7DfSCOHT8lWpxbf746n1mGqfW43yLsVZwi6uVEZw1bk7GKWyp2Pb6wxkNLVK0TSZ-jDRmS8KTlrhypfsD6DMOpAB_IqL8",
    tags: ["Vegetariano", "Italiano"],
    type: "standard",
  },
  {
    id: "3",
    title: "Tacos de Ribeye con Salsa de Mango",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAifDqPj5rrRep6E3CJ6Giv4PfaKYqDQ5GjFQ3FsT0-MtNRSRKz-0qQNEdCL71DuECn8y7Rc1J4iN6h6VGfh2eePCset9YhrWR6j_-AApu0BkqKsztAbAoDAR69emyaij9NweHWvohxpSuc0OweoL1DUFfcK5b-cEQ88ESdlEfDY0ZlHE26Mra9aamknARcRLs6be4qvOp3wJssk3n9SIuSJTwqoR0_9n9y8_Gk9Cgc4Zkvmo_qewjsLl6eLdPnFnyTdkg0hZk4FYQ",
    tags: ["Gourmet", "Picante"],
    type: "standard",
  },
  {
    id: "4",
    title: "Margherita Napolitana: La Receta Original",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBq6vd3fyj6rhFpUT6SppODjTy0ZJYrOSsW3D6fpwvmJusd2vNf4me3LxvEiHR8XiGbVlqzN-8UAaMAaGGkPFV3jhTpLuvHDTK_kNz1L2aQHlP2oITMrEAE7J8dXfcR6BYudlSDzy4geAeuuRAZZPzUuTSoHajB_RZx0Ye08b4EjWyrYfOXhC8yddiYYIt6vEViMdamSYRNpTfNZ2gi5fdSKWh6mbi9VoJUdkJT5YDpn0XY5kBx_WZICPxvX5I1QKbXAwjt5cMh71k",
    tags: [],
    type: "horizontal",
    isWeeklyFavorite: true,
    description:
      "Aprende los secretos de la masa fermentada por 48 horas y la selección perfecta de tomates San Marzano.",
    servings: 4,
    calories: 450,
  },
  {
    id: "5",
    title: "Ensalada César con Pollo a la Parrilla",
    image: "https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&q=80&w=800",
    tags: ["Saludable", "Ligero"],
    type: "standard",
    time: "20 min",
    rating: 4.8,
  },
  {
    id: "6",
    title: "Pad Thai de Camarones",
    image: "https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&q=80&w=800",
    tags: ["Asiático", "Fuerte"],
    type: "featured",
    time: "35 min",
    rating: 4.7,
  },
  {
    id: "7",
    title: "Tarta de Queso con Frutos Rojos",
    image: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&q=80&w=800",
    tags: ["Postre", "Dulce"],
    type: "standard",
    time: "60 min",
    rating: 4.9,
  },
  {
    id: "8",
    title: "Bowl de Quinoa y Aguacate",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=800",
    tags: ["Saludable", "Vegano"],
    type: "standard",
    time: "15 min",
    rating: 4.6,
  },
  {
    id: "9",
    title: "Hamburguesa Clásica con Queso",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=800",
    tags: ["Carne", "Cheat Meal"],
    type: "featured",
    time: "25 min",
    rating: 4.8,
  },
  {
    id: "10",
    title: "Sopa de Tomate Asado",
    image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&q=80&w=800",
    tags: ["Entrada", "Reconfortante"],
    type: "horizontal",
    time: "40 min",
    rating: 4.5,
    description: "Sopa cremosa con tomates asados a fuego lento, acompañada de crutones caseros.",
    servings: 2,
    calories: 250,
  },
  {
    id: "11",
    title: "Risotto de Champiñones",
    image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&q=80&w=800",
    tags: ["Italiano", "Gourmet"],
    type: "standard",
    time: "45 min",
    rating: 4.7,
  },
  {
    id: "12",
    title: "Smoothie de Mango y Plátano",
    image: "https://images.unsplash.com/photo-1628557044797-f21a177c37ec?auto=format&fit=crop&q=80&w=800",
    tags: ["Bebida", "Fruta"],
    type: "standard",
    time: "5 min",
    rating: 4.9,
  },
  {
    id: "13",
    title: "Pancakes de Avena con Miel",
    image: "https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&q=80&w=800",
    tags: ["Desayuno", "Dulce"],
    type: "featured",
    time: "20 min",
    rating: 4.8,
  },
  {
    id: "14",
    title: "Ceviche Peruano de Pescado",
    image: "https://images.unsplash.com/photo-1534080564583-6be75777b70a?auto=format&fit=crop&q=80&w=800",
    tags: ["Fresco", "Mariscos"],
    type: "horizontal",
    time: "30 min",
    rating: 4.9,
    description: "Pescado fresco marinado en jugo de limón, acompañado de camote, choclo y cebolla morada.",
    servings: 4,
    calories: 180,
  }
];
