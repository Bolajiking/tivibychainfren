import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { slugifyUsername } from "@/lib/profile";
import { creators as mockCreators } from "@/lib/mock/seed";

/**
 * Handle availability for the claim moment (F4).
 *
 * The claim screen makes the URL the hero, so availability has to resolve
 * inline — a page reload here would cost most of the 60-second budget. When a
 * handle is taken we return three suggestions rather than a dead end.
 *
 * Reads only whether a username row exists; no profile data leaves this route.
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("u") ?? "";
  const username = slugifyUsername(requested);

  if (username.length < 3) {
    return NextResponse.json({ ok: false, error: "too_short", username });
  }

  const taken = await isTaken(username);
  if (!taken) return NextResponse.json({ ok: true, username, available: true });

  const suggestions: string[] = [];
  for (const candidate of candidatesFor(username)) {
    if (suggestions.length >= 3) break;
    if (!(await isTaken(candidate))) suggestions.push(candidate);
  }

  return NextResponse.json({ ok: true, username, available: false, suggestions });
}

async function isTaken(username: string): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) {
    // Mock mode has no database; the seeded channels are the whole namespace.
    return MOCK_MODE ? mockCreators.some((creator) => creator.username === username) : false;
  }
  const { data } = await db.from("creators").select("creator_id").eq("username", username).maybeSingle();
  return Boolean(data);
}

/** Suggestions keep the handle recognisable — fans have to type it. */
function* candidatesFor(username: string): Generator<string> {
  yield `${username}tv`;
  yield `${username}live`;
  yield `the${username}`;
  yield `${username}hq`;
  for (let n = 1; n <= 9; n += 1) yield `${username}${n}`;
}
