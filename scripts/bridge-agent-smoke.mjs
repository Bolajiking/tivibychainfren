/**
 * Manual smoke test: the bridge host, end to end, from the app's perspective.
 *
 * Run this the moment a bridge box is up and BEFORE pointing a phone at it. It
 * drives the real `createBridgeAgentClient` — the same code path the app uses —
 * so a pass means TVinBio can actually talk to this host, not merely that the
 * host is up.
 *
 * It also checks the two things that fail SILENTLY in this stack:
 *   - raw TCP 443 accepting connections (the ICE media plane). If MediaMTX is
 *     not bound there, WebRTC signaling still succeeds and the broadcast dies.
 *   - /healthz reporting ok:true, which only happens once the agent can reach
 *     MediaMTX's API. A 503 means the forwarder half is not wired up.
 *
 * Not part of `npm test` — needs a live host.
 *
 *   TVINBIO_BRIDGE_CONTROL_URL=https://bridge.tvin.bio:8443 \
 *   TVINBIO_BRIDGE_CONTROL_SECRET=... \
 *   node scripts/bridge-agent-smoke.mjs
 *
 * Falls back to .env.local for either value. Creates one lease against a
 * deliberately fake RTMP destination (never a real stream key) and revokes it.
 */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { loadTsModule } from "../tests/helpers/load-ts-module.mjs";

// Never a real Livepeer stream key: no publisher connects during this test, so
// ffmpeg never spawns and this destination is never dialled.
const FAKE_RTMP = "rtmp://rtmp.invalid/live/smoke-test-not-a-real-key";

let passed = 0;
let failed = 0;
let skipped = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(label, why) {
  skipped += 1;
  console.log(`  SKIP  ${label} — ${why}`);
}

async function fromEnvLocal(key) {
  try {
    const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local; env vars only.
  }
  return null;
}

/** Does anything accept a TCP connection here? */
function tcpReachable(host, port, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function main() {
  const controlUrl =
    process.env.TVINBIO_BRIDGE_CONTROL_URL || (await fromEnvLocal("TVINBIO_BRIDGE_CONTROL_URL"));
  const controlSecret =
    process.env.TVINBIO_BRIDGE_CONTROL_SECRET || (await fromEnvLocal("TVINBIO_BRIDGE_CONTROL_SECRET"));

  if (!controlUrl || !controlSecret) {
    console.error(
      "Need TVINBIO_BRIDGE_CONTROL_URL and TVINBIO_BRIDGE_CONTROL_SECRET (env or .env.local).",
    );
    process.exit(1);
  }

  const { createBridgeAgentClient } = await loadTsModule(
    new URL("../src/lib/bridge/agent-client.ts", import.meta.url),
  );

  const parsed = new URL(controlUrl);
  // A loopback control URL means someone is exercising a bare `node
  // bridge/agent/index.mjs` with no MediaMTX and no TLS front. The media-plane
  // checks are structurally untestable there, so they are SKIPPED rather than
  // reported as failures — but the run is never called ready either.
  const localRun = ["127.0.0.1", "::1", "localhost"].includes(parsed.hostname);

  const client = createBridgeAgentClient({ controlUrl, controlSecret, timeoutMs: 8000 });
  const wrongSecretClient = createBridgeAgentClient({
    controlUrl,
    controlSecret: `wrong-${randomUUID()}`,
    timeoutMs: 8000,
  });

  console.log(`\nBridge host smoke test\n  control: ${controlUrl}\n  host:    ${parsed.hostname}`);
  if (localRun) {
    console.log("  mode:    LOCAL (loopback) — media-plane checks skipped, cannot certify readiness");
  }
  console.log("");

  let lease = null;
  const leaseId = `smoke-lease-${randomUUID()}`;

  try {
    // --- media plane ----------------------------------------------------
    console.log("media plane (the half that fails silently)");
    if (localRun) {
      skip("raw TCP 443 (MediaMTX ICE-TCP)", "local run has no MediaMTX");
    } else {
      check(
        "raw TCP 443 accepts connections (MediaMTX ICE-TCP)",
        await tcpReachable(parsed.hostname, 443),
        "nothing listening on 443 — WebRTC signaling would still succeed and the broadcast would die",
      );
    }
    const control = await tcpReachable(parsed.hostname, Number(parsed.port || 443));
    check(`TCP ${parsed.port || 443} accepts connections (TLS front)`, control);

    // --- agent readiness -------------------------------------------------
    console.log("\nagent");
    const healthy = await client.health();
    if (localRun && !healthy) {
      skip("/healthz reports ok", "local run has no MediaMTX, so 503 is expected");
    } else {
      check(
        "/healthz reports ok (agent can reach MediaMTX's API)",
        healthy,
        "503 means the agent is alive but MediaMTX is not answering — forwarder half not wired",
      );
    }

    // --- auth ------------------------------------------------------------
    console.log("\ncontrol API auth");
    const forged = await wrongSecretClient.createLease({
      leaseId: `forged-${randomUUID()}`,
      attemptId: `forged-${randomUUID()}`,
      creatorId: "smoke-test",
      rtmpUrl: FAKE_RTMP,
    });
    check("a wrong control secret is refused", forged === null);

    // --- lease lifecycle --------------------------------------------------
    console.log("\nlease lifecycle");
    lease = await client.createLease({
      leaseId,
      attemptId: `smoke-attempt-${randomUUID()}`,
      creatorId: "smoke-test",
      rtmpUrl: FAKE_RTMP,
    });
    check("createLease returns a lease", lease !== null, "null means non-201 or malformed payload");

    if (!lease) {
      skip("remaining lease checks", "no lease to exercise");
    } else {
      check("lease carries a WHIP url", typeof lease.whipUrl === "string" && lease.whipUrl.length > 0);
      check("lease carries a publish token", typeof lease.publishToken === "string" && lease.publishToken.length > 0);
      check(
        "WHIP url is publicly addressable, not loopback",
        !/127\.0\.0\.1|localhost/.test(lease.whipUrl),
        `browser could not reach ${lease.whipUrl} — check BRIDGE_PUBLIC_WHIP_BASE`,
      );
      if (localRun) {
        skip("WHIP url host matches the bridge host", "local run splits control and WHIP hosts");
      } else {
        check(
          "WHIP url host matches the bridge host",
          (() => {
            try {
              return new URL(lease.whipUrl).hostname === parsed.hostname;
            } catch {
              return false;
            }
          })(),
          lease.whipUrl,
        );
      }

      const status = await client.leaseStatus(lease.leaseId);
      check("leaseStatus resolves the lease", status !== null);
      check("nothing is publishing yet", status?.publishing === false, JSON.stringify(status));

      check("heartbeat keeps the lease alive", (await client.heartbeatLease(lease.leaseId)) === true);
      check(
        "heartbeat on an unknown lease is refused",
        (await client.heartbeatLease(`unknown-${randomUUID()}`)) === false,
      );

      await client.revokeLease(lease.leaseId);
      const afterRevoke = await client.leaseStatus(lease.leaseId);
      check(
        "a revoked lease no longer resolves as active",
        afterRevoke === null || afterRevoke.publishing === false,
        JSON.stringify(afterRevoke),
      );
      lease = null;

      // A revoked lease must not wedge the creator: the next attempt must work.
      const followUp = await client.createLease({
        leaseId: `smoke-lease-${randomUUID()}`,
        attemptId: `smoke-attempt-${randomUUID()}`,
        creatorId: "smoke-test",
        rtmpUrl: FAKE_RTMP,
      });
      check("a new lease can be created after a revoke", followUp !== null);
      if (followUp) await client.revokeLease(followUp.leaseId);
    }
  } finally {
    if (lease) {
      console.log("\ncleanup");
      await client.revokeLease(lease.leaseId).catch(() => {});
      console.log("  revoked the outstanding smoke lease");
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  if (failed === 0 && localRun) {
    console.log("Control API is sound, but this was a LOCAL run — the media plane was not\nexercised. Re-run against the real bridge host before trusting it.\n");
  } else if (failed === 0) {
    console.log("Bridge host is ready. Next: point a phone at it.\n");
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nsmoke test aborted:", error.message);
  process.exit(1);
});
