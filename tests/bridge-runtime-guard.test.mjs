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
