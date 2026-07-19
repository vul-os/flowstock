import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Wrench } from "lucide-react";
import { api } from "@/services/api";
import { useTables, useWorkspace } from "@/context/workspace-context";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

const emptyForm = { name: "", description: "", hourly_rate: "" };

/**
 * Services are billable labour lines (repairs, cutting, installation) that can
 * appear on customer orders and purchase orders. They carry an hourly rate and
 * never affect stock.
 */
const ServicesPage = () => {
  const { data, loading } = useTables("services");
  const { fmtMoney } = useWorkspace();
  const services = useMemo(() => data.services || [], [data.services]);

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q),
    );
  }, [services, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (service) => {
    setEditing(service);
    setForm({
      name: service.name || "",
      description: service.description || "",
      hourly_rate: service.hourly_rate ?? "",
    });
    setDialogOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({
        description: "A service name is required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await api.putRow("services", editing?.id || null, {
        name: form.name.trim(),
        description: form.description.trim(),
        hourly_rate: Number(form.hourly_rate) || 0,
        created_at: editing?.created_at || new Date().toISOString(),
      });
      toast({ description: editing ? "Service updated." : "Service created." });
      setDialogOpen(false);
    } catch (err) {
      toast({ description: `Could not save: ${err}`, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteRow("services", deleteTarget.id);
      toast({ description: `${deleteTarget.name} was removed.` });
    } catch (err) {
      toast({
        description: `Could not delete: ${err}`,
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="text-sm text-muted-foreground">
            Billable labour you can add to orders and purchase orders.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New service
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Service catalog</CardTitle>
            <CardDescription>{services.length} services</CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search services…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Wrench className="h-8 w-8" />
              <p>
                {search ? "No services match your search." : "No services yet."}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openCreate}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Add your first service
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Hourly rate</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {s.description || "—"}
                    </TableCell>
                    <TableCell className="cell-num">
                      {fmtMoney(s.hourly_rate)}/h
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(s)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit service" : "New service"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="svc-name">Name</Label>
              <Input
                id="svc-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Power tool repair"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-desc">Description</Label>
              <Textarea
                id="svc-desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="What this service covers"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-rate">Hourly rate</Label>
              <Input
                id="svc-rate"
                type="number"
                min="0"
                step="0.01"
                value={form.hourly_rate}
                onChange={(e) =>
                  setForm({ ...form, hourly_rate: e.target.value })
                }
                placeholder="0.00"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Create service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} will be removed. Orders that already
              reference it keep their recorded amounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ServicesPage;
