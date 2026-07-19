import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Product + service line item editors for the order dialog.
 * `variants` are product_variants joined with product_name; `services` are
 * service rows. When `disabled` (order no longer draft) everything is
 * read-only — the backend ignores line item changes for non-draft orders.
 */
const OrderItemsTabs = ({ form, variants = [], services = [], fmtMoney, disabled = false }) => {
  const addProduct = () => {
    const items = form.getValues('order_items') || [];
    form.setValue('order_items', [
      ...items,
      { product_variant_id: '', quantity: 1, unit_price: 0, total_price: 0 },
    ]);
  };

  const addService = () => {
    const svcs = form.getValues('order_services') || [];
    form.setValue('order_services', [
      ...svcs,
      { service_id: '', hours: 1, hourly_rate: 0, total_price: 0, description: '' },
    ]);
  };

  const removeProduct = (index) => {
    const items = form.getValues('order_items') || [];
    form.setValue(
      'order_items',
      items.filter((_, i) => i !== index),
    );
  };

  const removeService = (index) => {
    const svcs = form.getValues('order_services') || [];
    form.setValue(
      'order_services',
      svcs.filter((_, i) => i !== index),
    );
  };

  const updateProduct = (index, field, value) => {
    const items = form.getValues('order_items') || [];
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'product_variant_id') {
      const variant = variants.find((v) => v.id === value);
      if (variant) {
        newItems[index].unit_price = variant.price || 0;
      }
    }
    newItems[index].total_price =
      (newItems[index].quantity || 0) * (newItems[index].unit_price || 0);

    form.setValue('order_items', newItems);
  };

  const updateService = (index, field, value) => {
    const svcs = form.getValues('order_services') || [];
    const newServices = [...svcs];
    newServices[index] = { ...newServices[index], [field]: value };

    if (field === 'service_id') {
      const service = services.find((s) => s.id === value);
      if (service) {
        newServices[index].hourly_rate = service.hourly_rate || 0;
      }
    }
    newServices[index].total_price =
      (newServices[index].hours || 0) * (newServices[index].hourly_rate || 0);

    form.setValue('order_services', newServices);
  };

  return (
    <Tabs defaultValue="products" className="w-full">
      <TabsList>
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="services">Services</TabsTrigger>
      </TabsList>

      <TabsContent value="products">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Products</CardTitle>
              {!disabled && (
                <Button type="button" variant="outline" onClick={addProduct}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(form.watch('order_items') || []).length === 0 && (
                <div className="text-sm text-muted-foreground">No products on this order.</div>
              )}
              {(form.watch('order_items') || []).map((item, index) => (
                <div key={item.id || index} className="grid grid-cols-6 items-start gap-4">
                  <div className="col-span-2">
                    <FormLabel>Product</FormLabel>
                    <Select
                      value={item.product_variant_id || ''}
                      onValueChange={(value) => updateProduct(index, 'product_variant_id', value)}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {variants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variant.product_name} - {variant.name} ({variant.sku}) —{' '}
                            {fmtMoney(variant.price)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        disabled={disabled}
                        onChange={(e) =>
                          updateProduct(index, 'quantity', parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </FormControl>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Unit Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        disabled={disabled}
                        onChange={(e) =>
                          updateProduct(index, 'unit_price', parseFloat(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Total</FormLabel>
                    <FormControl>
                      <Input value={fmtMoney(item.total_price)} disabled />
                    </FormControl>
                  </FormItem>

                  {!disabled && (
                    <div className="pt-8">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProduct(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="services">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Services</CardTitle>
              {!disabled && (
                <Button type="button" variant="outline" onClick={addService}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Service
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {(form.watch('order_services') || []).length === 0 && (
                <div className="text-sm text-muted-foreground">No services on this order.</div>
              )}
              {(form.watch('order_services') || []).map((service, index) => (
                <div key={service.id || index} className="space-y-4">
                  <div className="grid grid-cols-6 items-start gap-4">
                    <div className="col-span-2">
                      <FormLabel>Service</FormLabel>
                      <Select
                        value={service.service_id || ''}
                        onValueChange={(value) => updateService(index, 'service_id', value)}
                        disabled={disabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select service" />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} — {fmtMoney(s.hourly_rate)}/hr
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <FormItem>
                      <FormLabel>Hours</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={service.hours}
                          disabled={disabled}
                          onChange={(e) =>
                            updateService(index, 'hours', parseFloat(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                    </FormItem>

                    <FormItem>
                      <FormLabel>Hourly Rate</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={service.hourly_rate}
                          disabled={disabled}
                          onChange={(e) =>
                            updateService(index, 'hourly_rate', parseFloat(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                    </FormItem>

                    <FormItem>
                      <FormLabel>Total</FormLabel>
                      <FormControl>
                        <Input value={fmtMoney(service.total_price)} disabled />
                      </FormControl>
                    </FormItem>

                    {!disabled && (
                      <div className="pt-8">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeService(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        value={service.description}
                        disabled={disabled}
                        onChange={(e) => updateService(index, 'description', e.target.value)}
                        placeholder="Describe the service details..."
                      />
                    </FormControl>
                  </FormItem>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default OrderItemsTabs;
