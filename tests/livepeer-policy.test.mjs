import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const policy = await loadTsModule(new URL("../src/lib/livepeer/policy.ts", import.meta.url));

test("matchProxyRoute allows only the allow-listed surface", () => {
  assert.ok(policy.matchProxyRoute("GET", ["playback", "abc123"]));
  assert.ok(policy.matchProxyRoute("POST", ["stream"]));
  assert.ok(policy.matchProxyRoute("PATCH", ["stream", "id"]));
  assert.ok(policy.matchProxyRoute("GET", ["stream", "id", "sessions"]));
  assert.ok(policy.matchProxyRoute("GET", ["session"]));
  assert.ok(policy.matchProxyRoute("POST", ["asset", "request-upload"]));

  // Rejections: unknown verbs, paths, and arity mismatches.
  assert.equal(policy.matchProxyRoute("DELETE", ["stream", "id"]), null);
  assert.equal(policy.matchProxyRoute("GET", ["api-tokens"]), null);
  assert.equal(policy.matchProxyRoute("POST", ["stream", "id", "terminate"]), null);
  assert.equal(policy.matchProxyRoute("GET", ["stream"]), null);
});

test("playback reads require no owner; stream/asset reads do", () => {
  assert.equal(policy.matchProxyRoute("GET", ["playback", "x"]).requireOwner, false);
  assert.equal(policy.matchProxyRoute("GET", ["stream", "x"]).requireOwner, true);
  assert.equal(policy.matchProxyRoute("GET", ["stream", "x", "sessions"]).requireOwner, true);
  assert.equal(policy.matchProxyRoute("GET", ["stream", "x", "sessions"]).redactSecrets, true);
  assert.equal(policy.matchProxyRoute("GET", ["session"]).requireOwner, true);
  assert.equal(policy.matchProxyRoute("GET", ["session"]).redactSecrets, true);
  assert.equal(policy.matchProxyRoute("GET", ["asset", "x"]).requireOwner, true);
});

test("redactSecrets strips ingest keys at any depth", () => {
  const input = {
    id: "s1",
    playbackId: "pb1",
    streamKey: "SECRET-KEY",
    profiles: [{ name: "720p" }],
    nested: { secret: "no", srtIngestUrl: "srt://x", keep: 1 },
    multistream: { targets: [{ createdByTokenName: "tok", url: "ok" }] },
  };
  const out = policy.redactSecrets(input);

  assert.equal(out.id, "s1");
  assert.equal(out.playbackId, "pb1");
  assert.equal(out.streamKey, undefined);
  assert.equal(out.nested.secret, undefined);
  assert.equal(out.nested.srtIngestUrl, undefined);
  assert.equal(out.nested.keep, 1);
  assert.equal(out.multistream.targets[0].createdByTokenName, undefined);
  assert.equal(out.multistream.targets[0].url, "ok");
  // Original is untouched (deep clone).
  assert.equal(input.streamKey, "SECRET-KEY");
});

test("filterWritableStreamFields keeps only the allow-listed PATCH fields", () => {
  const out = policy.filterWritableStreamFields({
    suspended: true,
    record: false,
    name: "Show",
    streamKey: "hax",
    playbackId: "nope",
    creatorId: "0xevil",
  });
  assert.deepEqual(out, { suspended: true, record: false, name: "Show" });
});
