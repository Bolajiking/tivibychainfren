import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { asRecord } from "@/lib/input-normalizers";

/**
 * Redeem a creator invite code for the authenticated wallet. The
 * `redeem_creator_invite` RPC is row-locked and idempotent (returns `already`
 * if this wallet was granted before), so double-submits can't over-redeem.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("invalid_json");
  }
  const record = asRecord(body);

  let owner;
  try {
    owner = await resolveOwner(req, body);
  } catch (error) {
    return authError(error);
  }

  const code = String(record.code ?? "").trim();
  if (!code) return bad("missing_code");

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, granted: true });
  }

  const { data, error } = await db.rpc("redeem_creator_invite", {
    p_creator_id: owner.walletAddress,
    p_code: code,
  });
  if (error) return NextResponse.json({ ok: false, error: "redeem_failed" }, { status: 500 });

  const result = (data ?? {}) as { ok?: boolean; error?: string; already?: boolean };
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "invalid_code" }, { status: 400 });

  return NextResponse.json({ ok: true, granted: true, already: !!result.already });
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
