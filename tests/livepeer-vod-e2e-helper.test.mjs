import assert from "node:assert/strict";
import test from "node:test";

import { vodE2ePassed } from "../scripts/livepeer-vod-e2e-helpers.mjs";

test("VOD evidence passes only when a ready asset is playable and deleted", () => {
  const healthy = {
    phase: "ready",
    playbackId: "playback-id",
    playbackSources: 2,
    manifestOk: true,
    segments: 1,
    assetDeleted: true,
  };

  assert.equal(vodE2ePassed(healthy), true);
  assert.equal(vodE2ePassed({ ...healthy, phase: "processing" }), false);
  assert.equal(vodE2ePassed({ ...healthy, playbackId: "" }), false);
  assert.equal(vodE2ePassed({ ...healthy, playbackSources: 0 }), false);
  assert.equal(vodE2ePassed({ ...healthy, manifestOk: false }), false);
  assert.equal(vodE2ePassed({ ...healthy, segments: 0 }), false);
  assert.equal(vodE2ePassed({ ...healthy, assetDeleted: false }), false);
});
