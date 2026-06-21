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
import AgendaMotor from "@/pages/agenda/motor";
import RAS from "@/pages/ras";
import RASDetail from "@/pages/ras/detail";
import Stock from "@/pages/stock";
import Payments from "@/pages/payments";
import Professionals from "@/pages/professionals";
import Prescricao from "@/pages/prescricao";
import Pharmacies from "@/pages/pharmacies";
import Sncr from "@/pages/sncr";
import MegaAnamnese from "@/pages/mega-anamnese";
import Catalogos from "@/pages/catalogos";
import Exames from "@/pages/exames";
import CadastroExames from "@/pages/cadastros/exames";
import CadastroListas from "@/pages/cadastros/listas";
import CadastroClinicas from "@/pages/cadastros/clinicas";
import CadastroAgendasGoogle from "@/pages/cadastros/agendas-google";
import CadastroEquipe from "@/pages/cadastros/equipe";
import CadastroTextos from "@/pages/cadastros/textos";
import CadastroAuditoria from "@/pages/cadastros/auditoria";
import { CollaboratorGate } from "@/components/CollaboratorGate";
import { registerCollabTokenGetter } from "@/lib/collab-auth";
import Portal from "@/pages/portal";
import Agendar from "@/pages/agendar";
import Anamnese from "@/pages/anamnese";
import AnamneseV2 from "@/pages/anamnese-v2";
import AnamneseRevisao from "@/pages/anamnese-v2/revisao";
import Area from "@/pages/area";
import Entrada from "@/pages/entrada";
import Abertura from "@/pages/abertura";
import PawardsDemo from "@/pages/pawards-demo";
import TipografiaDemo from "@/pages/tipografia";
import OrcamentosList from "@/pages/orcamentos";
import MontagemOrcamento from "@/pages/orcamentos/novo";
import Parametrizacao from "@/pages/orcamentos/parametrizacao";
import Vitrine from "@/pages/orcamentos/vitrine";
import ApresentacaoOrcamento from "@/pages/orcamentos/apresentacao";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

// Portao do Colaborador (Onda 8.2): injeta o token HMAC do colaborador em toda
// chamada da API gerada (rotas protegidas exigem; demais ignoram).
registerCollabTokenGetter();

function Router() {
  return (
    <Switch>
      <Route path="/portal" component={Portal} />
      <Route path="/agendar" component={Agendar} />
      <Route path="/anamnese" component={Anamnese} />
      <Route path="/anamnese/v2" component={AnamneseV2} />
      <Route path="/area" component={Area} />
      <Route path="/entrada" component={Entrada} />
      <Route path="/abertura" component={Abertura} />
      <Route path="/pawards" component={PawardsDemo} />
      <Route path="/tipografia" component={TipografiaDemo} />
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

            <Route path="/orcamentos/parametrizacao" component={Parametrizacao} />
            <Route path="/orcamentos/vitrine" component={Vitrine} />
            <Route path="/orcamentos/novo" component={MontagemOrcamento} />
            <Route path="/orcamentos/:id/apresentacao" component={ApresentacaoOrcamento} />
            <Route path="/orcamentos" component={OrcamentosList} />
            
            <Route path="/agenda/motor" component={AgendaMotor} />
            <Route path="/agenda" component={Agenda} />
            
            <Route path="/ras" component={RAS} />
            <Route path="/ras/:id" component={RASDetail} />
            
            <Route path="/stock" component={Stock} />
            <Route path="/payments" component={Payments} />
            <Route path="/professionals" component={Professionals} />
            <Route path="/pharmacies" component={Pharmacies} />
            <Route path="/sncr" component={Sncr} />
            <Route path="/mega-anamnese" component={MegaAnamnese} />
            <Route path="/anamnese/revisao">
              <CollaboratorGate>
                <AnamneseRevisao />
              </CollaboratorGate>
            </Route>
            <Route path="/catalogos" component={Catalogos} />
            <Route path="/exames" component={Exames} />
            <Route path="/cadastros/:rest*">
              <CollaboratorGate>
                <Switch>
                  <Route path="/cadastros/exames" component={CadastroExames} />
                  <Route path="/cadastros/listas" component={CadastroListas} />
                  <Route path="/cadastros/clinicas" component={CadastroClinicas} />
                  <Route path="/cadastros/agendas-google" component={CadastroAgendasGoogle} />
                  <Route path="/cadastros/equipe" component={CadastroEquipe} />
                  <Route path="/cadastros/textos" component={CadastroTextos} />
                  <Route path="/cadastros/auditoria" component={CadastroAuditoria} />
                  <Route component={NotFound} />
                </Switch>
              </CollaboratorGate>
            </Route>
            
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
