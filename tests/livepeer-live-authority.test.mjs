import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const authority = await loadTsModule(new URL("../src/lib/livepeer/live-authority.ts", import.meta.url));

const NOW = 1_750_000_000_000;
const LIVEPEER_ID = "abcd-1234";

function freshSession(overrides = {}) {
  return {
    id: "session-1",
    parentId: LIVEPEER_ID,
    createdAt: NOW - 4_000,
    lastSeen: NOW - 1_000,
    sourceBytes: 10_000,
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    livepeerId: LIVEPEER_ID,
    generation: 2,
    generationStartedAtMs: NOW - 12_000,
    nowMs: NOW,
    sessions: [freshSession()],
    upstreamActive: true,
    targetKind: "livepeer-direct",
    probes: [
      { atMs: NOW - 3_000, generation: 2, sourceBytes: 5_000, sourceSegments: 2 },
      { atMs: NOW - 500, generation: 2, sourceBytes: 9_000, sourceSegments: 3 },
    ],
    ...overrides,
  };
}

test("happy path confirms with all four §9.1 requirements", () => {
  const verdict = authority.evaluateLiveAuthority(baseInput());
  assert.equal(verdict.confirmed, true);
  assert.deepEqual(verdict.missing, []);
});

test("a fresh matching session without explicit upstream isActive does not confirm", () => {
  const verdict = authority.evaluateLiveAuthority(baseInput({ upstreamActive: false }));
  assert.equal(verdict.confirmed, false);
  assert.ok(verdict.missing.includes("upstream_active"));
});

test("no matching current session does not confirm", () => {
  const stale = freshSession({ createdAt: NOW - 60 * 60_000, lastSeen: NOW - 30 * 60_000 });
  const otherParent = freshSession({ parentId: "other-stream" });
  const verdict = authority.evaluateLiveAuthority(baseInput({ sessions: [stale, otherParent] }));
  assert.equal(verdict.confirmed, false);
  assert.ok(verdict.missing.includes("matching_session"));
});

test("isActive with a single nonzero historical counter is insufficient", () => {
  const verdict = authority.evaluateLiveAuthority(
    baseInput({ probes: [{ atMs: NOW - 500, generation: 2, sourceBytes: 9_000 }] }),
  );
  assert.equal(verdict.confirmed, false);
  assert.ok(verdict.missing.includes("media_progression"));
});

test("two probes without strict increase and without positive ingest rate fail", () => {
  const verdict = authority.evaluateLiveAuthority(
    baseInput({
      probes: [
        { atMs: NOW - 3_000, generation: 2, sourceBytes: 9_000, sourceSegments: 3, ingestRate: 0 },
        { atMs: NOW - 500, generation: 2, sourceBytes: 9_000, sourceSegments: 3, ingestRate: 0 },
      ],
    }),
  );
  assert.equal(verdict.confirmed, false);
  assert.ok(verdict.missing.includes("media_progression"));
});

test("a positive ingest rate on the second probe satisfies progression", () => {
  const verdict = authority.evaluateLiveAuthority(
    baseInput({
      probes: [
        { atMs: NOW - 3_000, generation: 2, sourceBytes: 9_000 },
        { atMs: NOW - 500, generation: 2, sourceBytes: 9_000, ingestRate: 1.2 },
      ],
    }),
  );
  assert.equal(verdict.confirmed, true);
});

test("probes closer than two seconds apart do not satisfy progression", () => {
  const verdict = authority.evaluateLiveAuthority(
    baseInput({
      probes: [
        { atMs: NOW - 1_500, generation: 2, sourceBytes: 5_000 },
        { atMs: NOW - 500, generation: 2, sourceBytes: 9_000 },
      ],
    }),
  );
  assert.equal(verdict.confirmed, false);
  assert.ok(verdict.missing.includes("media_progression"));
});

test("progression spanning generations never confirms", () => {
  const verdict = authority.evaluateLiveAuthority(
    baseInput({
      probes: [
        { atMs: NOW - 3_000, generation: 1, sourceBytes: 5_000 },
        { atMs: NOW - 500, generation: 2, sourceBytes: 9_000 },
      ],
    }),
  );
  assert.equal(verdict.confirmed, false);
  assert.ok(verdict.missing.includes("media_progression"));
});

test("probes from an abandoned generation are discarded entirely", () => {
  const verdict = authority.evaluateLiveAuthority(
    baseInput({
      generation: 3,
      probes: [
        { atMs: NOW - 3_000, generation: 2, sourceBytes: 5_000 },
        { atMs: NOW - 500, generation: 2, sourceBytes: 9_000 },
      ],
    }),
  );
  assert.equal(verdict.confirmed, false);
  assert.ok(verdict.missing.includes("media_progression"));
});

test("a bridge generation additionally requires the lease to be publishing", () => {
  const unpublished = authority.evaluateLiveAuthority(
    baseInput({ targetKind: "tvinbio-bridge", bridgePublishing: false }),
  );
  assert.equal(unpublished.confirmed, false);
  assert.ok(unpublished.missing.includes("bridge_publishing"));

  const publishing = authority.evaluateLiveAuthority(
    baseInput({ targetKind: "tvinbio-bridge", bridgePublishing: true }),
  );
  assert.equal(publishing.confirmed, true);

  const direct = authority.evaluateLiveAuthority(baseInput({ bridgePublishing: undefined }));
  assert.equal(direct.confirmed, true);
});

test("session freshness is keyed to the generation start, not the overall attempt", () => {
  const beforeGeneration = freshSession({ createdAt: NOW - 60_000, lastSeen: NOW - 40_000 });
  const verdict = authority.evaluateLiveAuthority(
    baseInput({ generationStartedAtMs: NOW - 12_000, sessions: [beforeGeneration] }),
  );
  assert.equal(verdict.confirmed, false);
  assert.ok(verdict.missing.includes("matching_session"));
});
