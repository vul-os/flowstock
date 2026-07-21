import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { StatCard, StatGrid } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/state";
import {
  Package2,
  AlertTriangle,
  TrendingUp,
  Box,
  ShoppingCart,
  Wallet,
  Scale,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useChartTheme } from "@/lib/chart-theme";
import {
  useWorkspace,
  useTables,
  useStockLevels,
} from "@/context/workspace-context";
import {
  salesByMonth,
  salesByCategory,
  partyBalances,
  inventoryValuation,
  lowStock,
  movementLedger,
  MOVEMENT_KIND_LABELS,
} from "@/lib/reports";

const KIND_BADGE = {
  receive: "bg-success-muted text-success",
  transfer_in: "bg-success-muted text-success",
  sale: "bg-destructive-muted text-destructive",
  transfer_out: "bg-destructive-muted text-destructive",
  adjustment: "bg-signal-muted text-signal-text",
  count: "bg-signal-muted text-signal-text",
  reversal: "bg-signal-muted text-signal-text",
};

const fmtDay = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
};

const Dashboard = () => {
  const { businessName, branchName, fmtMoney, currency } = useWorkspace();
  const chart = useChartTheme();
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

  const computed = useMemo(() => {
    const products = data.products || [];
    const variants = data.product_variants || [];
    const categories = data.categories || [];
    const branches = data.branches || [];
    const orders = data.orders || [];
    const orderItems = data.order_items || [];
    const purchaseOrders = data.purchase_orders || [];
    const payments = data.payments || [];
    const customers = data.customers || [];
    const suppliers = data.suppliers || [];
    const movements = data.stock_movements || [];

    const monthly = salesByMonth(orders, 6);
    const thisMonth = monthly[monthly.length - 1] || { total: 0, count: 0 };
    const lastMonth = monthly[monthly.length - 2] || { total: 0, count: 0 };
    const delta =
      lastMonth.total > 0
        ? ((thisMonth.total - lastMonth.total) / lastMonth.total) * 100
        : null;

    const byCategory = salesByCategory(
      orders,
      orderItems,
      variants,
      products,
      categories,
    );
    const pieData =
      byCategory.length > 4
        ? [
            ...byCategory.slice(0, 4),
            {
              name: "Other",
              total: byCategory.slice(4).reduce((s, c) => s + c.total, 0),
            },
          ]
        : byCategory;

    const productName = new Map(products.map((p) => [p.id, p.name]));
    const low = lowStock(variants, levels).map((v) => ({
      ...v,
      product: productName.get(v.product_id) || "—",
    }));

    return {
      monthly,
      thisMonth,
      delta,
      pieData,
      openOrders: orders.filter((o) =>
        ["draft", "confirmed"].includes(o.status),
      ).length,
      balances: partyBalances({
        orders,
        purchaseOrders,
        payments,
        customers,
        suppliers,
      }),
      valuation: inventoryValuation(products, variants, levels),
      low,
      recentMoves: movementLedger(
        movements,
        variants,
        products,
        branches,
      ).slice(0, 8),
    };
  }, [data, levels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner />
      </div>
    );
  }

  const {
    monthly,
    thisMonth,
    delta,
    pieData,
    openOrders,
    balances,
    valuation,
    low,
    recentMoves,
  } = computed;
  const hasSales = monthly.some((m) => m.total > 0);
  const symbol = currency?.symbol ?? "R";

  const stats = [
    {
      title: "Sales this month",
      value: fmtMoney(thisMonth.total),
      icon: TrendingUp,
      tone: "lead",
      delta,
      detail: `${thisMonth.count} order${thisMonth.count === 1 ? "" : "s"} · vs last month`,
    },
    {
      title: "Open orders",
      value: String(openOrders),
      icon: ShoppingCart,
      detail: "Draft + confirmed",
    },
    {
      title: "Receivable",
      value: fmtMoney(balances.total_receivable),
      icon: Wallet,
      detail: `${balances.debtors.length} debtor${balances.debtors.length === 1 ? "" : "s"}`,
    },
    {
      title: "Payable",
      value: fmtMoney(balances.total_payable),
      icon: Scale,
      detail: `${balances.creditors.length} creditor${balances.creditors.length === 1 ? "" : "s"}`,
    },
    {
      title: "Inventory value",
      value: fmtMoney(valuation.total_cost),
      icon: Box,
      detail: `At cost · ${fmtMoney(valuation.total_retail)} retail`,
    },
    {
      title: "Low stock",
      value: String(low.length),
      icon: AlertTriangle,
      detail: "At or below reorder point",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {businessName || "FlowStock"}
            {branchName ? ` · ${branchName}` : ""}
          </p>
        </div>
        <Link
          to="/reports"
          className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-fast hover:bg-flow-700 dark:hover:bg-flow-300"
        >
          View reports
        </Link>
      </div>

      {/* Stats Grid */}
      <StatGrid>
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </StatGrid>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {/* Sales by month */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Sales — last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {hasSales ? (
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
                      tick={{ fill: chart.axisInk, fontSize: 12 }}
                      axisLine={{ stroke: chart.grid }}
                      tickLine={false}
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
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No sales yet"
                  description="Confirmed and paid orders will appear here."
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sales by category */}
        <Card>
          <CardHeader>
            <CardTitle>Sales by category</CardTitle>
          </CardHeader>
          <CardContent>
            {/* A ranked bar list rather than a donut. The categories are
                already sorted by value and every figure was being printed in
                the legend beside the ring, so the ring was carrying no
                information the list did not — and an arc is the harder shape to
                compare two values with. Bars share one baseline, so "Power
                Tools is roughly twice Hand Tools" is readable at a glance. */}
            <div className="h-64">
              {pieData.length > 0 ? (
                <ul className="flex h-full flex-col justify-center gap-4">
                  {pieData.map((entry, index) => {
                    const top = pieData[0]?.total || 0;
                    const pct = top > 0 ? (entry.total / top) * 100 : 0;
                    return (
                      <li key={entry.name} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate text-muted-foreground">
                            {entry.name}
                          </span>
                          <span className="data-figure shrink-0 tabular-nums">
                            {fmtMoney(entry.total)}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
                          <div
                            className="h-full rounded-sm"
                            style={{
                              width: `${pct}%`,
                              background:
                                chart.categorical[
                                  index % chart.categorical.length
                                ],
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={Package2}
                  title="No category sales yet"
                  description="Revenue is grouped by product category."
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Low stock */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Low stock</span>
              <Link
                to="/products"
                className="text-sm font-normal text-primary hover:text-blue-800"
              >
                View products
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {low.length === 0 ? (
              <EmptyState
                icon={Package2}
                title="All stock levels healthy"
                description="Items at or below their reorder point show up here."
              />
            ) : (
              <div className="space-y-3">
                {low.slice(0, 6).map((item) => (
                  <Link
                    key={item.id}
                    to={`/products/${item.product_id}`}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {item.product}
                        {item.name ? ` — ${item.name}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        SKU: {item.sku || "—"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 ml-4 px-3 py-1 rounded-full text-sm ${
                        item.qty <= Number(item.reorder_point || 0) / 2
                          ? "bg-destructive-muted text-destructive"
                          : "bg-signal-muted text-signal-text"
                      }`}
                    >
                      {item.qty} / {item.reorder_point} reorder
                    </span>
                  </Link>
                ))}
                {low.length > 6 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{low.length - 6} more — see the low stock report
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent stock movements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Recent stock movements</span>
              <Link
                to="/reports/stock-movements"
                className="text-sm font-normal text-primary hover:text-blue-800"
              >
                Full ledger
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentMoves.length === 0 ? (
              <EmptyState
                icon={Box}
                title="No stock movements yet"
                description="Receipts, sales and adjustments will appear here."
              />
            ) : (
              <div className="space-y-3">
                {recentMoves.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                            KIND_BADGE[m.kind] || "bg-muted text-foreground"
                          }`}
                        >
                          {MOVEMENT_KIND_LABELS[m.kind] || m.kind}
                        </span>
                        <p className="font-medium text-sm truncate">
                          {m.product}
                          {m.variant ? ` — ${m.variant}` : ""}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {m.branch}
                        {m.note ? ` · ${m.note}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p
                        className={`font-semibold text-sm ${
                          Number(m.qty_delta) >= 0
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {Number(m.qty_delta) >= 0 ? "+" : ""}
                        {m.qty_delta}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDay(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
