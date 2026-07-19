import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import SideNav from '../nav/side-nav';
import TopBar from '../nav/top-bar';

const MainLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar onMenuClick={() => setMobileOpen((v) => !v)} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r bg-muted/30 md:block">
          <SideNav onNavigate={() => {}} />
        </aside>
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/50 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-40 mt-14 w-60 overflow-y-auto border-r bg-background shadow-lg md:hidden">
              <SideNav onNavigate={() => setMobileOpen(false)} />
            </aside>
          </>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
