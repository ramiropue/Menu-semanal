export interface MealSlot {
  type: "DESAYUNO" | "COMIDA" | "CENA";
  recipeId?: string | null;
  recipeIds?: string[];
}

export const PLANNER_STORAGE_KEY = "planner_meals";
export const PLANNER_EVENT_KEY = "planner_meals_updated";

/**
 * Fetch planned meals from MariaDB API (shared across devices) and update local cache.
 */
export async function getPlannedMeals(): Promise<Record<string, MealSlot[]>> {
  let localMeals: Record<string, MealSlot[]> = {};
  
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(PLANNER_STORAGE_KEY);
    if (saved) {
      try {
        localMeals = JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing local planner_meals", e);
      }
    }
  }

  try {
    const res = await fetch("/api/state/_PLANNER_STATE_");
    if (res.ok) {
      const dbMeals = await res.json();
      if (dbMeals !== null) {
        if (typeof window !== "undefined") {
          localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(dbMeals));
          window.dispatchEvent(new Event(PLANNER_EVENT_KEY));
        }
        return dbMeals;
      }
    }
  } catch (e) {
    console.error("Error fetching remote planner state:", e);
  }

  return localMeals;
}

/**
 * Save planned meals to local cache immediately and sync to MariaDB API in the background.
 */
export async function savePlannedMeals(meals: Record<string, MealSlot[]>) {
  const jsonStr = JSON.stringify(meals);
  
  if (typeof window !== "undefined") {
    localStorage.setItem(PLANNER_STORAGE_KEY, jsonStr);
    window.dispatchEvent(new Event(PLANNER_EVENT_KEY));
  }

  try {
    await fetch("/api/state/_PLANNER_STATE_", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: jsonStr,
    });
  } catch (e) {
    console.error("Error saving remote planner state:", e);
  }
}
