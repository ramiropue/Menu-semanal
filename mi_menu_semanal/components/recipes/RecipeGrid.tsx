import { Recipe } from "@/data/mockData";
import { RecipeCard } from "./RecipeCard";

export function RecipeGrid({ recipes }: { recipes: Recipe[] }) {
  const featuredRecipes = recipes.filter(
    (recipe) => recipe.type === "featured" || recipe.isWeeklyFavorite
  );
  const otherRecipes = recipes.filter(
    (recipe) => recipe.type !== "featured" && !recipe.isWeeklyFavorite
  );

  return (
    <div className="flex flex-col gap-12 mt-8">
      {featuredRecipes.length > 0 && (
        <section>
          <div className="flex justify-between items-end mb-6">
            <h2 className="text-2xl md:text-3xl font-extrabold font-headline text-on-surface">
              Destacadas
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {featuredRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </section>
      )}

      {otherRecipes.length > 0 && (
        <section>
          <div className="flex justify-between items-end mb-6">
            <h2 className="text-2xl md:text-3xl font-extrabold font-headline text-on-surface">
              Todas las recetas
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {otherRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
