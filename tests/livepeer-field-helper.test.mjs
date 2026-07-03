import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

let helpers = {};
try {
  helpers = await import("../scripts/livepeer-field-helpers.mjs");
} catch {}

test("field server environment binds one temporary stream without dropping existing env", () => {
  assert.equal(typeof helpers.buildLiveFieldEnvironment, "function");
  const env = helpers.buildLiveFieldEnvironment(
    { id: "stream-1", streamKey: "secret-key", playbackId: "playback-1" },
    "field-token",
    { PATH: "/bin", LIVEPEER_API_KEY: "api-secret" },
  );

  assert.equal(env.PATH, "/bin");
  assert.equal(env.TVINBIO_FIELD_TOKEN, "field-token");
  assert.equal(env.TVINBIO_FIELD_STREAM_ID, "stream-1");
  assert.equal(env.TVINBIO_FIELD_STREAM_KEY, "secret-key");
  assert.equal(env.TVINBIO_FIELD_PLAYBACK_ID, "playback-1");
  assert.equal(env.TVINBIO_FIELD_WHIP_URL, "https://playback.livepeer.studio/webrtc/secret-key");
});

test("quick tunnel parser returns only the generated HTTPS origin", () => {
  assert.equal(typeof helpers.parseQuickTunnelOrigin, "function");
  assert.equal(
    helpers.parseQuickTunnelOrigin("INF Requesting new quick Tunnel on trycloudflare.com\nhttps://bright-field.trycloudflare.com"),
    "https://bright-field.trycloudflare.com",
  );
  assert.equal(
    helpers.parseQuickTunnelOrigin(
      "INF POST https://api.trycloudflare.com/tunnel\nINF Your quick Tunnel has been created! Visit it at https://quiet-river.trycloudflare.com",
    ),
    "https://quiet-river.trycloudflare.com",
  );
  assert.equal(helpers.parseQuickTunnelOrigin("INF POST https://api.trycloudflare.com/tunnel"), null);
  assert.equal(helpers.parseQuickTunnelOrigin("waiting for connector"), null);
});

test("quick tunnel readiness requires both an assigned origin and registered connector", () => {
  assert.equal(typeof helpers.parseReadyQuickTunnelOrigin, "function");
  const assigned = "INF Your quick Tunnel has been created: https://bright-field.trycloudflare.com";

  assert.equal(helpers.parseReadyQuickTunnelOrigin(assigned), null);
  assert.equal(
    helpers.parseReadyQuickTunnelOrigin(`${assigned}\nINF Registered tunnel connection protocol=quic`),
    "https://bright-field.trycloudflare.com",
  );
});

test("field run rejects when its assigned quick tunnel exits", async () => {
  assert.equal(typeof helpers.waitForFieldRunEnd, "function");
  const tunnel = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const run = helpers.waitForFieldRunEnd(tunnel, new Promise(() => {}));

  tunnel.exitCode = 1;
  tunnel.emit("exit", 1, null);

  await assert.rejects(run, /Cloudflare Quick Tunnel exited \(1\)/);
});

test("field run rejects when the quick tunnel exited before supervision began", async () => {
  const tunnel = Object.assign(new EventEmitter(), { exitCode: 2, signalCode: null });
  await assert.rejects(
    helpers.waitForFieldRunEnd(tunnel, new Promise(() => {})),
    /Cloudflare Quick Tunnel exited \(2\)/,
  );
});

test("field shutdown signals share and await one in-flight cleanup", async () => {
  assert.equal(typeof helpers.createIdempotentFieldCleanup, "function");
  assert.equal(typeof helpers.waitForFieldShutdown, "function");
  const signals = new EventEmitter();
  let cleanupCalls = 0;
  let finishCleanup;
  const cleanup = helpers.createIdempotentFieldCleanup(() => {
    cleanupCalls += 1;
    return new Promise((resolve) => {
      finishCleanup = resolve;
    });
  });
  const shutdown = helpers.waitForFieldShutdown(signals);

  signals.emit("SIGINT");
  signals.emit("SIGTERM");
  await shutdown;
  assert.equal(signals.listenerCount("SIGINT"), 1);
  assert.equal(signals.listenerCount("SIGTERM"), 1);
  const firstCleanup = cleanup();
  const repeatedCleanup = cleanup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cleanupCalls, 1);
  finishCleanup();

  await Promise.all([firstCleanup, repeatedCleanup]);
  assert.equal(cleanupCalls, 1);
});

test("field page readiness waits for a real HTTP 200", async () => {
  assert.equal(typeof helpers.waitForFieldPage, "function");
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.statusCode = requests === 1 ? 503 : 200;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await helpers.waitForFieldPage(`http://127.0.0.1:${address.port}/field/live`, { exitCode: null }, {
      timeoutMs: 1_000,
      pollMs: 1,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.equal(requests, 2);
});

test("field URL contains the ephemeral token but never ingest or API secrets", () => {
  const url = helpers.buildLiveFieldUrl("https://bright-field.trycloudflare.com", "field token");
  assert.equal(url, "https://bright-field.trycloudflare.com/field/live?token=field+token");
  assert.equal(url.includes("secret-key"), false);
  assert.equal(url.includes("api-secret"), false);
});
