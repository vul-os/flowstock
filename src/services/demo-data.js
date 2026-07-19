/**
 * Seeded demo dataset — a South African hardware & tools trader with three
 * branches. Used by the in-browser demo driver (`npm run dev` outside Tauri)
 * and the screenshotter, so it aims for realistic, chart-friendly history.
 *
 * Deterministic: a fixed-seed PRNG generates the trading history, so
 * screenshots are reproducible.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d) => d.toISOString();
const daysAgo = (n, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 15 + (n % 40), 0, 0);
  return d;
};

export function seedDemoData() {
  const rand = mulberry32(0xf10c);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  const branches = [
    { id: 'br-jhb', name: 'Johannesburg HQ', code: 'JHB', address: '14 Commissioner St, Johannesburg', is_active: 1, created_at: iso(daysAgo(400)) },
    { id: 'br-cpt', name: 'Cape Town', code: 'CPT', address: '82 Voortrekker Rd, Parow', is_active: 1, created_at: iso(daysAgo(320)) },
    { id: 'br-dbn', name: 'Durban', code: 'DBN', address: '5 Umgeni Rd, Durban', is_active: 1, created_at: iso(daysAgo(200)) },
  ];

  const categories = [
    { id: 'cat-fast', name: 'Fasteners' },
    { id: 'cat-power', name: 'Power Tools' },
    { id: 'cat-hand', name: 'Hand Tools' },
    { id: 'cat-elec', name: 'Electrical' },
    { id: 'cat-plumb', name: 'Plumbing' },
    { id: 'cat-safety', name: 'Safety Gear' },
  ];

  const products = [];
  const variants = [];
  const addProduct = (id, name, category_id, description, data, vs) => {
    products.push({ id, name, category_id, description, product_data: JSON.stringify(data || {}), created_at: iso(daysAgo(between(120, 380))), updated_at: iso(daysAgo(between(1, 60))) });
    vs.forEach(([vid, vname, sku, price, cost, reorder, attributes]) =>
      variants.push({ id: vid, product_id: id, name: vname, sku, price, cost_price: cost, reorder_point: reorder, attributes: JSON.stringify(attributes || {}) }),
    );
  };

  addProduct('p-hexbolt', 'Hex Bolts M6 (box of 100)', 'cat-fast', 'Zinc-plated class 8.8 hex bolts, boxed per 100.', { material: 'Steel, zinc plated', specifications: { headType: 'Hex', threadType: 'Metric coarse', packageQuantity: 100 } }, [
    ['v-hexbolt-30', 'M6 × 30 mm', 'FAS-HB-M6-30', 189.0, 122.5, 40, { length: '30 mm' }],
    ['v-hexbolt-50', 'M6 × 50 mm', 'FAS-HB-M6-50', 239.0, 158.0, 40, { length: '50 mm' }],
  ]);
  addProduct('p-woodscrew', 'Wood Screws 4×40 (box of 200)', 'cat-fast', 'Countersunk pozi chipboard screws.', { material: 'Hardened steel', specifications: { headType: 'Countersunk', packageQuantity: 200 } }, [
    ['v-woodscrew', '4 × 40 mm', 'FAS-WS-4-40', 129.0, 78.0, 60, {}],
  ]);
  addProduct('p-drill', 'Cordless Drill 18V', 'cat-power', 'Brushless 18V drill driver, 13 mm keyless chuck.', { specifications: { finish: 'Brushless' } }, [
    ['v-drill-bare', 'Bare tool', 'PWR-DRL-18-B', 1899.0, 1305.0, 6, { kit: 'bare' }],
    ['v-drill-kit', 'Kit (2 × 4Ah + charger)', 'PWR-DRL-18-K', 3499.0, 2440.0, 4, { kit: 'full' }],
  ]);
  addProduct('p-grinder', 'Angle Grinder 115 mm', 'cat-power', '900 W angle grinder with side handle.', {}, [
    ['v-grinder', '900 W', 'PWR-GRN-115', 849.0, 585.0, 8, {}],
  ]);
  addProduct('p-hammer', 'Claw Hammer 450 g', 'cat-hand', 'Fibreglass shaft claw hammer.', {}, [
    ['v-hammer', '450 g', 'HND-HAM-450', 219.0, 132.0, 15, {}],
  ]);
  addProduct('p-screwset', 'Screwdriver Set 12 pc', 'cat-hand', 'Slotted + pozi + torx set with magnetic tips.', {}, [
    ['v-screwset', '12 piece', 'HND-SDS-12', 449.0, 276.0, 10, {}],
  ]);
  addProduct('p-cable', 'Twin & Earth Cable 2.5 mm²', 'cat-elec', 'SANS-approved surfix cable.', {}, [
    ['v-cable-10', '10 m roll', 'ELC-TE25-10', 289.0, 196.0, 25, { length: '10 m' }],
    ['v-cable-100', '100 m drum', 'ELC-TE25-100', 2590.0, 1820.0, 5, { length: '100 m' }],
  ]);
  addProduct('p-flood', 'LED Floodlight 50 W', 'cat-elec', 'IP65 outdoor floodlight, cool white.', {}, [
    ['v-flood', '50 W', 'ELC-FLD-50', 429.0, 265.0, 12, {}],
  ]);
  addProduct('p-pipe', 'PVC Pipe 110 mm × 6 m', 'cat-plumb', 'Underground drainage pipe, SABS mark.', {}, [
    ['v-pipe', '110 mm × 6 m', 'PLB-PVC-110', 319.0, 208.0, 20, {}],
  ]);
  addProduct('p-boots', 'Safety Boots (steel toe)', 'cat-safety', 'Leather safety boots, steel toe cap.', {}, [
    ['v-boots-8', 'Size 8', 'SFT-BT-08', 689.0, 452.0, 6, { size: '8' }],
    ['v-boots-9', 'Size 9', 'SFT-BT-09', 689.0, 452.0, 6, { size: '9' }],
    ['v-boots-10', 'Size 10', 'SFT-BT-10', 689.0, 452.0, 6, { size: '10' }],
  ]);

  const services = [
    { id: 'svc-blade', name: 'Blade sharpening', description: 'Sharpening service for saw blades and chisels.', hourly_rate: 350.0, created_at: iso(daysAgo(300)) },
    { id: 'svc-repair', name: 'Power tool repair', description: 'Bench repair of power tools, quote first.', hourly_rate: 480.0, created_at: iso(daysAgo(300)) },
    { id: 'svc-cut', name: 'Cutting & threading', description: 'Pipe cutting and thread work per job.', hourly_rate: 300.0, created_at: iso(daysAgo(240)) },
  ];

  const suppliers = [
    { id: 'sup-natal', name: 'Sipho Ndlovu', company_name: 'Natal Fastener Co.', email: 'orders@natalfastener.co.za', phone: '+27 31 555 0192', address: '18 Titanium Rd, Pinetown', tax_number: '4890123456', payment_terms: '30 days', notes: 'Fastener + fixings wholesaler.', is_active: 1 },
    { id: 'sup-power', name: 'Anelisa Mfeka', company_name: 'PowerTool Distributors SA', email: 'sales@ptdsa.co.za', phone: '+27 11 555 0428', address: '2 Kyalami Blvd, Midrand', tax_number: '4550098821', payment_terms: '30 days', notes: 'Exclusive drill/grinder distributor.', is_active: 1 },
    { id: 'sup-electro', name: 'Pieter van Wyk', company_name: 'ElectroSupply CC', email: 'accounts@electrosupply.co.za', phone: '+27 21 555 0871', address: '9 Bofors Circle, Epping', tax_number: '4120067543', payment_terms: '60 days', notes: 'Cable and lighting.', is_active: 1 },
  ];

  const customers = [
    { id: 'cus-mokoena', name: 'Thabo Mokoena', company_name: 'Mokoena Construction', email: 'thabo@mokoenaconstruction.co.za', phone: '+27 82 555 0134', billing_address: '221 Rivonia Rd, Sandton', shipping_address: 'Site 4, Waterfall City', tax_number: '9012345678', payment_terms: '30 days', credit_limit: 150000, notes: 'Large residential contractor.', is_active: 1 },
    { id: 'cus-capeb', name: 'Lauren Petersen', company_name: 'Cape Builders Collective', email: 'lauren@capebuilders.co.za', phone: '+27 83 555 0917', billing_address: '12 Bree St, Cape Town', shipping_address: '12 Bree St, Cape Town', tax_number: '9155502211', payment_terms: '30 days', credit_limit: 80000, notes: '', is_active: 1 },
    { id: 'cus-umhlanga', name: 'Naledi Zungu', company_name: 'Umhlanga Property Care', email: 'naledi@upcare.co.za', phone: '+27 84 555 0555', billing_address: '77 Lighthouse Rd, Umhlanga', shipping_address: '77 Lighthouse Rd, Umhlanga', tax_number: '9223301199', payment_terms: '14 days', credit_limit: 40000, notes: 'Maintenance company, weekly orders.', is_active: 1 },
    { id: 'cus-walkin', name: 'Walk-in / cash sales', company_name: '', email: '', phone: '', billing_address: '', shipping_address: '', tax_number: '', payment_terms: 'cash', credit_limit: 0, notes: 'Aggregated retail counter sales.', is_active: 1 },
  ];

  const tables = {
    branches,
    categories,
    products,
    product_variants: variants,
    services,
    suppliers,
    customers,
    orders: [],
    order_items: [],
    order_services: [],
    purchase_orders: [],
    purchase_order_items: [],
    payments: [],
    stock_movements: [],
    peers: [
      { id: 'peer-cpt', name: 'Cape Town branch', url: 'http://10.0.4.21:7365', enabled: 1, last_sync_at: iso(daysAgo(0, 8)), last_status: 'ok: pushed 12, pulled 3' },
      { id: 'peer-dbn', name: 'Durban branch', url: 'http://10.0.6.14:7365', enabled: 1, last_sync_at: iso(daysAgo(0, 8)), last_status: 'ok: pushed 12, pulled 9' },
    ],
  };

  let seq = 1;
  const nextId = (prefix) => `${prefix}-${String(seq++).padStart(4, '0')}`;
  const move = (variant_id, branch_id, qty_delta, kind, ref_kind, ref_id, when, note = '') =>
    tables.stock_movements.push({ id: nextId('mov'), variant_id, branch_id, qty_delta, kind, ref_kind, ref_id, note, created_by: 'Johannesburg HQ', created_at: iso(when) });

  // ── opening stock: goods received ~90 days ago at each branch ──────────────
  variants.forEach((v) => {
    branches.forEach((b, i) => {
      const base = Math.max(2, Math.round((v.reorder_point || 5) * (2.6 - i * 0.5)));
      move(v.id, b.id, base, 'receive', 'manual', '', daysAgo(92 - i, 9), 'opening stock');
    });
  });

  // ── purchase orders ────────────────────────────────────────────────────────
  const poDefs = [
    { id: 'po-1', supplier_id: 'sup-natal', branch_id: 'br-jhb', ago: 45, status: 'received', items: [['v-hexbolt-30', 60, 122.5], ['v-hexbolt-50', 40, 158.0], ['v-woodscrew', 80, 78.0]] },
    { id: 'po-2', supplier_id: 'sup-power', branch_id: 'br-jhb', ago: 21, status: 'partially_received', items: [['v-drill-bare', 10, 1305.0], ['v-drill-kit', 6, 2440.0], ['v-grinder', 12, 585.0]] },
    { id: 'po-3', supplier_id: 'sup-electro', branch_id: 'br-cpt', ago: 9, status: 'sent', items: [['v-cable-10', 40, 196.0], ['v-cable-100', 6, 1820.0], ['v-flood', 24, 265.0]] },
    { id: 'po-4', supplier_id: 'sup-natal', branch_id: 'br-dbn', ago: 2, status: 'draft', items: [['v-woodscrew', 50, 78.0], ['v-hexbolt-30', 30, 122.5]] },
  ];
  poDefs.forEach((def) => {
    const subtotal = def.items.reduce((s, [, q, p]) => s + q * p, 0);
    const tax = subtotal * 0.15;
    tables.purchase_orders.push({
      id: def.id, branch_id: def.branch_id, supplier_id: def.supplier_id,
      po_number: `PO-2026-${def.id.slice(-1).padStart(3, '0')}`,
      order_date: iso(daysAgo(def.ago)), expected_delivery_date: iso(daysAgo(def.ago - 14)),
      status: def.status, subtotal, tax_amount: tax, total_amount: subtotal + tax,
      notes: '', created_at: iso(daysAgo(def.ago)),
    });
    def.items.forEach(([vid, qty, price], i) => {
      const fullReceive = def.status === 'received';
      const partial = def.status === 'partially_received' && i === 0;
      const received = fullReceive ? qty : partial ? Math.floor(qty / 2) : 0;
      tables.purchase_order_items.push({
        id: `${def.id}-i${i}`, purchase_order_id: def.id, item_type: 'product',
        product_variant_id: vid, service_id: null, quantity: qty, unit_price: price,
        total_price: qty * price, description: '', unit_type: 'units', received_quantity: received,
      });
      if (received > 0) move(vid, def.branch_id, received, 'receive', 'purchase_order', def.id, daysAgo(Math.max(def.ago - 7, 1), 11));
    });
  });

  // ── sales orders across ~10 weeks ─────────────────────────────────────────
  const statusFor = (ago) => (ago > 30 ? 'paid' : ago > 7 ? pick(['paid', 'confirmed', 'confirmed']) : pick(['confirmed', 'draft']));
  let orderNo = 101;
  for (let ago = 70; ago >= 0; ago -= between(1, 4)) {
    const customer = pick(customers);
    const branch = pick(branches);
    const status = statusFor(ago);
    const id = nextId('ord');
    const lineCount = between(1, 3);
    let subtotal = 0;
    const chosen = new Set();
    for (let li = 0; li < lineCount; li++) {
      const v = pick(variants);
      if (chosen.has(v.id)) continue;
      chosen.add(v.id);
      const qty = v.price > 1000 ? between(1, 2) : between(2, 12);
      subtotal += qty * v.price;
      tables.order_items.push({ id: `${id}-i${li}`, order_id: id, product_variant_id: v.id, quantity: qty, unit_price: v.price, total_price: qty * v.price });
      if (status !== 'draft') move(v.id, branch.id, -qty, 'sale', 'order', id, daysAgo(ago, 13));
    }
    if (rand() < 0.25) {
      const svc = pick(services);
      const hours = between(1, 4);
      subtotal += hours * svc.hourly_rate;
      tables.order_services.push({ id: `${id}-s0`, order_id: id, service_id: svc.id, hours, hourly_rate: svc.hourly_rate, total_price: hours * svc.hourly_rate, description: svc.name });
    }
    tables.orders.push({
      id, branch_id: branch.id, customer_id: customer.id, order_number: `ORD-2026-${orderNo++}`,
      order_date: iso(daysAgo(ago)), due_date: iso(daysAgo(ago - 14)), payment_terms: customer.payment_terms || '30 days',
      status, subtotal, total_amount: subtotal, notes: '', created_at: iso(daysAgo(ago, 12)),
    });
  }

  // ── a couple of manual adjustments + one transfer ─────────────────────────
  move('v-hammer', 'br-jhb', -2, 'adjustment', 'manual', '', daysAgo(12, 16), 'damaged stock write-off');
  move('v-boots-9', 'br-cpt', 1, 'count', 'manual', '', daysAgo(6, 9), 'stock count correction');
  move('v-drill-bare', 'br-jhb', -3, 'transfer_out', 'transfer', 'tr-demo-1', daysAgo(4, 10), 'rebalance to Cape Town');
  move('v-drill-bare', 'br-cpt', 3, 'transfer_in', 'transfer', 'tr-demo-1', daysAgo(4, 10), 'rebalance to Cape Town');

  // ── payments against confirmed orders / received POs ─────────────────────
  tables.orders
    .filter((o) => o.status === 'confirmed')
    .slice(0, 3)
    .forEach((o, i) =>
      tables.payments.push({
        id: nextId('pay'), party_kind: 'customer', party_id: o.customer_id, direction: 'in',
        amount: Math.round(o.total_amount * 0.5), payment_date: iso(daysAgo(2 + i)), method: 'eft',
        note: `part payment ${o.order_number}`, created_at: iso(daysAgo(2 + i)),
      }),
    );
  tables.payments.push({
    id: nextId('pay'), party_kind: 'supplier', party_id: 'sup-power', direction: 'out',
    amount: 15000, payment_date: iso(daysAgo(5)), method: 'eft', note: 'part payment PO-2026-002', created_at: iso(daysAgo(5)),
  });

  return {
    settings: {
      business_name: 'Khumalo Hardware & Tools',
      branch_id: 'br-jhb',
      branch_name: 'Johannesburg HQ',
      currency_code: 'ZAR',
      currency_symbol: 'R',
      tax_rate: 15,
    },
    sync: { listen: true, port: 7365, bind_addr: '0.0.0.0', secret: 'demo-sync-secret-not-real' },
    tables,
  };
}
