/**
 * FlowStock data layer — one interface, two drivers.
 *
 * - HTTP driver: talks to the Go backend (SQLite + peer sync) over the app's
 *   own origin. This is the real app, whether self-hosted standalone or
 *   embedded in the Vulos OS shell.
 * - Demo driver: runs entirely in the browser with seeded data, so
 *   `npm run dev` (and the screenshotter) work with zero setup.
 *
 * Selection: the demo driver is used when the UI is served by the Vite dev
 * server (port 5173) or when VITE_DEMO=1; otherwise the HTTP driver talks to
 * the Go backend that served the page.
 *
 * All row objects use snake_case column names, mirroring the SQLite schema.
 */

import { seedDemoData } from './demo-data';

const IS_DEMO =
  import.meta.env.VITE_DEMO === '1' ||
  (import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.location.port === '5173');

// ── HTTP driver (Go backend) ──────────────────────────────────────────────────

function makeHttpDriver() {
  const req = async (method, path, body) => {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const text = (await res.text()).trim();
      throw new Error(text || `${method} ${path} failed (${res.status})`);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  };

  return {
    isDemo: false,
    bootstrap: () => req('GET', '/api/bootstrap'),
    setupWorkspace: (businessName, branchName) =>
      req('POST', '/api/setup', { business_name: businessName, branch_name: branchName }),
    joinWorkspace: ({ url, secret, businessName, branchName }) =>
      req('POST', '/api/workspace/join', {
        url,
        secret,
        business_name: businessName,
        branch_name: branchName,
      }),
    updateSettings: (settings) => req('POST', '/api/settings', settings),
    listRows: (tbl) => req('GET', `/api/rows/${tbl}`),
    putRow: (tbl, id, data) => req('POST', `/api/rows/${tbl}`, { id: id || '', data }),
    deleteRow: (tbl, id) => req('DELETE', `/api/rows/${tbl}/${id}`),
    getStockLevels: () => req('GET', '/api/stock/levels'),
    adjustStock: ({ variantId, branchId, qtyDelta, kind, note }) =>
      req('POST', '/api/stock/adjust', {
        variant_id: variantId,
        branch_id: branchId,
        qty_delta: qtyDelta,
        kind,
        note: note || '',
      }),
    transferStock: ({ variantId, fromBranchId, toBranchId, qty, note }) =>
      req('POST', '/api/stock/transfer', {
        variant_id: variantId,
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        qty,
        note: note || '',
      }),
    saveOrder: (payload) => req('POST', '/api/orders/save', payload),
    setOrderStatus: (orderId, status) =>
      req('POST', '/api/orders/status', { order_id: orderId, status }),
    savePurchaseOrder: (payload) => req('POST', '/api/purchase-orders/save', payload),
    setPurchaseOrderStatus: (poId, status) =>
      req('POST', '/api/purchase-orders/status', { po_id: poId, status }),
    receivePurchaseOrder: (poId, receipts) =>
      req('POST', '/api/purchase-orders/receive', { po_id: poId, receipts }),
    getSyncSettings: () => req('GET', '/api/sync/settings'),
    setSyncSettings: ({ listen: listenFlag, port, bindAddr, secret, folder }) =>
      req('POST', '/api/sync/settings', {
        listen: listenFlag,
        port: String(port),
        bind_addr: bindAddr,
        secret,
        ...(folder === undefined ? {} : { folder }),
      }),
    folderSync: () => req('POST', '/api/sync/folder', {}),
    compact: () => req('POST', '/api/sync/compact', {}),
    newSyncSecret: () => req('GET', '/api/sync/secret/new').then((r) => r.secret),
    listPeers: () => req('GET', '/api/peers'),
    savePeer: ({ id, name, url, enabled }) =>
      req('POST', '/api/peers', { id: id || '', name, url, enabled }),
    deletePeer: (id) => req('DELETE', `/api/peers/${id}`),
    syncNow: (peerId) => req('POST', '/api/sync/now', { peer_id: peerId || '' }),
    testPeer: (url) => req('POST', '/api/sync/test', { url }).then((r) => r.ok),
    onDataChanged: (cb) => {
      let es;
      try {
        es = new EventSource('/api/events');
        es.addEventListener('data-changed', cb);
      } catch {
        return () => {};
      }
      return () => es && es.close();
    },
  };
}

// ── Demo driver ──────────────────────────────────────────────────────────────

const DEMO_KEY = 'flowstock-demo-v1';

function ulidish() {
  // Sortable unique id, good enough for the in-browser demo.
  return (
    Date.now().toString(36).toUpperCase().padStart(9, '0') +
    Math.random().toString(36).slice(2, 10).toUpperCase()
  );
}

function makeDemoDriver() {
  let db;
  const listeners = new Set();

  function load() {
    if (db) return db;
    try {
      const raw = sessionStorage.getItem(DEMO_KEY);
      if (raw) {
        db = JSON.parse(raw);
        return db;
      }
    } catch {
      /* reseed */
    }
    db = seedDemoData();
    persist();
    return db;
  }

  function persist() {
    try {
      sessionStorage.setItem(DEMO_KEY, JSON.stringify(db));
    } catch {
      /* storage full/unavailable — demo keeps working in memory */
    }
  }

  function changed() {
    persist();
    listeners.forEach((cb) => cb());
  }

  const rows = (tbl) => {
    const d = load();
    if (!d.tables[tbl]) d.tables[tbl] = [];
    return d.tables[tbl];
  };
  const live = (tbl) => rows(tbl).filter((r) => !r.deleted);
  const byId = (tbl, id) => rows(tbl).find((r) => r.id === id && !r.deleted);

  function upsert(tbl, id, data) {
    const all = rows(tbl);
    const rowId = id || ulidish();
    const idx = all.findIndex((r) => r.id === rowId);
    const row = { ...(idx >= 0 ? all[idx] : {}), ...data, id: rowId, deleted: 0 };
    if (idx >= 0) all[idx] = row;
    else all.push(row);
    return row;
  }

  function movement(variantId, branchId, qtyDelta, kind, refKind, refId, note) {
    const d = load();
    upsert('stock_movements', null, {
      variant_id: variantId,
      branch_id: branchId,
      qty_delta: qtyDelta,
      kind,
      ref_kind: refKind,
      ref_id: refId,
      note: note || '',
      created_by: d.settings.branch_name,
      created_at: new Date().toISOString(),
    });
  }

  function replaceChildren(tbl, parentCol, parentId, children) {
    const keep = children.map((c) => c.id).filter(Boolean);
    rows(tbl).forEach((r) => {
      if (r[parentCol] === parentId && !keep.includes(r.id)) r.deleted = 1;
    });
    children.forEach((c) => upsert(tbl, c.id, { ...c, [parentCol]: parentId }));
  }

  return {
    isDemo: true,
    bootstrap: async () => {
      const d = load();
      return {
        initialized: true,
        node_id: 'DEMO-NODE',
        branch_id: d.settings.branch_id,
        branch_name: d.settings.branch_name,
        business_name: d.settings.business_name,
        currency: { code: 'ZAR', symbol: 'R' },
        tax_rate: 15,
        data_version: 1,
      };
    },
    setupWorkspace: async () => {
      throw new Error('demo workspace is pre-configured');
    },
    joinWorkspace: async () => {
      throw new Error('joining a workspace is not available in demo mode');
    },
    updateSettings: async (settings) => {
      Object.assign(load().settings, settings);
      changed();
    },
    listRows: async (tbl) => live(tbl).map((r) => ({ ...r })),
    putRow: async (tbl, id, data) => {
      if (tbl === 'stock_movements') throw new Error('stock movements are immutable');
      const row = upsert(tbl, id, data);
      changed();
      return { ...row };
    },
    deleteRow: async (tbl, id) => {
      const row = rows(tbl).find((r) => r.id === id);
      if (row) row.deleted = 1;
      changed();
    },
    getStockLevels: async () => {
      const acc = new Map();
      live('stock_movements').forEach((m) => {
        const key = `${m.variant_id}|${m.branch_id}`;
        acc.set(key, (acc.get(key) || 0) + (m.qty_delta || 0));
      });
      return [...acc.entries()].map(([key, qty]) => {
        const [variant_id, branch_id] = key.split('|');
        return { variant_id, branch_id, qty };
      });
    },
    adjustStock: async ({ variantId, branchId, qtyDelta, kind, note }) => {
      if (!qtyDelta) throw new Error('quantity delta may not be zero');
      movement(variantId, branchId, qtyDelta, kind, 'manual', '', note);
      changed();
    },
    transferStock: async ({ variantId, fromBranchId, toBranchId, qty, note }) => {
      if (qty <= 0) throw new Error('transfer quantity must be positive');
      if (fromBranchId === toBranchId) throw new Error('cannot transfer to the same branch');
      const refId = ulidish();
      movement(variantId, fromBranchId, -qty, 'transfer_out', 'transfer', refId, note);
      movement(variantId, toBranchId, qty, 'transfer_in', 'transfer', refId, note);
      changed();
    },
    saveOrder: async ({ order, items, services }) => {
      const d = load();
      const existing = order.id ? byId('orders', order.id) : null;
      const status = existing ? existing.status : order.status || 'draft';
      const id = order.id || ulidish();
      const row = upsert('orders', id, {
        ...order,
        status,
        branch_id: order.branch_id || d.settings.branch_id,
        order_number: order.order_number || `ORD-${id.slice(-6)}`,
        created_at: order.created_at || new Date().toISOString(),
      });
      if ((existing ? existing.status : 'draft') === 'draft') {
        if (items) replaceChildren('order_items', 'order_id', id, items);
        if (services) replaceChildren('order_services', 'order_id', id, services);
      }
      changed();
      return { ...row };
    },
    setOrderStatus: async (orderId, status) => {
      const order = byId('orders', orderId);
      if (!order) throw new Error('order not found');
      const allowed = {
        draft: ['confirmed', 'cancelled'],
        confirmed: ['paid', 'cancelled'],
        paid: ['cancelled'],
      };
      if (!(allowed[order.status] || []).includes(status))
        throw new Error(`cannot move order from ${order.status} to ${status}`);
      const sales = live('stock_movements').filter(
        (m) => m.ref_kind === 'order' && m.ref_id === orderId && m.kind === 'sale',
      );
      if (status === 'confirmed' && sales.length === 0) {
        live('order_items')
          .filter((i) => i.order_id === orderId)
          .forEach((i) => {
            if (i.product_variant_id && i.quantity > 0)
              movement(i.product_variant_id, order.branch_id, -i.quantity, 'sale', 'order', orderId, '');
          });
      }
      if (status === 'cancelled' && order.status !== 'draft') {
        const reversed = live('stock_movements').some(
          (m) => m.ref_kind === 'order' && m.ref_id === orderId && m.kind === 'reversal',
        );
        if (!reversed)
          sales.forEach((m) =>
            movement(m.variant_id, m.branch_id, -m.qty_delta, 'reversal', 'order', orderId, 'order cancelled'),
          );
      }
      order.status = status;
      changed();
    },
    savePurchaseOrder: async ({ purchase_order, items }) => {
      const d = load();
      const po = purchase_order;
      const existing = po.id ? byId('purchase_orders', po.id) : null;
      const status = existing ? existing.status : po.status || 'draft';
      const id = po.id || ulidish();
      const row = upsert('purchase_orders', id, {
        ...po,
        status,
        branch_id: po.branch_id || d.settings.branch_id,
        po_number: po.po_number || `PO-${id.slice(-6)}`,
        created_at: po.created_at || new Date().toISOString(),
      });
      if ((existing ? existing.status : 'draft') === 'draft' && items)
        replaceChildren('purchase_order_items', 'purchase_order_id', id, items);
      changed();
      return { ...row };
    },
    setPurchaseOrderStatus: async (poId, status) => {
      const po = byId('purchase_orders', poId);
      if (!po) throw new Error('purchase order not found');
      const allowed = { draft: ['sent', 'cancelled'], sent: ['cancelled'] };
      if (!(allowed[po.status] || []).includes(status))
        throw new Error(`cannot move purchase order from ${po.status} to ${status}`);
      po.status = status;
      changed();
    },
    receivePurchaseOrder: async (poId, receipts) => {
      const po = byId('purchase_orders', poId);
      if (!po) throw new Error('purchase order not found');
      if (!['sent', 'partially_received'].includes(po.status))
        throw new Error(`cannot receive against a ${po.status} purchase order`);
      const items = live('purchase_order_items').filter((i) => i.purchase_order_id === poId);
      receipts.forEach(({ item_id, qty }) => {
        if (qty <= 0) return;
        const item = items.find((i) => i.id === item_id);
        if (!item) throw new Error('line item not on this purchase order');
        if ((item.item_type || 'product') !== 'product') return;
        const already = item.received_quantity || 0;
        if (already + qty > (item.quantity || 0) + 1e-9)
          throw new Error('receiving would exceed ordered quantity');
        if (item.product_variant_id)
          movement(item.product_variant_id, po.branch_id, qty, 'receive', 'purchase_order', poId, '');
        item.received_quantity = already + qty;
      });
      const stockable = items.filter((i) => (i.item_type || 'product') === 'product');
      const all = stockable.length > 0 && stockable.every((i) => (i.received_quantity || 0) + 1e-9 >= (i.quantity || 0));
      const any = stockable.some((i) => (i.received_quantity || 0) > 0);
      po.status = all ? 'received' : any ? 'partially_received' : po.status;
      changed();
    },
    getSyncSettings: async () => {
      const d = load();
      return { ...d.sync, listening: d.sync.listen, node_id: 'DEMO-NODE' };
    },
    setSyncSettings: async (cfg) => {
      const d = load();
      Object.assign(d.sync, cfg, { bind_addr: cfg.bindAddr ?? d.sync.bind_addr });
      changed();
      return { ...d.sync, listening: d.sync.listen, node_id: 'DEMO-NODE' };
    },
    folderSync: async () => ({ exported: 0, imported: 0, files: 0 }),
    compact: async () => ({ pruned: 0 }),
    newSyncSecret: async () =>
      [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''),
    listPeers: async () => live('peers').map((r) => ({ ...r })),
    savePeer: async ({ id, name, url, enabled }) => {
      upsert('peers', id, { name, url, enabled, last_sync_at: '', last_status: '' });
      changed();
    },
    deletePeer: async (id) => {
      const row = rows('peers').find((r) => r.id === id);
      if (row) row.deleted = 1;
      changed();
    },
    syncNow: async (peerId) => {
      // Demo: pretend every enabled peer answered.
      const now = new Date().toISOString();
      const results = live('peers')
        .filter((p) => p.enabled && (!peerId || p.id === peerId))
        .map((p) => {
          p.last_sync_at = now;
          p.last_status = 'ok: pushed 0, pulled 0 (demo)';
          return { peer_id: p.id, ok: true, pushed: 0, pulled: 0, error: '' };
        });
      changed();
      return results;
    },
    testPeer: async () => true,
    onDataChanged: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

export const api = IS_DEMO ? makeDemoDriver() : makeHttpDriver();
export const isDemo = IS_DEMO;
