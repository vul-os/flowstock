import React from 'react';
import { HashRouter as Router } from 'react-router-dom';
import AppRoutes from './routes';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import { WorkspaceProvider, useWorkspace } from '@/context/workspace-context';
import SetupScreen from '@/pages/setup';

const Gate = () => {
  const { loading, initialized } = useWorkspace();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading FlowStock…
      </div>
    );
  }
  if (!initialized) return <SetupScreen />;
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
};

const App = () => (
  <WorkspaceProvider>
    <ThemeProvider defaultTheme="light" storageKey="flowstock-theme">
      <Gate />
      <Toaster />
    </ThemeProvider>
  </WorkspaceProvider>
);

export default App;
