import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LangProvider } from "@/lib/i18n";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Releases from "@/pages/releases";
import Artists from "@/pages/artists";
import Labels from "@/pages/labels";
import Videos from "@/pages/videos";
import CRM from "@/pages/crm";
import Finance from "@/pages/finance";
import Splits from "@/pages/splits";
import Payouts from "@/pages/payouts";
import Publishing from "@/pages/publishing";
import Analytics from "@/pages/analytics";
import Distribution from "@/pages/distribution";
import Rights from "@/pages/rights";
import Communications from "@/pages/communications";
import Marketing from "@/pages/marketing";
import Automation from "@/pages/automation";
import Users from "@/pages/users";
import Settings from "@/pages/settings";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/distribution" component={Distribution} />
      <Route path="/delivery" component={Distribution} />
      <Route path="/releases" component={Releases} />
      <Route path="/artists" component={Artists} />
      <Route path="/labels" component={Labels} />
      <Route path="/videos" component={Videos} />
      <Route path="/users" component={Users} />
      <Route path="/publishing" component={Publishing} />
      <Route path="/rights" component={Rights} />
      <Route path="/crm" component={CRM} />
      <Route path="/communications" component={Communications} />
      <Route path="/marketing" component={Marketing} />
      <Route path="/finance" component={Finance} />
      <Route path="/splits" component={Splits} />
      <Route path="/payouts" component={Payouts} />
      <Route path="/automation" component={Automation} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LangProvider>
    </QueryClientProvider>
  );
}

export default App;
