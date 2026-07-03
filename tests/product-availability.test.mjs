import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const availability = await loadTsModule(new URL("../src/lib/product-availability.ts", import.meta.url));

test("live products must be active with inventory before they can be featured", () => {
  assert.equal(availability.canFeatureProduct({ status: "active", inventory: 1 }), true);
  assert.equal(availability.canFeatureProduct({ status: "active", inventory: 0 }), false);
  assert.equal(availability.canFeatureProduct({ status: "sold_out", inventory: 8 }), false);
  assert.equal(availability.canFeatureProduct({ status: "archived", inventory: 8 }), false);
});

test("live product unavailable reason stays user-facing and concise", () => {
  assert.equal(availability.liveProductUnavailableReason({ status: "active", inventory: 0 }), "No inventory");
  assert.equal(availability.liveProductUnavailableReason({ status: "sold_out", inventory: 2 }), "Sold out");
  assert.equal(availability.liveProductUnavailableReason({ status: "active", inventory: 2 }), null);
});
