import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const state = await loadTsModule(new URL("../src/lib/realtime-state.ts", import.meta.url));

test("mergeChatMessage sorts, dedupes by id, and caps to the newest messages", () => {
  const base = [
    chat("old", "2026-01-01T00:00:00.000Z"),
    chat("keep", "2026-01-01T00:00:01.000Z", "before"),
  ];

  const merged = state.mergeChatMessage(base, chat("keep", "2026-01-01T00:00:03.000Z", "after"), 2);
  const withNewest = state.mergeChatMessage(merged, chat("new", "2026-01-01T00:00:02.000Z"), 2);

  assert.deepEqual(withNewest.map((m) => m.id), ["new", "keep"]);
  assert.equal(withNewest[1].message, "after");
});

test("removeChatMessage deletes a realtime-moderated message by id", () => {
  const messages = [chat("a"), chat("b"), chat("c")];
  assert.deepEqual(state.removeChatMessage(messages, "b").map((m) => m.id), ["a", "c"]);
});

test("normalizeChatText trims, rejects blank messages, and caps length", () => {
  assert.equal(state.normalizeChatText("   hello from the room   "), "hello from the room");
  assert.equal(state.normalizeChatText(" \n\t "), null);

  const long = `${"a".repeat(280)}extra`;
  assert.equal(state.normalizeChatText(long), "a".repeat(280));
});

test("createLocalChatMessage builds a normalized viewer message or returns null", () => {
  assert.deepEqual(
    state.createLocalChatMessage({
      id: "local-1",
      streamId: "live-ada",
      sender: "Ada Plays",
      walletAddress: "0xabc",
      message: "  hello   chat  ",
      timestamp: "2026-01-01T00:00:00.000Z",
    }),
    {
      id: "local-1",
      streamId: "live-ada",
      sender: "Ada Plays",
      walletAddress: "0xabc",
      message: "hello chat",
      kind: "message",
      role: "viewer",
      nameColor: "#9fd3ff",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
  );

  assert.equal(
    state.createLocalChatMessage({
      streamId: "live-ada",
      sender: "Ada Plays",
      walletAddress: "0xabc",
      message: "   ",
    }),
    null,
  );
});

test("upsertFeaturedProduct updates existing pins and sorts by sortOrder", () => {
  const hoodie = featured("hoodie", 1, false);
  const cap = featured("cap", 2, false);
  const highlightedHoodie = featured("hoodie", 0, true);

  const next = state.upsertFeaturedProduct([hoodie, cap], highlightedHoodie);

  assert.deepEqual(next.map((f) => f.productId), ["hoodie", "cap"]);
  assert.equal(next[0].isHighlighted, true);
});

test("removeFeaturedProduct removes a pin by product id", () => {
  const next = state.removeFeaturedProduct([featured("hoodie"), featured("cap")], "cap");
  assert.deepEqual(next.map((f) => f.productId), ["hoodie"]);
});

test("selectFeaturedProduct prefers highlighted products, then first shelf item", () => {
  const cap = featured("cap", 1, false);
  const hoodie = featured("hoodie", 0, true);

  assert.equal(state.selectFeaturedProduct([cap, hoodie])?.productId, "hoodie");
  assert.equal(state.selectFeaturedProduct([cap])?.productId, "cap");
  assert.equal(state.selectFeaturedProduct([]), null);
});

function chat(id, timestamp = "2026-01-01T00:00:00.000Z", message = id) {
  return {
    id,
    streamId: "live-ada",
    sender: "tobi",
    walletAddress: "0xabc",
    message,
    kind: "message",
    timestamp,
  };
}

function featured(productId, sortOrder = 0, isHighlighted = false) {
  return {
    playbackId: "live-ada",
    productId,
    creatorId: "0xada",
    sortOrder,
    isHighlighted,
    product: {
      id: productId,
      playbackId: "live-ada",
      creatorId: "0xada",
      name: productId,
      price: 10,
      currency: "USDC",
      imageColor: "#222",
      productType: "merch",
      inventory: 10,
      status: "active",
    },
  };
}
