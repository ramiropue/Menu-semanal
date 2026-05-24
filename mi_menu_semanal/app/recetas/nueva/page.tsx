"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { supabase } from "@/lib/supabase";

type Ingredient = { id: string; quantity: string; name: string };
type Step = { id: string; text: string; image?: File | null };

export default function NewRecipePage() {
  const router = useRouter();
  
  // States
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Alta Cocina");
  const [time, setTime] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ id: '1', quantity: "", name: "" }]);
  const [steps, setSteps] = useState<Step[]>([{ id: '1', text: "", image: null }]);
  const [tags, setTags] = useState<string[]>(["Mediterránea", "SinGluten"]);
  const [newTag, setNewTag] = useState("");
  const [chefTips, setChefTips] = useState("");
  const [coverImage, setCoverImage] = useState<File | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const coverImageInputRef = useRef<HTMLInputElement>(null);

  // Categories mapping (in a real app, this should be fetched from DB)
  const categoryMap: Record<string, string> = {
    "Alta Cocina": "2", // Mapped to Fuertes for now
    "Postres": "3",
    "Fuertes": "2",
    "Entradas": "1"
  };

  // Ingredient Handlers
  const addIngredient = () => setIngredients([...ingredients, { id: Date.now().toString(), quantity: "", name: "" }]);
  const removeIngredient = (id: string) => setIngredients(ingredients.filter(ing => ing.id !== id));
  const updateIngredient = (id: string, field: 'quantity' | 'name', value: string) => {
    setIngredients(ingredients.map(ing => ing.id === id ? { ...ing, [field]: value } : ing));
  };

  // Step Handlers
  const addStep = () => setSteps([...steps, { id: Date.now().toString(), text: "", image: null }]);
  const updateStepText = (id: string, text: string) => setSteps(steps.map(s => s.id === id ? { ...s, text } : s));
  const removeStep = (id: string) => setSteps(steps.filter(s => s.id !== id));

  // Tag Handlers
  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };
  const removeTag = (tagToRemove: string) => setTags(tags.filter(tag => tag !== tagToRemove));

  // File Handlers
  const handleCoverImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCoverImage(e.target.files[0]);
    }
  };

  // Upload helper
  const uploadImage = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
      .from('recipe-images')
      .upload(filePath, file);

    if (error) throw error;
    
    const { data: publicUrlData } = supabase.storage.from('recipe-images').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  // Submit Logic
  const handleSave = async (isDraft: boolean) => {
    if (!title) {
      alert("Por favor, ingresa el nombre de la receta.");
      return;
    }

    setIsSubmitting(true);
    try {
      let coverImageUrl = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800"; // default placeholder
      
      if (coverImage) {
        coverImageUrl = await uploadImage(coverImage);
      }

      // Generate a new ID
      const newId = Date.now().toString();

      // Clean ingredients
      const cleanIngredients = ingredients.filter(i => i.name.trim() !== "").map(i => ({ cantidad: i.quantity, ingrediente: i.name }));
      
      // Clean steps
      const cleanSteps = steps.filter(s => s.text.trim() !== "").map((s, index) => ({ step: index + 1, description: s.text }));

      const recipeData = {
        id: newId,
        title,
        category_id: categoryMap[category] || "2",
        time: time || null,
        image: coverImageUrl,
        tags,
        type: 'standard',
        ingredients: cleanIngredients,
        steps: cleanSteps,
        chef_tips: chefTips,
        is_draft: isDraft,
        is_weekly_favorite: false
      };

      const { error } = await supabase.from('recipes').insert(recipeData);

      if (error) throw error;

      alert(isDraft ? "Borrador guardado con éxito" : "¡Receta publicada con éxito!");
      router.push('/');
      
    } catch (error: any) {
      console.error("Error al guardar receta:", error);
      alert("Hubo un error al guardar: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 pt-8 pb-32 md:pb-12">
        <div className="mb-6">
          <p className="text-sm font-bold text-red-800 tracking-widest uppercase mb-1">Añade tu próximo éxito</p>
          <h1 className="text-3xl font-extrabold text-[#0B3B3C]">Añadir Nueva Receta</h1>
        </div>

        <form className="space-y-6 md:grid md:grid-cols-12 md:gap-8 md:space-y-0" onSubmit={(e) => e.preventDefault()}>
          
          {/* LADO IZQUIERDO (Desktop) */}
          <div className="md:col-span-5 space-y-6">
            
            {/* General Information */}
            <div className="bg-[#EAF5F8] rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#2A4B4C] mb-2">Nombre Receta</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ej: Risotto de Azafrán y Marisco" 
                  className="w-full rounded-xl border-none p-3 shadow-sm bg-white focus:ring-2 focus:ring-[#0B3B3C] outline-none text-base text-[#2A4B4C] placeholder:text-gray-400" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#2A4B4C] mb-2">Categoría</label>
                <div className="relative">
                  <select 
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full rounded-xl border-none p-3 shadow-sm bg-white appearance-none focus:ring-2 focus:ring-[#0B3B3C] outline-none text-base text-[#2A4B4C]"
                  >
                    <option>Alta Cocina</option>
                    <option>Postres</option>
                    <option>Fuertes</option>
                    <option>Entradas</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-3 text-gray-500 pointer-events-none">expand_more</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-[#2A4B4C] mb-2">Tiempo de Preparación</label>
                <input 
                  type="text" 
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  placeholder="45 min" 
                  className="w-full rounded-xl border-none p-3 shadow-sm bg-white focus:ring-2 focus:ring-[#0B3B3C] outline-none text-base text-[#2A4B4C]" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#2A4B4C] mb-2">Importar desde URL</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-3 text-gray-400">link</span>
                  <input type="url" placeholder="https://ejemplo.com/receta-deliciosa" className="w-full rounded-xl border-none p-3 pl-10 shadow-sm bg-white focus:ring-2 focus:ring-[#0B3B3C] outline-none text-base text-[#2A4B4C]" />
                </div>
                <button type="button" onClick={() => alert("Función de scraping en desarrollo")} className="mt-3 w-full bg-[#0B3B3C] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#082a2b] transition-colors">
                  <span className="material-symbols-outlined">auto_fix_high</span> Extraer datos
                </button>
              </div>
            </div>

            {/* Cover Image */}
            <div className="bg-[#EAF5F8] rounded-2xl overflow-hidden shadow-sm flex flex-col items-center justify-center text-center p-12 relative min-h-[300px]">
              <div className="absolute inset-0 bg-gradient-to-b from-[#EAF5F8] to-[#D1E8ED] opacity-50 z-0"></div>
              
              {/* Show preview if image selected */}
              {coverImage && (
                <div className="absolute inset-0 z-10">
                  <img src={URL.createObjectURL(coverImage)} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40"></div>
                </div>
              )}

              <div className="relative z-20 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-white text-red-700 flex items-center justify-center shadow-md mb-4">
                  <span className="material-symbols-outlined">{coverImage ? 'check' : 'description'}</span>
                </div>
                <h3 className={`font-extrabold text-sm mb-1 ${coverImage ? 'text-white' : 'text-[#0B3B3C]'}`}>
                  {coverImage ? 'Imagen Seleccionada' : 'Imagen de Portada'}
                </h3>
                <p className={`text-xs mb-6 max-w-[200px] ${coverImage ? 'text-gray-200' : 'text-gray-600'}`}>
                  {coverImage ? coverImage.name : 'Sube una fotografía que capture la esencia de tu plato.'}
                </p>
                
                <input 
                  type="file" 
                  accept="image/*"
                  ref={coverImageInputRef}
                  className="hidden"
                  onChange={handleCoverImageSelect}
                />
                <button 
                  type="button" 
                  onClick={() => coverImageInputRef.current?.click()}
                  className="bg-[#0B3B3C] text-white text-xs font-bold px-6 py-2.5 rounded-full hover:bg-[#082a2b] transition-colors shadow-sm"
                >
                  {coverImage ? 'Cambiar Archivo' : 'Seleccionar Archivo'}
                </button>
              </div>
            </div>

            {/* Chef Tips */}
            <div className="bg-[#EAF5F8] rounded-2xl p-6 shadow-sm hidden md:block">
              <h2 className="text-sm font-bold text-[#0B3B3C] mb-3">Consejos del Chef</h2>
              <textarea 
                value={chefTips}
                onChange={e => setChefTips(e.target.value)}
                placeholder="Añade notas profesionales o secretos de la receta..." 
                className="w-full rounded-xl border-none p-3 shadow-sm bg-white outline-none focus:ring-2 focus:ring-[#0B3B3C] text-[#2A4B4C] min-h-[100px] resize-none text-sm"
              ></textarea>
            </div>

          </div>

          {/* LADO DERECHO (Desktop) */}
          <div className="md:col-span-7 space-y-6">

            {/* Ingredients */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-bold text-[#0B3B3C]">Ingredientes</h2>
                <button type="button" onClick={addIngredient} className="text-xs font-bold text-red-700 flex items-center gap-1 hover:text-red-800 transition-colors">
                  <span className="material-symbols-outlined text-sm">add_circle</span> AÑADIR LÍNEA
                </button>
              </div>
              <div className="space-y-3">
                {ingredients.map((ing) => (
                  <div key={ing.id} className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      value={ing.quantity}
                      onChange={e => updateIngredient(ing.id, 'quantity', e.target.value)}
                      placeholder="Cant." 
                      className="w-20 rounded-lg border-none bg-[#EAF5F8] p-3 text-base text-[#2A4B4C] outline-none focus:ring-1 focus:ring-[#0B3B3C]" 
                    />
                    <input 
                      type="text" 
                      value={ing.name}
                      onChange={e => updateIngredient(ing.id, 'name', e.target.value)}
                      placeholder="Ingrediente (ej. Harina de fuerza)" 
                      className="flex-1 rounded-lg border-none bg-[#EAF5F8] p-3 text-base text-[#2A4B4C] outline-none focus:ring-1 focus:ring-[#0B3B3C]" 
                    />
                    <button type="button" onClick={() => removeIngredient(ing.id)} className="text-red-400 hover:text-red-600 p-2">
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div className="bg-[#EAF5F8] rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-[#0B3B3C] mb-4">Pasos de Elaboración</h2>
              <div className="relative space-y-6">
                <div className="absolute left-[15px] top-[30px] bottom-[30px] w-0.5 bg-gray-300 z-0"></div>
                {steps.map((step, index) => (
                  <div key={step.id} className="relative z-10 pl-12">
                    <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-[#0B3B3C] text-white flex items-center justify-center font-bold text-sm shadow-md">
                      {index + 1}
                    </div>
                    <div className="space-y-2">
                      <textarea 
                        value={step.text}
                        onChange={e => updateStepText(step.id, e.target.value)}
                        placeholder={index === 0 ? "Describe la técnica inicial..." : "Siguiente paso..."}
                        className="w-full rounded-xl border-none p-3 shadow-sm bg-white outline-none focus:ring-2 focus:ring-[#0B3B3C] text-base text-[#2A4B4C] min-h-[80px] resize-none"
                      ></textarea>
                      {/* Botón de imagen y botón de eliminar */}
                      <div className="flex justify-between items-center pt-1">
                        <button type="button" className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-[#0B3B3C] hover:border-[#0B3B3C] transition-colors bg-white/50">
                          <span className="material-symbols-outlined text-lg">add_a_photo</span>
                        </button>
                        <button 
                          type="button" 
                          onClick={() => removeStep(step.id)} 
                          className="text-red-400 hover:text-red-600 flex items-center gap-1 text-sm font-bold bg-white px-3 py-2 rounded-xl shadow-sm border border-red-100"
                          title="Eliminar paso"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                          <span className="hidden sm:inline">Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pl-12 pt-2">
                  <button type="button" onClick={addStep} className="w-full border-2 border-dashed border-[#0B3B3C]/40 rounded-xl py-3 flex items-center justify-center gap-2 text-[#0B3B3C] font-semibold hover:bg-[#0B3B3C]/5 transition-colors">
                    <span className="material-symbols-outlined text-sm">add</span> Insertar nuevo paso
                  </button>
                </div>
              </div>
            </div>

            {/* Gourmet Tags */}
            <div className="bg-[#EAF5F8] rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-bold text-[#0B3B3C] mb-3">Etiquetas Gourmet</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-[#E2DFD9] text-[#786153] text-xs font-bold px-3 py-1.5 rounded-full">
                    #{tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-800 focus:outline-none">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <input 
                  type="text" 
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Añadir etiqueta..." 
                  className="w-full rounded-xl border-none p-3 shadow-sm bg-white outline-none focus:ring-2 focus:ring-[#0B3B3C] text-base text-[#2A4B4C]" 
                />
                <button type="button" onClick={addTag} className="absolute right-3 top-3 text-red-700 hover:text-red-800">
                  <span className="material-symbols-outlined">add</span>
                </button>
              </div>
            </div>

            {/* Chef Tips - Only for mobile, hidden on desktop to not duplicate */}
            <div className="bg-[#EAF5F8] rounded-2xl p-6 shadow-sm md:hidden">
              <h2 className="text-sm font-bold text-[#0B3B3C] mb-3">Consejos del Chef</h2>
              <textarea 
                value={chefTips}
                onChange={e => setChefTips(e.target.value)}
                placeholder="Añade notas profesionales o secretos de la receta..." 
                className="w-full rounded-xl border-none p-3 shadow-sm bg-white outline-none focus:ring-2 focus:ring-[#0B3B3C] text-base text-[#2A4B4C] min-h-[100px] resize-none"
              ></textarea>
            </div>

          </div>

          {/* BOTONES ACCIÓN (Span Completo) */}
          <div className="md:col-span-12 flex flex-col sm:flex-row gap-4 pt-4 mt-6 border-t md:border-none border-gray-200">
            <button 
              type="button" 
              onClick={() => handleSave(true)} 
              disabled={isSubmitting}
              className="flex-1 border-2 border-[#2A4B4C] text-[#2A4B4C] bg-white font-bold py-4 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 text-lg"
            >
              Borrador
            </button>
            <button 
              type="button" 
              onClick={() => handleSave(false)}
              disabled={isSubmitting}
              className="flex-[2] bg-[#A74400] text-white font-bold py-4 rounded-xl hover:bg-[#8A3800] transition-colors shadow-md disabled:opacity-50 flex items-center justify-center text-lg"
            >
              {isSubmitting ? <span className="material-symbols-outlined animate-spin mr-2">sync</span> : null}
              {isSubmitting ? 'Guardando...' : 'Publicar Receta'}
            </button>
          </div>

        </form>
      </main>
      <BottomNav />
    </>
  );
}
