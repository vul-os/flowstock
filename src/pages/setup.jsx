import React, { useState } from 'react';
import Logo from '@/assets/flowstock-logo.svg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/services/api';
import { useWorkspace } from '@/context/workspace-context';

/**
 * First-run screen: name the business and this branch. Every FlowStock
 * install is a branch node — the first one is usually "Head Office".
 */
const SetupScreen = () => {
  const { refresh } = useWorkspace();
  const [businessName, setBusinessName] = useState('');
  const [branchName, setBranchName] = useState('Head Office');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src={Logo} alt="FlowStock" className="mb-2 h-16 w-16" />
          <CardTitle className="text-2xl">Welcome to FlowStock</CardTitle>
          <CardDescription>
            Set up this branch. You can connect more branches later under
            Settings → Sync, and they will share stock even when offline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
};

export default SetupScreen;
