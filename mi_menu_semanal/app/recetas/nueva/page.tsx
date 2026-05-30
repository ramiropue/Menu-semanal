"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { supabase } from "@/lib/supabase";

type Ingredient = { id: string; quantity: string; name: string };
type Step = { id: string; text: string; image?: File | null };

function RecipeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  
  // States
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Entrantes");
  const [time, setTime] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ id: '1', quantity: "", name: "" }]);
  const [steps, setSteps] = useState<Step[]>([{ id: '1', text: "", image: null }]);
  const [tags, setTags] = useState<string[]>(["Mediterránea", "SinGluten"]);
  const [newTag, setNewTag] = useState("");
  const [chefTips, setChefTips] = useState("");
  const [coverImage, setCoverImage] = useState<File | null>(null);
  
  const [importUrl, setImportUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedImageUrl, setScrapedImageUrl] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const coverImageInputRef = useRef<HTMLInputElement>(null);

  // Categories mapping (in a real app, this should be fetched from DB)
  const categoryMap: Record<string, string> = {
    "Entrantes": "2",
    "Desayuno": "3",
    "Carne": "4",
    "Pescado": "5",
    "Ensaladas": "6",
    "Postres": "7",
  };
  
  const reverseCategoryMap: Record<string, string> = {
    "2": "Entrantes",
    "3": "Desayuno",
    "4": "Carne",
    "5": "Pescado",
    "6": "Ensaladas",
    "7": "Postres",
  };

  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(false);

  // Cargar datos si estamos editando
  useEffect(() => {
    if (editId) {
      setIsEditing(true);
      setIsLoadingRecipe(true);
      
      const loadRecipe = async () => {
        try {
          const { data: recipe, error } = await supabase
            .from('recipes')
            .select('*')
            .eq('id', editId)
            .single();
            
          if (error) throw error;
          
          if (recipe) {
            setTitle(recipe.title || "");
            setTime(recipe.time || "");
            setCategory(reverseCategoryMap[recipe.category_id] || "Entrantes");
            setTags(recipe.tags || ["Mediterránea"]);
            
            // Parsear chef_tips si es JSON
            try {
              if (recipe.chef_tips && recipe.chef_tips.startsWith('{')) {
                const parsedTips = JSON.parse(recipe.chef_tips);
                setChefTips(parsedTips.text || "");
                setImportUrl(parsedTips.url || "");
              } else if (recipe.chef_tips && recipe.chef_tips.includes("Enlace original: ")) {
                const parts = recipe.chef_tips.split("Enlace original: ");
                setChefTips(parts[0].trim());
                setImportUrl(parts[1].trim());
              } else {
                setChefTips(recipe.chef_tips || "");
              }
            } catch (e) {
              setChefTips(recipe.chef_tips || "");
            }
            
            if (recipe.ingredients && recipe.ingredients.length > 0) {
              setIngredients(recipe.ingredients.map((ing: any, i: number) => ({
                id: Date.now().toString() + i,
                quantity: ing.cantidad || "",
                name: ing.ingrediente || ""
              })));
            }
            
            if (recipe.steps && recipe.steps.length > 0) {
              setSteps(recipe.steps.map((step: any, i: number) => ({
                id: Date.now().toString() + i,
                text: step.description || "",
                image: null // We don't fetch image blobs, user must re-upload if changing
              })));
            }
          }
        } catch (error) {
          console.error("Error al cargar receta para edición:", error);
          alert("No se pudo cargar la receta para editar.");
        } finally {
          setIsLoadingRecipe(false);
        }
      };
      
      loadRecipe();
    }
  }, [editId]);

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

  // Scraping Logic
  const handleScrape = async () => {
    if (!importUrl) {
      alert("Por favor, introduce una URL para extraer la receta.");
      return;
    }
    
    setIsScraping(true);
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Error al extraer la receta');
      }

      // Check if data is empty (AI didn't find anything)
      const hasIngredients = data.ingredients && data.ingredients.length > 0;
      const hasSteps = data.steps && data.steps.length > 0;
      
      if (!data.title && !hasIngredients && !hasSteps) {
        throw new Error('La IA no ha podido encontrar ninguna receta en este enlace. Puede que la web esté bloqueando el acceso o sea privada.');
      }

      // Populate form
      if (data.title) setTitle(data.title);
      if (data.time && data.time !== "Variable") setTime(data.time);
      
      if (hasIngredients) {
        setIngredients(data.ingredients.map((ing: any, i: number) => ({
          id: Date.now().toString() + i,
          quantity: ing.quantity || "",
          name: ing.name || ""
        })));
      }
      
      if (hasSteps) {
        setSteps(data.steps.map((stepText: string, i: number) => ({
          id: Date.now().toString() + i,
          text: stepText,
          image: null
        })));
      }

      if (data.chefTips) {
        setChefTips(data.chefTips);
      }

      if (data.imageUrl && data.imageUrl.startsWith('http')) {
        setScrapedImageUrl(data.imageUrl);
        try {
          // Attempt to fetch the image to use as a File object, bypassing CORS issues by routing through a proxy if needed.
          // For simplicity we try to fetch directly, if it fails due to CORS, it fails silently.
          const imgRes = await fetch(data.imageUrl);
          const blob = await imgRes.blob();
          const ext = data.imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
          const file = new File([blob], `portada-extraida.${ext}`, { type: blob.type });
          setCoverImage(file);
        } catch (e) {
          console.warn("No se pudo descargar la imagen de portada automáticamente:", e);
        }
      }

      alert("¡Receta extraída con éxito! Revisa los datos antes de guardar.");

    } catch (error: any) {
      console.error("Error al extraer receta:", error);
      alert(error.message);
    } finally {
      setIsScraping(false);
    }
  };

  // Submit Logic
  const handleSave = async (isDraft: boolean) => {
    if (!title) {
      alert("Por favor, ingresa el nombre de la receta.");
      return;
    }

    setIsSubmitting(true);
    try {
      let coverImageUrl = scrapedImageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800"; // default placeholder
      
      if (coverImage) {
        coverImageUrl = await uploadImage(coverImage);
      }

      // Generate a new ID
      const newId = Date.now().toString();

      // Clean ingredients
      const cleanIngredients = ingredients.filter(i => i.name.trim() !== "").map(i => ({ cantidad: i.quantity, ingrediente: i.name }));
      
      // Clean steps and upload their images if any
      const cleanSteps = await Promise.all(
        steps.filter(s => s.text.trim() !== "").map(async (s, index) => {
          let stepImageUrl = null;
          if (s.image) {
            stepImageUrl = await uploadImage(s.image);
          }
          // Para mantener imágenes antiguas, habría que manejar el estado de la imagen antigua.
          // Por simplicidad en la edición, si no sube nueva, ignoramos la url (o la perdería si tuvieran).
          // Asumimos que los pasos son texto principalmente.
          return { step: index + 1, description: s.text, image_url: stepImageUrl };
        })
      );
      
      // Guardar chef_tips como JSON para separar la URL original
      const chefTipsPayload = JSON.stringify({
        text: chefTips,
        url: importUrl
      });

      const recipeData: any = {
        title,
        category_id: categoryMap[category] || "2",
        time: time || null,
        tags,
        type: 'standard',
        ingredients: cleanIngredients,
        steps: cleanSteps,
        chef_tips: chefTipsPayload,
        is_draft: isDraft,
      };

      // Si hay coverImage nueva o si venía del scraping, la incluimos
      if (coverImage || scrapedImageUrl) {
        (recipeData as any).image = coverImageUrl;
      } else if (!isEditing) {
        (recipeData as any).image = coverImageUrl;
      }

      let saveError;

      if (isEditing && editId) {
        const { error } = await supabase.from('recipes').update(recipeData).eq('id', editId);
        saveError = error;
      } else {
        const newId = Date.now().toString();
        const insertData = { ...recipeData, id: newId, is_weekly_favorite: false };
        // Asegurar que image existe para insert
        if (!insertData.image) insertData.image = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800";
        const { error } = await supabase.from('recipes').insert(insertData);
        saveError = error;
      }

      if (saveError) throw saveError;

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
    <div className="bg-[#F6F9FC] flex-1 overflow-y-auto w-full h-full pb-32 md:pb-12 font-plus-jakarta flex flex-col">
      <Header />
      <main className="max-w-7xl mx-auto px-4 pt-8 pb-32 md:pb-12 flex-1 w-full flex flex-col">
        <div className="mb-6">
          <p className="text-sm font-bold text-red-800 tracking-widest uppercase mb-1">
            {isEditing ? "Edición" : "Añade tu próximo éxito"}
          </p>
          <h1 className="text-3xl font-extrabold text-[#0B3B3C]">
            {isEditing ? "Modificar Receta" : "Añadir Nueva Receta"}
          </h1>
        </div>

        {isLoadingRecipe ? (
          <div className="py-20 flex justify-center items-center flex-col text-[#0B3B3C]">
            <span className="material-symbols-outlined animate-spin text-4xl mb-4">sync</span>
            <p className="font-bold">Cargando receta...</p>
          </div>
        ) : (
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
                    <option>Entrantes</option>
                    <option>Desayuno</option>
                    <option>Carne</option>
                    <option>Pescado</option>
                    <option>Ensaladas</option>
                    <option>Postres</option>
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
                  <input 
                    type="url" 
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://ejemplo.com/receta-deliciosa" 
                    className="w-full rounded-xl border-none p-3 pl-10 shadow-sm bg-white focus:ring-2 focus:ring-[#0B3B3C] outline-none text-base text-[#2A4B4C]" 
                  />
                </div>
                <button 
                  type="button" 
                  onClick={handleScrape} 
                  disabled={isScraping}
                  className="mt-3 w-full bg-[#0B3B3C] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#082a2b] transition-colors disabled:opacity-70"
                >
                  {isScraping ? (
                    <span className="material-symbols-outlined animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined">auto_fix_high</span>
                  )}
                  {isScraping ? "Analizando página..." : "Extraer datos"}
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
                        <input 
                          type="file" 
                          accept="image/*"
                          className="hidden"
                          id={`step-image-${step.id}`}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setSteps(steps.map(s => s.id === step.id ? { ...s, image: e.target.files![0] } : s));
                            }
                          }}
                        />
                        <button 
                          type="button" 
                          onClick={() => document.getElementById(`step-image-${step.id}`)?.click()}
                          className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-[#0B3B3C] hover:border-[#0B3B3C] transition-colors bg-white/50 overflow-hidden"
                          title="Añadir foto al paso"
                        >
                          {step.image ? (
                            <img src={URL.createObjectURL(step.image)} alt="Paso" className="w-full h-full object-cover" />
                          ) : (
                            <span className="material-symbols-outlined text-lg">add_a_photo</span>
                          )}
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
              {isSubmitting ? 'Guardando...' : (isEditing ? 'Actualizar Receta' : 'Publicar Receta')}
            </button>
          </div>

        </form>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

export default function NewRecipePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F6F9FC] flex items-center justify-center"><span className="material-symbols-outlined animate-spin text-[#0B3B3C] text-4xl">sync</span></div>}>
      <RecipeForm />
    </Suspense>
  );
}
