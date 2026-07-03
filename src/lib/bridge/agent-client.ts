import { randomUUID } from "node:crypto";
import { signBridgeRequest } from "@/lib/bridge/hmac";

export interface BridgeAgentLease {
  leaseId: string;
  whipUrl: string;
  publishToken: string;
  expiresAt: string | null;
}

export interface BridgeAgentLeaseStatus {
  status: string;
  publishing: boolean;
}

export interface BridgeAgentClient {
  health(): Promise<boolean>;
  createLease(input: {
    leaseId: string;
    attemptId: string;
    creatorId: string;
    rtmpUrl: string;
  }): Promise<BridgeAgentLease | null>;
  heartbeatLease(leaseId: string): Promise<boolean>;
  revokeLease(leaseId: string): Promise<void>;
  leaseStatus(leaseId: string): Promise<BridgeAgentLeaseStatus | null>;
}

type Fetcher = (url: string, init: RequestInit & { headers: Record<string, string> }) => Promise<Response>;

export interface BridgeAgentClientOptions {
  controlUrl: string;
  controlSecret: string;
  fetcher?: Fetcher;
  nowSeconds?: () => number;
  mintNonce?: () => string;
  timeoutMs?: number;
  /** Structured, secret-free log sink. */
  log?: (entry: Record<string, unknown>) => void;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export function createBridgeAgentClient(opts: BridgeAgentClientOptions): BridgeAgentClient {
  const base = opts.controlUrl.replace(/\/$/, "");
  const nowSeconds = opts.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const mintNonce = opts.mintNonce ?? (() => randomUUID());
  const log = opts.log ?? (() => {});
  const fetcher: Fetcher =
    opts.fetcher ??
    (async (url, init) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
      } finally {
        clearTimeout(timer);
      }
    });

  async function signedRequest(method: string, path: string, body: unknown): Promise<Response | null> {
    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const timestampSeconds = nowSeconds();
    const nonce = mintNonce();
    const signature = signBridgeRequest(opts.controlSecret, {
      method,
      path,
      timestampSeconds,
      nonce,
      body: bodyText,
    });
    try {
      return await fetcher(`${base}${path}`, {
        method,
        headers: {
          ...(bodyText ? { "content-type": "application/json" } : {}),
          "x-tvinbio-timestamp": String(timestampSeconds),
          "x-tvinbio-nonce": nonce,
          "x-tvinbio-signature": signature,
        },
        body: bodyText || undefined,
      });
    } catch {
      log({ event: "bridge_agent_unreachable", method, path });
      return null;
    }
  }

  return {
    async health() {
      try {
        const response = await fetcher(`${base}/healthz`, { method: "GET", headers: {} });
        return response.ok;
      } catch {
        return false;
      }
    },

    async createLease(input) {
      const response = await signedRequest("POST", "/v1/leases", {
        leaseId: input.leaseId,
        attemptId: input.attemptId,
        creatorId: input.creatorId,
        rtmpUrl: input.rtmpUrl,
      });
      if (!response || response.status !== 201) {
        log({ event: "bridge_lease_create_failed", attemptId: input.attemptId, status: response?.status ?? null });
        return null;
      }
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const leaseId = typeof payload?.leaseId === "string" ? payload.leaseId : null;
      const whipUrl = typeof payload?.whipUrl === "string" ? payload.whipUrl : null;
      const publishToken = typeof payload?.publishToken === "string" ? payload.publishToken : null;
      if (!leaseId || !whipUrl || !publishToken) {
        log({ event: "bridge_lease_create_invalid", attemptId: input.attemptId });
        return null;
      }
      return {
        leaseId,
        whipUrl,
        publishToken,
        expiresAt: typeof payload?.expiresAt === "string" ? payload.expiresAt : null,
      };
    },

    async heartbeatLease(leaseId) {
      const response = await signedRequest("POST", `/v1/leases/${encodeURIComponent(leaseId)}/heartbeat`, {});
      return response !== null && (response.status === 200 || response.status === 204);
    },

    async revokeLease(leaseId) {
      await signedRequest("DELETE", `/v1/leases/${encodeURIComponent(leaseId)}`, undefined);
    },

    async leaseStatus(leaseId) {
      const response = await signedRequest("GET", `/v1/leases/${encodeURIComponent(leaseId)}`, undefined);
      if (!response || !response.ok) return null;
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!payload) return null;
      return {
        status: typeof payload.status === "string" ? payload.status : "unknown",
        publishing: payload.publishing === true,
      };
    },
  };
}
