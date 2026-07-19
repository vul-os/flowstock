import React, { useMemo, useState } from 'react';
import {
  Plus,
  FileText,
  CreditCard,
  CheckCircle2,
  PencilLine,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/services/api';
import { useWorkspace, useTables } from '@/context/workspace-context';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import OrderDialog from './dialog';

const STATUS_BADGE = {
  draft: { variant: 'secondary', className: '' },
  confirmed: { variant: 'default', className: '' },
  paid: { variant: 'default', className: 'border-transparent bg-emerald-600 text-white hover:bg-emerald-600/80' },
  cancelled: { variant: 'destructive', className: '' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return (
    <Badge variant={cfg.variant} className={cfg.className}>
      {(status || 'draft').replace(/_/g, ' ')}
    </Badge>
  );
}

const formatDate = (dateString) =>
  dateString
    ? new Date(dateString).toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

const OrdersPage = () => {
  const { fmtMoney } = useWorkspace();
  const { toast } = useToast();
  const { data, loading } = useTables(
    'orders',
    'order_items',
    'order_services',
    'customers',
    'product_variants',
    'products',
    'services',
    'branches',
  );

  const [expandedOrders, setExpandedOrders] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);

  const customersById = useMemo(
    () => new Map((data.customers || []).map((c) => [c.id, c])),
    [data.customers],
  );
  const branchesById = useMemo(
    () => new Map((data.branches || []).map((b) => [b.id, b])),
    [data.branches],
  );
  const servicesById = useMemo(
    () => new Map((data.services || []).map((s) => [s.id, s])),
    [data.services],
  );

  // Variants joined with their parent product for display + pickers.
  const variants = useMemo(() => {
    const productsById = new Map((data.products || []).map((p) => [p.id, p]));
    return (data.product_variants || []).map((v) => ({
      ...v,
      product_name: productsById.get(v.product_id)?.name || 'Unknown product',
    }));
  }, [data.product_variants, data.products]);
  const variantsById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);

  const orders = useMemo(
    () =>
      [...(data.orders || [])].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''),
      ),
    [data.orders],
  );
  const itemsByOrder = useMemo(() => {
    const m = new Map();
    (data.order_items || []).forEach((i) => {
      if (!m.has(i.order_id)) m.set(i.order_id, []);
      m.get(i.order_id).push(i);
    });
    return m;
  }, [data.order_items]);
  const servicesByOrder = useMemo(() => {
    const m = new Map();
    (data.order_services || []).forEach((s) => {
      if (!m.has(s.order_id)) m.set(s.order_id, []);
      m.get(s.order_id).push(s);
    });
    return m;
  }, [data.order_services]);

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
      setBusyOrderId(order.id);
      await api.setOrderStatus(order.id, status);
      toast({ title: `Order ${order.order_number || ''} ${status}`, description });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not update order status',
        description: String(error?.message || error),
      });
    } finally {
      setBusyOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const confirmedOrders = orders.filter((o) => o.status === 'confirmed');
  const pendingPayment = confirmedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const paidTotal = orders
    .filter((o) => o.status === 'paid')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Orders</h1>
          <p className="mt-2 text-muted-foreground">Manage your customer orders</p>
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
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <PencilLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders.filter((o) => o.status === 'draft').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payment</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtMoney(pendingPayment)}</div>
            <p className="text-xs text-muted-foreground">{confirmedOrders.length} orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtMoney(paidTotal)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>View and manage your customer orders</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No orders yet. Create your first order to get started.
                  </TableCell>
                </TableRow>
              )}
              {orders.map((order) => {
                const customer = customersById.get(order.customer_id);
                const items = itemsByOrder.get(order.id) || [];
                const services = servicesByOrder.get(order.id) || [];
                const busy = busyOrderId === order.id;
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
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell className="font-medium">
                        <div>{customer?.name || 'Unknown customer'}</div>
                        {customer?.company_name ? (
                          <div className="text-sm text-muted-foreground">
                            {customer.company_name}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{branchesById.get(order.branch_id)?.name || '—'}</TableCell>
                      <TableCell>{formatDate(order.order_date)}</TableCell>
                      <TableCell>{formatDate(order.due_date)}</TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>{fmtMoney(order.total_amount)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditOrder(order)}>
                            {order.status === 'draft' ? 'Edit' : 'View Details'}
                          </Button>
                          {order.status === 'draft' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                handleStatusChange(order, 'confirmed', 'Stock has been deducted.')
                              }
                            >
                              Confirm (deducts stock)
                            </Button>
                          )}
                          {order.status === 'confirmed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => handleStatusChange(order, 'paid')}
                            >
                              Mark Paid
                            </Button>
                          )}
                          {['draft', 'confirmed', 'paid'].includes(order.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={busy}
                              onClick={() =>
                                handleStatusChange(
                                  order,
                                  'cancelled',
                                  order.status === 'draft'
                                    ? undefined
                                    : 'Stock movements have been reversed.',
                                )
                              }
                            >
                              {order.status === 'draft' ? 'Cancel' : 'Cancel (restocks)'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedOrders[order.id] && (
                      <TableRow>
                        <TableCell colSpan={9} className="p-0">
                          <div className="space-y-4 bg-muted/30 p-4">
                            {items.length === 0 && services.length === 0 && (
                              <div className="text-sm text-muted-foreground">
                                No line items on this order.
                              </div>
                            )}

                            {/* Products Section */}
                            {items.length > 0 && (
                              <div>
                                <h4 className="mb-2 font-medium">Products</h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Product</TableHead>
                                      <TableHead>SKU</TableHead>
                                      <TableHead>Quantity</TableHead>
                                      <TableHead>Unit Price</TableHead>
                                      <TableHead>Total Price</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {items.map((item) => {
                                      const variant = variantsById.get(item.product_variant_id);
                                      return (
                                        <TableRow key={item.id}>
                                          <TableCell>
                                            {variant
                                              ? `${variant.product_name} - ${variant.name}`
                                              : 'Unknown product'}
                                          </TableCell>
                                          <TableCell>{variant?.sku || '—'}</TableCell>
                                          <TableCell>{item.quantity}</TableCell>
                                          <TableCell>{fmtMoney(item.unit_price)}</TableCell>
                                          <TableCell>{fmtMoney(item.total_price)}</TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}

                            {/* Services Section */}
                            {services.length > 0 && (
                              <div>
                                <h4 className="mb-2 font-medium">Services</h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Service</TableHead>
                                      <TableHead>Description</TableHead>
                                      <TableHead>Hours</TableHead>
                                      <TableHead>Hourly Rate</TableHead>
                                      <TableHead>Total Price</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {services.map((service) => (
                                      <TableRow key={service.id}>
                                        <TableCell>
                                          {servicesById.get(service.service_id)?.name ||
                                            'Unknown service'}
                                        </TableCell>
                                        <TableCell>{service.description}</TableCell>
                                        <TableCell>{service.hours}</TableCell>
                                        <TableCell>{fmtMoney(service.hourly_rate)}</TableCell>
                                        <TableCell>{fmtMoney(service.total_price)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
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

      <OrderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        order={selectedOrder}
        orderItems={selectedOrder ? itemsByOrder.get(selectedOrder.id) || [] : []}
        orderServices={selectedOrder ? servicesByOrder.get(selectedOrder.id) || [] : []}
        customers={data.customers || []}
        variants={variants}
        services={data.services || []}
      />
    </div>
  );
};

export default OrdersPage;
