import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { PrivyAuthError, requirePrivyUser } from "@/lib/auth/server";

export interface OwnerContext {
  walletAddress: string;
  walletAddresses: string[];
}

export async function resolveOwner(req: Request, body?: unknown): Promise<OwnerContext> {
  if (MOCK_MODE) {
    const record = mockOwnerBody(body);
    const walletAddress = String(record.walletAddress ?? req.headers.get("x-tvinbio-wallet") ?? "").toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(walletAddress)) return { walletAddress, walletAddresses: [walletAddress] };
  }
  return requirePrivyUser(req);
}

export function authError(error: unknown) {
  if (error instanceof PrivyAuthError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function mockOwnerBody(value: unknown): { walletAddress?: unknown } {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
