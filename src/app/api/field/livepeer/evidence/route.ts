import { NextResponse } from "next/server";
import {
  authorizeLiveFieldRequest,
  parseLiveFieldEvidence,
  readLiveFieldConfig,
} from "@/lib/livepeer/field";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

export async function POST(request: Request) {
  const config = readLiveFieldConfig(process.env);
  const token = new URL(request.url).searchParams.get("token");
  if (!config || !authorizeLiveFieldRequest(config, token, config.streamId)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: PRIVATE_HEADERS });
  }

  try {
    const body = await request.json();
    const evidence = parseLiveFieldEvidence(config, body);
    if (!evidence) {
      return NextResponse.json({ ok: false, error: "invalid_evidence" }, { status: 400, headers: PRIVATE_HEADERS });
    }
    console.info(`[field-evidence] ${JSON.stringify(evidence)}`);
    return new NextResponse(null, { status: 204, headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400, headers: PRIVATE_HEADERS });
  }
}
