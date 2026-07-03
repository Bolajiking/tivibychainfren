import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const s = await loadTsModule(new URL("../src/lib/livepeer/sources.ts", import.meta.url));

test("isHlsManifestHealthy rejects error markers", () => {
  assert.equal(s.isHlsManifestHealthy("#EXTM3U\n#EXT-X-VERSION:3"), true);
  assert.equal(s.isHlsManifestHealthy("#EXTM3U\n#EXT-X-ERROR: boom"), false);
  assert.equal(s.isHlsManifestHealthy("stream open failed"), false);
});

test("firstHlsVariantUri accepts variant URLs with query tokens", () => {
  const manifest = [
    "#EXTM3U",
    "#EXT-X-STREAM-INF:BANDWIDTH=815376",
    "0_1/index.m3u8?tkn=3535610191",
    "#EXT-X-STREAM-INF:BANDWIDTH=246368",
    "5_1/index.m3u8?tkn=3535610191",
  ].join("\n");

  assert.equal(s.firstHlsVariantUri(manifest), "0_1/index.m3u8?tkn=3535610191");
});
