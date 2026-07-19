import React, { useMemo, useState } from "react";
import {
  Plus,
  FileText,
  Send,
  PackageCheck,
  PencilLine,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
} from "lucide-react";
import { api } from "@/services/api";
import { useWorkspace, useTables } from "@/context/workspace-context";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/state";
import PurchaseOrderDialog from "./dialog";
import ReceiveGoodsDialog from "./receive-dialog";

const STATUS_BADGE = {
  draft: { variant: "outline" },
  sent: { variant: "flow" },
  partially_received: { variant: "signal" },
  received: { variant: "success" },
  cancelled: { variant: "danger" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return (
    <Badge variant={cfg.variant} className="capitalize">
      {(status || "draft").replace(/_/g, " ")}
    </Badge>
  );
}

const formatDate = (dateString) =>
  dateString
    ? new Date(dateString).toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

const PurchaseOrdersPage = () => {
  const { fmtMoney } = useWorkspace();
  const { toast } = useToast();
  const { data, loading } = useTables(
    "purchase_orders",
    "purchase_order_items",
    "suppliers",
    "product_variants",
    "products",
    "services",
    "branches",
  );

  const [expandedOrders, setExpandedOrders] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiveFor, setReceiveFor] = useState(null);
  const [busyPoId, setBusyPoId] = useState(null);

  const suppliersById = useMemo(
    () => new Map((data.suppliers || []).map((s) => [s.id, s])),
    [data.suppliers],
  );
  const branchesById = useMemo(
    () => new Map((data.branches || []).map((b) => [b.id, b])),
    [data.branches],
  );
  const servicesById = useMemo(
    () => new Map((data.services || []).map((s) => [s.id, s])),
    [data.services],
  );

  const variants = useMemo(() => {
    const productsById = new Map((data.products || []).map((p) => [p.id, p]));
    return (data.product_variants || []).map((v) => ({
      ...v,
      product_name: productsById.get(v.product_id)?.name || "Unknown product",
    }));
  }, [data.product_variants, data.products]);
  const variantsById = useMemo(
    () => new Map(variants.map((v) => [v.id, v])),
    [variants],
  );

  const orders = useMemo(
    () =>
      [...(data.purchase_orders || [])].sort((a, b) =>
        (b.created_at || "").localeCompare(a.created_at || ""),
      ),
    [data.purchase_orders],
  );
  const itemsByPo = useMemo(() => {
    const m = new Map();
    (data.purchase_order_items || []).forEach((i) => {
      if (!m.has(i.purchase_order_id)) m.set(i.purchase_order_id, []);
      m.get(i.purchase_order_id).push(i);
    });
    return m;
  }, [data.purchase_order_items]);

  const toggleOrderExpansion = (orderId) =>
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));

  const handleCreateOrder = () => {
    setSelectedOrder(null);
    setDialogOpen(true);
  };

  const handleEditOrder = (order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  const handleStatusChange = async (order, status, description) => {
    try {
      setBusyPoId(order.id);
      await api.setPurchaseOrderStatus(order.id, status);
      toast({
        title: `Purchase order ${order.po_number || ""} ${status}`,
        description,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update purchase order",
        description: String(error?.message || error),
      });
    } finally {
      setBusyPoId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const awaiting = orders.filter((o) =>
    ["sent", "partially_received"].includes(o.status),
  );
  const openValue = awaiting.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="mt-2 text-muted-foreground">
            Manage and track your purchase orders
          </p>
        </div>
        <Button onClick={handleCreateOrder}>
          <Plus className="mr-2 h-4 w-4" />
          Create Order
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="data-figure text-2xl font-semibold">
              {orders.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <PencilLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="data-figure text-2xl font-semibold">
              {orders.filter((o) => o.status === "draft").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Awaiting Delivery
            </CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="data-figure text-2xl font-semibold">
              {awaiting.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtMoney(openValue)} outstanding
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Received</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="data-figure text-2xl font-semibold">
              {orders.filter((o) => o.status === "received").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Purchase Orders</CardTitle>
          <CardDescription>
            View and manage your purchase orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead className="whitespace-nowrap">PO number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="whitespace-nowrap">Order date</TableHead>
                <TableHead className="whitespace-nowrap">Expected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  Total
                </TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState
                      icon={ShoppingCart}
                      title="No purchase orders yet"
                      description="Raise a PO to a supplier; receiving it books the stock in against the ordered quantities."
                      className="border-0 bg-transparent"
                    />
                  </TableCell>
                </TableRow>
              )}
              {orders.map((order) => {
                const items = itemsByPo.get(order.id) || [];
                const busy = busyPoId === order.id;
                return (
                  <React.Fragment key={order.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleOrderExpansion(order.id)}
                        >
                          {expandedOrders[order.id] ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                        {order.po_number}
                      </TableCell>
                      <TableCell>
                        {suppliersById.get(order.supplier_id)?.company_name ||
                          suppliersById.get(order.supplier_id)?.name ||
                          "Unknown supplier"}
                      </TableCell>
                      <TableCell>
                        {branchesById.get(order.branch_id)?.name || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(order.order_date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(order.expected_delivery_date)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="cell-num whitespace-nowrap font-medium">
                        {fmtMoney(order.total_amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditOrder(order)}
                          >
                            {order.status === "draft" ? "Edit" : "View Details"}
                          </Button>
                          {order.status === "draft" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                handleStatusChange(
                                  order,
                                  "sent",
                                  "Ready to receive goods against it.",
                                )
                              }
                            >
                              <Send className="mr-2 h-4 w-4" />
                              Send
                            </Button>
                          )}
                          {["sent", "partially_received"].includes(
                            order.status,
                          ) && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => setReceiveFor(order)}
                            >
                              <PackageCheck className="mr-2 h-4 w-4" />
                              Receive goods
                            </Button>
                          )}
                          {["draft", "sent"].includes(order.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={busy}
                              onClick={() =>
                                handleStatusChange(order, "cancelled")
                              }
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedOrders[order.id] && (
                      <TableRow>
                        <TableCell colSpan={9} className="p-0">
                          <div className="bg-muted/30 p-4">
                            {items.length === 0 ? (
                              <div className="text-sm text-muted-foreground">
                                No line items on this purchase order.
                              </div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Item</TableHead>
                                    <TableHead>Description/SKU</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Unit Type</TableHead>
                                    <TableHead>Unit Price</TableHead>
                                    <TableHead>Total Price</TableHead>
                                    <TableHead>Received</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {items.map((item) => {
                                    const isProduct =
                                      (item.item_type || "product") ===
                                      "product";
                                    const variant = variantsById.get(
                                      item.product_variant_id,
                                    );
                                    const received =
                                      item.received_quantity || 0;
                                    const ordered = item.quantity || 0;
                                    const pct =
                                      ordered > 0
                                        ? Math.min(
                                            100,
                                            Math.round(
                                              (received / ordered) * 100,
                                            ),
                                          )
                                        : 0;
                                    return (
                                      <TableRow key={item.id}>
                                        <TableCell>
                                          <Badge variant="outline">
                                            {item.item_type}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          {isProduct
                                            ? variant
                                              ? `${variant.product_name} - ${variant.name}`
                                              : "Unknown product"
                                            : servicesById.get(item.service_id)
                                                ?.name || "Unknown service"}
                                        </TableCell>
                                        <TableCell>
                                          {isProduct
                                            ? variant?.sku || "—"
                                            : item.description}
                                        </TableCell>
                                        <TableCell>{item.quantity}</TableCell>
                                        <TableCell>{item.unit_type}</TableCell>
                                        <TableCell>
                                          {fmtMoney(item.unit_price)}
                                        </TableCell>
                                        <TableCell>
                                          {fmtMoney(item.total_price)}
                                        </TableCell>
                                        <TableCell>
                                          {isProduct ? (
                                            <div className="min-w-[110px]">
                                              <div className="text-sm">
                                                {received} / {ordered}
                                              </div>
                                              <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                                                <div
                                                  className={`h-1.5 rounded-full ${
                                                    pct >= 100
                                                      ? "bg-success"
                                                      : "bg-signal"
                                                  }`}
                                                  style={{ width: `${pct}%` }}
                                                />
                                              </div>
                                            </div>
                                          ) : (
                                            "—"
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PurchaseOrderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        order={selectedOrder}
        orderItems={selectedOrder ? itemsByPo.get(selectedOrder.id) || [] : []}
        suppliers={data.suppliers || []}
        variants={variants}
        services={data.services || []}
      />

      <ReceiveGoodsDialog
        open={!!receiveFor}
        onClose={() => setReceiveFor(null)}
        order={receiveFor}
        items={receiveFor ? itemsByPo.get(receiveFor.id) || [] : []}
        variantsById={variantsById}
      />
    </div>
  );
};

export default PurchaseOrdersPage;
