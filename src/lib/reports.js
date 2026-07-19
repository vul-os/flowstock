/**
 * Shared report computations. All reports are derived client-side from the
 * primitive tables + stock levels so the Tauri backend and the in-browser
 * demo driver produce identical results.
 */

const num = (v) => Number(v || 0);

/** Sum stock per variant across branches. levels = [{variant_id, branch_id, qty}] */
export function totalsByVariant(levels) {
  const map = new Map();
  levels.forEach((l) => map.set(l.variant_id, (map.get(l.variant_id) || 0) + num(l.qty)));
  return map;
}

/** Stock per branch for one variant. */
export function branchBreakdown(levels, variantId) {
  return levels.filter((l) => l.variant_id === variantId);
}

/** Variants at or below their reorder point (business-wide total). */
export function lowStock(variants, levels) {
  const totals = totalsByVariant(levels);
  return variants
    .map((v) => ({ ...v, qty: totals.get(v.id) || 0 }))
    .filter((v) => num(v.reorder_point) > 0 && v.qty <= num(v.reorder_point))
    .sort((a, b) => a.qty - b.qty);
}

/** Inventory valuation at cost and at retail, per variant + grand totals. */
export function inventoryValuation(products, variants, levels) {
  const totals = totalsByVariant(levels);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const lines = variants.map((v) => {
    const qty = totals.get(v.id) || 0;
    return {
      variant_id: v.id,
      product: productName.get(v.product_id) || '—',
      variant: v.name,
      sku: v.sku,
      qty,
      cost_price: num(v.cost_price),
      price: num(v.price),
      cost_value: qty * num(v.cost_price),
      retail_value: qty * num(v.price),
    };
  });
  return {
    lines: lines.sort((a, b) => b.cost_value - a.cost_value),
    total_cost: lines.reduce((s, l) => s + l.cost_value, 0),
    total_retail: lines.reduce((s, l) => s + l.retail_value, 0),
  };
}

const monthKey = (iso) => (iso || '').slice(0, 7); // YYYY-MM

/** Sales by calendar month over the trailing `months`, from non-cancelled orders. */
export function salesByMonth(orders, months = 6) {
  const now = new Date();
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const sums = new Map(keys.map((k) => [k, { total: 0, count: 0 }]));
  orders
    .filter((o) => ['confirmed', 'paid'].includes(o.status))
    .forEach((o) => {
      const k = monthKey(o.order_date || o.created_at);
      if (sums.has(k)) {
        const e = sums.get(k);
        e.total += num(o.total_amount);
        e.count += 1;
      }
    });
  return keys.map((k) => ({
    month: k,
    label: new Date(`${k}-01T00:00:00`).toLocaleString('en-ZA', { month: 'short' }),
    total: sums.get(k).total,
    count: sums.get(k).count,
  }));
}

/** Revenue grouped by product category, from order items of non-cancelled orders. */
export function salesByCategory(orders, orderItems, variants, products, categories) {
  const okOrders = new Set(orders.filter((o) => ['confirmed', 'paid'].includes(o.status)).map((o) => o.id));
  const variantToProduct = new Map(variants.map((v) => [v.id, v.product_id]));
  const productToCat = new Map(products.map((p) => [p.id, p.category_id]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const sums = new Map();
  orderItems
    .filter((i) => okOrders.has(i.order_id))
    .forEach((i) => {
      const cat = productToCat.get(variantToProduct.get(i.product_variant_id));
      const name = catName.get(cat) || 'Uncategorised';
      sums.set(name, (sums.get(name) || 0) + num(i.total_price));
    });
  return [...sums.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Outstanding balances.
 * - Debtors (they owe us): confirmed orders minus customer payments in.
 * - Creditors (we owe them): sent/partially_received/received POs minus payments out.
 * "paid" orders are settled and excluded.
 */
export function partyBalances({ orders, purchaseOrders, payments, customers, suppliers }) {
  const debtors = customers
    .map((c) => {
      const invoiced = orders
        .filter((o) => o.customer_id === c.id && o.status === 'confirmed')
        .reduce((s, o) => s + num(o.total_amount), 0);
      const paid = payments
        .filter((p) => p.party_kind === 'customer' && p.party_id === c.id && p.direction === 'in')
        .reduce((s, p) => s + num(p.amount), 0);
      return { party: c, balance: invoiced - paid, invoiced, paid };
    })
    .filter((d) => Math.abs(d.balance) > 0.005);

  const creditors = suppliers
    .map((s) => {
      const billed = purchaseOrders
        .filter((po) => po.supplier_id === s.id && ['sent', 'partially_received', 'received'].includes(po.status))
        .reduce((sum, po) => sum + num(po.total_amount), 0);
      const paid = payments
        .filter((p) => p.party_kind === 'supplier' && p.party_id === s.id && p.direction === 'out')
        .reduce((sum, p) => sum + num(p.amount), 0);
      return { party: s, balance: billed - paid, invoiced: billed, paid };
    })
    .filter((c) => Math.abs(c.balance) > 0.005);

  return {
    debtors: debtors.sort((a, b) => b.balance - a.balance),
    creditors: creditors.sort((a, b) => b.balance - a.balance),
    total_receivable: debtors.reduce((s, d) => s + d.balance, 0),
    total_payable: creditors.reduce((s, c) => s + c.balance, 0),
  };
}

/** Movement rows joined with product/variant/branch names, newest first. */
export function movementLedger(movements, variants, products, branches) {
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  return movements
    .map((m) => {
      const v = variantById.get(m.variant_id);
      return {
        ...m,
        product: v ? productName.get(v.product_id) || '—' : '—',
        variant: v?.name || m.variant_id,
        sku: v?.sku || '',
        branch: branchName.get(m.branch_id) || m.branch_id,
      };
    })
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export const MOVEMENT_KIND_LABELS = {
  receive: 'Goods received',
  sale: 'Sale',
  adjustment: 'Adjustment',
  count: 'Stock count',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  reversal: 'Reversal',
};
