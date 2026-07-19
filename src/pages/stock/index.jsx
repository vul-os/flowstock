import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/services/api";
import {
  useStockLevels,
  useTables,
  useWorkspace,
} from "@/context/workspace-context";
import { MOVEMENT_KIND_LABELS, movementLedger } from "@/lib/reports";

const errMsg = (e) => (typeof e === "string" ? e : e?.message || String(e));

const num = (v) => Number(v || 0);

const fmtQty = (v) => {
  const n = num(v);
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("en-ZA", { maximumFractionDigits: 3 });
};

const fmtDelta = (v) => {
  const n = num(v);
  return n > 0 ? `+${fmtQty(n)}` : fmtQty(n);
};

const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
};

const KIND_BADGE = {
  receive: "bg-success-muted text-success",
  transfer_in: "bg-success-muted text-success",
  sale: "bg-destructive-muted text-destructive",
  transfer_out: "bg-destructive-muted text-destructive",
  adjustment: "bg-signal-muted text-signal-text",
  count: "bg-signal-muted text-signal-text",
  reversal: "bg-muted text-foreground",
};

function KindBadge({ kind }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        KIND_BADGE[kind] || "bg-muted text-foreground"
      }`}
    >
      {MOVEMENT_KIND_LABELS[kind] || kind}
    </span>
  );
}

/** Searchable variant picker used inside the dialogs. */
function VariantPicker({ rows, value, onChange }) {
  const [q, setQ] = useState("");
  const selected = rows.find((r) => r.id === value);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">
            {selected.product} — {selected.name}
          </p>
          <p className="text-xs text-muted-foreground">
            SKU {selected.sku || "—"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange("")}
        >
          Change
        </Button>
      </div>
    );
  }

  const needle = q.trim().toLowerCase();
  const filtered = rows
    .filter(
      (r) =>
        !needle ||
        `${r.product} ${r.name} ${r.sku || ""}`.toLowerCase().includes(needle),
    )
    .slice(0, 30);

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        placeholder="Search product, variant or SKU…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-44 divide-y overflow-y-auto rounded-md border">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No matching variants.
          </p>
        ) : (
          filtered.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => onChange(r.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span className="truncate">
                {r.product} — {r.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.sku || ""}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function BranchSelect({ id, branches, value, onChange, placeholder }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder || "Select branch"} />
      </SelectTrigger>
      <SelectContent>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Adjust stock dialog ──────────────────────────────────────────────────────

const ADJUST_KINDS = [
  { value: "receive", label: "Goods received" },
  { value: "adjustment", label: "Adjustment (+/-)" },
  { value: "count", label: "Stock count" },
];

function AdjustDialog({
  open,
  onOpenChange,
  variantRows,
  branches,
  levelMap,
  defaultBranchId,
}) {
  const { toast } = useToast();
  const [variantId, setVariantId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [kind, setKind] = useState("receive");
  const [qty, setQty] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setVariantId("");
      setBranchId(defaultBranchId || "");
      setKind("receive");
      setQty("");
      setCounted("");
      setNote("");
    }
  }, [open, defaultBranchId]);

  const currentQty =
    variantId && branchId
      ? num(levelMap.get(`${variantId}|${branchId}`))
      : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!variantId || !branchId) {
      toast({
        variant: "destructive",
        title: "Pick a variant and a branch first",
      });
      return;
    }
    let qtyDelta;
    if (kind === "count") {
      const c = Number(counted);
      if (!Number.isFinite(c) || counted === "") {
        toast({ variant: "destructive", title: "Enter the counted quantity" });
        return;
      }
      qtyDelta = c - (currentQty || 0);
      if (qtyDelta === 0) {
        toast({
          title: "No change",
          description: "Counted quantity matches the current level.",
        });
        return;
      }
    } else {
      qtyDelta = Number(qty);
      if (!Number.isFinite(qtyDelta) || qtyDelta === 0) {
        toast({ variant: "destructive", title: "Quantity may not be zero" });
        return;
      }
      if (kind === "receive" && qtyDelta < 0) {
        toast({
          variant: "destructive",
          title: "Received quantity must be positive",
        });
        return;
      }
    }
    setSaving(true);
    try {
      await api.adjustStock({
        variantId,
        branchId,
        qtyDelta,
        kind,
        note: note.trim(),
      });
      toast({
        title: "Stock updated",
        description: `Recorded ${fmtDelta(qtyDelta)}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not update stock",
        description: errMsg(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Record received goods, a manual adjustment or a physical stock
            count.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Variant</Label>
            <VariantPicker
              rows={variantRows}
              value={variantId}
              onChange={setVariantId}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adj_branch">Branch</Label>
              <BranchSelect
                id="adj_branch"
                branches={branches}
                value={branchId}
                onChange={setBranchId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj_kind">Type</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="adj_kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUST_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {kind === "count" ? (
            <div className="space-y-2">
              <Label htmlFor="adj_counted">Counted quantity</Label>
              <Input
                id="adj_counted"
                type="number"
                step="any"
                min="0"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="Physical quantity on the shelf"
              />
              {currentQty !== null && (
                <p className="text-xs text-muted-foreground">
                  System shows {fmtQty(currentQty)}
                  {counted !== "" && Number.isFinite(Number(counted))
                    ? ` — will record a ${fmtDelta(Number(counted) - currentQty)} correction`
                    : ""}
                  .
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="adj_qty">
                {kind === "receive"
                  ? "Quantity received"
                  : "Quantity change (+/-)"}
              </Label>
              <Input
                id="adj_qty"
                type="number"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={
                  kind === "receive" ? "e.g. 24" : "e.g. -3 for shrinkage"
                }
              />
              {currentQty !== null && (
                <p className="text-xs text-muted-foreground">
                  Current level: {fmtQty(currentQty)}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="adj_note">Note</Label>
            <Input
              id="adj_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional reason or reference"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Transfer dialog ──────────────────────────────────────────────────────────

function TransferDialog({
  open,
  onOpenChange,
  variantRows,
  branches,
  levelMap,
  defaultBranchId,
}) {
  const { toast } = useToast();
  const [variantId, setVariantId] = useState("");
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setVariantId("");
      setFromBranchId(defaultBranchId || "");
      setToBranchId("");
      setQty("");
      setNote("");
    }
  }, [open, defaultBranchId]);

  const available =
    variantId && fromBranchId
      ? num(levelMap.get(`${variantId}|${fromBranchId}`))
      : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!variantId || !fromBranchId || !toBranchId) {
      toast({
        variant: "destructive",
        title: "Pick a variant and both branches first",
      });
      return;
    }
    if (fromBranchId === toBranchId) {
      toast({
        variant: "destructive",
        title: "Cannot transfer to the same branch",
      });
      return;
    }
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      toast({
        variant: "destructive",
        title: "Transfer quantity must be positive",
      });
      return;
    }
    setSaving(true);
    try {
      await api.transferStock({
        variantId,
        fromBranchId,
        toBranchId,
        qty: q,
        note: note.trim(),
      });
      toast({
        title: "Transfer recorded",
        description: `Moved ${fmtQty(q)} between branches.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not record transfer",
        description: errMsg(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer between branches</DialogTitle>
          <DialogDescription>
            Moves stock out of one branch and into another in a single step.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Variant</Label>
            <VariantPicker
              rows={variantRows}
              value={variantId}
              onChange={setVariantId}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tr_from">From branch</Label>
              <BranchSelect
                id="tr_from"
                branches={branches}
                value={fromBranchId}
                onChange={setFromBranchId}
              />
              {available !== null && (
                <p className="text-xs text-muted-foreground">
                  Available: {fmtQty(available)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr_to">To branch</Label>
              <BranchSelect
                id="tr_to"
                branches={branches.filter((b) => b.id !== fromBranchId)}
                value={toBranchId}
                onChange={setToBranchId}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tr_qty">Quantity</Label>
              <Input
                id="tr_qty"
                type="number"
                step="any"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr_note">Note</Label>
              <Input
                id="tr_note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional reference"
              />
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
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const StockPage = () => {
  const { data, loading } = useTables(
    "branches",
    "products",
    "product_variants",
    "stock_movements",
  );
  const levels = useStockLevels();
  const { branchId } = useWorkspace();

  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [ledgerBranch, setLedgerBranch] = useState("all");
  const [ledgerKind, setLedgerKind] = useState("all");

  const branches = useMemo(() => data.branches || [], [data.branches]);
  const products = useMemo(() => data.products || [], [data.products]);
  const variants = useMemo(
    () => data.product_variants || [],
    [data.product_variants],
  );
  const movements = useMemo(
    () => data.stock_movements || [],
    [data.stock_movements],
  );

  const levelMap = useMemo(() => {
    const m = new Map();
    levels.forEach((l) => m.set(`${l.variant_id}|${l.branch_id}`, num(l.qty)));
    return m;
  }, [levels]);

  const variantRows = useMemo(() => {
    const productName = new Map(products.map((p) => [p.id, p.name]));
    return variants
      .map((v) => {
        const total = branches.reduce(
          (sum, b) => sum + num(levelMap.get(`${v.id}|${b.id}`)),
          0,
        );
        return {
          ...v,
          product: productName.get(v.product_id) || "—",
          total,
          low: num(v.reorder_point) > 0 && total <= num(v.reorder_point),
        };
      })
      .sort((a, b) =>
        `${a.product} ${a.name}`.localeCompare(`${b.product} ${b.name}`),
      );
  }, [variants, products, branches, levelMap]);

  const matrixRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return variantRows.filter((v) => {
      if (lowOnly && !v.low) return false;
      if (!needle) return true;
      return `${v.product} ${v.name} ${v.sku || ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [variantRows, search, lowOnly]);

  const ledger = useMemo(
    () => movementLedger(movements, variants, products, branches),
    [movements, variants, products, branches],
  );

  const ledgerRows = useMemo(
    () =>
      ledger
        .filter((m) => ledgerBranch === "all" || m.branch_id === ledgerBranch)
        .filter((m) => ledgerKind === "all" || m.kind === ledgerKind)
        .slice(0, 200),
    [ledger, ledgerBranch, ledgerKind],
  );

  const lowCount = variantRows.filter((v) => v.low).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Stock</h1>
          <p className="text-muted-foreground">
            Stock on hand per branch, adjustments and transfers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Transfer between branches
          </Button>
          <Button onClick={() => setAdjustOpen(true)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Adjust stock
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle>Stock on hand</CardTitle>
              <CardDescription>
                Quantities per branch. Rows at or below their reorder point are
                highlighted.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product, variant or SKU…"
                  className="w-64 pl-9"
                />
              </div>
              <Button
                variant={lowOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setLowOnly((v) => !v)}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Low stock only{lowCount > 0 ? ` (${lowCount})` : ""}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : variantRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No product variants yet. Add products first, then record stock
              here.
            </p>
          ) : matrixRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No variants match the current filter.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    {branches.map((b) => (
                      <TableHead key={b.id} className="text-right">
                        {b.name}
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-semibold">
                      Total
                    </TableHead>
                    <TableHead className="text-right">Reorder pt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixRows.map((v) => (
                    <TableRow
                      key={v.id}
                      className={v.low ? "bg-signal-muted" : undefined}
                    >
                      <TableCell className="font-medium">{v.product}</TableCell>
                      <TableCell>{v.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {v.sku || "—"}
                      </TableCell>
                      {branches.map((b) => (
                        <TableCell key={b.id} className="cell-num">
                          {fmtQty(levelMap.get(`${v.id}|${b.id}`))}
                        </TableCell>
                      ))}
                      <TableCell className="cell-num font-semibold">
                        <span className="inline-flex items-center gap-1">
                          {v.low && (
                            <AlertTriangle className="h-3.5 w-3.5 text-signal-text" />
                          )}
                          {fmtQty(v.total)}
                        </span>
                      </TableCell>
                      <TableCell className="cell-num text-muted-foreground">
                        {num(v.reorder_point) > 0
                          ? fmtQty(v.reorder_point)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle>Movement ledger</CardTitle>
              <CardDescription>
                Every stock change, newest first
                {ledger.length > 200 ? " (latest 200 shown)" : ""}.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={ledgerBranch} onValueChange={setLedgerBranch}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ledgerKind} onValueChange={setLedgerKind}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Kind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  {Object.entries(MOVEMENT_KIND_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {ledgerRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No stock movements match the current filter.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product / Variant</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Note / By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmtWhen(m.created_at)}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{m.product}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {m.variant}
                        </span>
                        {m.sku && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {m.sku}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{m.branch}</TableCell>
                      <TableCell>
                        <KindBadge kind={m.kind} />
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium tabular-nums ${
                          num(m.qty_delta) > 0
                            ? "text-success"
                            : num(m.qty_delta) < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {fmtDelta(m.qty_delta)}
                      </TableCell>
                      <TableCell className="max-w-64 text-muted-foreground">
                        <span className="block truncate" title={m.note}>
                          {m.note || "—"}
                        </span>
                        {m.created_by && (
                          <span className="block text-xs text-muted-foreground">
                            by {m.created_by}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        variantRows={variantRows}
        branches={branches}
        levelMap={levelMap}
        defaultBranchId={branchId}
      />
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        variantRows={variantRows}
        branches={branches}
        levelMap={levelMap}
        defaultBranchId={branchId}
      />
    </div>
  );
};

export default StockPage;
