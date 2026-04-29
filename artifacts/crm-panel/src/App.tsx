import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LangProvider } from "@/lib/i18n";
import { AuthProvider, useAuth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import AdminSignups from "@/pages/admin/signups";
import AdminKyc from "@/pages/admin/kyc";
import AdminAudit from "@/pages/admin/audit";

import Dashboard from "@/pages/dashboard";
import Releases from "@/pages/releases";
import ReleaseDetail from "@/pages/releases/[id]";
import CreateRelease from "@/pages/releases/new";
import BulkUploadReleases from "@/pages/releases/bulk";
import TransferTrack from "@/pages/releases/transfer";
import NewImport from "@/pages/releases/transfer/new";
import Artists from "@/pages/artists";
import Labels from "@/pages/labels";
import CRM from "@/pages/crm";
import Finance from "@/pages/finance";
import FinanceImport from "@/pages/finance/import";
import FinanceUnmatched from "@/pages/finance/unmatched";
import Royalties from "@/pages/royalties";
import Splits from "@/pages/splits";
import Payouts from "@/pages/payouts";
import Publishing from "@/pages/publishing";
import Rights from "@/pages/rights";
import Analytics from "@/pages/analytics";
import Distribution from "@/pages/distribution";
import Users from "@/pages/users";
import Settings from "@/pages/settings";
import ProfilePage from "@/pages/profile";
import SupportPage from "@/pages/support";

const queryClient = new QueryClient();

function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Route path={path}><Redirect to="/login" /></Route>;

  const allowed = canAccess(user.role, path);
  if (!allowed) return <Route path={path}><Redirect to="/" /></Route>;

  return (
    <Route path={path}>
      <Component />
    </Route>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to="/" /> : <Login />}
      </Route>

      {/* Public signup — намеренно ВНЕ ProtectedRoute. Залогиненных
          пользователей редиректим в дашборд, чтобы случайный заход не
          путал интерфейс. */}
      <Route path="/signup">
        {user ? <Redirect to="/" /> : <Signup />}
      </Route>

      <ProtectedRoute path="/"               component={Dashboard} />
      <ProtectedRoute path="/analytics"      component={Analytics} />
      <ProtectedRoute path="/distribution"   component={Distribution} />
      <ProtectedRoute path="/releases"                  component={Releases} />
      <ProtectedRoute path="/releases/new"              component={CreateRelease} />
      <ProtectedRoute path="/releases/bulk"             component={BulkUploadReleases} />
      <ProtectedRoute path="/releases/transfer"         component={TransferTrack} />
      <ProtectedRoute path="/releases/transfer/new"     component={NewImport} />
      <ProtectedRoute path="/releases/:id"              component={ReleaseDetail} />
      <ProtectedRoute path="/artists"        component={Artists} />
      <ProtectedRoute path="/labels"         component={Labels} />
      <ProtectedRoute path="/users"          component={Users} />
      <ProtectedRoute path="/publishing"     component={Publishing} />
      <ProtectedRoute path="/rights"         component={Rights} />
      <ProtectedRoute path="/crm"            component={CRM} />
      <ProtectedRoute path="/royalties"      component={Royalties} />
      <ProtectedRoute path="/finance/import"    component={FinanceImport} />
      <ProtectedRoute path="/finance/unmatched" component={FinanceUnmatched} />
      <ProtectedRoute path="/finance"        component={Finance} />
      <ProtectedRoute path="/splits"         component={Splits} />
      <ProtectedRoute path="/payouts"        component={Payouts} />
      <ProtectedRoute path="/settings"       component={Settings} />
      <ProtectedRoute path="/profile"        component={ProfilePage} />
      <ProtectedRoute path="/support"        component={SupportPage} />

      {/* Task #6 — admin/manager only (gated через permissions.ts) */}
      <ProtectedRoute path="/admin/signups"  component={AdminSignups} />
      <ProtectedRoute path="/admin/kyc"      component={AdminKyc} />
      <ProtectedRoute path="/admin/audit"    component={AdminAudit} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </LangProvider>
    </QueryClientProvider>
  );
}

export default App;
