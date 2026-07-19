import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wand2,
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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/services/api";
import { useTables, useWorkspace } from "@/context/workspace-context";

const APP_VERSION = "1.0.0";

const errMsg = (e) => (typeof e === "string" ? e : e?.message || String(e));

const fmtWhen = (iso) => {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
};

// ── Business ─────────────────────────────────────────────────────────────────

function BusinessCard() {
  const { businessName, branchName, currency, taxRate, refresh } =
    useWorkspace();
  const { toast } = useToast();
  const [form, setForm] = useState({
    business_name: businessName,
    branch_name: branchName,
    currency_code: currency.code,
    currency_symbol: currency.symbol,
    tax_rate: String(taxRate),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      business_name: businessName,
      branch_name: branchName,
      currency_code: currency.code,
      currency_symbol: currency.symbol,
      tax_rate: String(taxRate),
    });
  }, [businessName, branchName, currency.code, currency.symbol, taxRate]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({
        business_name: form.business_name.trim(),
        branch_name: form.branch_name.trim(),
        currency_code: form.currency_code.trim().toUpperCase(),
        currency_symbol: form.currency_symbol.trim(),
        tax_rate: Number(form.tax_rate) || 0,
      });
      await refresh();
      toast({ title: "Business settings saved" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save settings",
        description: errMsg(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business</CardTitle>
        <CardDescription>
          Your business identity and defaults used on documents and totals.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business_name">Business name</Label>
              <Input
                id="business_name"
                value={form.business_name}
                onChange={set("business_name")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch_name">Branch name (this device)</Label>
              <Input
                id="branch_name"
                value={form.branch_name}
                onChange={set("branch_name")}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="currency_code">Currency code</Label>
              <Input
                id="currency_code"
                value={form.currency_code}
                onChange={set("currency_code")}
                placeholder="ZAR"
                maxLength={3}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency_symbol">Currency symbol</Label>
              <Input
                id="currency_symbol"
                value={form.currency_symbol}
                onChange={set("currency_symbol")}
                placeholder="R"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_rate">Tax rate (%)</Label>
              <Input
                id="tax_rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.tax_rate}
                onChange={set("tax_rate")}
                required
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save business settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Branches ─────────────────────────────────────────────────────────────────

function BranchDialog({ open, onOpenChange, branch }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: branch?.name || "",
        code: branch?.code || "",
        address: branch?.address || "",
        active: branch ? !!branch.is_active : true,
      });
    }
  }, [open, branch]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.putRow("branches", branch?.id, {
        name: form.name.trim(),
        code: form.code.trim(),
        address: form.address.trim(),
        is_active: form.active ? 1 : 0,
      });
      toast({ title: branch ? "Branch updated" : "Branch created" });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save branch",
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
          <DialogTitle>{branch ? "Edit branch" : "New branch"}</DialogTitle>
          <DialogDescription>
            Branches are locations that hold stock. Every FlowStock install is
            one branch — create the record here, then pair the devices under
            Sync.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="br_name">Name</Label>
              <Input
                id="br_name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Main store"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br_code">Code</Label>
              <Input
                id="br_code"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value }))
                }
                placeholder="MAIN"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="br_address">Address</Label>
            <Input
              id="br_address"
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
              placeholder="12 Long Street, Cape Town"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: !!v }))}
            />
            Active
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {branch ? "Save changes" : "Create branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BranchesCard() {
  const { data, loading } = useTables("branches");
  const { branchId } = useWorkspace();
  const { toast } = useToast();
  const [dialog, setDialog] = useState({ open: false, branch: null });

  const branches = data.branches || [];

  const remove = async (branch) => {
    if (
      !window.confirm(
        `Delete branch "${branch.name}"? Its stock history stays in the ledger.`,
      )
    )
      return;
    try {
      await api.deleteRow("branches", branch.id);
      toast({ title: "Branch deleted" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not delete branch",
        description: errMsg(err),
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Branches</CardTitle>
            <CardDescription>
              Each FlowStock install is one branch. Create the branch record
              here, then pair the devices under Sync so they exchange changes.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setDialog({ open: true, branch: null })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add branch
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : branches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No branches yet. Add your first branch to start tracking stock per
            location.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      {b.name}
                      {b.id === branchId && (
                        <Badge variant="secondary" className="ml-2">
                          this device
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{b.code || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.address || "—"}
                    </TableCell>
                    <TableCell>
                      {b.is_active ? (
                        <Badge variant="outline">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDialog({ open: true, branch: b })}
                        title="Edit branch"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(b)}
                        title="Delete branch"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <BranchDialog
          open={dialog.open}
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
          branch={dialog.branch}
        />
      </CardContent>
    </Card>
  );
}

// ── Sync ─────────────────────────────────────────────────────────────────────

function PeerDialog({ open, onOpenChange, peer, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", url: "", enabled: true });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: peer?.name || "",
        url: peer?.url || "",
        enabled: peer ? !!peer.enabled : true,
      });
    }
  }, [open, peer]);

  const test = async () => {
    setTesting(true);
    try {
      const ok = await api.testPeer(form.url.trim());
      if (ok)
        toast({ title: "Connection OK", description: "The peer answered." });
      else
        toast({
          variant: "destructive",
          title: "Peer not reachable",
          description:
            "Check the URL, the peer is listening, and both share the same secret.",
        });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Connection failed",
        description: errMsg(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.savePeer({
        id: peer?.id,
        name: form.name.trim(),
        url: form.url.trim(),
        enabled: form.enabled,
      });
      toast({ title: peer ? "Peer updated" : "Peer added" });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save peer",
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
          <DialogTitle>{peer ? "Edit peer" : "Add peer"}</DialogTitle>
          <DialogDescription>
            A peer is another FlowStock device on your network. Use its address
            (the same host and port it serves FlowStock on), e.g.
            http://192.168.1.20:8787.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="peer_name">Name</Label>
            <Input
              id="peer_name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Warehouse laptop"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="peer_url">URL</Label>
            <Input
              id="peer_url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="http://192.168.1.20:8787"
              required
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.enabled}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, enabled: !!v }))
                }
              />
              Enabled
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={test}
              disabled={testing || !form.url.trim()}
            >
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Test connection
            </Button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !form.name.trim() || !form.url.trim()}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {peer ? "Save changes" : "Add peer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SyncCard() {
  const { toast } = useToast();
  // port/bindAddr are round-tripped for backend compatibility but not editable:
  // sync shares the app's own HTTP port, so peers reach this device at the same
  // address the UI is served on (see syncAddress below).
  const [form, setForm] = useState({
    listen: false,
    port: "8787",
    bindAddr: "0.0.0.0",
    secret: "",
    folder: "",
  });
  const syncAddress =
    typeof window !== "undefined" && window.location
      ? window.location.origin
      : "";
  const [folderSyncing, setFolderSyncing] = useState(false);
  const [status, setStatus] = useState(null); // {listening, bind_addr, port}
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [peers, setPeers] = useState([]);
  const [peerDialog, setPeerDialog] = useState({ open: false, peer: null });
  const [syncing, setSyncing] = useState(null); // peer id or 'all'

  const applyCfg = useCallback((cfg) => {
    setForm({
      listen: !!cfg.listen,
      port: String(cfg.port ?? 8787),
      bindAddr: cfg.bind_addr || "0.0.0.0",
      secret: cfg.secret || "",
      folder: cfg.folder || "",
    });
    setStatus({ listening: !!cfg.listening });
  }, []);

  const loadPeers = useCallback(async () => {
    try {
      setPeers(await api.listPeers());
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not load peers",
        description: errMsg(err),
      });
    }
  }, [toast]);

  useEffect(() => {
    let alive = true;
    api
      .getSyncSettings()
      .then((cfg) => {
        if (!alive) return;
        applyCfg(cfg);
        setLoadingCfg(false);
      })
      .catch((err) => {
        if (!alive) return;
        setLoadingCfg(false);
        toast({
          variant: "destructive",
          title: "Could not load sync settings",
          description: errMsg(err),
        });
      });
    loadPeers();
    return () => {
      alive = false;
    };
  }, [applyCfg, loadPeers, toast]);

  const generateSecret = async () => {
    try {
      const secret = await api.newSyncSecret();
      setForm((f) => ({ ...f, secret }));
      setShowSecret(true);
      toast({
        title: "New secret generated",
        description:
          "Save sync settings, then set the same secret on every peer.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not generate secret",
        description: errMsg(err),
      });
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(form.secret);
      toast({ title: "Secret copied to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Could not copy to clipboard" });
    }
  };

  const saveCfg = async (e) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      const cfg = await api.setSyncSettings({
        listen: form.listen,
        port: Number(form.port) || 7365,
        bindAddr: form.bindAddr.trim() || "0.0.0.0",
        secret: form.secret.trim(),
        folder: form.folder.trim(),
      });
      applyCfg(cfg);
      toast({ title: "Sync settings saved" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not apply sync settings",
        description: errMsg(err),
      });
    } finally {
      setSavingCfg(false);
    }
  };

  const runSync = async (peerId) => {
    setSyncing(peerId || "all");
    try {
      const results = await api.syncNow(peerId);
      if (results.length === 0) {
        toast({ title: "Nothing to sync", description: "No enabled peers." });
      } else {
        const failed = results.filter((r) => !r.ok);
        if (failed.length === 0) {
          const pushed = results.reduce((s, r) => s + (r.pushed || 0), 0);
          const pulled = results.reduce((s, r) => s + (r.pulled || 0), 0);
          toast({
            title: "Sync complete",
            description: `Pushed ${pushed} and pulled ${pulled} change${pushed + pulled === 1 ? "" : "s"}.`,
          });
        } else {
          toast({
            variant: "destructive",
            title: `Sync failed for ${failed.length} peer${failed.length === 1 ? "" : "s"}`,
            description:
              failed
                .map((r) => r.error)
                .filter(Boolean)
                .join("; ") || "Unknown error",
          });
        }
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: errMsg(err),
      });
    } finally {
      setSyncing(null);
      loadPeers();
    }
  };

  const runFolderSync = async () => {
    setFolderSyncing(true);
    try {
      const res = await api.folderSync();
      toast({
        title: "Folder sync complete",
        description: `Exported ${res.exported || 0}, imported ${res.imported || 0} change${
          (res.exported || 0) + (res.imported || 0) === 1 ? "" : "s"
        } across ${res.files || 0} peer file${res.files === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Folder sync failed",
        description: errMsg(err),
      });
    } finally {
      setFolderSyncing(false);
    }
  };

  const [compacting, setCompacting] = useState(false);
  const runCompact = async () => {
    setCompacting(true);
    try {
      const res = await api.compact();
      toast({
        title: "Compaction complete",
        description: `Wrote a checksummed snapshot and pruned ${res.pruned || 0} op${
          res.pruned === 1 ? "" : "s"
        } every peer has acknowledged.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Compaction failed",
        description: errMsg(err),
      });
    } finally {
      setCompacting(false);
    }
  };

  const removePeer = async (peer) => {
    if (!window.confirm(`Remove peer "${peer.name}"?`)) return;
    try {
      await api.deletePeer(peer.id);
      toast({ title: "Peer removed" });
      loadPeers();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not remove peer",
        description: errMsg(err),
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync</CardTitle>
        <CardDescription>
          Peers exchange changes whenever they can reach each other; a branch
          that was offline simply catches up the next time it connects. Share
          the secret once to pair a branch — after that, devices authenticate
          each other by cryptographic key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadingCfg ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={saveCfg} className="space-y-4">
            <div
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                status?.listening
                  ? "border-success/30 bg-success-muted"
                  : "border-border bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  {status?.listening && (
                    <span className="absolute inline-flex h-full w-full animate-flow-pulse rounded-full bg-success" />
                  )}
                  <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                      status?.listening
                        ? "bg-success"
                        : "bg-muted-foreground/40"
                    }`}
                  />
                </span>
                <div>
                  <p className="stencil-label">This device</p>
                  <p className="text-sm font-medium">
                    {status?.listening
                      ? "Accepting sync connections"
                      : "Not advertised to other branches"}
                  </p>
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.listen}
                onCheckedChange={(v) => setForm((f) => ({ ...f, listen: !!v }))}
              />
              Accept sync connections from other devices
            </label>
            <div className="space-y-2">
              <Label htmlFor="sync_addr">Address for peers</Label>
              <div className="flex gap-2">
                <Input
                  id="sync_addr"
                  value={syncAddress}
                  readOnly
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(syncAddress);
                      toast({ title: "Address copied to clipboard" });
                    } catch {
                      toast({
                        variant: "destructive",
                        title: "Could not copy to clipboard",
                      });
                    }
                  }}
                  disabled={!syncAddress}
                  title="Copy address"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Other branches add this exact address as a peer. Sync shares the
                app's own port — there is no separate sync port. To be reachable
                across the LAN, run FlowStock with host{" "}
                <span className="font-mono">0.0.0.0</span> (see Configuration).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync_secret">Shared secret</Label>
              <div className="flex gap-2">
                <Input
                  id="sync_secret"
                  type={showSecret ? "text" : "password"}
                  value={form.secret}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, secret: e.target.value }))
                  }
                  placeholder="Generate or paste the secret shared by all branches"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowSecret((s) => !s)}
                  title={showSecret ? "Hide secret" : "Show secret"}
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copySecret}
                  disabled={!form.secret}
                  title="Copy secret"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateSecret}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Give a new branch this secret once, to pair it; from then on
                devices authenticate by key and the secret is no longer the
                gate. Accepting sync connections is refused without a secret
                set.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync_folder">Sync folder (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="sync_folder"
                  value={form.folder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, folder: e.target.value }))
                  }
                  placeholder="e.g. ~/Dropbox/flowstock  ·  /Volumes/USB/flowstock"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={runFolderSync}
                  disabled={folderSyncing || !form.folder.trim()}
                  title="Export this device's changes and import every other device's"
                >
                  {folderSyncing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sync folder now
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A shared folder (Dropbox, Google Drive, Syncthing, a NAS mount,
                or a USB stick) is an alternative to networking: each device
                writes only its own
                <span className="font-mono"> ops-&lt;id&gt;.jsonl</span> file,
                so file sync never conflicts. Point every branch at the same
                folder — no ports, no secret required for this path. Save first
                to enable it.
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingCfg}>
                {savingCfg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save sync settings
              </Button>
            </div>
          </form>
        )}

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="stencil-label">Peers</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={runCompact}
                disabled={compacting}
                title="Snapshot state and prune ops every peer has acknowledged"
              >
                {compacting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Compact
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runSync(null)}
                disabled={syncing !== null || peers.length === 0}
              >
                {syncing === "all" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sync all now
              </Button>
              <Button
                size="sm"
                onClick={() => setPeerDialog({ open: true, peer: null })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add peer
              </Button>
            </div>
          </div>
          {peers.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No peers yet"
              description="Add the other branch devices to start syncing. Share this device's address and secret once to pair them."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Last sync</TableHead>
                    <TableHead>Last status</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {peers.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.name}
                        {!p.url && (
                          <Badge
                            variant="outline"
                            className="ml-2"
                            title="This device paired to us; we authenticate it but do not dial it."
                          >
                            inbound
                          </Badge>
                        )}
                        {!p.enabled && (
                          <Badge variant="secondary" className="ml-2">
                            disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.url || (p.has_key ? "key enrolled" : "—")}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {fmtWhen(p.last_sync_at)}
                      </TableCell>
                      <TableCell className="max-w-56" title={p.last_status}>
                        {p.last_status ? (
                          <Badge
                            variant={
                              /ok|success|synced/i.test(p.last_status)
                                ? "success"
                                : "danger"
                            }
                            className="max-w-full truncate"
                          >
                            {p.last_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => runSync(p.id)}
                          disabled={syncing !== null || !p.enabled || !p.url}
                          title={
                            p.url
                              ? "Sync now"
                              : "Inbound peer — nothing to dial"
                          }
                        >
                          {syncing === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPeerDialog({ open: true, peer: p })}
                          title="Edit peer"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePeer(p)}
                          title="Remove peer"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <PeerDialog
          open={peerDialog.open}
          onOpenChange={(open) => setPeerDialog((d) => ({ ...d, open }))}
          peer={peerDialog.peer}
          onSaved={loadPeers}
        />
      </CardContent>
    </Card>
  );
}

// ── About ────────────────────────────────────────────────────────────────────

function AboutCard() {
  const { nodeId, isDemo } = useWorkspace();
  return (
    <Card>
      <CardHeader>
        <CardTitle>About</CardTitle>
        <CardDescription>
          FlowStock — offline-first multi-branch inventory.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-medium">{APP_VERSION}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Node ID</dt>
            <dd className="font-mono text-xs">{nodeId || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Data</dt>
            <dd>Stored locally in the app data directory on this device.</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Project</dt>
            <dd className="space-x-3">
              <a
                href="https://github.com/vul-os/flowstock"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                github.com/vul-os/flowstock
              </a>
              <a
                href="https://vulos.org"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Part of VulOS — vulos.org
              </a>
            </dd>
          </div>
        </dl>
        {isDemo && (
          <p className="mt-4 rounded-md border border-signal/40 bg-signal-muted px-3 py-2 text-sm text-signal-text">
            Demo mode: data lives in this browser session only and sync is
            simulated. Run the desktop app for real storage and branch-to-branch
            sync.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const SettingsPage = () => (
  <div className="mx-auto max-w-4xl space-y-6">
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">
        Business details, branches and device sync.
      </p>
    </div>
    <BusinessCard />
    <BranchesCard />
    <SyncCard />
    <AboutCard />
  </div>
);

export default SettingsPage;
