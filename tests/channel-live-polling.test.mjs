import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const polling = await loadTsModule(new URL("../src/lib/channel-live-polling.ts", import.meta.url));

test("offline public channels poll under the live flip SLA", () => {
  assert.equal(polling.channelLiveStatusPollMs(false), 2_000);
  assert.ok(polling.channelLiveStatusPollMs(false) < 3_000);
});

test("already-live public channels recheck inside the live-drop recovery budget", () => {
  assert.equal(polling.channelLiveStatusPollMs(true), 5_000);
  assert.ok(polling.channelLiveStatusPollMs(true) < 15_000);
});

test("createSingleFlightChannelRefresh lets a slow status request finish", async () => {
  let calls = 0;
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const refresh = polling.createSingleFlightChannelRefresh(async () => {
    calls += 1;
    await blocked;
  });

  const first = refresh();
  const overlapping = refresh();
  assert.equal(calls, 1);
  assert.equal(overlapping, first);

  release();
  await first;
  await refresh();
  assert.equal(calls, 2);
});
