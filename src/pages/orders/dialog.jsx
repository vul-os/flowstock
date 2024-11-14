import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/services/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { 
  Card,
  CardContent,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import OrderItemsTabs from './items';

// Currency formatter
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
  }).format(amount).replace('ZAR', 'R');
};

const OrderDialog = ({ 
  open, 
  onClose, 
  order = null, 
  organizationId,
  onSubmit 
}) => {
  const [customers, setCustomers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
      customer_id: '',
      payment_terms: '',
      due_date: '',
      status: 'draft',
      order_items: [],
      order_services: [],
      notes: ''
    }
  });

  useEffect(() => {
    if (open) {
      fetchCustomers();
      
      if (order) {
        form.reset({
          customer_id: order.customer_id,
          payment_terms: order.payment_terms || '',
          due_date: order.due_date?.split('T')[0] || '',
          status: order.status || 'draft',
          notes: order.notes || '',
          order_items: order.order_items || [],
          order_services: order.order_services || []
        });
      } else {
        form.reset({
          customer_id: '',
          payment_terms: '',
          due_date: '',
          status: 'draft',
          notes: '',
          order_items: [],
          order_services: []
        });
      }
    }
  }, [open, order]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', organizationId);
      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const calculateTotals = () => {
    const items = form.getValues('order_items');
    const services = form.getValues('order_services');
    
    const itemsTotal = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
    const servicesTotal = services.reduce((sum, service) => sum + (service.total_price || 0), 0);
    
    const subtotal = itemsTotal + servicesTotal;
    const total = subtotal;

    return {
      itemsTotal,
      servicesTotal,
      subtotal,
      total
    };
  };

  const handleSubmit = async (data) => {
    try {
      setIsSubmitting(true);
      const totals = calculateTotals();

      const orderData = {
        customer_id: data.customer_id,
        organization_id: organizationId,
        payment_terms: data.payment_terms,
        due_date: data.due_date,
        status: data.status,
        total_amount: totals.total,
        notes: data.notes,
      };

      if (order?.id) {
        orderData.id = order.id;
      }

      await onSubmit(orderData, {
        order_items: data.order_items,
        order_services: data.order_services
      });

      onClose();
    } catch (error) {
      console.error('Error submitting order:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? 'Edit Order' : 'Create Order'}</DialogTitle>
          <DialogDescription>
            {order ? 'Update the order details below' : 'Add a new order with products and services'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Terms</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Net 30" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <OrderItemsTabs 
              form={form} 
              organizationId={organizationId}
            />

            <div className="flex justify-between items-center border-t pt-4">
              <div className="text-sm text-muted-foreground">
                Order #{order?.id ? order.id.split('-')[0] : 'New'}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    Products Total: {formatCurrency(calculateTotals().itemsTotal)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Services Total: {formatCurrency(calculateTotals().servicesTotal)}
                  </div>
                  <Separator className="my-2" />
                  <div className="font-medium">
                    Total: {formatCurrency(calculateTotals().total)}
                  </div>
                </div>
                <Button type="submit" disabled={isSubmitting}>
                  {order ? 'Update Order' : 'Create Order'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDialog;