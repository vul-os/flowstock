import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/services/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { 
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// Form validation schema
const formSchema = z.object({
  supplier_id: z.string().min(1, 'Supplier is required'),
  expected_delivery_date: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    item_type: z.enum(['product', 'service']),
    product_variant_id: z.string().optional(),
    service_id: z.string().optional(),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    unit_price: z.number().min(0, 'Unit price must be at least 0'),
    total_price: z.number(),
    description: z.string().optional(),
    unit_type: z.string()
  }))
});

const PurchaseOrderDialog = ({ 
  open, 
  onClose, 
  order = null, 
  organizationId,
  onSubmit 
}) => {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplier_id: '',
      expected_delivery_date: '',
      notes: '',
      items: []
    }
  });

  useEffect(() => {
    if (open) {
      fetchSuppliers();
      fetchProducts();
      fetchServices();
      
      if (order) {
        form.reset({
          supplier_id: order.supplier_id,
          expected_delivery_date: order.expected_delivery_date?.split('T')[0] || '',
          notes: order.notes || '',
          items: order.purchase_order_items || []
        });
      } else {
        form.reset({
          supplier_id: '',
          expected_delivery_date: '',
          notes: '',
          items: []
        });
      }
    }
  }, [open, order]);

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('organization_id', organizationId);
    setSuppliers(data || []);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('product_variants')
      .select(`
        *,
        product:products(name)
      `)
      .eq('organization_id', organizationId);
    setProducts(data || []);
  };

  const fetchServices = async () => {
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('organization_id', organizationId);
    setServices(data || []);
  };

  const addItem = (type) => {
    const items = form.getValues('items');
    form.setValue('items', [
      ...items,
      {
        item_type: type,
        product_variant_id: null,
        service_id: null,
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        description: '',
        unit_type: type === 'product' ? 'units' : 'hours',
      }
    ]);
  };

  const removeItem = (index) => {
    const items = form.getValues('items');
    form.setValue('items', items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const items = form.getValues('items');
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      [field]: value,
    };

    // Update total price when quantity or unit price changes
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total_price = newItems[index].quantity * newItems[index].unit_price;
    }

    // If product/service is selected, update the unit price
    if (field === 'product_variant_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].unit_price = product.price;
        newItems[index].total_price = product.price * newItems[index].quantity;
      }
    } else if (field === 'service_id') {
      const service = services.find(s => s.id === value);
      if (service) {
        newItems[index].unit_price = service.hourly_rate;
        newItems[index].total_price = service.hourly_rate * newItems[index].quantity;
      }
    }

    form.setValue('items', newItems);
  };

  const calculateTotals = () => {
    const items = form.getValues('items');
    const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
    const tax = subtotal * 0.15; // 15% VAT
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSubmitForm = (data) => {
    const { subtotal, tax, total } = calculateTotals();
    const orderData = {
      ...data,
      organization_id: organizationId,
      status: 'draft',
      subtotal,
      tax_amount: tax,
      total_amount: total,
    };

    onSubmit(orderData, data.items);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? 'Edit Purchase Order' : 'Create Purchase Order'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmitForm)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="supplier_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
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
                name="expected_delivery_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Delivery Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Add any notes or special instructions..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => addItem('product')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                  <Button type="button" variant="outline" onClick={() => addItem('service')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Service
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {form.watch('items')?.map((item, index) => (
                    <div key={index} className="grid grid-cols-6 gap-4 items-start">
                      {item.item_type === 'product' ? (
                        <div className="col-span-2">
                          <FormLabel>Product</FormLabel>
                          <Select
                            value={item.product_variant_id}
                            onValueChange={(value) => updateItem(index, 'product_variant_id', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.product.name} - {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="col-span-2">
                          <FormLabel>Service</FormLabel>
                          <Select
                            value={item.service_id}
                            onValueChange={(value) => updateItem(index, 'service_id', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select service" />
                            </SelectTrigger>
                            <SelectContent>
                              {services.map((service) => (
                                <SelectItem key={service.id} value={service.id}>
                                  {service.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                        />
                      </FormItem>

                      <FormItem>
                        <FormLabel>Unit Price</FormLabel>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value))}
                        />
                      </FormItem>

                      <FormItem>
                        <FormLabel>Total</FormLabel>
                        <Input
                          type="number"
                          value={item.total_price}
                          disabled
                        />
                      </FormItem>

                      <div className="pt-8">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4 border-t pt-4">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Subtotal: {calculateTotals().subtotal.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">VAT (15%): {calculateTotals().tax.toFixed(2)}</div>
                <div className="font-medium">Total: {calculateTotals().total.toFixed(2)}</div>
              </div>
              <Button type="submit">
                {order ? 'Update Order' : 'Create Order'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseOrderDialog;