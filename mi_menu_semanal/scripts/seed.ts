/**
 * scripts/seed.ts — Administrative seed script.
 *
 * This script is NOT part of the web application. It must be run manually
 * from the command line in a local or staging environment only.
 *
 * Requirements:
 *   1. SEED_CONFIRM=yes must be set explicitly.
 *   2. NEXT_PUBLIC_SUPABASE_URL must match a project in the allowlist.
 *   3. NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.
 *   4. Must not be invoked during build, deploy, or CI.
 *   5. tsx must be installed as a devDependency (not downloaded via npx).
 *
 * Usage:
 *   SEED_CONFIRM=yes npm run db:seed
 *   # or: SEED_CONFIRM=yes npx tsx scripts/seed.ts
 *
 * The allowlist below contains ONLY development/staging project hostnames.
 * The production project must NEVER be added to this list.
 */

import { createClient } from "@supabase/supabase-js";

// ─── Denylist: Explicitly blocked production host patterns ───────────────────
// Any host matching these patterns is blocked immediately, even if mistakenly
// placed in ALLOWED_SUPABASE_HOSTS.
const BLOCKED_SUPABASE_PATTERNS: (string | RegExp)[] = [
  /prod/i,
  /production/i,
];

// ─── Allowlist: ONLY dev/staging Supabase project hosts ───────────────────────
// Format: "<project-ref>.supabase.co"
// DO NOT ADD THE PRODUCTION PROJECT HERE.
const ALLOWED_SUPABASE_HOSTS: string[] = [
  // Example: "abc123dev.supabase.co"
  // Add your dev/staging project ref here before first use.
];

// ─── Safety Checks ───────────────────────────────────────────────────────────

// 1. Explicit confirmation
const SEED_CONFIRM = process.env.SEED_CONFIRM;
if (SEED_CONFIRM !== "yes") {
  console.error(
    "❌ SEED_CONFIRM=yes is required to run this script.\n" +
      "   Usage: SEED_CONFIRM=yes npm run db:seed"
  );
  process.exit(1);
}

// 2. Environment variables must be present
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
      "   Set them in your .env.local or export them before running."
  );
  process.exit(1);
}

// 3. Block production and CI deployment environments
const isProdEnv =
  process.env.NODE_ENV === "production" ||
  process.env.NETLIFY === "true" ||
  process.env.CONTEXT === "production" ||
  process.env.VERCEL_ENV === "production" ||
  process.env.CI === "true";

if (isProdEnv) {
  console.error(
    "❌ This script must not be run in production or automated deployment environments.\n" +
      "   Blocked by environment flag (NODE_ENV=production, NETLIFY, CONTEXT, VERCEL_ENV, or CI)."
  );
  process.exit(1);
}

// 4. Validate Supabase URL
let supabaseHost: string;
try {
  supabaseHost = new URL(supabaseUrl).hostname;
} catch {
  console.error(
    `❌ NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${supabaseUrl}`
  );
  process.exit(1);
}

// 5. Check against explicit production denylist
const isDenylisted = BLOCKED_SUPABASE_PATTERNS.some((pattern) =>
  typeof pattern === "string" ? pattern === supabaseHost : pattern.test(supabaseHost)
);
if (isDenylisted) {
  console.error(
    `❌ Supabase host '${supabaseHost}' matches the production denylist.\n` +
      "   Seeding against production is strictly prohibited."
  );
  process.exit(1);
}

// 6. Validate Supabase URL against the allowlist
if (ALLOWED_SUPABASE_HOSTS.length === 0) {
  console.error(
    "❌ The Supabase host allowlist is empty.\n" +
      "   Edit scripts/seed.ts and add your dev/staging project hostname\n" +
      "   to ALLOWED_SUPABASE_HOSTS before running.\n" +
      "   Example: 'abc123dev.supabase.co'\n" +
      "   DO NOT add the production project."
  );
  process.exit(1);
}

if (!ALLOWED_SUPABASE_HOSTS.includes(supabaseHost)) {
  console.error(
    `❌ Supabase host '${supabaseHost}' is not in the allowlist.\n` +
      `   Allowed hosts: ${ALLOWED_SUPABASE_HOSTS.join(", ")}\n` +
      "   If this is a dev/staging project, add it to ALLOWED_SUPABASE_HOSTS in scripts/seed.ts.\n" +
      "   DO NOT add the production project."
  );
  process.exit(1);
}

console.log(`✅ Supabase host '${supabaseHost}' is in the allowlist.`);

// ─── Seed Logic ───────────────────────────────────────────────────────────────

async function main() {
  const { CATEGORIES, RECIPES } = await import("../data/mockData");
  const supabase = createClient(supabaseUrl!, supabaseKey!);

  console.log("🌱 Starting seed...");

  // 1. Categories
  console.log("  → Inserting categories...");
  const { error: catError } = await supabase.from("categories").upsert(
    CATEGORIES.map((cat: Record<string, unknown>) => ({
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
    RECIPES.map((rec: Record<string, unknown>) => ({
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
}

main().catch((err: unknown) => {
  console.error("❌ Seed script failed:", err);
  process.exit(1);
});

