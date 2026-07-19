import React, { useState } from 'react';
import Logo from '@/assets/flowstock-logo.svg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, isDemo } from '@/services/api';
import { useWorkspace } from '@/context/workspace-context';

/**
 * First-run screen. Two paths:
 *  - Create a new workspace (the first branch of a business).
 *  - Join an existing workspace (a second/third branch pairs into the first
 *    over the sync mesh, adopting its data). Not available in demo mode.
 */
const SetupScreen = () => {
  const { refresh } = useWorkspace();

  // Create
  const [businessName, setBusinessName] = useState('');
  const [branchName, setBranchName] = useState('Head Office');

  // Join
  const [joinBusiness, setJoinBusiness] = useState('');
  const [joinBranch, setJoinBranch] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [joinSecret, setJoinSecret] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async (e) => {
    e.preventDefault();
    if (!businessName.trim() || !branchName.trim()) return;
    setBusy(true);
    setError('');
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
    setError('');
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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src={Logo} alt="FlowStock" className="mb-2 h-16 w-16" />
          <CardTitle className="text-2xl">Welcome to FlowStock</CardTitle>
          <CardDescription>
            Start a new business, or connect this device to an existing branch so
            they share stock — even when one goes offline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">New workspace</TabsTrigger>
              <TabsTrigger value="join" disabled={isDemo}>
                Join a branch
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <form onSubmit={create} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="business">Business name</Label>
                  <Input
                    id="business"
                    placeholder="e.g. Khumalo Hardware & Tools"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch">This branch</Label>
                  <Input
                    id="branch"
                    placeholder="e.g. Head Office"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy || !businessName.trim()}>
                  {busy ? 'Setting up…' : 'Create workspace'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="join">
              <form onSubmit={join} className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Enter another branch's address and the shared secret from its
                  Settings → Sync. This device will pull the existing catalog and
                  stock, then join as a new branch.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="join-branch">Name this branch</Label>
                  <Input
                    id="join-branch"
                    placeholder="e.g. Cape Town"
                    value={joinBranch}
                    onChange={(e) => setJoinBranch(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-url">Existing branch URL</Label>
                  <Input
                    id="join-url"
                    placeholder="http://192.168.1.20:8787"
                    value={joinUrl}
                    onChange={(e) => setJoinUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-secret">Shared secret</Label>
                  <Input
                    id="join-secret"
                    type="password"
                    placeholder="from the other branch's Settings → Sync"
                    value={joinSecret}
                    onChange={(e) => setJoinSecret(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-business">Business name (optional)</Label>
                  <Input
                    id="join-business"
                    placeholder="shown in this device's top bar"
                    value={joinBusiness}
                    onChange={(e) => setJoinBusiness(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || !joinUrl.trim() || !joinSecret.trim() || !joinBranch.trim()}
                >
                  {busy ? 'Joining…' : 'Join workspace'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default SetupScreen;
