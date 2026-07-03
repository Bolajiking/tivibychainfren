import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const sessions = await loadTsModule(new URL("../src/lib/livepeer/sessions.ts", import.meta.url));

test("livepeerSessionProxyPath uses the active Sessions API and keeps parentId in the query", () => {
  assert.equal(sessions.livepeerSessionProxyPath("stream-123"), "session?parentId=stream-123");
  assert.equal(sessions.livepeerSessionProxyPath("  stream with/slash  "), "session?parentId=stream+with%2Fslash");
});

test("livepeerSessionApiPath scopes direct Livepeer reads by parentId", () => {
  assert.equal(sessions.livepeerSessionApiPath("stream-123"), "/session?parentId=stream-123");
  assert.equal(sessions.livepeerSessionApiPath("  stream with/slash  "), "/session?parentId=stream+with%2Fslash");
});

test("livepeerSessionUpstreamUrl preserves parentId on the Livepeer API request", () => {
  assert.equal(
    sessions.livepeerSessionUpstreamUrl("https://livepeer.studio/api", "stream-123"),
    "https://livepeer.studio/api/session?parentId=stream-123",
  );
  assert.equal(
    sessions.livepeerSessionUpstreamUrl("https://livepeer.studio/api/", "  stream with/slash  "),
    "https://livepeer.studio/api/session?parentId=stream+with%2Fslash",
  );
});

test("filterSessionsByParentId returns only sessions for the mapped stream", () => {
  const rows = [
    { id: "a", parentId: "stream-123", streamKey: "SECRET" },
    { id: "b", parentId: "other" },
    { id: "c" },
  ];

  assert.deepEqual(sessions.filterSessionsByParentId(rows, "stream-123"), [{ id: "a", parentId: "stream-123" }]);
});

test("shouldReuseLivepeerStream bypasses stale mappings when a fresh ingest is requested", () => {
  assert.equal(sessions.shouldReuseLivepeerStream("lp-1", false), true);
  assert.equal(sessions.shouldReuseLivepeerStream("lp-1", true), false);
  assert.equal(sessions.shouldReuseLivepeerStream("", false), false);
});
