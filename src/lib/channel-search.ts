import { getSupabase } from "@/lib/db/client";
import { rowToCreator } from "@/lib/db/map";
import { slugifyUsername } from "@/lib/profile";
import { creators as seedCreators } from "@/lib/mock/seed";
import type { Creator } from "@/lib/types";

/**
 * Parse a channel link or handle into a username slug. Accepts:
 *   tvin.bio/adaplays · https://tvin.bio/adaplays · /adaplays · @adaplays · adaplays
 */
function parseChannelInput(input: string): string {
  let s = (input ?? "").trim();
  s = s.replace(/^https?:\/\//i, ""); // drop protocol
  if (s.includes("/")) s = s.slice(s.indexOf("/") + 1); // drop domain, keep path
  s = s.split(/[?#]/)[0]; // drop query/hash
  s = s.replace(/^@/, "").replace(/^\/+|\/+$/g, ""); // trim @ and slashes
  s = s.split("/")[0]; // first path segment
  return slugifyUsername(s);
}

/** Resolve a username to a public creator (real DB, or seed in mock mode). */
export async function resolveChannel(usernameOrLink: string): Promise<Creator | null> {
  const username = parseChannelInput(usernameOrLink);
  if (!username) return null;

  const db = getSupabase();
  if (db) {
    const { data } = await db.from("creators").select("*").eq("username", username).maybeSingle();
    return data ? rowToCreator(data) : null;
  }
  // Mock mode: resolve against the in-memory seed.
  return seedCreators.find((c) => c.username === username) ?? null;
}
