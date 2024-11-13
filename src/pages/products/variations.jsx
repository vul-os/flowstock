import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ProductVariationDialog = ({
  open,
  onOpenChange,
  selectedVariation,
  variationForm,
  setVariationForm,
  onSave,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {selectedVariation ? 'Edit Variation' : 'Add New Variation'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              value={variationForm.sku}
              onChange={(e) => setVariationForm({ ...variationForm, sku: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="variation-name">Name</Label>
            <Input
              id="variation-name"
              value={variationForm.name}
              onChange={(e) => setVariationForm({ ...variationForm, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="number"
              value={variationForm.price}
              onChange={(e) => setVariationForm({ ...variationForm, price: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="stock_quantity">Stock</Label>
            <Input
              id="stock_quantity"
              type="number"
              value={variationForm.stock_quantity}
              onChange={(e) => setVariationForm({ ...variationForm, stock_quantity: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="attributes">Attributes (JSON)</Label>
            <Input
              id="attributes"
              value={JSON.stringify(variationForm.attributes)}
              onChange={(e) => {
                try {
                  const attributes = JSON.parse(e.target.value);
                  setVariationForm({ ...variationForm, attributes });
                } catch (error) {
                  // Handle invalid JSON input
                }
              }}
              placeholder='{"color": "red", "size": "XL"}'
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>
            {selectedVariation ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductVariationDialog;