import { NextResponse } from "next/server";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { matchesAny } from "@/lib/access";
import { asRecord } from "@/lib/input-normalizers";
import { bridgeRuntime } from "@/lib/bridge/runtime";

/**
 * POST /api/livepeer/broadcast-session — create a broadcast attempt and its
 * transport plan (spec §6). Owner-authenticated; the plan never carries an
 * RTMP destination, bridge credential, or upstream MediaMTX URL.
 */
export async function POST(req: Request) {
  if (!config.livepeer.enabled) {
    return NextResponse.json({ ok: false, error: "livepeer_unconfigured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = asRecord(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  let owner;
  try {
    owner = await resolveOwner(req, body);
  } catch (e) {
    return authError(e);
  }

  const livepeerId = typeof body.livepeerId === "string" ? body.livepeerId.trim() : "";
  if (!livepeerId) {
    return NextResponse.json({ ok: false, error: "missing_livepeer_id" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
  const { data } = await db.from("streams").select("creator_id").eq("livepeer_id", livepeerId).maybeSingle();
  if (!data || !matchesAny(owner.walletAddresses, data.creator_id)) {
    return NextResponse.json({ ok: false, error: "not_resource_owner" }, { status: 403 });
  }

  const result = await bridgeRuntime().manager.create({
    creatorId: owner.walletAddress,
    livepeerId,
    userAgent: req.headers.get("user-agent") ?? "",
  });
  if (!result.ok) {
    const status = result.error === "broadcast_in_progress" ? 409 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json(
    { ok: true, plan: result.plan },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
