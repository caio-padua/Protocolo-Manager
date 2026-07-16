import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
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
import Dieta from "@/pages/dieta";
import Treino from "@/pages/treino";
import Craniotomia from "@/pages/craniotomia";
import Cockpit from "@/pages/cockpit";
import CockpitCliente from "@/pages/cockpit-cliente";
import CockpitAnamnese from "@/pages/cockpit-anamnese";
import Cartorio from "@/pages/cartorio";
import Exames from "@/pages/exames";
import CadastroExames from "@/pages/cadastros/exames";
import CadastroConfigExames from "@/pages/cadastros/config-exames";
import CadastroConsoleExames from "@/pages/cadastros/console-exames";
import CadastroListas from "@/pages/cadastros/listas";
import CadastroClinicas from "@/pages/cadastros/clinicas";
import CadastroEmpresas from "@/pages/cadastros/empresas";
import CadastroAgendasGoogle from "@/pages/cadastros/agendas-google";
import CadastroEquipe from "@/pages/cadastros/equipe";
import CadastroTextos from "@/pages/cadastros/textos";
import CadastroAuditoria from "@/pages/cadastros/auditoria";
import ConfigEmpresa from "@/pages/configuracoes/empresa";
import ConfigCertificados from "@/pages/configuracoes/certificados";
import ConfigAssinatura from "@/pages/configuracoes/assinatura";
import ConfigPagamentos from "@/pages/configuracoes/pagamentos";
import FinanceiroConciliacao from "@/pages/financeiro/conciliacao";
import FinanceiroMetas from "@/pages/financeiro/metas";
import FinanceiroCobranca from "@/pages/financeiro/cobranca";
import FinanceiroNfse from "@/pages/financeiro/nfse";
import FinanceiroBancos from "@/pages/financeiro/bancos";
import FinanceiroTransferencias from "@/pages/financeiro/transferencias";
import { CollaboratorGate } from "@/components/CollaboratorGate";
import { registerCollabTokenGetter } from "@/lib/collab-auth";
import Portal from "@/pages/portal";
import Foto from "@/pages/foto";
import Cadastro from "@/pages/cadastro";
import Agendar from "@/pages/agendar";
import AgendarStatus from "@/pages/agendar-status";
import Anamnese from "@/pages/anamnese";
import AnamneseV2 from "@/pages/anamnese-v2";
import AnamneseRevisao from "@/pages/anamnese-v2/revisao";
import Area from "@/pages/area";
import Entrada from "@/pages/entrada";
import VitrinePublica from "@/pages/vitrine";
import Abertura from "@/pages/abertura";
import MarcaMolde from "@/pages/marca-molde";
import PawardsDemo from "@/pages/pawards-demo";
import TipografiaDemo from "@/pages/tipografia";
import OrcamentosList from "@/pages/orcamentos";
import MontagemOrcamento from "@/pages/orcamentos/novo";
import Parametrizacao from "@/pages/orcamentos/parametrizacao";
import Vitrine from "@/pages/orcamentos/vitrine";
import ApresentacaoOrcamento from "@/pages/orcamentos/apresentacao";
import ComunicacaoGateways from "@/pages/comunicacao/gateways";
import ComunicacaoMensageria from "@/pages/comunicacao/mensageria";
import ComunicacaoCartaEncantamento from "@/pages/comunicacao/carta-encantamento";
import ExamesCliente from "@/pages/exames-cliente";
import ComunicacaoCentralLembretes from "@/pages/comunicacao/central-lembretes";
import ComunicacaoDigital from "@/pages/comunicacao/digital";
import ComunicacaoEmails from "@/pages/comunicacao/emails";
import ComunicacaoPlataformas from "@/pages/comunicacao/plataformas";
import ComunicacaoWhatsappStatus from "@/pages/comunicacao/whatsapp-status";
import Hierarquia from "@/pages/hierarquia";
import Governanca from "@/pages/governanca";
import ImportarDrive from "@/pages/importar-drive";
import Atestados from "@/pages/arsenal/atestados";
import Encaminhamentos from "@/pages/arsenal/encaminhamentos";
import ModelosDocumento from "@/pages/arsenal/modelos";

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
      <Route path="/foto" component={Foto} />
      <Route path="/cadastro" component={Cadastro} />
      <Route path="/agendar/status/:id" component={AgendarStatus} />
      <Route path="/agendar" component={Agendar} />
      <Route path="/anamnese"><Redirect to="/anamnese/v2" /></Route>
      <Route path="/anamnese/v2" component={AnamneseV2} />
      <Route path="/area" component={Area} />
      <Route path="/entrada" component={Entrada} />
      <Route path="/vitrine" component={VitrinePublica} />
      <Route path="/abertura" component={Abertura} />
      <Route path="/marca-molde" component={MarcaMolde} />
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

            <Route path="/prescricao" component={() => <Prescricao />} />
            
            <Route path="/protocols" component={Protocols} />
            <Route path="/protocols/new" component={() => <NewProtocol />} />
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
            <Route path="/dieta" component={Dieta} />
            <Route path="/treino" component={Treino} />
            <Route path="/craniotomia" component={Craniotomia} />
            <Route path="/cockpit" component={Cockpit} />
            <Route path="/cockpit-cliente" component={CockpitCliente} />
            <Route path="/cockpit-anamnese" component={CockpitAnamnese} />
            <Route path="/cartorio" component={Cartorio} />
            <Route path="/consulta"><Redirect to="/cockpit" /></Route>
            <Route path="/exames" component={() => <Exames />} />
            <Route path="/exames-cliente" component={ExamesCliente} />
            <Route path="/importar-drive">
              <CollaboratorGate>
                <ImportarDrive />
              </CollaboratorGate>
            </Route>
            <Route path="/cadastros/:rest*">
              <CollaboratorGate>
                <Switch>
                  <Route path="/cadastros/config-exames" component={CadastroConfigExames} />
                  <Route path="/cadastros/governanca" component={Governanca} />
                  <Route path="/cadastros/exames" component={CadastroExames} />
                  <Route path="/cadastros/console-exames" component={CadastroConsoleExames} />
                  <Route path="/cadastros/direcao-exames" component={CadastroConsoleExames} />
                  <Route path="/cadastros/planilha-faixas" component={CadastroConsoleExames} />
                  <Route path="/cadastros/listas" component={CadastroListas} />
                  <Route path="/cadastros/clinicas" component={CadastroClinicas} />
                  <Route path="/cadastros/empresas" component={CadastroEmpresas} />
                  <Route path="/cadastros/agendas-google" component={CadastroAgendasGoogle} />
                  <Route path="/cadastros/equipe" component={CadastroEquipe} />
                  <Route path="/cadastros/textos" component={CadastroTextos} />
                  <Route path="/cadastros/auditoria" component={CadastroAuditoria} />
                  <Route component={NotFound} />
                </Switch>
              </CollaboratorGate>
            </Route>
            <Route path="/configuracoes/:rest*">
              <CollaboratorGate>
                <Switch>
                  <Route path="/configuracoes/empresa" component={ConfigEmpresa} />
                  <Route path="/configuracoes/certificados" component={ConfigCertificados} />
                  <Route path="/configuracoes/assinatura" component={ConfigAssinatura} />
                  <Route path="/configuracoes/pagamentos" component={ConfigPagamentos} />
                  <Route component={NotFound} />
                </Switch>
              </CollaboratorGate>
            </Route>
            <Route path="/financeiro/:rest*">
              <CollaboratorGate>
                <Switch>
                  <Route path="/financeiro/cobranca" component={FinanceiroCobranca} />
                  <Route path="/financeiro/nfse" component={FinanceiroNfse} />
                  <Route path="/financeiro/bancos" component={FinanceiroBancos} />
                  <Route path="/financeiro/transferencias" component={FinanceiroTransferencias} />
                  <Route path="/financeiro/conciliacao" component={FinanceiroConciliacao} />
                  <Route path="/financeiro/metas" component={FinanceiroMetas} />
                  <Route component={NotFound} />
                </Switch>
              </CollaboratorGate>
            </Route>
            
            <Route path="/comunicacao/gateways" component={ComunicacaoGateways} />
            <Route path="/comunicacao/mensageria" component={ComunicacaoMensageria} />
            <Route path="/comunicacao/carta-encantamento" component={ComunicacaoCartaEncantamento} />
            <Route path="/comunicacao/central-lembretes" component={ComunicacaoCentralLembretes} />
            <Route path="/comunicacao/digital" component={ComunicacaoDigital} />
            <Route path="/comunicacao/emails" component={ComunicacaoEmails} />
            <Route path="/comunicacao/plataformas" component={ComunicacaoPlataformas} />
            <Route path="/comunicacao/whatsapp-status" component={ComunicacaoWhatsappStatus} />
            <Route path="/hierarquia" component={Hierarquia} />

            <Route path="/arsenal/atestados" component={Atestados} />
            <Route path="/arsenal/encaminhamentos" component={Encaminhamentos} />
            <Route path="/arsenal/modelos" component={ModelosDocumento} />

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
