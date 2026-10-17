import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

import type { PublicFeaturedProduct } from "./content";

export type HomeBestSellerCard = {
  id: string;
  name: string;
  price: string;
  image: string;
  description: string;
  badge: string | null;
  availability: string;
};

export type HomeFeaturedProductCard = {
  id: string;
  name: string;
  price: string;
  image: string;
  description: string;
  category_name: string;
};

const priceFallbacks = ["₱380.00", "₱240.00", "From ₱420.00", "₱260.00"];
const descriptionFallbacks = [
  "Freshly cut pork belly with ideal fat-to-meat ratio, perfect for grilling or crisp roasting.",
  "Lean, tender chicken breast prepared fresh daily, ideal for healthy home meals.",
  "Richly marbled beef short ribs cut for slow stewing, braising, or smoking.",
  "Freshly ground pork prepared from lean cuts, perfect for lumpia, patties, and sauces.",
];

function localProductImage(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("pork belly")) return "/images/pork_belly.png";
  if (normalized.includes("chicken breast")) return "/images/chicken_breast.png";
  if (normalized.includes("short ribs") || normalized.includes("beef")) {
    return "/images/beef_short_ribs.png";
  }
  if (normalized.includes("ground pork")) return "/images/ground_pork.png";
  return "/images/meat_cluster.svg";
}

function featuredProductImage(product: PublicFeaturedProduct): string {
  return resolvePublicStorageUrl(product.image_path) ?? localProductImage(product.name);
}

export function buildHomeBestSellers(products: PublicFeaturedProduct[]): HomeBestSellerCard[] {
  return products.map((product, index) => ({
    id: product.id,
    name: product.name,
    price: priceFallbacks[index] ?? "₱250.00",
    image: featuredProductImage(product),
    description:
      product.description ??
      descriptionFallbacks[index] ??
      "Fresh local cut prepared daily.",
    badge: null,
    availability: "Freshly packed daily",
  }));
}

export function buildHomeFeaturedProducts(
  products: PublicFeaturedProduct[],
): HomeFeaturedProductCard[] {
  return products.map((product, index) => ({
    id: product.id,
    name: product.name,
    price: priceFallbacks[index] ?? "₱250.00",
    image: featuredProductImage(product),
    description:
      product.description ??
      descriptionFallbacks[index] ??
      "Fresh local cut prepared daily.",
    category_name: product.category_name ?? product.category ?? "Fresh Cut",
  }));
}
