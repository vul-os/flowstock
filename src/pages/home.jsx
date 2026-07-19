import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Package2,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
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
  PieChart,
  Pie,
  Cell,
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

const EmptyState = ({ icon: Icon, title, hint }) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    {Icon && <Icon className="h-8 w-8 text-muted-foreground mb-3" />}
    <p className="text-sm font-medium text-muted-foreground">{title}</p>
    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
  </div>
);

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
      icon: <TrendingUp className="h-6 w-6 text-success" />,
      change:
        delta === null ? null : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
      trend: delta === null ? null : delta >= 0 ? "up" : "down",
      details: `${thisMonth.count} order${thisMonth.count === 1 ? "" : "s"} · vs last month`,
    },
    {
      title: "Open orders",
      value: String(openOrders),
      icon: <ShoppingCart className="h-6 w-6 text-primary" />,
      details: "Draft + confirmed",
    },
    {
      title: "Receivable",
      value: fmtMoney(balances.total_receivable),
      icon: <Wallet className="h-6 w-6 text-primary" />,
      details: `${balances.debtors.length} debtor${balances.debtors.length === 1 ? "" : "s"}`,
    },
    {
      title: "Payable",
      value: fmtMoney(balances.total_payable),
      icon: <Scale className="h-6 w-6 text-primary" />,
      details: `${balances.creditors.length} creditor${balances.creditors.length === 1 ? "" : "s"}`,
    },
    {
      title: "Inventory value",
      value: fmtMoney(valuation.total_cost),
      icon: <Box className="h-6 w-6 text-cyan-600" />,
      details: `At cost · ${fmtMoney(valuation.total_retail)} retail`,
    },
    {
      title: "Low stock",
      value: String(low.length),
      icon: <AlertTriangle className="h-6 w-6 text-signal-text" />,
      details: "At or below reorder point",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-muted-foreground">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                {stat.icon}
                {stat.change && (
                  <span
                    className={`text-sm font-medium ${
                      stat.trend === "up" ? "text-success" : "text-destructive"
                    }`}
                  >
                    {stat.change}
                    {stat.trend === "up" ? (
                      <ArrowUpRight className="h-4 w-4 inline ml-1" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 inline ml-1" />
                    )}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <p className="data-figure text-2xl font-semibold">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.details}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Sales by month */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Sales — last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
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
                  hint="Confirmed and paid orders will appear here."
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
            <div className="h-80">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      dataKey="total"
                      nameKey="name"
                      stroke={chart.surface}
                      strokeWidth={2}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={
                            chart.categorical[index % chart.categorical.length]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chart.tooltip}
                      formatter={(value) => fmtMoney(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={Package2}
                  title="No category sales yet"
                  hint="Revenue is grouped by product category."
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                hint="Items at or below their reorder point show up here."
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
                hint="Receipts, sales and adjustments will appear here."
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
