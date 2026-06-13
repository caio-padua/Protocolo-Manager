import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout/Layout";

import Dashboard from "@/pages/dashboard";
import Clients from "@/pages/clients";
import ClientDetail from "@/pages/clients/detail";
import EditClient from "@/pages/clients/edit";
import NewClient from "@/pages/clients/new";
import Substances from "@/pages/substances";
import Protocols from "@/pages/protocols";
import ProtocolDetail from "@/pages/protocols/detail";
import NewProtocol from "@/pages/protocols/new";
import Agenda from "@/pages/agenda";
import RAS from "@/pages/ras";
import RASDetail from "@/pages/ras/detail";
import Stock from "@/pages/stock";
import Payments from "@/pages/payments";
import Professionals from "@/pages/professionals";
import Prescricao from "@/pages/prescricao";
import Portal from "@/pages/portal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/portal" component={Portal} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            
            <Route path="/clients" component={Clients} />
            <Route path="/clients/new" component={NewClient} />
            <Route path="/clients/:id/edit" component={EditClient} />
            <Route path="/clients/:id" component={ClientDetail} />
            
            <Route path="/substances" component={Substances} />

            <Route path="/prescricao" component={Prescricao} />
            
            <Route path="/protocols" component={Protocols} />
            <Route path="/protocols/new" component={NewProtocol} />
            <Route path="/protocols/:id" component={ProtocolDetail} />
            
            <Route path="/agenda" component={Agenda} />
            
            <Route path="/ras" component={RAS} />
            <Route path="/ras/:id" component={RASDetail} />
            
            <Route path="/stock" component={Stock} />
            <Route path="/payments" component={Payments} />
            <Route path="/professionals" component={Professionals} />
            
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
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
