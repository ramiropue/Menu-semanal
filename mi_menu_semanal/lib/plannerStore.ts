import { getState, saveState, getCachedVersion } from '@/lib/state/stateAdapter';
import type { StateSaveOptions, StateSaveResult } from '@/lib/state/types';

export interface MealSlot {
  type: 'DESAYUNO' | 'COMIDA' | 'CENA';
  recipeId?: string | null;
  recipeIds?: string[];
}

export const PLANNER_STORAGE_KEY = 'planner_meals';
export const PLANNER_EVENT_KEY = 'planner_meals_updated';

/**
 * Obtiene la versión conocida del planificador para control de concurrencia.
 */
export function getPlannerVersion(): number {
  return getCachedVersion('planner');
}

/**
 * Obtiene las comidas planificadas delegando en stateAdapter (compatible V1 y V2).
 */
export async function getPlannedMeals(): Promise<Record<string, MealSlot[]>> {
  const result = await getState<Record<string, MealSlot[]>>('planner', {});
  return result.data;
}

/**
 * Guarda las comidas planificadas delegando en stateAdapter con validación y OCC.
 */
export async function savePlannedMeals(
  meals: Record<string, MealSlot[]>,
  options?: StateSaveOptions
): Promise<StateSaveResult<Record<string, MealSlot[]>>> {
  return saveState<Record<string, MealSlot[]>>('planner', meals, options);
}
