import { NextResponse } from "next/server";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { bridgeRuntime } from "@/lib/bridge/runtime";

/** GET /api/livepeer/broadcast-session/:id — owner-scoped lease publishing state. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let owner;
  try {
    owner = await resolveOwner(req);
  } catch (e) {
    return authError(e);
  }
  const { id } = await ctx.params;
  const result = await bridgeRuntime().manager.status(id, owner.walletAddress);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, {
      status: result.error === "attempt_not_found" ? 404 : 403,
    });
  }
  return NextResponse.json(
    { ok: true, publishing: result.publishing },
    { headers: { "cache-control": "no-store" } },
  );
}

/** DELETE /api/livepeer/broadcast-session/:id — revoke the attempt and its lease. Idempotent. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let owner;
  try {
    owner = await resolveOwner(req);
  } catch (e) {
    return authError(e);
  }
  const { id } = await ctx.params;
  const result = await bridgeRuntime().manager.revoke(id, owner.walletAddress);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
