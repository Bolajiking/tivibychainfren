import {
  asRecord,
  isOneOf,
  MAX_PAID_AMOUNT_USD,
  normalizeEvmAddress,
  normalizeHexColor,
  normalizeHttpsUrl,
  normalizePositiveMoney,
  trimBounded,
} from "@/lib/input-normalizers";
import type { ProductStatus, ProductType, ValidationResult } from "@/lib/types";

interface CreatorProductDraft {
  creatorId: string;
  playbackId: string;
  name: string;
  description?: string;
  price: number;
  currency: "USDC";
  imageColor: string;
  imageUrl?: string;
  productType: ProductType;
  inventory: number;
  subsOnly: boolean;
  status: ProductStatus;
}

type ProductParseResult = ValidationResult<CreatorProductDraft>;

type StatusParseResult = ValidationResult<{ status: ProductStatus }>;

interface CreatorProductEditRow {
  name?: string;
  price?: number;
  inventory?: number;
  description?: string | null;
  subs_only?: boolean;
  product_type?: ProductType;
  image_color?: string;
  image_url?: string | null;
  status?: ProductStatus;
}

const PRODUCT_TYPES: ProductType[] = ["physical", "digital", "merch", "ad"];
const PRODUCT_STATUSES: ProductStatus[] = ["active", "sold_out", "archived"];
const PRODUCT_COLORS = ["#26323f", "#2b2b2b", "#211f29", "#1d2230", "#1f3a33", "#442f2c"];

export function parseCreatorProductInput(
  input: unknown,
  context: { creatorId: string; playbackId: string },
): ProductParseResult {
  const record = asRecord(input);
  const creatorId = normalizeEvmAddress(context.creatorId);
  const playbackId = trimBounded(context.playbackId, 80);
  if (!creatorId || !playbackId) return { ok: false, error: "bad_owner" };

  const name = trimBounded(record.name, 64);
  if (!name) return { ok: false, error: "missing_product_name" };

  const price = normalizePositiveMoney(record.price);
  if (!price || price > MAX_PAID_AMOUNT_USD) return { ok: false, error: "bad_price" };

  const productType = isProductType(record.productType) ? record.productType : "merch";
  const inventory = normalizeInventory(record.inventory);
  const description = trimBounded(record.description, 240);
  const imageColor = normalizeHexColor(record.imageColor) ?? defaultProductColor(name);
  const imageUrl = normalizeHttpsUrl(record.imageUrl);

  return {
    ok: true,
    value: {
      creatorId,
      playbackId,
      name,
      ...(description ? { description } : {}),
      price,
      currency: "USDC",
      imageColor,
      ...(imageUrl ? { imageUrl } : {}),
      productType,
      inventory,
      subsOnly: Boolean(record.subsOnly),
      status: "active",
    },
  };
}

export function creatorProductToRow(product: CreatorProductDraft, id: string) {
  return {
    id,
    playback_id: product.playbackId,
    creator_id: product.creatorId,
    name: product.name,
    description: product.description ?? null,
    price: product.price,
    currency: "USDC",
    image_color: product.imageColor,
    image_url: product.imageUrl ?? null,
    product_type: product.productType,
    inventory: product.inventory,
    subs_only: product.subsOnly,
    status: product.status,
  };
}

export function parseCreatorProductStatusInput(input: unknown): StatusParseResult {
  const record = asRecord(input);
  if (!isProductStatus(record.status)) return { ok: false, error: "bad_product_status" };
  return { ok: true, value: { status: record.status } };
}

type EditParseResult = ValidationResult<CreatorProductEditRow>;

/**
 * Build a partial product update row from only the fields present in `input`.
 * Used by PATCH for full edits (status-only edits also work). Validates each
 * provided field; rejects an empty patch so a no-op can't silently "succeed".
 */
export function parseCreatorProductEditInput(input: unknown): EditParseResult {
  const record = asRecord(input);
  const patch: CreatorProductEditRow = {};

  if (record.name !== undefined) {
    const name = trimBounded(record.name, 64);
    if (!name) return { ok: false, error: "missing_product_name" };
    patch.name = name;
  }
  if (record.price !== undefined) {
    const price = normalizePositiveMoney(record.price);
    if (!price || price > MAX_PAID_AMOUNT_USD) return { ok: false, error: "bad_price" };
    patch.price = price;
  }
  if (record.inventory !== undefined) patch.inventory = normalizeInventory(record.inventory);
  if (record.description !== undefined) patch.description = trimBounded(record.description, 240) ?? null;
  if (record.subsOnly !== undefined) patch.subs_only = Boolean(record.subsOnly);
  if (record.productType !== undefined && isProductType(record.productType)) patch.product_type = record.productType;
  if (record.imageColor !== undefined) {
    const color = normalizeHexColor(record.imageColor);
    if (color) patch.image_color = color;
  }
  if (record.imageUrl !== undefined) patch.image_url = normalizeHttpsUrl(record.imageUrl) ?? null;
  if (record.status !== undefined) {
    if (!isProductStatus(record.status)) return { ok: false, error: "bad_product_status" };
    patch.status = record.status;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "empty_patch" };
  return { ok: true, value: patch };
}

export function buildFeaturedProductRow({
  creatorId,
  playbackId,
  productId,
  now = new Date().toISOString(),
}: {
  creatorId: string;
  playbackId: string;
  productId: string;
  now?: string;
}) {
  return {
    creator_id: normalizeEvmAddress(creatorId) ?? creatorId.toLowerCase(),
    playback_id: playbackId,
    product_id: productId,
    sort_order: 0,
    is_highlighted: true,
    highlighted_at: now,
  };
}

function normalizeInventory(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.min(999999, Math.floor(amount));
}

function defaultProductColor(_name: string): string {
  return PRODUCT_COLORS[0];
}

function isProductType(value: unknown): value is ProductType {
  return isOneOf(value, PRODUCT_TYPES);
}

function isProductStatus(value: unknown): value is ProductStatus {
  return isOneOf(value, PRODUCT_STATUSES);
}
