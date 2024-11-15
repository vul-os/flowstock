import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  const handleAttributeChange = (key, value) => {
    setVariationForm(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [key]: value
      }
    }));
  };

  const addNewAttribute = () => {
    setVariationForm(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        '': ''
      }
    }));
  };

  const removeAttribute = (keyToRemove) => {
    const newAttributes = { ...variationForm.attributes };
    delete newAttributes[keyToRemove];
    setVariationForm(prev => ({
      ...prev,
      attributes: newAttributes
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {selectedVariation ? 'Edit Variation' : 'Add New Variation'}
          </DialogTitle>
          <DialogDescription>
            {selectedVariation 
              ? 'Update the details of this product variation.' 
              : 'Create a new variation for this product.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              value={variationForm.sku}
              onChange={(e) => setVariationForm(prev => ({ ...prev, sku: e.target.value }))}
              placeholder="Enter SKU"
            />
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={variationForm.name}
              onChange={(e) => setVariationForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter variation name"
            />
          </div>
          <div>
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={variationForm.price}
              onChange={(e) => setVariationForm(prev => ({ ...prev, price: e.target.value }))}
              placeholder="Enter price"
            />
          </div>
          <div>
            <Label htmlFor="stock">Stock Quantity</Label>
            <Input
              id="stock"
              type="number"
              min="0"
              value={variationForm.stock_quantity}
              onChange={(e) => setVariationForm(prev => ({ ...prev, stock_quantity: e.target.value }))}
              placeholder="Enter stock quantity"
            />
          </div>
          
          <div>
            <Label>Attributes</Label>
            <div className="space-y-2">
              {Object.entries(variationForm.attributes || {}).map(([key, value], index) => (
                <div key={`${key}-${index}`} className="flex gap-2">
                  <Input
                    placeholder="Attribute name"
                    value={key}
                    onChange={(e) => {
                      const oldAttributes = { ...variationForm.attributes };
                      delete oldAttributes[key];
                      handleAttributeChange(e.target.value, value);
                    }}
                  />
                  <Input
                    placeholder="Value"
                    value={value}
                    onChange={(e) => handleAttributeChange(key, e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAttribute(key)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addNewAttribute}
              className="mt-2"
            >
              Add Attribute
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            {selectedVariation ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductVariationDialog;