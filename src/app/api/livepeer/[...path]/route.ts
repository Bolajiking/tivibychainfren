import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { authError, resolveOwner, type OwnerContext } from "@/lib/auth/owner";
import { matchesAny } from "@/lib/access";
import { asRecord } from "@/lib/input-normalizers";
import {
  LIVEPEER_API,
  matchProxyRoute,
  redactSecrets,
  filterWritableStreamFields,
} from "@/lib/livepeer/policy";
import {
  filterSessionsByParentId,
  livepeerSessionUpstreamUrl,
  parseForceNewLivepeerStream,
  shouldReuseLivepeerStream,
} from "@/lib/livepeer/sessions";

/**
 * The Livepeer key-holder proxy (spec §8.1). The LIVEPEER_API_KEY is injected
 * here and never shipped to the browser. The allow-list in policy.ts is the
 * entire reachable surface; owner routes require Privy auth; per-id stream/asset
 * operations are owner-scoped against our DB mapping; and ingest secrets are
 * stripped from every read.
 */
export const GET = handler;
export const POST = handler;
export const PATCH = handler;

async function handler(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!config.livepeer.enabled) {
    return NextResponse.json({ ok: false, error: "livepeer_unconfigured" }, { status: 503 });
  }

  const { path } = await ctx.params;
  const segments = (path ?? []).map((s) => String(s));
  const rule = matchProxyRoute(req.method, segments);
  if (!rule) return NextResponse.json({ ok: false, error: "route_not_allowed" }, { status: 404 });

  // Read the request body once (routes that need it are non-GET).
  let rawBody: Record<string, unknown> = {};
  if (req.method !== "GET") {
    try {
      rawBody = asRecord(await req.json());
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
  }

  // Owner-gated routes: authenticate, then bind per-resource ownership.
  let owner: OwnerContext | null = null;
  if (rule.requireOwner) {
    try {
      owner = await resolveOwner(req, rawBody);
    } catch (e) {
      return authError(e);
    }
    const denial = await assertResourceOwnership(req, segments, owner);
    if (denial) return denial;
    if (req.method === "POST" && requiresAppResourceMapping(segments) && !isNonEmptyString(rawBody.tvinbioPlaybackId)) {
      return NextResponse.json({ ok: false, error: "missing_tvinbio_playback_id" }, { status: 400 });
    }
  }

  // One Livepeer stream per channel. If this channel already provisioned a stream,
  // reuse it — subsequent broadcasts are new *sessions* under the same stream key,
  // not new streams. Mint a new Livepeer stream only when none exists yet, the
  // mapped one was deleted upstream, or the creator explicitly rotates ingest.
  if (req.method === "POST" && segments[0] === "stream" && owner && isNonEmptyString(rawBody.tvinbioPlaybackId)) {
    const existingLivepeerId = await findChannelStreamLivepeerId(owner, rawBody.tvinbioPlaybackId);
    if (shouldReuseLivepeerStream(existingLivepeerId, parseForceNewLivepeerStream(rawBody.forceNew))) {
      const reused = await fetchLivepeerStream(existingLivepeerId);
      if (reused) {
        return NextResponse.json(reused, { status: 200, headers: { "cache-control": "no-store" } });
      }
      // Mapped stream is gone upstream — fall through and create a fresh one.
    }
  }

  // Build and forward the upstream request with the server-held key.
  let bodyText: string | undefined;
  if (req.method !== "GET") {
    const forwarded =
      rule.method === "PATCH" && segments[0] === "stream"
        ? filterWritableStreamFields(rawBody)
        : stripInternalFields(rawBody);
    bodyText = JSON.stringify(forwarded);
  }

  let upstream: Response;
  try {
    const sessionParentId = segments[0] === "session" ? getSessionParentId(req) : null;
    const upstreamUrl = sessionParentId
      ? livepeerSessionUpstreamUrl(LIVEPEER_API, sessionParentId)
      : livepeerUpstreamUrl(segments);
    upstream = await fetchUpstreamWithRetry(upstreamUrl, {
      method: req.method,
      headers: {
        authorization: `Bearer ${process.env.LIVEPEER_API_KEY}`,
        ...(bodyText ? { "content-type": "application/json" } : {}),
      },
      body: bodyText,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  // Only the public playback route redacts (no secrets there anyway). Stream/asset
  // reads are owner-verified per-id above, so the verified owner gets their key.
  let out = rule.redactSecrets ? redactSecrets(payload) : payload;
  if (upstream.ok && req.method === "GET" && segments[0] === "session") {
    const parentId = getSessionParentId(req);
    const base = Array.isArray(out) ? {} : asRecord(out);
    out = {
      ...base,
      data: parentId ? filterSessionsByParentId(out, parentId) : [],
    };
  }

  // Persist the Livepeer id ↔ our resource mapping when a creator provisions one.
  if (upstream.ok && owner && req.method === "POST") {
    let mappingError: string | null = null;
    if (segments[0] === "stream") {
      mappingError = await persistStreamMapping(out, rawBody.tvinbioPlaybackId, owner);
    } else if (segments[0] === "asset" && segments[1] === "request-upload") {
      mappingError = await persistAssetMapping(asRecord(out).asset, rawBody.tvinbioPlaybackId, owner);
    }
    if (mappingError) {
      const status = mappingError.endsWith("_not_found") ? 404 : 500;
      return NextResponse.json({ ok: false, error: mappingError }, { status });
    }
  }

  return NextResponse.json(out, { status: upstream.status, headers: { "cache-control": "no-store" } });
}

/** For per-id stream/asset routes, the caller's creator must own the resource. */
async function assertResourceOwnership(
  req: Request,
  segments: string[],
  owner: OwnerContext,
): Promise<NextResponse | null> {
  if (segments[0] === "session") {
    const parentId = getSessionParentId(req);
    if (!parentId) return NextResponse.json({ ok: false, error: "missing_parent_livepeer_id" }, { status: 400 });
    const ownershipDenial = await assertOwnerOwnsMappedLivepeerStream(owner, parentId);
    if (ownershipDenial) return ownershipDenial;
    return null;
  }

  // Only routes carrying a concrete resource id need a per-resource check.
  // `asset/request-upload` is a creation sub-route (id segment is the literal
  // "request-upload", not an asset id) — its owner binding happens via the
  // tvinbio draft mapping, not a per-id Livepeer lookup. Skip it here.
  if (segments[0] === "asset" && segments[1] === "request-upload") return null;
  const id = segments.length === 2 ? segments[1] : segments[0] === "stream" && segments[2] === "sessions" ? segments[1] : null;
  if (!id || (segments[0] !== "stream" && segments[0] !== "asset")) return null;

  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });

  const table = segments[0] === "stream" ? "streams" : "videos";
  const { data } = await db.from(table).select("creator_id").eq("livepeer_id", id).maybeSingle();
  // Unmapped id → not provisioned through us → deny (closes cross-creator access).
  if (!data || !matchesAny(owner.walletAddresses, data.creator_id)) {
    return NextResponse.json({ ok: false, error: "not_resource_owner" }, { status: 403 });
  }
  return null;
}

async function assertOwnerOwnsMappedLivepeerStream(owner: OwnerContext, livepeerId: string): Promise<NextResponse | null> {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
  const { data } = await db
    .from("streams")
    .select("creator_id")
    .eq("livepeer_id", livepeerId.trim())
    .maybeSingle();
  return data && matchesAny(owner.walletAddresses, data.creator_id)
    ? null
    : NextResponse.json({ ok: false, error: "not_resource_owner" }, { status: 403 });
}

/** A newly created Livepeer stream is attached to the creator's tvinbio stream. */
async function persistStreamMapping(payload: unknown, tvinbioPlaybackId: unknown, owner: OwnerContext): Promise<string | null> {
  const record = asRecord(payload);
  const livepeerId = record.id;
  if (!livepeerId) return "livepeer_response_invalid";
  if (!isNonEmptyString(tvinbioPlaybackId)) return "missing_tvinbio_playback_id";
  const db = supabaseAdmin();
  if (!db) return "server_unconfigured";
  const patch: Record<string, string> = { livepeer_id: String(livepeerId) };
  if (record.playbackId) patch.livepeer_playback_id = String(record.playbackId);
  const { data, error } = await db
    .from("streams")
    .update(patch)
    .eq("creator_id", owner.walletAddress)
    .eq("playback_id", tvinbioPlaybackId.trim())
    .select("playback_id")
    .maybeSingle();
  if (error) {
    console.error("[livepeer proxy] stream mapping failed:", error);
    return "stream_mapping_failed";
  }
  if (!data) return "stream_not_found";
  return null;
}

/** A newly requested Livepeer asset is attached to the creator's tvinbio video. */
async function persistAssetMapping(asset: unknown, tvinbioPlaybackId: unknown, owner: OwnerContext): Promise<string | null> {
  const record = asRecord(asset);
  const livepeerId = record.id;
  if (!livepeerId) return "livepeer_response_invalid";
  if (!isNonEmptyString(tvinbioPlaybackId)) return "missing_tvinbio_playback_id";
  const db = supabaseAdmin();
  if (!db) return "server_unconfigured";
  const patch: Record<string, string> = { livepeer_id: String(livepeerId) };
  if (record.playbackId) patch.livepeer_playback_id = String(record.playbackId);
  const { data, error } = await db
    .from("videos")
    .update(patch)
    .eq("creator_id", owner.walletAddress)
    .eq("playback_id", tvinbioPlaybackId.trim())
    .select("playback_id")
    .maybeSingle();
  if (error) {
    console.error("[livepeer proxy] asset mapping failed:", error);
    return "asset_mapping_failed";
  }
  if (!data) return "video_not_found";
  return null;
}

/** The Livepeer stream id already provisioned for this creator's channel, if any. */
async function findChannelStreamLivepeerId(owner: OwnerContext, tvinbioPlaybackId: string): Promise<string | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("streams")
    .select("livepeer_id")
    .eq("creator_id", owner.walletAddress)
    .eq("playback_id", tvinbioPlaybackId.trim())
    .maybeSingle();
  const id = data?.livepeer_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Fetch an existing Livepeer stream (incl. stream key) by id; null if it's gone upstream. */
async function fetchLivepeerStream(livepeerId: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${LIVEPEER_API}/stream/${encodeURIComponent(livepeerId)}`, {
      headers: { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/** Retry transient upstream failures (408/425/429/5xx) with backoff, like the reference proxy. */
async function fetchUpstreamWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      // Don't retry non-idempotent writes on 5xx — they may have applied. Only retry GETs.
      if (RETRYABLE.has(res.status) && i < attempts - 1 && (init.method ?? "GET") === "GET") {
        await delay(250 * 2 ** i);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await delay(250 * 2 ** i);
    }
  }
  throw lastErr;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Strip TVinBio-internal fields so they never reach Livepeer. */
function stripInternalFields(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const rest = { ...(body as Record<string, unknown>) };
  delete rest.walletAddress;
  delete rest.tvinbioPlaybackId;
  delete rest.forceNew;
  return rest;
}

function livepeerUpstreamUrl(segments: string[]): string {
  return `${LIVEPEER_API}/${segments.map(encodeURIComponent).join("/")}`;
}

function getSessionParentId(req: Request): string | null {
  const parentId = new URL(req.url).searchParams.get("parentId");
  return isNonEmptyString(parentId) ? parentId.trim() : null;
}

function requiresAppResourceMapping(segments: string[]): boolean {
  return segments[0] === "stream" || (segments[0] === "asset" && segments[1] === "request-upload");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
