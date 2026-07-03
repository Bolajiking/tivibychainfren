import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const products = await loadTsModule(new URL("../src/lib/creator-products.ts", import.meta.url));
const streams = await loadTsModule(new URL("../src/lib/creator-streams.ts", import.meta.url));

test("parseCreatorProductInput normalizes a product draft", () => {
  const result = products.parseCreatorProductInput(
    {
      name: "  Tour Hoodie  ",
      description: "  Heavy cotton drop.  ",
      price: "40.499",
      productType: "merch",
      inventory: "50",
      subsOnly: true,
    },
    {
      creatorId: "0xFA9d000000000000000000000000000000000001",
      playbackId: "live-adaplays",
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    creatorId: "0xfa9d000000000000000000000000000000000001",
    playbackId: "live-adaplays",
    name: "Tour Hoodie",
    description: "Heavy cotton drop.",
    price: 40.5,
    currency: "USDC",
    imageColor: "#26323f",
    productType: "merch",
    inventory: 50,
    subsOnly: true,
    status: "active",
  });
});

test("parseCreatorProductInput rejects unsafe product drafts", () => {
  const context = {
    creatorId: "0xfa9d000000000000000000000000000000000001",
    playbackId: "live-adaplays",
  };

  assert.deepEqual(products.parseCreatorProductInput({ name: "", price: 10 }, context), { ok: false, error: "missing_product_name" });
  assert.deepEqual(products.parseCreatorProductInput({ name: "Cap", price: 0 }, context), { ok: false, error: "bad_price" });
  assert.deepEqual(products.parseCreatorProductInput({ name: "Cap", price: 10 }, { ...context, creatorId: "0xno" }), { ok: false, error: "bad_owner" });
});

test("creatorProductToRow creates the insert payload", () => {
  const draft = products.parseCreatorProductInput(
    { name: "Sticker Pack", price: 12, inventory: 200 },
    {
      creatorId: "0xfa9d000000000000000000000000000000000001",
      playbackId: "live-adaplays",
    },
  );

  assert.equal(draft.ok, true);
  assert.deepEqual(products.creatorProductToRow(draft.value, "prod-fixed"), {
    id: "prod-fixed",
    playback_id: "live-adaplays",
    creator_id: "0xfa9d000000000000000000000000000000000001",
    name: "Sticker Pack",
    description: null,
    price: 12,
    currency: "USDC",
    image_color: "#26323f",
    image_url: null,
    product_type: "merch",
    inventory: 200,
    subs_only: false,
    status: "active",
  });
});

test("parseCreatorProductStatusInput only allows store-safe states", () => {
  assert.deepEqual(products.parseCreatorProductStatusInput({ status: "sold_out" }), { ok: true, value: { status: "sold_out" } });
  assert.deepEqual(products.parseCreatorProductStatusInput({ status: "archived" }), { ok: true, value: { status: "archived" } });
  assert.deepEqual(products.parseCreatorProductStatusInput({ status: "deleted" }), { ok: false, error: "bad_product_status" });
});

test("parseStreamControlInput starts a creator stream only from confirmed ingest", () => {
  const current = {
    playbackId: "live-adaplays",
    creatorId: "0xfa9d000000000000000000000000000000000001",
    title: "Old title",
    description: "Old description",
    viewMode: "free",
    amount: 0,
    isActive: false,
    viewerCount: 0,
    thumbColor: "#2a2a2a",
    paidUsers: [],
    donationPresets: [3, 5, 10],
    record: true,
  };

  const rejected = streams.parseStreamControlInput(
    { isActive: true, title: "  Late drop  " },
    current,
    "2026-06-15T10:00:00.000Z",
    { requireActivationSource: true },
  );

  assert.deepEqual(rejected, { ok: false, error: "stream_activation_requires_ingest" });

  const started = streams.parseStreamControlInput(
    { isActive: true, title: "  Late drop  ", viewMode: "monthly", amount: "9", donationPresets: [2, "5", 0, 100] },
    current,
    "2026-06-15T10:00:00.000Z",
    { requireActivationSource: true, activationSource: "livepeer_status" },
  );

  assert.equal(started.ok, true);
  assert.deepEqual(started.value, {
    title: "Late drop",
    description: "Old description",
    viewMode: "monthly",
    amount: 9,
    isActive: true,
    startedAt: "2026-06-15T10:00:00.000Z",
    viewerCount: 0,
    donationPresets: [2, 5],
    record: true,
  });

  const ended = streams.parseStreamControlInput({ isActive: false }, { ...current, isActive: true }, "2026-06-15T11:00:00.000Z");
  assert.equal(ended.ok, true);
  assert.equal(ended.value.isActive, false);
  assert.equal(ended.value.startedAt, null);
  assert.equal(ended.value.viewerCount, 0);
});

test("streamControlToRow creates the stream update payload", () => {
  assert.deepEqual(
    streams.streamControlToRow({
      title: "Late drop",
      description: "Old description",
      viewMode: "monthly",
      amount: 9,
      isActive: true,
      startedAt: "2026-06-15T10:00:00.000Z",
      viewerCount: 0,
      donationPresets: [2, 5],
      record: true,
    }),
    {
      title: "Late drop",
      description: "Old description",
      view_mode: "monthly",
      amount: 9,
      is_active: true,
      started_at: "2026-06-15T10:00:00.000Z",
      viewer_count: 0,
      donation_presets: [2, 5],
      record: true,
    },
  );
});

test("buildFeaturedProductRow pins a store item to a stream", () => {
  assert.deepEqual(
    products.buildFeaturedProductRow({
      creatorId: "0xfa9d000000000000000000000000000000000001",
      playbackId: "live-adaplays",
      productId: "prod-hoodie",
      now: "2026-06-15T10:00:00.000Z",
    }),
    {
      creator_id: "0xfa9d000000000000000000000000000000000001",
      playback_id: "live-adaplays",
      product_id: "prod-hoodie",
      sort_order: 0,
      is_highlighted: true,
      highlighted_at: "2026-06-15T10:00:00.000Z",
    },
  );
});
