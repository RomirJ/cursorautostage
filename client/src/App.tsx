import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/Dashboard";
import Landing from "@/pages/Landing";
import Scheduling from "@/pages/Scheduling";
import Analytics from "@/pages/Analytics";
import Monetization from "@/pages/Monetization";
import Revenue from "@/pages/Revenue";
import Settings from "@/pages/Settings";
import ShortsGenerator from "@/pages/ShortsGenerator";
import Engagement from "@/pages/Engagement";
import Billing from "@/pages/Billing";
import UploadPage from "@/pages/Upload";
import LibraryPage from "@/pages/Library";
import AccountsPage from "@/pages/Accounts";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/library" component={LibraryPage} />
      <Route path="/accounts" component={AccountsPage} />
      <Route path="/scheduling" component={Scheduling} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/monetization" component={Monetization} />
      <Route path="/revenue" component={Revenue} />
      <Route path="/engagement" component={Engagement} />
      <Route path="/shorts" component={ShortsGenerator} />
      <Route path="/billing" component={Billing} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
