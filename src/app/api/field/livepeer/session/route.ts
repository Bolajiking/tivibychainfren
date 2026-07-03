import { NextResponse } from "next/server";
import { authorizeLiveFieldRequest, readLiveFieldConfig } from "@/lib/livepeer/field";
import { LIVEPEER_API } from "@/lib/livepeer/policy";
import { filterSessionsByParentId, livepeerSessionUpstreamUrl } from "@/lib/livepeer/sessions";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

export async function GET(request: Request) {
  const config = readLiveFieldConfig(process.env);
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const parentId = url.searchParams.get("parentId");

  if (!config || !authorizeLiveFieldRequest(config, token, parentId)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: PRIVATE_HEADERS });
  }

  try {
    const response = await fetch(livepeerSessionUpstreamUrl(LIVEPEER_API, config.streamId), {
      headers: { authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "upstream_unavailable" }, { status: 502, headers: PRIVATE_HEADERS });
    }
    const payload = await response.json();
    return NextResponse.json(
      { data: filterSessionsByParentId(payload, config.streamId) },
      { status: 200, headers: PRIVATE_HEADERS },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 502, headers: PRIVATE_HEADERS });
  }
}
