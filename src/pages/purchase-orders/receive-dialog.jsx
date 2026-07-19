import React, { useEffect, useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Receive goods against a purchase order. Only product lines are stockable;
 * each row shows ordered / already-received / outstanding, and the qty input
 * defaults to the outstanding amount and is capped there. Submitting posts
 * receive movements (backend adds stock at the PO's branch and advances the
 * PO status to partially_received / received).
 */
const ReceiveGoodsDialog = ({ open, onClose, order, items, variantsById }) => {
  const { toast } = useToast();
  const [qty, setQty] = useState({});
  const [saving, setSaving] = useState(false);

  const productLines = useMemo(
    () => (items || []).filter((i) => (i.item_type || 'product') === 'product'),
    [items],
  );

  const outstanding = (item) =>
    Math.max(0, (Number(item.quantity) || 0) - (Number(item.received_quantity) || 0));

  useEffect(() => {
    if (open) {
      const seed = {};
      productLines.forEach((i) => {
        seed[i.id] = outstanding(i);
      });
      setQty(seed);
    }
  }, [open, productLines]);

  const label = (item) => {
    const v = variantsById?.get(item.product_variant_id);
    if (!v) return item.description || item.product_variant_id || 'Item';
    return `${v.product_name} — ${v.name || v.sku || ''}`.trim();
  };

  const submit = async () => {
    const receipts = productLines
      .map((i) => ({ item_id: i.id, qty: Number(qty[i.id]) || 0 }))
      .filter((r) => r.qty > 0);
    if (receipts.length === 0) {
      toast({ description: 'Enter a quantity to receive on at least one line.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.receivePurchaseOrder(order.id, receipts);
      const total = receipts.reduce((s, r) => s + r.qty, 0);
      toast({ description: `Received ${total} unit(s) into stock.` });
      onClose();
    } catch (err) {
      toast({ description: `Could not receive goods: ${err}`, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Receive goods — {order.po_number}
          </DialogTitle>
          <DialogDescription>
            Enter the quantities that arrived. Stock is added at this purchase order's branch.
          </DialogDescription>
        </DialogHeader>

        {productLines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This purchase order has no stockable product lines.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="w-32 text-right">Receive now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productLines.map((item) => {
                const out = outstanding(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{label(item)}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.received_quantity || 0}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{out}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        max={out}
                        step="1"
                        disabled={out === 0}
                        value={qty[item.id] ?? 0}
                        onChange={(e) => {
                          const v = Math.min(out, Math.max(0, Number(e.target.value) || 0));
                          setQty((prev) => ({ ...prev, [item.id]: v }));
                        }}
                        className="text-right"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || productLines.length === 0}>
            {saving ? 'Receiving…' : 'Receive into stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiveGoodsDialog;
