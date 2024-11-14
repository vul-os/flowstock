import React, { useState, useEffect } from 'react';
import { Plus, FileText, Send, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/services/supabaseClient';
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
import PurchaseOrderDialog from './dialog';

// Currency formatter for South African Rand
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
  }).format(amount).replace('ZAR', 'R');
};

const getStatusBadgeVariant = (status) => {
  const variants = {
    draft: 'secondary',
    sent: 'primary',
    partially_received: 'warning',
    received: 'success',
    cancelled: 'destructive',
  };
  return variants[status] || 'secondary';
};

const formatDate = (dateString) => {
  return dateString ? new Date(dateString).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) : '';
};

const PurchaseOrdersPage = ({ organizationId }) => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(name),
          purchase_order_items(
            *,
            product_variant:product_variants(
              name,
              sku
            ),
            service:services(
              name,
              description
            )
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [organizationId]);

  const toggleOrderExpansion = (orderId) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const handleCreateOrder = () => {
    setSelectedOrder(null);
    setDialogOpen(true);
  };

  const handleEditOrder = (order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  const handleSubmitOrder = async (orderData, items) => {
    try {
      let orderId;
      if (selectedOrder) {
        // Update existing order
        const { error } = await supabase
          .from('purchase_orders')
          .update(orderData)
          .eq('id', selectedOrder.id);
        if (error) throw error;
        orderId = selectedOrder.id;

        // Delete existing items
        await supabase
          .from('purchase_order_items')
          .delete()
          .eq('purchase_order_id', orderId);
      } else {
        // Create new order
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert([{
            ...orderData,
            po_number: `PO-${Date.now()}`, // You might want to implement a better PO number generation system
          }])
          .select()
          .single();
        if (error) throw error;
        orderId = data.id;
      }

      // Insert new items
      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(
          items.map(item => ({
            ...item,
            purchase_order_id: orderId,
          }))
        );
      if (itemsError) throw itemsError;

      await fetchOrders();
      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving order:', error);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground mt-2">
            Manage and track your purchase orders
          </p>
        </div>
        <Button onClick={handleCreateOrder}>
          <Plus className="h-4 w-4 mr-2" />
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
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders.filter(order => order.status === 'sent').length}
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
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
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
                    <TableCell className="font-medium">{order.po_number}</TableCell>
                    <TableCell>{order.supplier?.name}</TableCell>
                    <TableCell>{formatDate(order.order_date)}</TableCell>
                    <TableCell>{formatDate(order.expected_delivery_date)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(order.status)}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(order.total_amount)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditOrder(order)}
                        >
                          View Details
                        </Button>
                        {order.status === 'draft' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditOrder(order)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedOrders[order.id] && (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0">
                        <div className="bg-muted/30 p-4">
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
                              {order.purchase_order_items?.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {item.item_type}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {item.item_type === 'product' 
                                      ? item.product_variant?.name 
                                      : item.service?.name}
                                  </TableCell>
                                  <TableCell>
                                    {item.item_type === 'product' 
                                      ? item.product_variant?.sku 
                                      : item.description}
                                  </TableCell>
                                  <TableCell>{item.quantity}</TableCell>
                                  <TableCell>{item.unit_type}</TableCell>
                                  <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                                  <TableCell>{formatCurrency(item.total_price)}</TableCell>
                                  <TableCell>
                                    {item.item_type === 'product' ? (item.received_quantity || 0) : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PurchaseOrderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        order={selectedOrder}
        organizationId={organizationId}
        onSubmit={handleSubmitOrder}
      />
    </div>
  );
};

export default PurchaseOrdersPage;