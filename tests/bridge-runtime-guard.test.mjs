import test from "node:test";
import assert from "node:assert/strict";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const { bridgeAllowedInRuntime } = await loadTsModule(
  new URL("../src/lib/bridge/runtime-guard.ts", import.meta.url),
);

test("bridge allowed on a plain node host", () => {
  assert.equal(bridgeAllowedInRuntime({ TVINBIO_BRIDGE_ENABLED: "true" }), true);
});

test("bridge disabled when the master switch is off", () => {
  assert.equal(bridgeAllowedInRuntime({}), false);
});

test("bridge blocked on Vercel unless the single-instance override is set", () => {
  assert.equal(bridgeAllowedInRuntime({ TVINBIO_BRIDGE_ENABLED: "true", VERCEL: "1" }), false);
  assert.equal(
    bridgeAllowedInRuntime({
      TVINBIO_BRIDGE_ENABLED: "true",
      VERCEL: "1",
      TVINBIO_BRIDGE_ALLOW_SERVERLESS: "true",
    }),
    true,
  );
});

test("bridge allowed on Vercel when a shared session store is configured", () => {
  assert.equal(
    bridgeAllowedInRuntime({
      TVINBIO_BRIDGE_ENABLED: "true",
      VERCEL: "1",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      TVINBIO_BRIDGE_CONTROL_SECRET: "control-secret",
    }),
    true,
    "migration 0019 makes multi-instance signaling safe",
  );
});

test("a partial shared-store config does NOT unlock serverless", () => {
  const base = { TVINBIO_BRIDGE_ENABLED: "true", VERCEL: "1" };
  assert.equal(
    bridgeAllowedInRuntime({ ...base, SUPABASE_SERVICE_ROLE_KEY: "service-key" }),
    false,
    "state without the sealing key would persist credentials in the clear",
  );
  assert.equal(
    bridgeAllowedInRuntime({ ...base, TVINBIO_BRIDGE_CONTROL_SECRET: "control-secret" }),
    false,
    "sealing key without shared state still breaks cross-instance signaling",
  );
});

test("the master switch still wins over a complete shared-store config", () => {
  assert.equal(
    bridgeAllowedInRuntime({
      VERCEL: "1",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      TVINBIO_BRIDGE_CONTROL_SECRET: "control-secret",
    }),
    false,
  );
});
