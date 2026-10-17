import { describe, expect, it } from "vitest";

import type { PublicFeaturedProduct } from "./content";
import {
  buildHomeBestSellers,
  buildHomeFeaturedProducts,
} from "./home-product-lists";

const fetchedProducts: PublicFeaturedProduct[] = [
  {
    id: "product-1",
    name: "Lechon Belly",
    description: "Crisp belly prepared for the day's orders.",
    image_path: "/images/pork_belly.png",
    category: "Pork",
  },
  {
    id: "product-2",
    name: "Chicken Thigh",
    description: null,
    image_path: null,
    category: "Chicken",
  },
];

describe("home product lists", () => {
  it("returns no placeholder cards when no products are fetched", () => {
    expect(buildHomeBestSellers([])).toEqual([]);
    expect(buildHomeFeaturedProducts([])).toEqual([]);
  });

  it("uses only fetched products for best sellers and featured products", () => {
    const bestSellers = buildHomeBestSellers(fetchedProducts);
    const featured = buildHomeFeaturedProducts(fetchedProducts);

    expect(bestSellers.map((product) => product.name)).toEqual([
      "Lechon Belly",
      "Chicken Thigh",
    ]);
    expect(featured.map((product) => product.name)).toEqual([
      "Lechon Belly",
      "Chicken Thigh",
    ]);
    expect(bestSellers.map((product) => product.name)).not.toContain("Pork Belly Prime Cut");
    expect(featured.map((product) => product.name)).not.toContain("Beef Short Ribs");
  });
});
