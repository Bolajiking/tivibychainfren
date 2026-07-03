import { getAccessToken } from "@/lib/auth/privy-bridge";
import type { FeaturedProductWithProduct, Product, Stream } from "@/lib/types";

interface ProductInput {
  playbackId: string;
  name: string;
  description?: string;
  price: string | number;
  productType?: string;
  inventory?: string | number;
  subsOnly?: boolean;
  imageColor?: string;
  imageUrl?: string | null;
}

export async function createCreatorProduct(input: ProductInput, walletAddress?: string): Promise<Product> {
  const data = await readJson(await creatorRequest("/api/products", "POST", input, walletAddress));
  return data.product as Product;
}

export async function updateCreatorProductStatus(
  productId: string,
  status: Product["status"],
  walletAddress?: string,
): Promise<Partial<Product>> {
  const data = await readJson(await creatorRequest(`/api/products/${encodeURIComponent(productId)}`, "PATCH", { status }, walletAddress));
  return data.product as Partial<Product>;
}

/** Edit a product's full fields (name/price/inventory/description/imageUrl/subsOnly). */
export async function updateCreatorProduct(
  productId: string,
  patch: Partial<Omit<ProductInput, "playbackId">>,
  walletAddress?: string,
): Promise<Product> {
  const data = await readJson(await creatorRequest(`/api/products/${encodeURIComponent(productId)}`, "PATCH", patch, walletAddress));
  return data.product as Product;
}

/** Upload a product image; returns the stored public URL. */
export async function uploadProductImage(file: File, walletAddress?: string): Promise<string | null> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/creator/image", { method: "POST", headers, body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) throw new Error(data?.error ?? "image_upload_failed");
  return (data?.url as string | null) ?? null;
}

export async function updateCreatorStream(input: {
  playbackId: string;
  title?: string;
  description?: string;
  viewMode?: Stream["viewMode"];
  amount?: string | number;
  isActive?: boolean;
  activationSource?: "livepeer_status";
  donationPresets?: number[];
  record?: boolean;
  currentStream?: Stream;
}, walletAddress?: string): Promise<Stream> {
  const data = await readJson(await creatorRequest("/api/stream", "PATCH", input, walletAddress));
  return data.stream as Stream;
}

export async function featureCreatorProduct(input: {
  playbackId: string;
  productId?: string | null;
}, walletAddress?: string): Promise<FeaturedProductWithProduct | null> {
  const data = await readJson(await creatorRequest("/api/featured-products", "POST", input, walletAddress));
  return (data.featured as FeaturedProductWithProduct | null) ?? null;
}

async function creatorRequest(path: string, method: "POST" | "PATCH", body: unknown, walletAddress?: string) {
  const token = await getAccessToken();
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());

  return fetch(path, {
    method,
    headers,
    body: JSON.stringify({ ...(body && typeof body === "object" ? body : {}), walletAddress }),
  });
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error ?? "creator_action_failed");
  }
  return data;
}
