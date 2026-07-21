import test from "node:test";
import assert from "node:assert/strict";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const { configWarnings } = await loadTsModule(new URL("../src/lib/config-guard.ts", import.meta.url));

test("all-off (mock mode, non-production) is clean", () => {
  assert.deepEqual(configWarnings({}), []);
});

test("production without Supabase warns about mock mode", () => {
  const warnings = configWarnings({ NODE_ENV: "production", VERCEL: "1" });
  assert.ok(warnings.some((w) => w.includes("MOCK MODE")));
});

test("supabase without privy warns that owner routes will 503", () => {
  const warnings = configWarnings({
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "svc",
  });
  assert.ok(warnings.some((w) => w.includes("Privy")));
});

test("privy app id without secret warns", () => {
  const warnings = configWarnings({
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "svc",
    NEXT_PUBLIC_PRIVY_APP_ID: "app",
  });
  assert.ok(warnings.some((w) => w.includes("PRIVY_APP_SECRET")));
});

test("supabase without service role key warns", () => {
  const warnings = configWarnings({
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    NEXT_PUBLIC_PRIVY_APP_ID: "app",
    PRIVY_APP_SECRET: "s",
  });
  assert.ok(warnings.some((w) => w.includes("SUPABASE_SERVICE_ROLE_KEY")));
});

test("fully configured production is clean", () => {
  const warnings = configWarnings({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "svc",
    NEXT_PUBLIC_PRIVY_APP_ID: "app",
    PRIVY_APP_SECRET: "s",
    LIVEPEER_API_KEY: "lp",
    LIVEPEER_WEBHOOK_SECRET: "wh",
  });
  assert.deepEqual(warnings, []);
});
