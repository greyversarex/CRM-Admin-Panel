import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Catalog from "@/pages/catalog";
import Releases from "@/pages/releases";
import Artists from "@/pages/artists";
import Labels from "@/pages/labels";
import CRM from "@/pages/crm";
import Finance from "@/pages/finance";
import Splits from "@/pages/splits";
import Payouts from "@/pages/payouts";
import Publishing from "@/pages/publishing";
import Analytics from "@/pages/analytics";
import Delivery from "@/pages/delivery";
import Users from "@/pages/users";
import Settings from "@/pages/settings";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/catalog" component={Catalog} />
      <Route path="/releases" component={Releases} />
      <Route path="/artists" component={Artists} />
      <Route path="/labels" component={Labels} />
      <Route path="/crm" component={CRM} />
      <Route path="/finance" component={Finance} />
      <Route path="/splits" component={Splits} />
      <Route path="/payouts" component={Payouts} />
      <Route path="/publishing" component={Publishing} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/delivery" component={Delivery} />
      <Route path="/users" component={Users} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;