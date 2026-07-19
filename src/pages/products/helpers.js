/** Shared parsing helpers for product pages. */

/** Parse a variant's `attributes` JSON string into a plain object. */
export function parseAttributes(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export const defaultProductData = {
  material: "",
  assortment: "",
  applications: "",
  specifications: {
    lengthRange: "",
    material: "",
    finish: "",
    headType: "",
    threadType: "",
    packageQuantity: "",
  },
};

/** Parse a product's `product_data` JSON string, filling in every spec field. */
export function parseProductData(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
  }
  if (!data || typeof data !== "object") data = {};
  const specs =
    data.specifications && typeof data.specifications === "object"
      ? data.specifications
      : {};
  return {
    ...data,
    material: data.material || "",
    assortment: data.assortment || "",
    applications: data.applications || "",
    specifications: {
      ...defaultProductData.specifications,
      ...specs,
    },
  };
}

/** Is this variant at/below its reorder point? (reorder point 0 = not tracked) */
export function isLowStock(variant, totalQty) {
  const rp = Number(variant?.reorder_point || 0);
  return rp > 0 && Number(totalQty || 0) <= rp;
}
