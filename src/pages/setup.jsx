import { useState } from "react";
import { Link2, Store } from "lucide-react";
import Logo from "@/assets/flowstock-logo.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, isDemo } from "@/services/api";
import { useWorkspace } from "@/context/workspace-context";

/**
 * First-run screen. Two paths:
 *  - Create a new workspace (the first branch of a business).
 *  - Join an existing workspace (a second/third branch pairs into the first
 *    over the sync mesh, adopting its data). Not available in demo mode.
 */
const SetupScreen = () => {
  const { refresh } = useWorkspace();

  // Create
  const [businessName, setBusinessName] = useState("");
  const [branchName, setBranchName] = useState("Head Office");

  // Join
  const [joinBusiness, setJoinBusiness] = useState("");
  const [joinBranch, setJoinBranch] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [joinSecret, setJoinSecret] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async (e) => {
    e.preventDefault();
    if (!businessName.trim() || !branchName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.setupWorkspace(businessName.trim(), branchName.trim());
      await refresh();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  const join = async (e) => {
    e.preventDefault();
    if (!joinUrl.trim() || !joinSecret.trim() || !joinBranch.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.joinWorkspace({
        url: joinUrl.trim(),
        secret: joinSecret.trim(),
        businessName: joinBusiness.trim(),
        branchName: joinBranch.trim(),
      });
      await refresh();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* a wash of flow-teal bleeding off the top corner — depth without noise */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary/[0.07] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 -right-32 h-[24rem] w-[24rem] rounded-full bg-signal/[0.06] blur-3xl"
      />

      <div className="relative w-full max-w-md animate-fade-rise">
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src={Logo}
            alt=""
            className="mb-3 h-14 w-14 rounded-xl shadow-md"
          />
          <p className="stencil-label mb-1.5">First run</p>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Flow<span className="text-primary">Stock</span>
          </h1>
          <p className="page-subtitle max-w-sm">
            Start a new business, or connect this device to an existing branch
            so they share stock — even when one goes offline.
          </p>
        </div>

        <Card className="shadow-lg">
          <CardContent className="pt-5">
            <Tabs defaultValue="create">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create" className="gap-1.5">
                  <Store className="h-3.5 w-3.5" />
                  New workspace
                </TabsTrigger>
                <TabsTrigger value="join" disabled={isDemo} className="gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  Join a branch
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create">
                <form onSubmit={create} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="business">Business name</Label>
                    <Input
                      id="business"
                      placeholder="e.g. Khumalo Hardware & Tools"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="branch">This branch</Label>
                    <Input
                      id="branch"
                      placeholder="e.g. Head Office"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Stock is tracked per branch. You can add more later.
                    </p>
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={busy || !businessName.trim()}
                  >
                    {busy ? "Setting up…" : "Create workspace"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="join">
                <form onSubmit={join} className="space-y-4">
                  <Alert variant="flow">
                    <AlertDescription>
                      Enter another branch&apos;s address and the shared secret
                      from its Settings → Sync. This device will pull the
                      existing catalog and stock, then join as a new branch.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-branch">Name this branch</Label>
                    <Input
                      id="join-branch"
                      placeholder="e.g. Cape Town"
                      value={joinBranch}
                      onChange={(e) => setJoinBranch(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-url">Existing branch URL</Label>
                    <Input
                      id="join-url"
                      className="font-mono"
                      placeholder="http://192.168.1.20:8787"
                      value={joinUrl}
                      onChange={(e) => setJoinUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-secret">Shared secret</Label>
                    <Input
                      id="join-secret"
                      type="password"
                      className="font-mono"
                      placeholder="from the other branch's Settings → Sync"
                      value={joinSecret}
                      onChange={(e) => setJoinSecret(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-business">
                      Business name (optional)
                    </Label>
                    <Input
                      id="join-business"
                      placeholder="shown in this device's top bar"
                      value={joinBusiness}
                      onChange={(e) => setJoinBusiness(e.target.value)}
                    />
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      busy ||
                      !joinUrl.trim() ||
                      !joinSecret.trim() ||
                      !joinBranch.trim()
                    }
                  >
                    {busy ? "Joining…" : "Join workspace"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Everything stays on this device. No account, no cloud.
        </p>
      </div>
    </div>
  );
};

export default SetupScreen;
