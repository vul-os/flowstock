import { useEffect, useMemo, useState } from "react";
import { Plus, Scale, Wallet } from "lucide-react";
import { api } from "@/services/api";
import { useTables, useWorkspace } from "@/context/workspace-context";
import { partyBalances } from "@/lib/reports";
import { toast } from "@/components/ui/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";
import { StatCard, StatGrid } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const METHODS = [
  { value: "eft", label: "EFT" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

const methodLabel = (m) =>
  METHODS.find((x) => x.value === m)?.label || m || "—";
const today = () => new Date().toISOString().slice(0, 10);

/** Record a customer receipt (direction in) or supplier payment (direction out). */
const RecordPaymentDialog = ({
  open,
  onClose,
  preset,
  customers,
  suppliers,
}) => {
  const [kind, setKind] = useState("customer");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState("eft");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-initialise the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setKind(preset?.kind || "customer");
      setPartyId(preset?.party?.id || "");
      setAmount(
        preset?.balance != null ? String(preset.balance.toFixed(2)) : "",
      );
      setPaymentDate(today());
      setMethod("eft");
      setNote("");
    }
  }, [open, preset]);

  const isCustomer = kind === "customer";
  const parties = isCustomer ? customers : suppliers;
  const locked = !!preset;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!partyId) {
      toast({
        title: "Error",
        description: "Choose a party first.",
        variant: "destructive",
      });
      return;
    }
    if (!(value > 0)) {
      toast({
        title: "Error",
        description: "Amount must be greater than zero.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await api.putRow("payments", null, {
        party_kind: kind,
        party_id: partyId,
        direction: isCustomer ? "in" : "out",
        amount: value,
        payment_date: paymentDate,
        method,
        note,
        created_at: new Date().toISOString(),
      });
      toast({
        title: "Payment recorded",
        description: isCustomer
          ? "Customer receipt saved."
          : "Supplier payment saved.",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to record payment: ${error.message || error}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {isCustomer
              ? "Money received from a customer (reduces what they owe you)."
              : "Money paid to a supplier (reduces what you owe them)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v);
                  setPartyId("");
                }}
                disabled={locked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer receipt</SelectItem>
                  <SelectItem value="supplier">Supplier payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isCustomer ? "Customer" : "Supplier"}</Label>
              <Select
                value={partyId}
                onValueChange={setPartyId}
                disabled={locked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="pay-date">Payment date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
            <div className="col-span-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="pay-note">Note</Label>
              <Textarea
                id="pay-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const BalancesTable = ({
  rows,
  emptyText,
  balanceClass,
  fmtMoney,
  onRecord,
}) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Contact</TableHead>
        <TableHead>Payment Terms</TableHead>
        <TableHead className="text-right">Invoiced</TableHead>
        <TableHead className="text-right">Paid</TableHead>
        <TableHead className="text-right">Balance</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.length === 0 && (
        <TableRow>
          <TableCell colSpan={7} className="text-center text-muted-foreground">
            {emptyText}
          </TableCell>
        </TableRow>
      )}
      {rows.map(({ party, balance, invoiced, paid }) => (
        <TableRow key={party.id}>
          <TableCell className="font-medium">
            {party.name}
            {party.company_name ? (
              <div className="text-sm text-muted-foreground">
                {party.company_name}
              </div>
            ) : null}
          </TableCell>
          <TableCell>
            <div>{party.email}</div>
            <div className="text-sm text-muted-foreground">{party.phone}</div>
          </TableCell>
          <TableCell>{party.payment_terms}</TableCell>
          <TableCell className="cell-num">{fmtMoney(invoiced)}</TableCell>
          <TableCell className="cell-num">{fmtMoney(paid)}</TableCell>
          <TableCell className={`cell-num font-medium ${balanceClass}`}>
            {fmtMoney(balance)}
          </TableCell>
          <TableCell className="text-right">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRecord(party, balance)}
            >
              Record payment
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const CreditorsDebtorsPage = () => {
  const { fmtMoney } = useWorkspace();
  const { data, loading } = useTables(
    "customers",
    "suppliers",
    "orders",
    "purchase_orders",
    "payments",
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [preset, setPreset] = useState(null);

  const customers = useMemo(() => data.customers || [], [data.customers]);
  const suppliers = useMemo(() => data.suppliers || [], [data.suppliers]);
  const payments = useMemo(() => data.payments || [], [data.payments]);

  const balances = useMemo(
    () =>
      partyBalances({
        orders: data.orders || [],
        purchaseOrders: data.purchase_orders || [],
        payments,
        customers,
        suppliers,
      }),
    [data.orders, data.purchase_orders, payments, customers, suppliers],
  );

  const partyName = useMemo(() => {
    const map = new Map();
    customers.forEach((c) => map.set(`customer:${c.id}`, c.name));
    suppliers.forEach((s) => map.set(`supplier:${s.id}`, s.name));
    return map;
  }, [customers, suppliers]);

  const recentPayments = useMemo(
    () =>
      [...payments]
        .sort((a, b) =>
          (b.created_at || b.payment_date || "").localeCompare(
            a.created_at || a.payment_date || "",
          ),
        )
        .slice(0, 10),
    [payments],
  );

  const openDialog = (presetValue) => {
    setPreset(presetValue);
    setDialogOpen(true);
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">Creditors &amp; Debtors</h1>
          <p className="text-muted-foreground mt-2">
            Outstanding balances and payment recording
          </p>
        </div>
        <Button onClick={() => openDialog(null)}>
          <Plus className="h-4 w-4 mr-2" />
          Record payment
        </Button>
      </div>

      <StatGrid className="lg:grid-cols-2">
        <StatCard
          title="Total payable"
          value={fmtMoney(balances.total_payable)}
          detail={`Owed to ${balances.creditors.length} supplier${balances.creditors.length === 1 ? "" : "s"}`}
          icon={Scale}
        />
        <StatCard
          title="Total receivable"
          value={fmtMoney(balances.total_receivable)}
          detail={`Owed by ${balances.debtors.length} customer${balances.debtors.length === 1 ? "" : "s"}`}
          icon={Wallet}
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>Accounts Payable &amp; Receivable</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="creditors">
            <TabsList>
              <TabsTrigger value="creditors">Creditors</TabsTrigger>
              <TabsTrigger value="debtors">Debtors</TabsTrigger>
            </TabsList>

            <TabsContent value="creditors">
              <BalancesTable
                rows={balances.creditors}
                emptyText="Nothing owed to suppliers."
                balanceClass="text-destructive"
                fmtMoney={fmtMoney}
                onRecord={(party, balance) =>
                  openDialog({
                    kind: "supplier",
                    party,
                    balance: Math.max(balance, 0),
                  })
                }
              />
            </TabsContent>

            <TabsContent value="debtors">
              <BalancesTable
                rows={balances.debtors}
                emptyText="No customers owe you money."
                balanceClass="text-success"
                fmtMoney={fmtMoney}
                onRecord={(party, balance) =>
                  openDialog({
                    kind: "customer",
                    party,
                    balance: Math.max(balance, 0),
                  })
                }
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPayments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      title="No payments recorded yet"
                      description="Record a payment against a creditor or debtor to see it here."
                      className="border-0 bg-transparent py-10"
                    />
                  </TableCell>
                </TableRow>
              )}
              {recentPayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {(p.payment_date || "").slice(0, 10)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {partyName.get(`${p.party_kind}:${p.party_id}`) || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={p.direction === "in" ? "default" : "secondary"}
                    >
                      {p.direction === "in" ? "Received" : "Paid out"}
                    </Badge>
                  </TableCell>
                  <TableCell>{methodLabel(p.method)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.note}
                  </TableCell>
                  <TableCell
                    className={`cell-num font-medium ${p.direction === "in" ? "text-success" : "text-destructive"}`}
                  >
                    {fmtMoney(p.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        preset={preset}
        customers={customers}
        suppliers={suppliers}
      />
    </div>
  );
};

export default CreditorsDebtorsPage;
