#!/usr/bin/env npx tsx
/**
 * scripts/seed.ts — Administrative seed script.
 *
 * This script is NOT part of the web application. It must be run manually
 * from the command line in a local or staging environment only.
 *
 * Requirements:
 *   1. SEED_CONFIRM=yes must be set explicitly.
 *   2. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.
 *   3. Must not be invoked during build, deploy, or CI.
 *
 * Usage:
 *   SEED_CONFIRM=yes npx tsx scripts/seed.ts
 */

import { createClient } from "@supabase/supabase-js";

// ─── Safety Checks ───────────────────────────────────────────────────────────

const SEED_CONFIRM = process.env.SEED_CONFIRM;
if (SEED_CONFIRM !== "yes") {
  console.error(
    "❌ SEED_CONFIRM=yes is required to run this script.\n" +
      "   Usage: SEED_CONFIRM=yes npx tsx scripts/seed.ts"
  );
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
      "   Set them in your .env.local or export them before running."
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error(
    "❌ This script must not be run in production.\n" +
      "   Set NODE_ENV to development or staging."
  );
  process.exit(1);
}

// ─── Seed Logic ───────────────────────────────────────────────────────────────

// Dynamic import so the script can resolve the data module from the project
const { CATEGORIES, RECIPES } = await import("../data/mockData");

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("🌱 Starting seed...");

// 1. Categories
console.log("  → Inserting categories...");
const { error: catError } = await supabase.from("categories").upsert(
  CATEGORIES.map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    is_active: cat.isActive || false,
  }))
);
if (catError) {
  console.error("❌ Category insert failed:", catError.message);
  process.exit(1);
}

// 2. Recipes
console.log("  → Inserting recipes...");
const { error: recError } = await supabase.from("recipes").upsert(
  RECIPES.map((rec: any) => ({
    id: rec.id,
    title: rec.title,
    image: rec.image,
    tags: rec.tags,
    type: rec.type,
    time: rec.time || null,
    rating: rec.rating || null,
    is_weekly_favorite: rec.isWeeklyFavorite || false,
    servings: rec.servings || null,
    calories: rec.calories || null,
    description: rec.description || null,
  }))
);
if (recError) {
  console.error("❌ Recipe insert failed:", recError.message);
  process.exit(1);
}

console.log("✅ Seed completed successfully.");
