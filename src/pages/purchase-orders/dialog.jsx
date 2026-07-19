import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { api } from "@/services/api";
import { useWorkspace } from "@/context/workspace-context";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Form validation schema
const formSchema = z.object({
  supplier_id: z.string().min(1, "Supplier is required"),
  order_date: z.string().min(1, "Order date is required"),
  expected_delivery_date: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z
      .object({
        id: z.string().optional(),
        item_type: z.enum(["product", "service"]),
        product_variant_id: z.string().nullable().optional(),
        service_id: z.string().nullable().optional(),
        quantity: z.number().min(1, "Quantity must be at least 1"),
        unit_price: z.number().min(0, "Unit price must be at least 0"),
        total_price: z.number(),
        description: z.string().optional(),
        unit_type: z.string(),
        received_quantity: z.number().optional(),
      })
      .refine(
        (item) =>
          item.item_type === "product" ? !!item.product_variant_id : true,
        {
          message: "Select a product",
          path: ["product_variant_id"],
        },
      )
      .refine(
        (item) => (item.item_type === "service" ? !!item.service_id : true),
        {
          message: "Select a service",
          path: ["service_id"],
        },
      ),
  ),
});

const today = () => new Date().toISOString().split("T")[0];

const PurchaseOrderDialog = ({
  open,
  onClose,
  order = null,
  orderItems = [],
  suppliers = [],
  variants = [],
  services = [],
}) => {
  const { fmtMoney, taxRate } = useWorkspace();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Items are only editable while the purchase order is a draft.
  const locked = !!order && order.status !== "draft";

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplier_id: "",
      order_date: today(),
      expected_delivery_date: "",
      notes: "",
      items: [],
    },
  });

  useEffect(() => {
    if (!open) return;
    if (order) {
      form.reset({
        supplier_id: order.supplier_id || "",
        order_date: order.order_date?.split("T")[0] || today(),
        expected_delivery_date:
          order.expected_delivery_date?.split("T")[0] || "",
        notes: order.notes || "",
        items: orderItems.map((i) => ({
          id: i.id,
          item_type: i.item_type || "product",
          product_variant_id: i.product_variant_id || null,
          service_id: i.service_id || null,
          quantity: i.quantity || 0,
          unit_price: i.unit_price || 0,
          total_price: i.total_price || 0,
          description: i.description || "",
          unit_type: i.unit_type || "units",
          received_quantity: i.received_quantity || 0,
        })),
      });
    } else {
      form.reset({
        supplier_id: "",
        order_date: today(),
        expected_delivery_date: "",
        notes: "",
        items: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order]);

  const addItem = (type) => {
    const items = form.getValues("items") || [];
    form.setValue("items", [
      ...items,
      {
        item_type: type,
        product_variant_id: null,
        service_id: null,
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        description: "",
        unit_type: type === "product" ? "units" : "hours",
        received_quantity: 0,
      },
    ]);
  };

  const removeItem = (index) => {
    const items = form.getValues("items") || [];
    form.setValue(
      "items",
      items.filter((_, i) => i !== index),
    );
  };

  const updateItem = (index, field, value) => {
    const items = form.getValues("items") || [];
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    // If a product/service is selected, default the unit price from it.
    if (field === "product_variant_id") {
      const variant = variants.find((v) => v.id === value);
      if (variant)
        newItems[index].unit_price = variant.cost_price ?? variant.price ?? 0;
    } else if (field === "service_id") {
      const service = services.find((s) => s.id === value);
      if (service) newItems[index].unit_price = service.hourly_rate || 0;
    }
    newItems[index].total_price =
      (newItems[index].quantity || 0) * (newItems[index].unit_price || 0);

    form.setValue("items", newItems);
  };

  const watchedItems = form.watch("items") || [];
  const subtotal = watchedItems.reduce(
    (sum, item) => sum + (item.total_price || 0),
    0,
  );
  const tax = subtotal * ((taxRate || 0) / 100);
  const total = subtotal + tax;

  const handleSubmitForm = async (data) => {
    try {
      setIsSubmitting(true);
      const payload = {
        purchase_order: {
          ...(order?.id ? { id: order.id } : {}),
          supplier_id: data.supplier_id,
          order_date: data.order_date,
          expected_delivery_date: data.expected_delivery_date,
          subtotal,
          tax_amount: tax,
          total_amount: total,
          notes: data.notes,
        },
      };
      if (!locked) {
        payload.items = data.items.map((item) => ({
          ...(item.id ? { id: item.id } : {}),
          item_type: item.item_type,
          product_variant_id:
            item.item_type === "product" ? item.product_variant_id : null,
          service_id: item.item_type === "service" ? item.service_id : null,
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          total_price: item.total_price || 0,
          description: item.description || "",
          unit_type: item.unit_type || "units",
        }));
      }
      const saved = await api.savePurchaseOrder(payload);
      toast({
        title: order ? "Purchase order updated" : "Purchase order created",
        description: saved?.po_number,
      });
      onClose();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save purchase order",
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
            {order
              ? `Purchase Order ${order.po_number || ""}`
              : "Create Purchase Order"}
            {order && (
              <Badge
                variant={
                  order.status === "cancelled" ? "destructive" : "secondary"
                }
              >
                {(order.status || "").replace(/_/g, " ")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {order
              ? locked
                ? 'This purchase order has been sent — line items are locked. Use "Receive goods" on the list to record deliveries.'
                : "Update the purchase order details below"
              : "Order products and services from a supplier"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmitForm)}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="supplier_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.company_name || supplier.name}
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
                    <Textarea
                      {...field}
                      placeholder="Add any notes or special instructions..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
                {!locked && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addItem("product")}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Product
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addItem("service")}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Service
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {watchedItems.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No items on this purchase order.
                    </div>
                  )}
                  {watchedItems.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="grid grid-cols-6 items-start gap-4"
                    >
                      {item.item_type === "product" ? (
                        <div className="col-span-2">
                          <FormLabel>Product</FormLabel>
                          <Select
                            value={item.product_variant_id || ""}
                            onValueChange={(value) =>
                              updateItem(index, "product_variant_id", value)
                            }
                            disabled={locked}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {variants.map((variant) => (
                                <SelectItem key={variant.id} value={variant.id}>
                                  {variant.product_name} - {variant.name} (
                                  {variant.sku})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {form.formState.errors.items?.[index]
                            ?.product_variant_id && (
                            <p className="mt-1 text-[0.8rem] font-medium text-destructive">
                              {
                                form.formState.errors.items[index]
                                  .product_variant_id.message
                              }
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="col-span-2">
                          <FormLabel>Service</FormLabel>
                          <Select
                            value={item.service_id || ""}
                            onValueChange={(value) =>
                              updateItem(index, "service_id", value)
                            }
                            disabled={locked}
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
                          {form.formState.errors.items?.[index]?.service_id && (
                            <p className="mt-1 text-[0.8rem] font-medium text-destructive">
                              {
                                form.formState.errors.items[index].service_id
                                  .message
                              }
                            </p>
                          )}
                        </div>
                      )}

                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          disabled={locked}
                          onChange={(e) =>
                            updateItem(
                              index,
                              "quantity",
                              parseInt(e.target.value, 10) || 0,
                            )
                          }
                        />
                      </FormItem>

                      <FormItem>
                        <FormLabel>Unit Price</FormLabel>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          disabled={locked}
                          onChange={(e) =>
                            updateItem(
                              index,
                              "unit_price",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                        />
                      </FormItem>

                      <FormItem>
                        <FormLabel>Total</FormLabel>
                        <Input value={fmtMoney(item.total_price)} disabled />
                      </FormItem>

                      {!locked && (
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
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4 border-t pt-4">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  Subtotal: {fmtMoney(subtotal)}
                </div>
                <div className="text-sm text-muted-foreground">
                  VAT ({taxRate}%): {fmtMoney(tax)}
                </div>
                <div className="font-medium">Total: {fmtMoney(total)}</div>
              </div>
              <Button type="submit" disabled={isSubmitting}>
                {order ? "Update Order" : "Create Order"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseOrderDialog;
