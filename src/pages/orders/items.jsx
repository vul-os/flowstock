import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/services/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormItem,
  FormLabel,
  FormControl,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

const OrderItemsTabs = ({ form, organizationId }) => {
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);

  useEffect(() => {
    fetchProducts();
    fetchServices();
  }, [organizationId]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('product_variants')
        .select(`
          *,
          product:products(
            name,
            description
          )
        `)
        .eq('organization_id', organizationId);
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('organization_id', organizationId);
      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const addProduct = () => {
    const items = form.getValues('order_items');
    form.setValue('order_items', [
      ...items,
      {
        product_variant_id: '',
        quantity: 1,
        unit_price: 0,
        total_price: 0
      }
    ]);
  };

  const addService = () => {
    const services = form.getValues('order_services');
    form.setValue('order_services', [
      ...services,
      {
        service_id: '',
        hours: 1,
        hourly_rate: 0,
        total_price: 0,
        description: ''
      }
    ]);
  };

  const removeProduct = (index) => {
    const items = form.getValues('order_items');
    form.setValue('order_items', items.filter((_, i) => i !== index));
  };

  const removeService = (index) => {
    const services = form.getValues('order_services');
    form.setValue('order_services', services.filter((_, i) => i !== index));
  };

  const updateProduct = (index, field, value) => {
    const items = form.getValues('order_items');
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      [field]: value,
    };

    if (field === 'product_variant_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].unit_price = product.price || 0;
        newItems[index].total_price = (product.price || 0) * newItems[index].quantity;
      }
    }

    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total_price = newItems[index].quantity * newItems[index].unit_price;
    }

    form.setValue('order_items', newItems);
  };

  const updateService = (index, field, value) => {
    const services = form.getValues('order_services');
    const newServices = [...services];
    newServices[index] = {
      ...newServices[index],
      [field]: value,
    };

    if (field === 'service_id') {
      const service = services.find(s => s.id === value);
      if (service) {
        newServices[index].hourly_rate = service.hourly_rate || 0;
        newServices[index].total_price = (service.hourly_rate || 0) * newServices[index].hours;
      }
    }

    if (field === 'hours' || field === 'hourly_rate') {
      newServices[index].total_price = newServices[index].hours * newServices[index].hourly_rate;
    }

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
            <div className="flex justify-between items-center">
              <CardTitle>Products</CardTitle>
              <Button type="button" variant="outline" onClick={addProduct}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {form.watch('order_items')?.map((item, index) => (
                <div key={index} className="grid grid-cols-6 gap-4 items-start">
                  <div className="col-span-2">
                    <FormLabel>Product</FormLabel>
                    <Select
                      value={item.product_variant_id}
                      onValueChange={(value) => updateProduct(index, 'product_variant_id', value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.product.name} - {product.name}
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
                        onChange={(e) => updateProduct(index, 'quantity', parseInt(e.target.value) || 0)}
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
                        onChange={(e) => updateProduct(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Total</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={item.total_price}
                        disabled
                      />
                    </FormControl>
                  </FormItem>

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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="services">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Services</CardTitle>
              <Button type="button" variant="outline" onClick={addService}>
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {form.watch('order_services')?.map((service, index) => (
                <div key={index} className="space-y-4">
                  <div className="grid grid-cols-6 gap-4 items-start">
                    <div className="col-span-2">
                      <FormLabel>Service</FormLabel>
                      <Select
                        value={service.service_id}
                        onValueChange={(value) => updateService(index, 'service_id', value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select service" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {services.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
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
                          onChange={(e) => updateService(index, 'hours', parseFloat(e.target.value) || 0)}
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
                          onChange={(e) => updateService(index, 'hourly_rate', parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                    </FormItem>

                    <FormItem>
                      <FormLabel>Total</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={service.total_price}
                          disabled
                        />
                      </FormControl>
                    </FormItem>

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
                  </div>

                  <FormItem className="col-span-5">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        value={service.description}
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