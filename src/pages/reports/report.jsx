import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/state";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, ArrowUpDown, Download, FileBarChart } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useWorkspace,
  useTables,
  useStockLevels,
} from "@/context/workspace-context";
import {
  inventoryValuation,
  lowStock,
  salesByMonth,
  partyBalances,
  movementLedger,
  MOVEMENT_KIND_LABELS,
} from "@/lib/reports";
import { REPORTS } from "./reports-config";
import { useChartTheme } from "@/lib/chart-theme";

const KIND_BADGE = {
  receive: "bg-success-muted text-success",
  transfer_in: "bg-success-muted text-success",
  sale: "bg-destructive-muted text-destructive",
  transfer_out: "bg-destructive-muted text-destructive",
  adjustment: "bg-signal-muted text-signal-text",
  count: "bg-signal-muted text-signal-text",
  reversal: "bg-signal-muted text-signal-text",
};

const money2 = (n) => Number(n || 0).toFixed(2);

const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const monthLabel = (key) => {
  const d = new Date(`${key}-01T00:00:00`);
  return Number.isNaN(d.getTime())
    ? key
    : d.toLocaleString("en-ZA", { month: "short", year: "numeric" });
};

/** Build a CSV from headers + rows-of-arrays and trigger a client-side download. */
function makeCsvExporter(toast, filename, buildRows) {
  return () => {
    try {
      const { headers, rows } = buildRows();
      const esc = (v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers, ...rows]
        .map((r) => r.map(esc).join(","))
        .join("\n");
      const blob = new Blob([` ${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not build the CSV file.",
        variant: "destructive",
      });
    }
  };
}

const ReportShell = ({ title, description, onExport, children }) => (
  <div className="p-6 max-w-6xl mx-auto space-y-6">
    <div>
      <Link
        to="/reports"
        className="inline-flex items-center gap-1 text-sm text-primary hover:text-blue-800 mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        All reports
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {onExport && (
          <Button variant="outline" onClick={onExport} className="shrink-0">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>
    </div>
    {children}
  </div>
);

// ── Inventory valuation ──────────────────────────────────────────────────────

const VALUATION_SORTS = {
  product: (a, b) => a.product.localeCompare(b.product),
  qty: (a, b) => a.qty - b.qty,
  cost_value: (a, b) => a.cost_value - b.cost_value,
  retail_value: (a, b) => a.retail_value - b.retail_value,
};

function InventoryValuationReport({ data, levels, fmtMoney, toast }) {
  const [sort, setSort] = useState({ key: "cost_value", dir: "desc" });

  const valuation = useMemo(
    () =>
      inventoryValuation(
        data.products || [],
        data.product_variants || [],
        levels,
      ),
    [data, levels],
  );

  const lines = useMemo(() => {
    const sorted = [...valuation.lines].sort(VALUATION_SORTS[sort.key]);
    return sort.dir === "desc" ? sorted.reverse() : sorted;
  }, [valuation, sort]);

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "product" ? "asc" : "desc" },
    );

  const onExport = makeCsvExporter(toast, "inventory-valuation.csv", () => ({
    headers: [
      "Product",
      "Variant",
      "SKU",
      "Qty",
      "Unit cost",
      "Unit price",
      "Cost value",
      "Retail value",
    ],
    rows: lines.map((l) => [
      l.product,
      l.variant,
      l.sku,
      l.qty,
      money2(l.cost_price),
      money2(l.price),
      money2(l.cost_value),
      money2(l.retail_value),
    ]),
  }));

  const SortHead = ({ id, children, className }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(id)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          sort.key === id ? "text-foreground font-semibold" : ""
        }`}
      >
        {children}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  return (
    <ReportShell
      title="Inventory Valuation"
      description="Stock on hand valued at cost and at retail. Click a column to sort."
      onExport={valuation.lines.length ? onExport : null}
    >
      <Card>
        <CardContent className="pt-6">
          {valuation.lines.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="No products yet"
              description="Add products and stock to see a valuation."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead id="product">Product</SortHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <SortHead id="qty" className="text-right">
                    Qty
                  </SortHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <SortHead id="cost_value" className="text-right">
                    Cost value
                  </SortHead>
                  <SortHead id="retail_value" className="text-right">
                    Retail value
                  </SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.variant_id}>
                    <TableCell className="font-medium">{l.product}</TableCell>
                    <TableCell>{l.variant}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.sku}
                    </TableCell>
                    <TableCell className="cell-num">{l.qty}</TableCell>
                    <TableCell className="cell-num">
                      {fmtMoney(l.cost_price)}
                    </TableCell>
                    <TableCell className="cell-num">
                      {fmtMoney(l.price)}
                    </TableCell>
                    <TableCell className="cell-num">
                      {fmtMoney(l.cost_value)}
                    </TableCell>
                    <TableCell className="cell-num">
                      {fmtMoney(l.retail_value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="cell-num font-semibold">
                    {fmtMoney(valuation.total_cost)}
                  </TableCell>
                  <TableCell className="cell-num font-semibold">
                    {fmtMoney(valuation.total_retail)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}

// ── Stock movements ──────────────────────────────────────────────────────────

const MOVEMENTS_SHOWN = 300;

function StockMovementsReport({ data, toast }) {
  const [branch, setBranch] = useState("all");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");

  const branches = useMemo(() => data.branches || [], [data.branches]);

  const ledger = useMemo(
    () =>
      movementLedger(
        data.stock_movements || [],
        data.product_variants || [],
        data.products || [],
        branches,
      ),
    [data, branches],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.filter((m) => {
      if (branch !== "all" && m.branch_id !== branch) return false;
      if (kind !== "all" && m.kind !== kind) return false;
      if (!q) return true;
      return [m.product, m.variant, m.sku, m.note, m.branch].some((f) =>
        (f || "").toLowerCase().includes(q),
      );
    });
  }, [ledger, branch, kind, search]);

  const onExport = makeCsvExporter(toast, "stock-movements.csv", () => ({
    headers: [
      "Date",
      "Product",
      "Variant",
      "SKU",
      "Branch",
      "Kind",
      "Qty change",
      "Note",
    ],
    rows: filtered.map((m) => [
      m.created_at,
      m.product,
      m.variant,
      m.sku,
      m.branch,
      MOVEMENT_KIND_LABELS[m.kind] || m.kind,
      m.qty_delta,
      m.note,
    ]),
  }));

  return (
    <ReportShell
      title="Stock Movements"
      description="Every change to stock, newest first. Filters apply to the export too."
      onExport={filtered.length ? onExport : null}
    >
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search product, SKU, note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {Object.entries(MOVEMENT_KIND_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="No movements match"
              description="Try clearing the filters, or record some stock activity first."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, MOVEMENTS_SHOWN).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmtDateTime(m.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.product}
                        {m.variant ? ` — ${m.variant}` : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.sku}
                      </TableCell>
                      <TableCell>{m.branch}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full font-medium whitespace-nowrap ${
                            KIND_BADGE[m.kind] || "bg-muted text-foreground"
                          }`}
                        >
                          {MOVEMENT_KIND_LABELS[m.kind] || m.kind}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-semibold ${
                          Number(m.qty_delta) >= 0
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {Number(m.qty_delta) >= 0 ? "+" : ""}
                        {m.qty_delta}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[16rem] truncate">
                        {m.note}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                {filtered.length > MOVEMENTS_SHOWN
                  ? `Showing first ${MOVEMENTS_SHOWN} of ${filtered.length} movements — narrow the filters or export the full set.`
                  : `${filtered.length} movement${filtered.length === 1 ? "" : "s"}.`}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}

// ── Low stock ────────────────────────────────────────────────────────────────

function LowStockReport({ data, levels, toast }) {
  const rows = useMemo(() => {
    const products = data.products || [];
    const variants = data.product_variants || [];
    const movements = data.stock_movements || [];
    const purchaseOrders = data.purchase_orders || [];
    const suppliers = data.suppliers || [];

    const productName = new Map(products.map((p) => [p.id, p.name]));
    const poById = new Map(purchaseOrders.map((po) => [po.id, po]));
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));

    // Supplier hint: the supplier on the PO behind the latest goods receipt.
    const lastSupplier = new Map();
    [...movements]
      .filter(
        (m) =>
          m.kind === "receive" && m.ref_kind === "purchase_order" && m.ref_id,
      )
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
      .forEach((m) => {
        const po = poById.get(m.ref_id);
        const sup = po && supplierById.get(po.supplier_id);
        if (sup) lastSupplier.set(m.variant_id, sup.company_name || sup.name);
      });

    return lowStock(variants, levels).map((v) => ({
      ...v,
      product: productName.get(v.product_id) || "—",
      shortfall: Number(v.reorder_point || 0) - v.qty,
      supplier: lastSupplier.get(v.id) || "",
    }));
  }, [data, levels]);

  const onExport = makeCsvExporter(toast, "low-stock.csv", () => ({
    headers: [
      "Product",
      "Variant",
      "SKU",
      "Qty on hand",
      "Reorder point",
      "Shortfall",
      "Last supplier",
    ],
    rows: rows.map((r) => [
      r.product,
      r.name,
      r.sku,
      r.qty,
      r.reorder_point,
      r.shortfall,
      r.supplier,
    ]),
  }));

  return (
    <ReportShell
      title="Low Stock"
      description="Variants at or below their reorder point, business-wide, most urgent first."
      onExport={rows.length ? onExport : null}
    >
      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="All stock levels healthy"
              description="Nothing is at or below its reorder point right now."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reorder point</TableHead>
                  <TableHead className="text-right">Shortfall</TableHead>
                  <TableHead>Last supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/products/${r.product_id}`}
                        className="hover:underline"
                      >
                        {r.product}
                      </Link>
                    </TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.sku}
                    </TableCell>
                    <TableCell className="cell-num">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.qty <= Number(r.reorder_point || 0) / 2
                            ? "bg-destructive-muted text-destructive"
                            : "bg-signal-muted text-signal-text"
                        }`}
                      >
                        {r.qty}
                      </span>
                    </TableCell>
                    <TableCell className="cell-num">
                      {r.reorder_point}
                    </TableCell>
                    <TableCell className="cell-num font-semibold text-destructive">
                      {r.shortfall}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.supplier || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}

// ── Sales ────────────────────────────────────────────────────────────────────

function SalesReport({ data, fmtMoney, currency, toast }) {
  const chart = useChartTheme();
  const { monthly, topProducts, topCustomers } = useMemo(() => {
    const orders = data.orders || [];
    const orderItems = data.order_items || [];
    const variants = data.product_variants || [];
    const products = data.products || [];
    const customers = data.customers || [];

    const months = salesByMonth(orders, 12).map((m) => ({
      ...m,
      label: monthLabel(m.month),
    }));

    const okOrders = new Set(
      orders
        .filter((o) => ["confirmed", "paid"].includes(o.status))
        .map((o) => o.id),
    );
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const productName = new Map(products.map((p) => [p.id, p.name]));

    const byVariant = new Map();
    orderItems
      .filter((i) => okOrders.has(i.order_id))
      .forEach((i) => {
        const e = byVariant.get(i.product_variant_id) || { qty: 0, revenue: 0 };
        e.qty += Number(i.quantity || 0);
        e.revenue += Number(i.total_price || 0);
        byVariant.set(i.product_variant_id, e);
      });
    const prods = [...byVariant.entries()]
      .map(([vid, e]) => {
        const v = variantById.get(vid);
        return {
          id: vid,
          name: v ? `${productName.get(v.product_id) || "—"} — ${v.name}` : vid,
          sku: v?.sku || "",
          qty: e.qty,
          revenue: e.revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const byCustomer = new Map();
    orders
      .filter((o) => ["confirmed", "paid"].includes(o.status))
      .forEach((o) => {
        const e = byCustomer.get(o.customer_id) || { orders: 0, revenue: 0 };
        e.orders += 1;
        e.revenue += Number(o.total_amount || 0);
        byCustomer.set(o.customer_id, e);
      });
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const custs = [...byCustomer.entries()]
      .map(([cid, e]) => {
        const c = customerById.get(cid);
        return {
          id: cid || "unknown",
          name: c ? c.company_name || c.name : "Unknown customer",
          orders: e.orders,
          revenue: e.revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return { monthly: months, topProducts: prods, topCustomers: custs };
  }, [data]);

  const hasSales = monthly.some((m) => m.total > 0);
  const symbol = currency?.symbol ?? "R";

  const onExport = makeCsvExporter(toast, "sales.csv", () => ({
    headers: ["Month", "Orders", "Sales"],
    rows: monthly.map((m) => [m.month, m.count, money2(m.total)]),
  }));

  return (
    <ReportShell
      title="Sales"
      description="Confirmed and paid orders over the trailing 12 months."
      onExport={hasSales ? onExport : null}
    >
      <Card>
        <CardHeader>
          <CardTitle>Monthly sales</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSales ? (
            <EmptyState
              icon={FileBarChart}
              title="No sales yet"
              description="Confirm or complete an order to see it here."
            />
          ) : (
            <>
              <div className="h-72 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthly}
                    margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chart.grid}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chart.axisInk, fontSize: 11 }}
                      axisLine={{ stroke: chart.grid }}
                      tickLine={false}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fill: chart.axisInk, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1000
                          ? `${symbol}${(v / 1000).toLocaleString("en-ZA")}k`
                          : `${symbol}${v}`
                      }
                    />
                    <Tooltip
                      cursor={{ fill: chart.cursorFill }}
                      contentStyle={chart.tooltip}
                      formatter={(value) => [fmtMoney(value), "Sales"]}
                    />
                    <Bar
                      dataKey="total"
                      fill={chart.categorical[0]}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthly.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="cell-num">{m.count}</TableCell>
                      <TableCell className="cell-num">
                        {fmtMoney(m.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="cell-num font-semibold">
                      {monthly.reduce((s, m) => s + m.count, 0)}
                    </TableCell>
                    <TableCell className="cell-num font-semibold">
                      {fmtMoney(monthly.reduce((s, m) => s + m.total, 0))}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top products by revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <EmptyState icon={FileBarChart} title="No product sales yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span className="font-medium">{p.name}</span>
                        {p.sku && (
                          <span className="text-muted-foreground text-xs ml-2">
                            {p.sku}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="cell-num">{p.qty}</TableCell>
                      <TableCell className="cell-num">
                        {fmtMoney(p.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top customers</CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <EmptyState title="No customer sales yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="cell-num">{c.orders}</TableCell>
                      <TableCell className="cell-num">
                        {fmtMoney(c.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ReportShell>
  );
}

// ── Creditors & debtors ──────────────────────────────────────────────────────

function BalanceTable({ rows, partyLabel, fmtMoney, total, balanceClass }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{partyLabel}</TableHead>
          <TableHead className="text-right">Invoiced</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.party.id}>
            <TableCell>
              <span className="font-medium">
                {r.party.company_name || r.party.name}
              </span>
              {r.party.company_name && r.party.name && (
                <span className="text-muted-foreground text-xs ml-2">
                  {r.party.name}
                </span>
              )}
            </TableCell>
            <TableCell className="cell-num">{fmtMoney(r.invoiced)}</TableCell>
            <TableCell className="cell-num">{fmtMoney(r.paid)}</TableCell>
            <TableCell className={`cell-num font-semibold ${balanceClass}`}>
              {fmtMoney(r.balance)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="font-semibold">
            Total
          </TableCell>
          <TableCell className={`cell-num font-semibold ${balanceClass}`}>
            {fmtMoney(total)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function AccountsReport({ data, fmtMoney, toast }) {
  const balances = useMemo(
    () =>
      partyBalances({
        orders: data.orders || [],
        purchaseOrders: data.purchase_orders || [],
        payments: data.payments || [],
        customers: data.customers || [],
        suppliers: data.suppliers || [],
      }),
    [data],
  );

  const onExport = makeCsvExporter(toast, "creditors-debtors.csv", () => ({
    headers: ["Type", "Party", "Invoiced", "Paid", "Balance"],
    rows: [
      ...balances.debtors.map((d) => [
        "Debtor",
        d.party.company_name || d.party.name,
        money2(d.invoiced),
        money2(d.paid),
        money2(d.balance),
      ]),
      ...balances.creditors.map((c) => [
        "Creditor",
        c.party.company_name || c.party.name,
        money2(c.invoiced),
        money2(c.paid),
        money2(c.balance),
      ]),
    ],
  }));

  const hasRows = balances.debtors.length > 0 || balances.creditors.length > 0;

  return (
    <ReportShell
      title="Creditors & Debtors"
      description="Outstanding balances from confirmed orders and open purchase orders."
      onExport={hasRows ? onExport : null}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total receivable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="data-figure text-2xl font-semibold text-success">
              {fmtMoney(balances.total_receivable)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Customers owe you
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total payable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="data-figure text-2xl font-semibold text-destructive">
              {fmtMoney(balances.total_payable)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You owe suppliers
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Debtors (accounts receivable)</CardTitle>
        </CardHeader>
        <CardContent>
          {balances.debtors.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="No outstanding debtors"
              description="Confirmed unpaid orders create debtors."
            />
          ) : (
            <BalanceTable
              rows={balances.debtors}
              partyLabel="Customer"
              fmtMoney={fmtMoney}
              total={balances.total_receivable}
              balanceClass="text-success"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Creditors (accounts payable)</CardTitle>
        </CardHeader>
        <CardContent>
          {balances.creditors.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="No outstanding creditors"
              description="Sent or received purchase orders create creditors."
            />
          ) : (
            <BalanceTable
              rows={balances.creditors}
              partyLabel="Supplier"
              fmtMoney={fmtMoney}
              total={balances.total_payable}
              balanceClass="text-destructive"
            />
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const ReportPage = () => {
  const { slug } = useParams();
  const { toast } = useToast();
  const { fmtMoney, currency } = useWorkspace();
  const { data, loading } = useTables(
    "products",
    "product_variants",
    "categories",
    "branches",
    "orders",
    "order_items",
    "purchase_orders",
    "payments",
    "customers",
    "suppliers",
    "stock_movements",
  );
  const levels = useStockLevels();

  const meta = REPORTS.find((r) => r.slug === slug);

  if (!meta) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={FileBarChart}
              title="Report not found"
              description={`There is no report called "${slug}".`}
            />
            <div className="text-center pb-4">
              <Link
                to="/reports"
                className="text-sm text-primary hover:text-blue-800"
              >
                Back to all reports
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner />
      </div>
    );
  }

  const common = { data, levels, fmtMoney, currency, toast };
  switch (slug) {
    case "inventory-valuation":
      return <InventoryValuationReport {...common} />;
    case "stock-movements":
      return <StockMovementsReport {...common} />;
    case "low-stock":
      return <LowStockReport {...common} />;
    case "sales":
      return <SalesReport {...common} />;
    case "accounts":
      return <AccountsReport {...common} />;
    default:
      return null;
  }
};

export default ReportPage;
