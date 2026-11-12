import { Router, type IRouter } from "express";
import clinicalDemonstrationsRouter from "./clinical-demonstrations";
import healthRouter from "./health";
import clientsRouter from "./clients";
import clientRubricaRouter from "./client-rubrica";
import substancesRouter from "./substances";
import procedimentosRouter from "./procedimentos";
import protocoloProcedimentosRouter from "./protocolo-procedimentos";
import pitStopRouter from "./pit-stop";
import agendaProfissionaisPreferidosRouter from "./agenda-profissionais-preferidos";
import profissionalDocumentosRouter from "./profissional-documentos";
import agendaGoogleReconciliacaoRouter from "./agenda-google-reconciliacao";
import fornecedoresRouter from "./fornecedores";
import professionalsRouter from "./professionals";
import locationsRouter from "./locations";
import locationsAgendaGoogleRouter from "./locations-agenda-google";
import agendaGoogleCompromissosRouter from "./agenda-google-compromissos";
import agendaIntegrationRouter from "./agenda-integration";
import semanticCodesRouter from "./semantic-codes";
import protocolsRouter from "./protocols";
import protocolSchedulingRouter from "./protocol-scheduling";
import sessionsRouter from "./sessions";
import rasRouter from "./ras";
import stockRouter from "./stock";
import paymentsRouter from "./payments";
import dashboardRouter from "./dashboard";
import validationCodesRouter from "./validation-codes";
import emailRouter from "./email";
import googleCalendarRouter from "./google-calendar";
import googleDriveRouter from "./google-drive";
import clientPortalRouter from "./client-portal";
import clientPhotoRouter from "./client-photo";
import clientRegistrationRouter from "./client-registration";
import vitrineLeadsRouter from "./vitrine-leads";
import vitrineContatosRouter from "./vitrine-contatos";
import nursingAssessmentsRouter from "./nursing-assessments";
import taskCardsRouter from "./task-cards";
import pharmaciesRouter from "./pharmacies";
import prescriptionsRouter from "./prescriptions";
import prescriptionProtocolsRouter from "./prescription-protocols";
import systemErrorsRouter from "./system-errors";
import clinicalApprovalsRouter from "./clinical-approvals";
import sncrRouter from "./sncr";
import transmutacaoRouter from "./transmutacao";
import motorRouter from "./motor";
import megaAnamneseRouter from "./mega-anamnese";
import catalogsRouter from "./catalogs";
import dietaRouter from "./dieta";
import dietaPdfRouter from "./dieta-pdf";
import pesquisasRouter from "./pesquisas";
import treinoRouter from "./treino";
import cadastrosRouter from "./cadastros";
import examRequestsRouter from "./exam-requests";
import examesLabRouter from "./exames-lab";
import anamnesePortalRouter from "./anamnese-portal";
import pulsoDiarioRouter from "./pulso-diario";
import anamneseV2Router from "./anamnese-v2";
import areaPacienteRouter from "./area-paciente";
import areaPacientePedidosRouter from "./area-paciente-pedidos";
import pedidosMedicosRouter from "./pedidos-medicos";
import catalogOptionsRouter from "./catalog-options";
import budgetCatalogRouter from "./budget-catalog";
import budgetSettingsRouter from "./budget-settings";
import budgetsRouter from "./budgets";
import cockpitRouter from "./cockpit";
import agendaRouter from "./agenda";
import agendaLocaisExternosRouter from "./agenda-locais-externos";
import agendaCalendarsRouter from "./agenda-calendars";
import icalRouter from "./ical";
import siteContentRouter from "./site-content";
import schedulingRouter from "./scheduling";
import storageRouter from "./storage";
import collaboratorRouter, { collaboratorGuard } from "./collaborator";
import asaasRouter from "./asaas";
import settingsRouter from "./settings";
import integrationsRouter from "./integrations";
import comunicacaoRouter from "./comunicacao";
import mensagensCatalogoRouter from "./mensagens-catalogo";
import lembretesRouter from "./lembretes";
import whatsappStatusRouter from "./whatsapp-status";
import financeiroRouter from "./financeiro";
import assinaturasRouter, { assinaturaWebhookRouter, telegramWebhookRouter } from "./assinaturas";
import brandRouter from "./brand";
import whatsappWebhookRouter from "./whatsapp-webhook";
import demoGaleriaRouter from "./demo-galeria";
import importarDriveRouter from "./importar-drive";
import atestadosRouter from "./atestados";
import cid10Router from "./cid10";
import encaminhamentosRouter from "./encaminhamentos";
import clinicalDocumentDeliveryRouter, { clinicalDocumentShareRouter } from "./clinical-document-delivery";
import visitConfirmationRouter, { visitConfirmationPublicRouter } from "./visit-confirmation";
import documentTemplatesRouter from "./document-templates";
import clientServiceAddressesRouter from "./client-service-addresses";
import empresasRouter from "./empresas";
import provisionamentoRouter from "./provisionamento";
import ceoRouter from "./ceo";
import conciergeAdminRouter from "./concierge-admin";
import aiUsageRouter from "./ai-usage";
import dominiosRouter from "./dominios";
import dominiosComercialRouter from "./dominios-comercial";
import cadernosJuridicosRouter from "./cadernos-juridicos";
import receituarioRouter from "./receituario";
import receituarioModelosRouter from "./receituario-modelos";
import paxmed2bIdentidadeRouter from "./paxmed-2b-identidade";
import adminPreviewRouter from "./admin-preview";
import adminDriveRouter from "./admin-drive";
import adminSheetsRouter from "./admin-sheets";
import slackPadaxorRouter from "./slack-padaxor";
import adminPlanilhaTempRouter from "./admin-planilha-temp";
import padteamRouter from "./padteam";
import provaDeValorRouter from "./prova-de-valor";
import agentesRouter from "./agentes";
import agentesChatRouter from "./agentes-chat";
import agentesTrelloRouter from "./agentes-trello";
import agentesWppRouter from "./agentes-wpp";
import agentesIntegracoesRouter from "./agentes-integracoes";
import agentesQuickrepliesRouter from "./agentes-quickreplies";
import whatsappInboundRouter from "./whatsapp-inbound";
import prontuarioRouter from "./prontuario";
import driveWatcherRouter from "./drive-watcher";
import menuRouter from "./menu";
import avatarsRouter from "./avatares";
import radarClinicoRouter from "./radar-clinico";
import { onboardingRouter, onboardingPublicRouter } from "./onboarding.js";

const router: IRouter = Router();

// Banner de marca (imagem pública) — buscado por Twilio/Telegram sem sessão.
// Registrado ANTES do portão de colaborador.
router.use(brandRouter);

// Pagamentos Asaas (cobranca + webhook): registrado ANTES do portao de
// colaborador para o webhook externo do Asaas nao ser bloqueado.
router.use(asaasRouter);

// Webhook de Assinatura Remota (ZapSign): provedor externo sem sessao, tambem
// registrado ANTES do portao. Autenticidade via header secreto proprio.
router.use(assinaturaWebhookRouter);

// Webhook do Telegram: o bot chama esta rota; associa chat_id ao paciente.
// Registrado ANTES do portao (provedor externo sem sessao). Nao usa token aqui.
router.use(telegramWebhookRouter);

// Webhook de STATUS do Twilio (StatusCallback): atualiza a entrega da mensagem.
// Registrado ANTES do portao; autenticidade via assinatura X-Twilio-Signature.
router.use(whatsappWebhookRouter);

// Webhook de ENTRADA do Twilio (InboundRequestUrl): recebe mensagens dos usuários
// e responde via Aurora ADM com contexto clínico. Registrado ANTES do portão.
router.use(whatsappInboundRouter);

// Webhooks do Trello (HEAD+POST de validação e eventos de cards).
// Devem vir ANTES do portão — Trello não envia token de colaborador.
router.use(agentesTrelloRouter);

// Admin Drive: rota interna de admin, sem sessão de colaborador.
router.use(adminDriveRouter);
router.use(adminSheetsRouter);
router.use(slackPadaxorRouter);
router.use(adminPlanilhaTempRouter);

// Onboarding público — POST /evento chamado pelo browser do paciente sem auth.
// Deve ficar ANTES do collaboratorGuard para não ser bloqueado.
router.use("/onboarding", onboardingPublicRouter);

// QR impresso na receita: o paciente abre pelo celular, sem sessao. Token aleatorio
// de 43 caracteres + validade curta (a propria rota valida). ANTES do portao.
router.use(clinicalDocumentShareRouter);

// K8: link de um clique da confirmação do cliente por visita. O token HMAC é a credencial;
// abrir não confirma, só o POST. ANTES do portão.
router.use(visitConfirmationPublicRouter);

// Portao do Colaborador (Onda 8.2): protege as ESCRITAS da Central de Cadastro
// (site-content + cadastros) e registra auditoria. Precisa vir ANTES das rotas
// protegidas. Leituras seguem livres.
router.use(collaboratorGuard);

router.use(healthRouter);
router.use(clientsRouter);
router.use(clientRubricaRouter);
router.use(substancesRouter);
router.use(procedimentosRouter);
router.use(protocoloProcedimentosRouter);
router.use(pitStopRouter);
router.use(agendaProfissionaisPreferidosRouter);
router.use(profissionalDocumentosRouter);
router.use(agendaGoogleReconciliacaoRouter);
router.use(fornecedoresRouter);
router.use(professionalsRouter);
router.use(locationsRouter);
router.use(locationsAgendaGoogleRouter);
router.use(semanticCodesRouter);
router.use(protocolsRouter);
router.use(protocolSchedulingRouter);
router.use(sessionsRouter);
// K8: confirmação do cliente por visita (chave, "Cliente confirma depois", desafio). Depois do sessionsRouter (módulo agenda).
router.use(visitConfirmationRouter);
router.use(rasRouter);
router.use(stockRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);
router.use(validationCodesRouter);
router.use(emailRouter);
router.use(googleCalendarRouter);
router.use("/google-drive", googleDriveRouter);
router.use(clientPortalRouter);
router.use(clientPhotoRouter);
router.use(clientRegistrationRouter);
router.use(vitrineLeadsRouter);
router.use(vitrineContatosRouter);
router.use(nursingAssessmentsRouter);
router.use(taskCardsRouter);
router.use(pharmaciesRouter);
router.use(prescriptionsRouter);
router.use(clinicalDemonstrationsRouter);
router.use(prescriptionProtocolsRouter);
router.use(systemErrorsRouter);
router.use(clinicalApprovalsRouter);
router.use(pedidosMedicosRouter);
router.use(sncrRouter);
router.use(transmutacaoRouter);
router.use(motorRouter);
router.use(megaAnamneseRouter);
router.use(catalogsRouter);
router.use(dietaRouter);
router.use(dietaPdfRouter);
router.use(pesquisasRouter);
router.use(treinoRouter);
router.use(cockpitRouter);
router.use(radarClinicoRouter);
router.use(cadastrosRouter);
router.use(examRequestsRouter);
router.use(examesLabRouter);
router.use(anamnesePortalRouter);
router.use(pulsoDiarioRouter);
router.use(anamneseV2Router);
router.use(areaPacienteRouter);
router.use(areaPacientePedidosRouter);
router.use(catalogOptionsRouter);
router.use(budgetCatalogRouter);
router.use(budgetSettingsRouter);
router.use(budgetsRouter);
router.use(agendaRouter);
router.use(agendaLocaisExternosRouter);
router.use(agendaGoogleCompromissosRouter);
router.use(agendaIntegrationRouter);
router.use(agendaCalendarsRouter);
router.use(icalRouter);
router.use(siteContentRouter);
router.use(schedulingRouter);
router.use(storageRouter);
router.use(collaboratorRouter);
router.use(settingsRouter);
router.use(integrationsRouter);
router.use(comunicacaoRouter);
router.use(mensagensCatalogoRouter);
router.use(lembretesRouter);
router.use(whatsappStatusRouter);
router.use(financeiroRouter);
router.use(assinaturasRouter);
router.use(demoGaleriaRouter);
router.use(importarDriveRouter);
router.use(atestadosRouter);
router.use(clinicalDocumentDeliveryRouter);
router.use(cid10Router);
router.use(encaminhamentosRouter);
router.use(documentTemplatesRouter);
router.use(clientServiceAddressesRouter);
router.use(empresasRouter);
router.use(provisionamentoRouter);
router.use(ceoRouter);
router.use(conciergeAdminRouter);
router.use(aiUsageRouter);
router.use(cadernosJuridicosRouter);
router.use(receituarioRouter);
router.use(receituarioModelosRouter);
router.use(paxmed2bIdentidadeRouter);
router.use(adminPreviewRouter);
router.use(dominiosRouter);
router.use(dominiosComercialRouter);
router.use(padteamRouter);
router.use(provaDeValorRouter);
router.use(agentesRouter);
router.use(agentesChatRouter);
router.use(agentesWppRouter);
router.use(agentesIntegracoesRouter);
router.use(agentesQuickrepliesRouter);
router.use(prontuarioRouter);
router.use(radarClinicoRouter);
// Onboarding — POST /enviar-guia + GET /stats (ANTES do driveWatcherRouter que tem requireCollaborator sem caminho)
router.use("/onboarding", onboardingRouter);
router.use(driveWatcherRouter);
router.use(menuRouter);
router.use(avatarsRouter);

export default router;
