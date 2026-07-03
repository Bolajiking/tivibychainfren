import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const fallback = await loadTsModule(new URL("../src/lib/livepeer/obs-fallback.ts", import.meta.url));

test("browserObsFallbackHandoff reveals and focuses OBS credentials when ingest is available", () => {
  assert.deepEqual(
    fallback.browserObsFallbackHandoff({ hasIngest: true, keyShown: false }),
    { revealKey: true, focusObsPanel: true },
  );
});

test("browserObsFallbackHandoff still focuses the OBS panel if the key is already visible", () => {
  assert.deepEqual(
    fallback.browserObsFallbackHandoff({ hasIngest: true, keyShown: true }),
    { revealKey: false, focusObsPanel: true },
  );
});

test("browserObsFallbackHandoff does not reveal credentials before ingest exists", () => {
  assert.deepEqual(
    fallback.browserObsFallbackHandoff({ hasIngest: false, keyShown: false }),
    { revealKey: false, focusObsPanel: false },
  );
});

test("browserPublisherFailureAction hands terminal pre-live failures to OBS", () => {
  assert.equal(
    fallback.browserPublisherFailureAction({ currentAttempt: true, aborted: false, live: false }),
    "handoff",
  );
  assert.equal(
    fallback.browserPublisherFailureAction({ currentAttempt: true, aborted: false, live: true }),
    "recover",
  );
  assert.equal(
    fallback.browserPublisherFailureAction({ currentAttempt: false, aborted: false, live: false }),
    "ignore",
  );
  assert.equal(
    fallback.browserPublisherFailureAction({ currentAttempt: true, aborted: true, live: false }),
    "ignore",
  );
});
