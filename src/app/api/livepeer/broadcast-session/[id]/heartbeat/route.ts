import { NextResponse } from "next/server";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { bridgeRuntime } from "@/lib/bridge/runtime";

/** POST /api/livepeer/broadcast-session/:id/heartbeat — keep the bridge lease alive pre-publish. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let owner;
  try {
    owner = await resolveOwner(req);
  } catch (e) {
    return authError(e);
  }
  const { id } = await ctx.params;
  const result = await bridgeRuntime().manager.heartbeat(id, owner.walletAddress);
  if (!result.ok) {
    const status =
      result.error === "attempt_not_found" ? 404 : result.error === "lease_expired" ? 410 : 403;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
