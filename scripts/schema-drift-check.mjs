/**
 * Manual check: does the live database actually have everything the app writes?
 *
 * Migrations in `supabase/migrations/` are applied by hand through the Supabase
 * SQL editor, so nothing guarantees production matches the repo. On 2026-07-21
 * three migrations (0013, 0014, 0015) had been skipped while later ones (0016,
 * 0018, 0019) were applied — "the latest migration worked" hid the gap, and the
 * damage was silent:
 *
 *   - videos.thumbnail_url missing  -> every VOD upload failed with
 *     "Couldn't save the video" (Postgres 42703, mapped to video_write_failed)
 *   - increment_subscriber_count missing -> follows never incremented the fan
 *     count, because supabase-js .rpc() returns an error object instead of
 *     throwing, so the route carried on as if it had worked
 *   - broadcast_bridge_leases missing -> the bridge's lease audit trail would
 *     vanish into a best-effort try/catch the moment the bridge went live
 *
 * Every entry below is something application code depends on at runtime. Add to
 * it whenever a migration adds a column, table or function the app writes.
 *
 * Not part of `npm test` — needs live credentials.
 *
 *   node scripts/schema-drift-check.mjs                  # uses .env.local
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/schema-drift-check.mjs
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

/** [migration, kind, target, detail, why it matters if missing] */
const EXPECTATIONS = [
  ["0001", "table", "creators", null, "core"],
  ["0001", "table", "streams", null, "core"],
  ["0001", "table", "videos", null, "core"],
  ["0001", "table", "products", null, "store"],
  ["0001", "table", "orders", null, "checkout"],
  ["0001", "table", "subscriptions", null, "follows + paid access"],
  ["0001", "table", "chats", null, "chat"],
  ["0001", "table", "notifications", null, "notifications"],
  ["0005", "table", "settled_payments", null, "payment replay protection"],
  ["0006", "column", "videos", "livepeer_id", "VOD asset mapping"],
  ["0006", "column", "streams", "livepeer_id", "live stream mapping"],
  ["0008", "column", "videos", "livepeer_playback_id", "VOD playback"],
  ["0010", "table", "creator_invite_codes", null, "invite redemption"],
  ["0012", "column", "creators", "header_url", "channel header"],
  ["0013", "column", "videos", "thumbnail_url", "VOD UPLOAD FAILS WITHOUT THIS"],
  ["0013", "table", "video_comments", null, "VOD comments"],
  ["0014", "rpc", "increment_subscriber_count", { p_creator_id: "0x0" }, "follows silently do not count"],
  ["0015", "table", "broadcast_bridge_leases", null, "bridge lease audit trail"],
  ["0016", "column", "creators", "accent_color", "creator theming"],
  ["0016", "column", "creators", "theme_variant", "creator theming"],
  ["0018", "rpc", "prune_expired_paid_users", {}, "monthly access expiry"],
  ["0019", "table", "broadcast_bridge_attempts", null, "bridge on serverless"],
  ["0019", "table", "broadcast_bridge_lease_events", null, "bridge lease rate limiting"],
];

async function loadEnv() {
  const out = {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
  if (out.url && out.key) return out;
  try {
    const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!m) continue;
      const v = m[2].replace(/^["']|["']$/g, "");
      if (!out.url && (m[1] === "NEXT_PUBLIC_SUPABASE_URL" || m[1] === "SUPABASE_URL")) out.url = v;
      if (!out.key && m[1] === "SUPABASE_SERVICE_ROLE_KEY") out.key = v;
    }
  } catch {
    // env vars only
  }
  return out;
}

async function main() {
  const { url, key } = await loadEnv();
  if (!url || !key) {
    console.error("Need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  // supabase-js builds a realtime client in its constructor; Node < 22 has no
  // global WebSocket. Same shim src/lib/db/client.ts uses.
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  console.log(`\nSchema drift check\n  target: ${url}\n`);

  const missing = [];
  for (const [migration, kind, target, detail, why] of EXPECTATIONS) {
    let ok = false;
    let note = "";
    try {
      if (kind === "table") {
        const { error } = await db.from(target).select("*").limit(1);
        ok = !error;
        note = error?.message ?? "";
      } else if (kind === "column") {
        const { error } = await db.from(target).select(detail).limit(1);
        ok = !error;
        note = error?.message ?? "";
      } else {
        // A missing function is a "does not exist" error; any other error means
        // the function IS there and merely rejected the probe arguments.
        const { error } = await db.rpc(target, detail ?? {});
        ok = !error || !/does not exist|could not find|not find the function/i.test(error.message);
        note = error?.message ?? "";
      }
    } catch (e) {
      ok = false;
      note = e.message;
    }

    const label = kind === "column" ? `${target}.${detail}` : target;
    if (ok) {
      console.log(`  ok       ${migration}  ${kind.padEnd(6)} ${label}`);
    } else {
      console.log(`  MISSING  ${migration}  ${kind.padEnd(6)} ${label}   <- ${why}`);
      missing.push({ migration, label, why, note });
    }
  }

  if (missing.length === 0) {
    console.log(`\nNo drift. The live schema has everything the app writes.\n`);
    process.exit(0);
  }

  const migrations = [...new Set(missing.map((m) => m.migration))].sort();
  console.log(`\n${missing.length} missing across migration(s): ${migrations.join(", ")}`);
  console.log(`\nApply the corresponding files from supabase/migrations/ in the Supabase SQL editor:`);
  for (const m of migrations) console.log(`  supabase/migrations/${m}_*.sql`);
  console.log("");
  process.exit(1);
}

main().catch((error) => {
  console.error("\ndrift check aborted:", error.message);
  process.exit(1);
});
