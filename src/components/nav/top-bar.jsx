import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Moon, Sun, RefreshCw, Building2, FlaskConical } from 'lucide-react';
import Logo from '@/assets/flowstock-logo.svg';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/components/theme-provider';
import { useWorkspace } from '@/context/workspace-context';
import { api } from '@/services/api';
import { toast } from '@/components/ui/use-toast';

const TopBar = ({ onMenuClick }) => {
  const { theme, setTheme } = useTheme();
  const { businessName, branchName, isDemo } = useWorkspace();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const results = await api.syncNow();
      if (results.length === 0) {
        toast({ description: 'No sync peers configured — add branches under Settings.' });
      } else {
        const ok = results.filter((r) => r.ok).length;
        const pulled = results.reduce((s, r) => s + (r.pulled || 0), 0);
        const pushed = results.reduce((s, r) => s + (r.pushed || 0), 0);
        toast({
          description: `Synced ${ok}/${results.length} peers — pushed ${pushed}, pulled ${pulled} changes.`,
          variant: ok === results.length ? 'default' : 'destructive',
        });
      }
    } catch (e) {
      toast({ description: `Sync failed: ${e}`, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <header className="z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <button
        className="text-muted-foreground hover:text-foreground md:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link to="/" className="flex items-center gap-2">
        <img src={Logo} alt="" className="h-7 w-7" />
        <span className="text-base font-semibold tracking-tight">FlowStock</span>
      </Link>
      <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
        <span className="text-border">/</span>
        <span>{businessName}</span>
        <Badge variant="outline" className="gap-1 font-normal">
          <Building2 className="h-3 w-3" />
          {branchName}
        </Badge>
        {isDemo && (
          <Badge variant="secondary" className="gap-1 font-normal">
            <FlaskConical className="h-3 w-3" />
            demo data
          </Badge>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sync now</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
};

export default TopBar;
