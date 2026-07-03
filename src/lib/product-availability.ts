import type { Product } from "@/lib/types";

export function canFeatureProduct(product: Pick<Product, "status" | "inventory">): boolean {
  return product.status === "active" && product.inventory > 0;
}

export function liveProductUnavailableReason(product: Pick<Product, "status" | "inventory">): string | null {
  if (product.status !== "active") return "Sold out";
  if (product.inventory <= 0) return "No inventory";
  return null;
}
