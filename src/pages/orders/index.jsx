import React, { useState, useEffect } from 'react';
import { Plus, FileText, CreditCard, ChevronDown, ChevronRight } from 'lucide-react';
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
import OrderDialog from './dialog';

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
    confirmed: 'primary',
    paid: 'success',
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

const OrdersPage = ({ organizationId }) => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(id, name, email),
          order_items(
            *,
            product_variant:product_variants(
              *,
              product:products(name)
            )
          ),
          order_services(
            *,
            service:services(name)
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

  const handleSubmitOrder = async (orderData, itemsData) => {
    try {
      if (orderData.id) {
        // Update existing order
        const { error: orderError } = await supabase
          .from('orders')
          .update(orderData)
          .eq('id', orderData.id);

        if (orderError) throw orderError;

        // Delete existing items and services
        await supabase
          .from('order_items')
          .delete()
          .eq('order_id', orderData.id);
        
        await supabase
          .from('order_services')
          .delete()
          .eq('order_id', orderData.id);
      } else {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert([orderData])
          .select()
          .single();

        if (orderError) throw orderError;
        orderData.id = newOrder.id;
      }

      // Insert new items
      if (itemsData.order_items.length > 0) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(
            itemsData.order_items.map(item => ({
              ...item,
              order_id: orderData.id
            }))
          );
        if (itemsError) throw itemsError;
      }

      // Insert new services
      if (itemsData.order_services.length > 0) {
        const { error: servicesError } = await supabase
          .from('order_services')
          .insert(
            itemsData.order_services.map(service => ({
              ...service,
              order_id: orderData.id
            }))
          );
        if (servicesError) throw servicesError;
      }

      await fetchOrders();
      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving order:', error);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const getPendingPaymentAmount = () => {
    return orders
      .filter(order => order.status === 'confirmed')
      .reduce((sum, order) => sum + order.total_amount, 0);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Orders</h1>
          <p className="text-muted-foreground mt-2">
            Manage your customer orders
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
            <CardTitle className="text-sm font-medium">Pending Payment</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(getPendingPaymentAmount())}</div>
            <p className="text-xs text-muted-foreground">
              {orders.filter(order => order.status === 'confirmed').length} orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>
            View and manage your customer orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Due Date</TableHead>
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
                    <TableCell className="font-medium">
                      <div>{order.customer?.name}</div>
                      <div className="text-sm text-muted-foreground">{order.customer?.email}</div>
                    </TableCell>
                    <TableCell>{formatDate(order.order_date)}</TableCell>
                    <TableCell>{formatDate(order.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(order.status)}>
                        {order.status}
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
                      <TableCell colSpan={7} className="p-0">
                        <div className="bg-muted/30 p-4 space-y-4">
                          {/* Products Section */}
                          {order.order_items?.length > 0 && (
                            <div>
                              <h4 className="font-medium mb-2">Products</h4>
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
                                  {order.order_items.map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell>
                                        {item.product_variant.product.name} - {item.product_variant.name}
                                      </TableCell>
                                      <TableCell>{item.product_variant.sku}</TableCell>
                                      <TableCell>{item.quantity}</TableCell>
                                      <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                                      <TableCell>{formatCurrency(item.total_price)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}

                          {/* Services Section */}
                          {order.order_services?.length > 0 && (
                            <div>
                              <h4 className="font-medium mb-2">Services</h4>
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
                                  {order.order_services.map((service) => (
                                    <TableRow key={service.id}>
                                      <TableCell>{service.service.name}</TableCell>
                                      <TableCell>{service.description}</TableCell>
                                      <TableCell>{service.hours}</TableCell>
                                      <TableCell>{formatCurrency(service.hourly_rate)}</TableCell>
                                      <TableCell>{formatCurrency(service.total_price)}</TableCell>
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        order={selectedOrder}
        organizationId={organizationId}
        onSubmit={handleSubmitOrder}
      />
    </div>
  );
};

export default OrdersPage;