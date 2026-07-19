import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Menu,
  Moon,
  Sun,
  RefreshCw,
  Building2,
  FlaskConical,
} from "lucide-react";
import Logo from "@/assets/flowstock-logo.svg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";
import { useWorkspace } from "@/context/workspace-context";
import { api } from "@/services/api";
import { toast } from "@/components/ui/use-toast";

const TopBar = ({ onMenuClick }) => {
  const { theme, setTheme } = useTheme();
  const { businessName, branchName, isDemo } = useWorkspace();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const results = await api.syncNow();
      if (results.length === 0) {
        toast({
          description:
            "No sync peers configured — add branches under Settings.",
        });
      } else {
        const ok = results.filter((r) => r.ok).length;
        const pulled = results.reduce((s, r) => s + (r.pulled || 0), 0);
        const pushed = results.reduce((s, r) => s + (r.pushed || 0), 0);
        toast({
          description: `Synced ${ok}/${results.length} peers — pushed ${pushed}, pulled ${pulled} changes.`,
          variant: ok === results.length ? "success" : "destructive",
        });
      }
    } catch (e) {
      toast({ description: `Sync failed: ${e}`, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const isDark = theme === "dark";

  return (
    <header className="z-40 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3 shadow-xs md:px-4">
      <button
        className="rounded-md p-1 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground md:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Link
        to="/"
        className="flex items-center gap-2"
        aria-label="FlowStock home"
      >
        <img src={Logo} alt="" className="h-6 w-6 rounded-[5px]" />
        <span className="text-base font-bold tracking-[-0.02em]">
          Flow<span className="text-primary">Stock</span>
        </span>
      </Link>

      {/* workspace breadcrumb — which business, which branch, is it demo data */}
      <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
        <span aria-hidden="true" className="text-border">
          /
        </span>
        <span className="font-medium text-foreground">{businessName}</span>
        <Badge
          variant="outline"
          className="gap-1 font-mono text-2xs font-medium"
        >
          <Building2 className="h-3 w-3" />
          {branchName}
        </Badge>
        {isDemo && (
          <Badge variant="signal" className="gap-1">
            <FlaskConical className="h-3 w-3" />
            demo data
          </Badge>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
        >
          <RefreshCw className={syncing ? "animate-spin" : undefined} />
          <span className="hidden sm:inline">
            {syncing ? "Syncing" : "Sync now"}
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle theme"
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
};

export default TopBar;
