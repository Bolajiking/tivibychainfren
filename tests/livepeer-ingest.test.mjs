import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const ingest = await loadTsModule(new URL("../src/lib/livepeer/ingest.ts", import.meta.url));

test("livepeerRtmpServerUrl returns the dedicated rtmp.livepeer.com ingest host", () => {
  assert.equal(ingest.livepeerRtmpServerUrl(), "rtmp://rtmp.livepeer.com/live");
  // Must NOT be the API/dashboard host, which does not accept RTMP.
  assert.equal(ingest.livepeerRtmpServerUrl().includes("livepeer.studio"), false);
  assert.equal(ingest.livepeerRtmpServerUrl().includes("sk_abc123"), false);
});

test("livepeerRtmpFullUrl is only for diagnostics and appends the trimmed stream key once", () => {
  assert.equal(ingest.livepeerRtmpFullUrl(" abc123 "), "rtmp://rtmp.livepeer.com/live/abc123");
});

test("livepeerWhipIngestUrl keeps the Livepeer SDK ingest URL unmodified for browser broadcast", () => {
  const url = ingest.livepeerWhipIngestUrl("abc123");

  assert.match(url, /^https:\/\/.+\/webrtc\/abc123$/);
  assert.equal(url.includes("/webrtc/video+"), false);
});
