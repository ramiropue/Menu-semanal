import { supabase } from "@/lib/supabase";

/**
 * Generic helper to fetch synced state from Supabase with localStorage fallback.
 */
export async function getSyncedState<T>(storageKey: string, dbId: string, defaultVal: T): Promise<T> {
  let localVal: T = defaultVal;

  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        localVal = JSON.parse(saved);
      } catch (e) {
        console.error(`Error parsing local ${storageKey}`, e);
      }
    }
  }

  try {
    const { data, error } = await supabase
      .from("categories")
      .select("name")
      .eq("id", dbId)
      .single();

    if (!error && data?.name) {
      const dbVal = JSON.parse(data.name);
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, JSON.stringify(dbVal));
        window.dispatchEvent(new Event(`${storageKey}_updated`));
      }
      return dbVal;
    }
  } catch (e) {
    console.error(`Error fetching remote state for ${dbId}:`, e);
  }

  return localVal;
}

/**
 * Generic helper to save synced state to localStorage and Supabase.
 */
export async function saveSyncedState<T>(storageKey: string, dbId: string, val: T) {
  const jsonStr = JSON.stringify(val);

  if (typeof window !== "undefined") {
    localStorage.setItem(storageKey, jsonStr);
    window.dispatchEvent(new Event(`${storageKey}_updated`));
  }

  try {
    await supabase.from("categories").upsert({
      id: dbId,
      name: jsonStr,
      icon: "settings",
      is_active: false,
    });
  } catch (e) {
    console.error(`Error saving remote state for ${dbId}:`, e);
  }
}

// Freezer helpers
export const FREEZER_STORAGE_KEY = "congelador_items";
export const FREEZER_DB_ID = "_FREEZER_STATE_";

export async function getFreezerItems(defaultVal: any[]) {
  return getSyncedState(FREEZER_STORAGE_KEY, FREEZER_DB_ID, defaultVal);
}

export async function saveFreezerItems(items: any[]) {
  return saveSyncedState(FREEZER_STORAGE_KEY, FREEZER_DB_ID, items);
}

// Shopping list helpers
export const SHOPPING_STORAGE_KEY = "shopping_list_items";
export const SHOPPING_DB_ID = "_SHOPPING_LIST_STATE_";

export async function getShoppingList(defaultVal: any[]) {
  return getSyncedState(SHOPPING_STORAGE_KEY, SHOPPING_DB_ID, defaultVal);
}

export async function saveShoppingList(items: any[]) {
  return saveSyncedState(SHOPPING_STORAGE_KEY, SHOPPING_DB_ID, items);
}

// Favorites helpers
export const FAVORITES_STORAGE_KEY = "mimenu_favorites";
export const FAVORITES_DB_ID = "_FAVORITES_STATE_";

export async function getFavorites(defaultVal: string[]) {
  return getSyncedState(FAVORITES_STORAGE_KEY, FAVORITES_DB_ID, defaultVal);
}

export async function saveFavorites(items: string[]) {
  return saveSyncedState(FAVORITES_STORAGE_KEY, FAVORITES_DB_ID, items);
}
