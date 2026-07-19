import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/services/api';
import { useWorkspace } from '@/context/workspace-context';
import { useToast } from '@/components/ui/use-toast';
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
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import OrderItemsTabs from './items';

const today = () => new Date().toISOString().split('T')[0];

const OrderDialog = ({
  open,
  onClose,
  order = null,
  orderItems = [],
  orderServices = [],
  customers = [],
  variants = [],
  services = [],
}) => {
  const { fmtMoney } = useWorkspace();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Line items may only be changed while the order is a draft.
  const locked = !!order && order.status !== 'draft';

  const form = useForm({
    defaultValues: {
      customer_id: '',
      order_date: today(),
      due_date: '',
      payment_terms: '',
      notes: '',
      order_items: [],
      order_services: [],
    },
  });

  useEffect(() => {
    if (!open) return;
    if (order) {
      form.reset({
        customer_id: order.customer_id || '',
        order_date: order.order_date?.split('T')[0] || today(),
        due_date: order.due_date?.split('T')[0] || '',
        payment_terms: order.payment_terms || '',
        notes: order.notes || '',
        order_items: orderItems.map((i) => ({
          id: i.id,
          product_variant_id: i.product_variant_id || '',
          quantity: i.quantity || 0,
          unit_price: i.unit_price || 0,
          total_price: i.total_price || 0,
        })),
        order_services: orderServices.map((s) => ({
          id: s.id,
          service_id: s.service_id || '',
          hours: s.hours || 0,
          hourly_rate: s.hourly_rate || 0,
          total_price: s.total_price || 0,
          description: s.description || '',
        })),
      });
    } else {
      form.reset({
        customer_id: '',
        order_date: today(),
        due_date: '',
        payment_terms: '',
        notes: '',
        order_items: [],
        order_services: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order]);

  const watchedItems = form.watch('order_items') || [];
  const watchedServices = form.watch('order_services') || [];
  const itemsTotal = watchedItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const servicesTotal = watchedServices.reduce((sum, svc) => sum + (svc.total_price || 0), 0);
  const subtotal = itemsTotal + servicesTotal;
  const total = subtotal; // sales orders carry no tax

  const handleSubmit = async (data) => {
    if (!data.customer_id) {
      form.setError('customer_id', { message: 'Customer is required' });
      return;
    }
    try {
      setIsSubmitting(true);
      const payload = {
        order: {
          ...(order?.id ? { id: order.id } : {}),
          customer_id: data.customer_id,
          order_date: data.order_date,
          due_date: data.due_date,
          payment_terms: data.payment_terms,
          subtotal,
          total_amount: total,
          notes: data.notes,
        },
      };
      if (!locked) {
        payload.items = data.order_items
          .filter((i) => i.product_variant_id)
          .map((i) => ({
            ...(i.id ? { id: i.id } : {}),
            product_variant_id: i.product_variant_id,
            quantity: i.quantity || 0,
            unit_price: i.unit_price || 0,
            total_price: i.total_price || 0,
          }));
        payload.services = data.order_services
          .filter((s) => s.service_id)
          .map((s) => ({
            ...(s.id ? { id: s.id } : {}),
            service_id: s.service_id,
            hours: s.hours || 0,
            hourly_rate: s.hourly_rate || 0,
            total_price: s.total_price || 0,
            description: s.description || '',
          }));
      }
      const saved = await api.saveOrder(payload);
      toast({ title: order ? 'Order updated' : 'Order created', description: saved?.order_number });
      onClose();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not save order',
        description: String(error?.message || error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {order ? `Order ${order.order_number || ''}` : 'Create Order'}
            {order && (
              <Badge variant={order.status === 'cancelled' ? 'destructive' : 'secondary'}>
                {order.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {order
              ? locked
                ? 'This order is no longer a draft — line items are locked. Use the status buttons on the list to move it along.'
                : 'Update the order details below'
              : 'Add a new order with products and services'}
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
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                            {customer.company_name ? ` — ${customer.company_name}` : ''}
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
                name="order_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
              variants={variants}
              services={services}
              fmtMoney={fmtMoney}
              disabled={locked}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Add any notes for this order..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                Order #{order?.order_number || 'New'}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    Products Total: {fmtMoney(itemsTotal)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Services Total: {fmtMoney(servicesTotal)}
                  </div>
                  <Separator className="my-2" />
                  <div className="font-medium">Total: {fmtMoney(total)}</div>
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
