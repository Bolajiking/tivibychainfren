import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { supabaseAdmin } from "@/lib/db/client";
import { rowToStream } from "@/lib/db/map";
import { parseStreamControlInput, streamControlToRow } from "@/lib/creator-streams";
import { asRecord, DEFAULT_DONATION_PRESETS } from "@/lib/input-normalizers";
import { selectCanonicalStreamRow } from "@/lib/stream-selection";
import type { Stream } from "@/lib/types";

export async function PATCH(req: Request) {
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

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    const current = mockStream(record.currentStream, owner.walletAddress);
    const parsed = parseStreamControlInput(body, current);
    if (!parsed.ok) return bad(parsed.error);
    return NextResponse.json({ ok: true, stream: { ...current, ...parsed.value } });
  }

  const currentRow = record.playbackId
    ? await db
      .from("streams")
      .select("*")
      .eq("creator_id", owner.walletAddress)
      .eq("playback_id", String(record.playbackId))
      .maybeSingle()
    : await loadCanonicalStream(db, owner.walletAddress);
  if (!currentRow.data) return NextResponse.json({ ok: false, error: "stream_not_found" }, { status: 404 });

  const parsed = parseStreamControlInput(body, rowToStream(currentRow.data), new Date().toISOString(), {
    requireActivationSource: !MOCK_MODE,
    activationSource: record.activationSource === "livepeer_status" ? "livepeer_status" : undefined,
  });
  if (!parsed.ok) return bad(parsed.error);

  const { data, error } = await db
    .from("streams")
    .update(streamControlToRow(parsed.value))
    .eq("playback_id", currentRow.data.playback_id)
    .eq("creator_id", owner.walletAddress)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: "stream_update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, stream: rowToStream(data) });
}

function mockStream(value: unknown, creatorId: string): Stream {
  const record = asRecord(value);
  return {
    playbackId: String(record.playbackId ?? "live-demo"),
    creatorId,
    title: String(record.title ?? "Untitled live"),
    description: typeof record.description === "string" ? record.description : undefined,
    viewMode: record.viewMode === "one-time" || record.viewMode === "monthly" ? record.viewMode : "free",
    amount: Number(record.amount ?? 0),
    isActive: Boolean(record.isActive),
    viewerCount: Number(record.viewerCount ?? 0),
    thumbColor: typeof record.thumbColor === "string" ? record.thumbColor : "#2a2a2a",
    startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
    paidUsers: Array.isArray(record.paidUsers) ? record.paidUsers.map(String) : [],
    donationPresets: Array.isArray(record.donationPresets) ? record.donationPresets.map(Number) : [...DEFAULT_DONATION_PRESETS],
    record: typeof record.record === "boolean" ? record.record : true,
  };
}

async function loadCanonicalStream(db: NonNullable<ReturnType<typeof supabaseAdmin>>, creatorId: string) {
  const rows = await db.from("streams").select("*").eq("creator_id", creatorId);
  const data = selectCanonicalStreamRow(rows.data ?? []);
  return { data, error: rows.error };
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
