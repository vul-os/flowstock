import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SideNav from "../nav/side-nav";
import TopBar from "../nav/top-bar";

const MainLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar onMenuClick={() => setMobileOpen((v) => !v)} />
      <div className="relative flex flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border bg-muted/40 md:block">
          <SideNav onNavigate={() => {}} />
        </aside>
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-kraft-950/60 backdrop-blur-[2px] md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-40 mt-12 w-60 overflow-y-auto border-r border-border bg-card shadow-xl md:hidden">
              <SideNav onNavigate={() => setMobileOpen(false)} />
            </aside>
          </>
        )}
        <main className="relative flex-1 overflow-y-auto">
          {/* keyed on route so each page arrives with one quiet rise */}
          <div key={pathname} className="animate-fade-rise p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
