/**
 * Catalog seeding for E2E tests.
 *
 * Prerequisites (a category, some products, a customer, a supplier) are created
 * over the API so each spec spends its time on the flow it actually tests.
 * The flow under test is always driven through the browser.
 */

/** Create a workspace with a second branch, so transfers have somewhere to go. */
export async function seedWorkspace(
  node,
  {
    business = "Khumalo Hardware",
    branch = "Head Office",
    extraBranches = ["Cape Town"],
  } = {},
) {
  await node.setup(business, branch);
  const branches = { [branch]: await node.branchId(branch) };
  for (const name of extraBranches) {
    const row = await node.putRow("branches", {
      name,
      code: "",
      address: "",
      is_active: 1,
    });
    branches[name] = row.id;
  }
  return { business, branch, branches };
}

/** A category + one product with one variant. Returns ids and the labels the UI shows. */
export async function seedProduct(
  node,
  {
    product = "Claw Hammer",
    variant = "16oz",
    sku = "HAM-16",
    price = 199.99,
    cost = 120,
    category = "Tools",
  } = {},
) {
  const cat = await node.putRow("categories", { name: category });
  const prod = await node.putRow("products", {
    name: product,
    description: "",
    category_id: cat.id,
  });
  const v = await node.putRow("product_variants", {
    product_id: prod.id,
    sku,
    name: variant,
    price,
    cost_price: cost,
    reorder_point: 0,
    attributes: "",
  });
  return {
    categoryId: cat.id,
    productId: prod.id,
    variantId: v.id,
    product,
    variant,
    sku,
    price,
    cost,
  };
}

export async function seedCustomer(
  node,
  { name = "Acme Builders", company = "Acme Pty Ltd" } = {},
) {
  const row = await node.putRow("customers", {
    name,
    company_name: company,
    email: "",
    phone: "",
    billing_address: "",
    shipping_address: "",
    tax_number: "",
    payment_terms: "Net 30",
    credit_limit: 0,
    notes: "",
    is_active: 1,
  });
  return { id: row.id, name, company };
}

export async function seedSupplier(
  node,
  { name = "Bolt Depot", company = "Bolt Depot CC" } = {},
) {
  const row = await node.putRow("suppliers", {
    name,
    company_name: company,
    email: "",
    phone: "",
    address: "",
    tax_number: "",
    payment_terms: "Net 30",
    notes: "",
    is_active: 1,
  });
  return { id: row.id, name, company };
}

/** Sum of every movement recorded for a variant at a branch (the true on-hand). */
export function onHand(levels, variantId, branchId) {
  const row = levels.find(
    (l) => l.variant_id === variantId && l.branch_id === branchId,
  );
  return row ? row.qty : 0;
}
