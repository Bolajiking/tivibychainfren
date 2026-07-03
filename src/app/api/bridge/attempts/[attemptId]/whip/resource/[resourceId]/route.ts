import { NextResponse } from "next/server";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { bridgeRuntime } from "@/lib/bridge/runtime";

type RouteContext = { params: Promise<{ attemptId: string; resourceId: string }> };

/** PATCH — trickle ICE to the stored upstream WHIP resource (spec §7.5). */
export async function PATCH(req: Request, ctx: RouteContext) {
  return handle(req, ctx, "PATCH");
}

/** DELETE — idempotent teardown of the WHIP resource (spec §7.5). */
export async function DELETE(req: Request, ctx: RouteContext) {
  return handle(req, ctx, "DELETE");
}

async function handle(req: Request, ctx: RouteContext, method: "PATCH" | "DELETE") {
  let owner;
  try {
    owner = await resolveOwner(req);
  } catch (e) {
    return authError(e);
  }
  const { attemptId, resourceId } = await ctx.params;
  const { manager, proxy } = bridgeRuntime();
  if (!manager.getAttempt(attemptId, owner.walletAddress)) {
    return NextResponse.json({ ok: false, error: "attempt_not_found" }, { status: 404 });
  }

  const result =
    method === "PATCH"
      ? await proxy.patch({
          attemptId,
          resourceId,
          contentType: req.headers.get("content-type"),
          body: await req.text().catch(() => ""),
        })
      : await proxy.del({ attemptId, resourceId });

  if (result.reasonCode) {
    return NextResponse.json({ ok: false, error: result.reasonCode }, { status: result.status });
  }
  return new NextResponse(result.body, {
    status: result.status,
    headers: { ...result.headers, "cache-control": "no-store" },
  });
}
