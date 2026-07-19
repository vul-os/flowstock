import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/services/api';
import { useWorkspace } from '@/context/workspace-context';
import { toast } from '@/components/ui/use-toast';

const qtyAt = (levels, variantId, branchId) =>
  Number(
    levels.find((l) => l.variant_id === variantId && l.branch_id === branchId)?.qty || 0,
  );

const variantLabel = (variant) =>
  variant ? `${variant.name}${variant.sku ? ` (${variant.sku})` : ''}` : '';

/**
 * Manual stock adjustment for one variant: pick a branch, then either enter
 * a +/- delta (kind "adjustment") or a counted total (kind "count", delta
 * computed against the current level).
 */
export const AdjustStockDialog = ({ open, onOpenChange, variant, branches, levels }) => {
  const { branchId: homeBranchId } = useWorkspace();
  const [branchId, setBranchId] = useState('');
  const [mode, setMode] = useState('adjustment');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setBranchId(homeBranchId || branches[0]?.id || '');
      setMode('adjustment');
      setQty('');
      setNote('');
    }
  }, [open, homeBranchId, branches]);

  const current = variant && branchId ? qtyAt(levels, variant.id, branchId) : 0;
  const qtyNum = Number(qty);
  const delta = mode === 'count' ? qtyNum - current : qtyNum;
  const canSave = branchId && qty !== '' && Number.isFinite(qtyNum) && delta !== 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await api.adjustStock({
        variantId: variant.id,
        branchId,
        qtyDelta: delta,
        kind: mode,
        note,
      });
      toast({
        title: 'Stock updated',
        description: `${variantLabel(variant)}: ${delta > 0 ? '+' : ''}${delta} recorded.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Adjustment failed',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>{variantLabel(variant)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {branchId && (
                <p className="text-sm text-muted-foreground">
                  Current level at this branch: <span className="font-medium">{current}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment">Adjustment (+/- change)</SelectItem>
                  <SelectItem value="count">Stock count (set new total)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-qty">
                {mode === 'count' ? 'Counted quantity' : 'Quantity change'}
              </Label>
              <Input
                id="adjust-qty"
                type="number"
                step="1"
                min={mode === 'count' ? 0 : undefined}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={mode === 'count' ? 'e.g. 42' : 'e.g. -3 or 10'}
                required
              />
              {mode === 'count' && qty !== '' && Number.isFinite(qtyNum) && (
                <p className="text-sm text-muted-foreground">
                  Computed change: {delta > 0 ? '+' : ''}
                  {delta}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-note">Note</Label>
              <Input
                id="adjust-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason (optional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || saving}>
              {saving ? 'Saving…' : 'Record'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** Move stock of one variant between two branches. */
export const TransferStockDialog = ({ open, onOpenChange, variant, branches, levels }) => {
  const { branchId: homeBranchId } = useWorkspace();
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFromBranchId(homeBranchId || branches[0]?.id || '');
      setToBranchId('');
      setQty('');
      setNote('');
    }
  }, [open, homeBranchId, branches]);

  const available = useMemo(
    () => (variant && fromBranchId ? qtyAt(levels, variant.id, fromBranchId) : 0),
    [levels, variant, fromBranchId],
  );
  const qtyNum = Number(qty);
  const canSave =
    fromBranchId && toBranchId && fromBranchId !== toBranchId && Number.isFinite(qtyNum) && qtyNum > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await api.transferStock({
        variantId: variant.id,
        fromBranchId,
        toBranchId,
        qty: qtyNum,
        note,
      });
      const fromName = branches.find((b) => b.id === fromBranchId)?.name || 'branch';
      const toName = branches.find((b) => b.id === toBranchId)?.name || 'branch';
      toast({
        title: 'Transfer recorded',
        description: `${qtyNum} × ${variantLabel(variant)}: ${fromName} → ${toName}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Transfer failed',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Transfer Stock</DialogTitle>
            <DialogDescription>{variantLabel(variant)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>From branch</Label>
              <Select value={fromBranchId} onValueChange={setFromBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fromBranchId && (
                <p className="text-sm text-muted-foreground">
                  Available here: <span className="font-medium">{available}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>To branch</Label>
              <Select value={toBranchId} onValueChange={setToBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((b) => b.id !== fromBranchId)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-qty">Quantity</Label>
              <Input
                id="transfer-qty"
                type="number"
                step="1"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-note">Note</Label>
              <Input
                id="transfer-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason (optional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || saving}>
              {saving ? 'Transferring…' : 'Transfer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
