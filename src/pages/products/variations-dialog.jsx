import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import { parseAttributes } from "./helpers";

const emptyForm = {
  name: "",
  sku: "",
  price: "",
  cost_price: "",
  reorder_point: "",
  pairs: [], // attributes as [{key, value}] so typing a key never loses focus
};

function formFromVariant(variant) {
  if (!variant) return emptyForm;
  return {
    name: variant.name || "",
    sku: variant.sku || "",
    price: variant.price ?? "",
    cost_price: variant.cost_price ?? "",
    reorder_point: variant.reorder_point ?? "",
    pairs: Object.entries(parseAttributes(variant.attributes)).map(
      ([key, value]) => ({
        key,
        value: String(value ?? ""),
      }),
    ),
  };
}

/**
 * Create / edit a product variant. `onSave(payload)` is awaited with
 * {name, sku, price, cost_price, reorder_point, attributes(JSON string)};
 * the dialog closes itself on success.
 */
const ProductVariationDialog = ({ open, onOpenChange, variant, onSave }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(formFromVariant(variant));
  }, [open, variant]);

  const setPair = (idx, patch) =>
    setForm((prev) => ({
      ...prev,
      pairs: prev.pairs.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));

  const isValid = form.name.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || saving) return;
    const attributes = {};
    form.pairs.forEach(({ key, value }) => {
      if (key.trim()) attributes[key.trim()] = value;
    });
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: Number(form.price) || 0,
        cost_price: Number(form.cost_price) || 0,
        reorder_point: Number(form.reorder_point) || 0,
        attributes: JSON.stringify(attributes),
      });
      onOpenChange(false);
    } catch {
      // caller already surfaced the error via toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {variant ? "Edit Variation" : "Add New Variation"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variant-name">Name</Label>
                <Input
                  id="variant-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. 50mm / Box of 100"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-sku">SKU</Label>
                <Input
                  id="variant-sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="SKU"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variant-price">Price</Label>
                <Input
                  id="variant-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-cost">Cost Price</Label>
                <Input
                  id="variant-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost_price}
                  onChange={(e) =>
                    setForm({ ...form, cost_price: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-reorder">Reorder Point</Label>
                <Input
                  id="variant-reorder"
                  type="number"
                  step="1"
                  min="0"
                  value={form.reorder_point}
                  onChange={(e) =>
                    setForm({ ...form, reorder_point: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <Label>Attributes</Label>
              {form.pairs.map((pair, idx) => (
                <div key={idx} className="mt-2 flex gap-2">
                  <Input
                    placeholder="Attribute name"
                    value={pair.key}
                    onChange={(e) => setPair(idx, { key: e.target.value })}
                  />
                  <Input
                    placeholder="Value"
                    value={pair.value}
                    onChange={(e) => setPair(idx, { value: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        pairs: prev.pairs.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    pairs: [...prev.pairs, { key: "", value: "" }],
                  }))
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Attribute
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving…" : variant ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProductVariationDialog;
