import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Watchlist from "@/pages/watchlist";
import RunScan from "@/pages/run-scan";
import Settings from "@/pages/settings";
import Analytics from "@/pages/analytics";
import Login from "@/pages/login";
import { useAuth } from "@/hooks/useAuth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <AuthGuard>
          <Dashboard />
        </AuthGuard>
      </Route>
      <Route path="/watchlist">
        <AuthGuard>
          <Watchlist />
        </AuthGuard>
      </Route>
      <Route path="/scan">
        <AuthGuard>
          <RunScan />
        </AuthGuard>
      </Route>
      <Route path="/settings">
        <AuthGuard>
          <Settings />
        </AuthGuard>
      </Route>
      <Route path="/analytics">
        <AuthGuard>
          <Analytics />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
