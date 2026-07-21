import { NextResponse } from "next/server";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { bridgeRuntime } from "@/lib/bridge/runtime";

/**
 * POST /api/bridge/attempts/:attemptId/whip — same-origin WHIP offer proxy
 * (spec §7.5). Auth first: the attempt must belong to the caller's channel
 * before any upstream contact.
 */
export async function POST(req: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  let owner;
  try {
    owner = await resolveOwner(req);
  } catch (e) {
    return authError(e);
  }
  const { attemptId } = await ctx.params;
  const { manager, proxy } = bridgeRuntime();
  if (!(await manager.getAttempt(attemptId, owner.walletAddress))) {
    return NextResponse.json({ ok: false, error: "attempt_not_found" }, { status: 404 });
  }

  const body = await req.text().catch(() => "");
  const result = await proxy.post({
    attemptId,
    contentType: req.headers.get("content-type"),
    body,
  });
  if (result.reasonCode) {
    return NextResponse.json({ ok: false, error: result.reasonCode }, { status: result.status });
  }
  return new NextResponse(result.body, {
    status: result.status,
    headers: { ...result.headers, "cache-control": "no-store" },
  });
}
