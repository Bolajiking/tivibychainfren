import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const hydration = await loadTsModule(new URL("../src/lib/hydration.ts", import.meta.url));

test("isHydrationExtensionAttributeName targets known extension hydration attributes only", () => {
  assert.equal(hydration.isHydrationExtensionAttributeName("bis_skin_checked"), true);
  assert.equal(hydration.isHydrationExtensionAttributeName("bis_register"), true);
  assert.equal(hydration.isHydrationExtensionAttributeName("__processed_f127c56a-472f-47bb-b39b-6c6e4b5c7efe__"), true);

  assert.equal(hydration.isHydrationExtensionAttributeName("class"), false);
  assert.equal(hydration.isHydrationExtensionAttributeName("data-testid"), false);
  assert.equal(hydration.isHydrationExtensionAttributeName("aria-label"), false);
});

test("extensionHydrationAttributeCleanupScript removes attributes before React hydrates", () => {
  assert.equal(typeof hydration.extensionHydrationAttributeCleanupScript, "string");
  assert.match(hydration.extensionHydrationAttributeCleanupScript, /bis_skin_checked/);
  assert.match(hydration.extensionHydrationAttributeCleanupScript, /querySelectorAll\("\*"\)/);
  // Keeps stripping re-injected attributes during hydration, not just one sweep.
  assert.match(hydration.extensionHydrationAttributeCleanupScript, /MutationObserver/);
});
