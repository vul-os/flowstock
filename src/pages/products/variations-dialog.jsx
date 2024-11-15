// variations.jsx
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
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
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
            <Label htmlFor="stock">Stock Quantity</Label>
            <Input
              id="stock"
              type="number"
              value={variationForm.stock_quantity}
              onChange={(e) => setVariationForm({ ...variationForm, stock_quantity: e.target.value })}
            />
          </div>
          
          <div>
            <Label>Attributes</Label>
            {Object.entries(variationForm.attributes || {}).map(([key, value]) => (
              <div key={key} className="flex gap-2 mt-2">
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
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttribute(key)}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
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