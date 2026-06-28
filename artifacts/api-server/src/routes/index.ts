import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import substancesRouter from "./substances";
import professionalsRouter from "./professionals";
import locationsRouter from "./locations";
import protocolsRouter from "./protocols";
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
import nursingAssessmentsRouter from "./nursing-assessments";
import taskCardsRouter from "./task-cards";
import pharmaciesRouter from "./pharmacies";
import prescriptionsRouter from "./prescriptions";
import sncrRouter from "./sncr";
import transmutacaoRouter from "./transmutacao";
import motorRouter from "./motor";
import megaAnamneseRouter from "./mega-anamnese";
import catalogsRouter from "./catalogs";
import dietaRouter from "./dieta";
import treinoRouter from "./treino";
import cadastrosRouter from "./cadastros";
import examRequestsRouter from "./exam-requests";
import anamnesePortalRouter from "./anamnese-portal";
import anamneseV2Router from "./anamnese-v2";
import areaPacienteRouter from "./area-paciente";
import catalogOptionsRouter from "./catalog-options";
import budgetCatalogRouter from "./budget-catalog";
import budgetSettingsRouter from "./budget-settings";
import budgetsRouter from "./budgets";
import cockpitRouter from "./cockpit";
import agendaRouter from "./agenda";
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
import financeiroRouter from "./financeiro";
import assinaturasRouter, { assinaturaWebhookRouter, telegramWebhookRouter } from "./assinaturas";
import brandRouter from "./brand";

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

// Portao do Colaborador (Onda 8.2): protege as ESCRITAS da Central de Cadastro
// (site-content + cadastros) e registra auditoria. Precisa vir ANTES das rotas
// protegidas. Leituras seguem livres.
router.use(collaboratorGuard);

router.use(healthRouter);
router.use(clientsRouter);
router.use(substancesRouter);
router.use(professionalsRouter);
router.use(locationsRouter);
router.use(protocolsRouter);
router.use(sessionsRouter);
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
router.use(nursingAssessmentsRouter);
router.use(taskCardsRouter);
router.use(pharmaciesRouter);
router.use(prescriptionsRouter);
router.use(sncrRouter);
router.use(transmutacaoRouter);
router.use(motorRouter);
router.use(megaAnamneseRouter);
router.use(catalogsRouter);
router.use(dietaRouter);
router.use(treinoRouter);
router.use(cockpitRouter);
router.use(cadastrosRouter);
router.use(examRequestsRouter);
router.use(anamnesePortalRouter);
router.use(anamneseV2Router);
router.use(areaPacienteRouter);
router.use(catalogOptionsRouter);
router.use(budgetCatalogRouter);
router.use(budgetSettingsRouter);
router.use(budgetsRouter);
router.use(agendaRouter);
router.use(agendaCalendarsRouter);
router.use(icalRouter);
router.use(siteContentRouter);
router.use(schedulingRouter);
router.use(storageRouter);
router.use(collaboratorRouter);
router.use(settingsRouter);
router.use(integrationsRouter);
router.use(comunicacaoRouter);
router.use(financeiroRouter);
router.use(assinaturasRouter);

export default router;
