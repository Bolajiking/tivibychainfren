import {
  evaluateWhipProxyRequest,
  filterWhipResponseHeaders,
  mapWhipUpstreamOutcome,
  rewriteWhipLocation,
  type WhipResourceMap,
} from "@/lib/bridge/whip-proxy-policy";

export interface WhipProxyAttemptContext {
  whipUpstreamUrl: string | null;
  publishToken: string | null;
}

export interface WhipProxyResult {
  status: number;
  headers: Record<string, string>;
  body: string | null;
  reasonCode?: string;
}

type UpstreamFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<Response>;

export interface WhipProxyDeps {
  resolveAttempt(attemptId: string): WhipProxyAttemptContext | null;
  resourceMap: WhipResourceMap;
  upstreamFetch: UpstreamFetch;
}

export interface WhipProxy {
  post(input: { attemptId: string; contentType: string | null; body: string }): Promise<WhipProxyResult>;
  patch(input: {
    attemptId: string;
    resourceId: string;
    contentType: string | null;
    body: string;
  }): Promise<WhipProxyResult>;
  del(input: { attemptId: string; resourceId: string }): Promise<WhipProxyResult>;
}

function errorResult(status: number, reasonCode: string): WhipProxyResult {
  return { status, headers: {}, body: null, reasonCode };
}

export function createWhipProxy(deps: WhipProxyDeps): WhipProxy {
  async function callUpstream(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<Response | null> {
    try {
      return await deps.upstreamFetch(url, init);
    } catch {
      return null;
    }
  }

  function gate(
    attemptId: string,
    method: string,
    contentType: string | null,
    body: string,
  ):
    | { kind: "error"; result: WhipProxyResult }
    | { kind: "ok"; attempt: WhipProxyAttemptContext & { whipUpstreamUrl: string } } {
    const attempt = deps.resolveAttempt(attemptId);
    if (!attempt) return { kind: "error", result: errorResult(404, "attempt_not_found") };

    const verdict = evaluateWhipProxyRequest({
      method,
      contentType,
      bodyBytes: Buffer.byteLength(body ?? "", "utf8"),
    });
    if (!verdict.ok) return { kind: "error", result: errorResult(verdict.status, verdict.reasonCode) };

    if (!attempt.whipUpstreamUrl) return { kind: "error", result: errorResult(503, "bridge_unavailable") };
    return { kind: "ok", attempt: { ...attempt, whipUpstreamUrl: attempt.whipUpstreamUrl } };
  }

  function upstreamHeaders(attempt: WhipProxyAttemptContext, contentType?: string): Record<string, string> {
    return {
      ...(contentType ? { "content-type": contentType } : {}),
      ...(attempt.publishToken ? { authorization: `Bearer ${attempt.publishToken}` } : {}),
    };
  }

  return {
    async post({ attemptId, contentType, body }) {
      const gated = gate(attemptId, "POST", contentType, body);
      if (gated.kind === "error") return gated.result;
      const { attempt } = gated;

      const upstream = await callUpstream(attempt.whipUpstreamUrl, {
        method: "POST",
        headers: upstreamHeaders(attempt, "application/sdp"),
        body,
      });
      const outcome = mapWhipUpstreamOutcome({ method: "POST", upstreamStatus: upstream?.status ?? null });
      if (outcome.kind === "error") return errorResult(outcome.status, outcome.reasonCode);

      const upstreamLocation = upstream?.headers.get("location") ?? null;
      if (!upstreamLocation) return errorResult(502, "bridge_signaling_rejected");
      const resolvedLocation = new URL(upstreamLocation, attempt.whipUpstreamUrl).toString();

      const { resourceId, replacedUpstreamUrl } = deps.resourceMap.register(attemptId, resolvedLocation);
      if (replacedUpstreamUrl) {
        // One live WHIP resource per attempt: the replaced publisher is torn down upstream.
        await callUpstream(replacedUpstreamUrl, { method: "DELETE", headers: upstreamHeaders(attempt) });
      }

      const headers = filterWhipResponseHeaders(
        Object.fromEntries((upstream as Response).headers.entries()),
      );
      headers.location = rewriteWhipLocation(attemptId, resourceId);
      const answer = await (upstream as Response).text().catch(() => "");
      return { status: 201, headers, body: answer };
    },

    async patch({ attemptId, resourceId, contentType, body }) {
      const gated = gate(attemptId, "PATCH", contentType, body);
      if (gated.kind === "error") return gated.result;
      const { attempt } = gated;

      const upstreamUrl = deps.resourceMap.resolve(attemptId, resourceId);
      if (!upstreamUrl) return errorResult(404, "attempt_not_found");

      const upstream = await callUpstream(upstreamUrl, {
        method: "PATCH",
        headers: upstreamHeaders(attempt, "application/trickle-ice-sdpfrag"),
        body,
      });
      const outcome = mapWhipUpstreamOutcome({ method: "PATCH", upstreamStatus: upstream?.status ?? null });
      if (outcome.kind === "error") return errorResult(outcome.status, outcome.reasonCode);
      return { status: outcome.status, headers: {}, body: null };
    },

    async del({ attemptId, resourceId }) {
      const attempt = deps.resolveAttempt(attemptId);
      if (!attempt) return errorResult(404, "attempt_not_found");

      // Clear the mapping first: teardown must succeed for the browser even
      // when upstream is already gone (revoking the lease kicks the publisher).
      const upstreamUrl = deps.resourceMap.release(attemptId, resourceId);
      if (upstreamUrl) {
        await callUpstream(upstreamUrl, { method: "DELETE", headers: upstreamHeaders(attempt) });
      }
      return { status: 204, headers: {}, body: null };
    },
  };
}
