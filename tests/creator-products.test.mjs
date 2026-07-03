import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const p = await loadTsModule(new URL("../src/lib/creator-products.ts", import.meta.url));

test("parseCreatorProductEditInput patches only provided, valid fields", () => {
  const r = p.parseCreatorProductEditInput({ name: "  New  Name ", price: "19.5", inventory: "3", subsOnly: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { name: "New Name", price: 19.5, inventory: 3, subs_only: true });
});

test("parseCreatorProductEditInput maps camel→snake and clears image with empty url", () => {
  const r = p.parseCreatorProductEditInput({ imageUrl: "", productType: "digital", status: "sold_out" });
  assert.deepEqual(r.value, { image_url: null, product_type: "digital", status: "sold_out" });
});

test("parseCreatorProductEditInput rejects bad values and empty patches", () => {
  assert.deepEqual(p.parseCreatorProductEditInput({ price: "0" }), { ok: false, error: "bad_price" });
  assert.deepEqual(p.parseCreatorProductEditInput({ name: "  " }), { ok: false, error: "missing_product_name" });
  assert.deepEqual(p.parseCreatorProductEditInput({ status: "nope" }), { ok: false, error: "bad_product_status" });
  assert.deepEqual(p.parseCreatorProductEditInput({}), { ok: false, error: "empty_patch" });
});

test("parseCreatorProductEditInput only accepts https image urls", () => {
  assert.equal(p.parseCreatorProductEditInput({ imageUrl: "https://cdn.x/p.png" }).value.image_url, "https://cdn.x/p.png");
  assert.equal(p.parseCreatorProductEditInput({ imageUrl: "http://insecure" }).value.image_url, null);
});
