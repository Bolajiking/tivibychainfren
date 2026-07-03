import assert from "node:assert/strict";
import { test } from "node:test";

let helpers = {};
try {
  helpers = await import("../scripts/livepeer-webhook-e2e-helpers.mjs");
} catch {}

test("temporary webhook listens only for lifecycle events on its stream", () => {
  assert.equal(typeof helpers.buildTemporaryWebhookInput, "function");
  assert.deepEqual(
    helpers.buildTemporaryWebhookInput({
      name: "field-check",
      url: "https://example.test/api/livepeer/webhook",
      sharedSecret: "webhook-secret",
      streamId: "stream-123",
    }),
    {
      name: "field-check",
      url: "https://example.test/api/livepeer/webhook",
      sharedSecret: "webhook-secret",
      streamId: "stream-123",
      events: ["stream.started", "stream.idle"],
    },
  );
});

test("webhook propagation passes only with real start, idle, profile, and cleanup evidence", () => {
  assert.equal(typeof helpers.webhookPropagationPassed, "function");
  const complete = {
    livepeerActive: true,
    livepeerIdle: true,
    startedWebhookSuccess: true,
    idleWebhookSuccess: true,
    databaseLive: true,
    databaseIdle: true,
    profileLiveMs: 1_200,
    profileIdleMs: 1_500,
    pollingRequestsAborted: 2,
    realtimeSockets: 1,
    consoleErrors: [],
    pageErrors: [],
    cleanup: { encoderStopped: true, webhookDeleted: true, rowsDeleted: true, streamDeleted: true, tunnelStopped: true, serverStopped: true },
  };

  assert.equal(helpers.webhookPropagationPassed(complete), true);
  assert.equal(helpers.webhookPropagationPassed({ ...complete, startedWebhookSuccess: false }), false);
  assert.equal(helpers.webhookPropagationPassed({ ...complete, profileLiveMs: 3_001 }), false);
  assert.equal(helpers.webhookPropagationPassed({ ...complete, pollingRequestsAborted: 0 }), false);
  assert.equal(helpers.webhookPropagationPassed({ ...complete, realtimeSockets: 0 }), false);
  assert.equal(helpers.webhookPropagationPassed({ ...complete, consoleErrors: ["TypeError"] }), false);
  assert.equal(helpers.webhookPropagationPassed({ ...complete, pageErrors: ["crashed"] }), false);
  assert.equal(helpers.webhookPropagationPassed({ ...complete, cleanup: { ...complete.cleanup, webhookDeleted: false } }), false);
});

test("webhook diagnostics redact shared secrets and signature values", () => {
  assert.equal(
    helpers.redactWebhookDiagnostic(
      "secret=webhook-secret Livepeer-Signature=t=1,v1=abcdef",
      "webhook-secret",
    ),
    "secret=[redacted] Livepeer-Signature=[redacted]",
  );
});

test("intentional polling aborts are separated from unexpected console errors", () => {
  assert.equal(
    helpers.classifyWebhookConsoleMessage("Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector"),
    "expected_poll_block",
  );
  assert.equal(helpers.classifyWebhookConsoleMessage("TypeError: crashed"), "unexpected");
});
