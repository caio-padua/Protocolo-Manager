import { Router, type IRouter, type Request, type Response } from "express";
import { getGoogleSheetsClient, getGoogleDriveClientRaw } from "../lib/google-drive";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BASE = "https://e4777049-2482-4493-bc8d-9ddd502ce731-00-33xz3y36vyw2i.riker.replit.dev";

type Tela = {
  num: number;
  nome: string;
  funcao: string;
  menu: string;
  necessidade: string;
  fusao: string;
  candidata: string;
  link: string;
};

type Grupo = {
  nome: string;
  cor: { red: number; green: number; blue: number };
  telas: Tela[];
};

const GRUPOS: Grupo[] = [
  {
    nome: "1 — AGENDA & RECEPÇÃO",
    cor: { red: 0.741, green: 0.843, blue: 0.933 },
    telas: [
      { num: 1, nome: "Marcação de Consulta", funcao: "Cliente marca horário online", menu: "✅", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/agendar` },
      { num: 2, nome: "Agenda Diária", funcao: "Grade semanal de sessões", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "Motor de Agenda", link: `${BASE}/agenda` },
      { num: 3, nome: "Motor de Agenda", funcao: "Configuração das regras de horário", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Agenda Diária (aba Config)", link: `${BASE}/agenda/motor` },
      { num: 4, nome: "Clientes", funcao: "Lista e cadastro de clientes", menu: "✅", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/clients` },
    ],
  },
  {
    nome: "2 — O ATO MÉDICO",
    cor: { red: 0.776, green: 0.937, blue: 0.808 },
    telas: [
      { num: 5, nome: "Cockpit da Consulta", funcao: "Central da consulta médica (cockpit real em /cockpit/:id)", menu: "✅", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/cockpit` },
      { num: 6, nome: "Cockpit da Anamnese", funcao: "Visualização do prontuário de anamnese", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Cockpit (aba Anamnese)", link: `${BASE}/cockpit-anamnese` },
      { num: 7, nome: "Cartório", funcao: "Assinar e gerenciar documentos", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Cockpit (aba Documentos)", link: `${BASE}/cartorio` },
      { num: 8, nome: "Craniotomia", funcao: "Análise cognitiva/neuro", menu: "✅", necessidade: "★★★☆☆", fusao: "★★★★☆", candidata: "Cockpit (aba Neuro)", link: `${BASE}/craniotomia` },
      { num: 9, nome: "Mega Anamnese", funcao: "Formulário longo de anamnese (admin)", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Cockpit da Anamnese", link: `${BASE}/mega-anamnese` },
      { num: 10, nome: "Revisão de Anamneses", funcao: "Médico revisa anamneses pendentes", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Cockpit da Anamnese", link: `${BASE}/anamnese/revisao` },
    ],
  },
  {
    nome: "3 — EXAMES (⚠️ 10 telas — grupo mais fragmentado)",
    cor: { red: 1.0, green: 0.922, blue: 0.612 },
    telas: [
      { num: 11, nome: "Hub de Exames", funcao: "Central consolidada de exames", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "Absorve Exames do Cliente", link: `${BASE}/exames-hub` },
      { num: 12, nome: "Exames do Cliente", funcao: "Ver exames de um paciente específico", menu: "✅", necessidade: "★★★★★", fusao: "★★★★★", candidata: "Hub de Exames (aba)", link: `${BASE}/exames-cliente` },
      { num: 13, nome: "Procedência de Exames", funcao: "Rastrear origem de cada exame", menu: "✅", necessidade: "★★★☆☆", fusao: "★★★★☆", candidata: "Hub de Exames (aba Origem)", link: `${BASE}/procedencia-exames` },
      { num: 14, nome: "Prescritor de Exames", funcao: "Solicitar/prescrever exames", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Arsenal Clínico ou Cockpit", link: `${BASE}/exames` },
      { num: 15, nome: "Importação do Drive", funcao: "Importar lote de PDFs do Drive", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Vigilância Drive (mesma tela)", link: `${BASE}/importar-drive` },
      { num: 16, nome: "Vigilância Drive", funcao: "Monitorar pasta Google Drive vigiada", menu: "✅", necessidade: "★★★★★", fusao: "★★★★★", candidata: "Importação Drive (mesma tela)", link: `${BASE}/arsenal/drive-watcher` },
      { num: 17, nome: "Monitor do Motor", funcao: "Log em tempo real da extração Gemini", menu: "✅", necessidade: "★★★★★", fusao: "★★★★☆", candidata: "Hub de Exames (aba Log)", link: `${BASE}/exames/monitor` },
      { num: 18, nome: "Exames & Blocos", funcao: "Catálogo de exames e blocos", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Console de Exames (absorve)", link: `${BASE}/cadastros/exames` },
      { num: 19, nome: "Console de Exames", funcao: "Config avançada de faixas de referência", menu: "✅", necessidade: "★★★★★", fusao: "★★★★★", candidata: "Absorve Exames & Blocos + Config", link: `${BASE}/cadastros/console-exames` },
      { num: 20, nome: "Configuração de Exames", funcao: "Parâmetros gerais de extração Gemini", menu: "✅", necessidade: "★★★☆☆", fusao: "★★★★★", candidata: "Console de Exames (aba Config)", link: `${BASE}/cadastros/config-exames` },
    ],
  },
  {
    nome: "4 — ÁREA DO CLIENTE",
    cor: { red: 0.886, green: 0.937, blue: 0.855 },
    telas: [
      { num: 21, nome: "Experiência do Cliente (Preview Admin)", funcao: "Pré-visualização admin da área do cliente", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/experiencia-cliente` },
      { num: 22, nome: "Área do Paciente (Direto)", funcao: "Tela real que o cliente vê", menu: "✅", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/area` },
    ],
  },
  {
    nome: "5 — ÓRGÃOS DE PRESCRIÇÃO",
    cor: { red: 0.988, green: 0.894, blue: 0.839 },
    telas: [
      { num: 23, nome: "Prescrição", funcao: "Receituário clínico", menu: "✅", necessidade: "★★★★★", fusao: "★★★★☆", candidata: "Arsenal Clínico", link: `${BASE}/prescricao` },
      { num: 24, nome: "Fórmulas & Substâncias", funcao: "Catálogo de substâncias injetáveis", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "Catálogos", link: `${BASE}/substances` },
      { num: 25, nome: "Dieta", funcao: "Prescrição de dieta nutricional", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Treino (mesma tela, 2 abas)", link: `${BASE}/dieta` },
      { num: 26, nome: "Treino", funcao: "Prescrição de exercício físico", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Dieta (mesma tela, 2 abas)", link: `${BASE}/treino` },
      { num: 27, nome: "Orçamentos", funcao: "Criação e apresentação de orçamentos", menu: "✅", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/orcamentos` },
      { num: 28, nome: "Farmácias", funcao: "Cadastro de farmácias parceiras", menu: "✅", necessidade: "★★★☆☆", fusao: "★★★☆☆", candidata: "Catálogos", link: `${BASE}/pharmacies` },
      { num: 29, nome: "SNCR", funcao: "Sistema Nacional de Controle de Receituário", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "Prescrição", link: `${BASE}/sncr` },
    ],
  },
  {
    nome: "6 — ARSENAL CLÍNICO",
    cor: { red: 1.0, green: 0.78, green2: 0.808 } as any,
    telas: [
      { num: 30, nome: "Atestados", funcao: "Emissão de atestados médicos", menu: "✅", necessidade: "★★★★★", fusao: "★★★★★", candidata: "Modelos de Documento", link: `${BASE}/arsenal/atestados` },
      { num: 31, nome: "Encaminhamentos", funcao: "Encaminhamentos para especialistas", menu: "✅", necessidade: "★★★★★", fusao: "★★★★★", candidata: "Modelos de Documento", link: `${BASE}/arsenal/encaminhamentos` },
      { num: 32, nome: "Modelos de Documento", funcao: "Biblioteca de modelos editáveis", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Absorve Atestados + Encaminhamentos", link: `${BASE}/arsenal/modelos` },
      { num: 33, nome: "Receituário Automático", funcao: "Geração automática de receitas diárias", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/receituario-automatico` },
    ],
  },
  {
    nome: "7 — CADASTROS CLÍNICOS",
    cor: { red: 0.835, green: 0.922, blue: 0.969 },
    telas: [
      { num: 34, nome: "Portfólio Clínico", funcao: "Visão do portfólio de produtos clínicos", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/portfolio-clinico` },
      { num: 35, nome: "Protocolos", funcao: "Criação e gestão de protocolos injetáveis", menu: "✅", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/protocols` },
      { num: 36, nome: "RAS", funcao: "Registro de Administração de Substâncias", menu: "✅", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/ras` },
      { num: 37, nome: "Catálogos", funcao: "Catálogos IHE (fórmulas, injetáveis, implantes)", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "Fórmulas & Substâncias", link: `${BASE}/catalogos` },
      { num: 38, nome: "Estoque", funcao: "Controle de estoque de substâncias", menu: "✅", necessidade: "★★★★☆", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/stock` },
    ],
  },
  {
    nome: "8 — FINANCEIRO",
    cor: { red: 1.0, green: 1.0, blue: 0.6 },
    telas: [
      { num: 39, nome: "Lançador de Cobrança", funcao: "Cobrar via Asaas (PIX/boleto/cartão)", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/financeiro/cobranca` },
      { num: 40, nome: "Lançador de NFS-e", funcao: "Emissão de nota fiscal de serviço eletrônica", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Cobrança (aba NF)", link: `${BASE}/financeiro/nfse` },
      { num: 41, nome: "Cadastro de Bancos", funcao: "Contas bancárias cadastradas", menu: "✅", necessidade: "★★★☆☆", fusao: "★★★★☆", candidata: "Transferências (aba)", link: `${BASE}/financeiro/bancos` },
      { num: 42, nome: "Transferências", funcao: "Saques e transferências Asaas", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Bancos + Cobrança", link: `${BASE}/financeiro/transferencias` },
      { num: 43, nome: "Pagamentos", funcao: "Histórico de pagamentos dos clientes", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "Cobrança", link: `${BASE}/payments` },
      { num: 44, nome: "Conciliação", funcao: "Conciliação bancária automática", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Pagamentos", link: `${BASE}/financeiro/conciliacao` },
      { num: 45, nome: "Metas & Crescimento", funcao: "Dashboard de metas financeiras", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "CEO Command Center", link: `${BASE}/financeiro/metas` },
    ],
  },
  {
    nome: "9 — COMUNICAÇÃO",
    cor: { red: 0.91, green: 0.835, blue: 0.961 },
    telas: [
      { num: 46, nome: "Gateway de Comunicação", funcao: "Config Twilio / WhatsApp / e-mail", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/comunicacao/gateways` },
      { num: 47, nome: "Mensageria", funcao: "Mensagens programadas PAXMED (WhatsApp/e-mail)", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/comunicacao/mensageria` },
      { num: 48, nome: "Carta de Encantamento", funcao: "Comunicação personalizada de boas-vindas", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Mensageria", link: `${BASE}/comunicacao/carta-encantamento` },
      { num: 49, nome: "Central de Lembretes", funcao: "Lembretes automáticos de sessão", menu: "✅", necessidade: "★★★★★", fusao: "★★★★☆", candidata: "Mensageria (aba)", link: `${BASE}/comunicacao/central-lembretes` },
      { num: 50, nome: "Comunicação Digital", funcao: "Canais digitais ativos", menu: "✅", necessidade: "★★★☆☆", fusao: "★★★★☆", candidata: "Plataformas Digitais", link: `${BASE}/comunicacao/digital` },
      { num: 51, nome: "E-mails", funcao: "Histórico de e-mails enviados", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Central de Auditoria", link: `${BASE}/comunicacao/emails` },
      { num: 52, nome: "Plataformas Digitais", funcao: "Config de plataformas conectadas", menu: "✅", necessidade: "★★★☆☆", fusao: "★★★★☆", candidata: "Gateway", link: `${BASE}/comunicacao/plataformas` },
      { num: 53, nome: "Status WhatsApp", funcao: "Monitor de entrega de mensagens WhatsApp", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Central de Auditoria", link: `${BASE}/comunicacao/whatsapp-status` },
      { num: 54, nome: "Central de Auditoria", funcao: "Log completo de todas comunicações", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/comunicacao/central-auditoria` },
      { num: 55, nome: "Painel de Domínios & Aliases", funcao: "Domínios e aliases de e-mail", menu: "✅", necessidade: "★★★☆☆", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/comunicacao/dominios` },
    ],
  },
  {
    nome: "10 — CONFIGURAÇÕES & ADMINISTRAÇÃO",
    cor: { red: 0.949, green: 0.949, blue: 0.949 },
    telas: [
      { num: 56, nome: "Empresas Licenciadas", funcao: "SaaS — clientes licenciados do sistema", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/cadastros/empresas-licenciadas` },
      { num: 57, nome: "Empresa & Clínicas", funcao: "Dados da empresa principal (PADCOM)", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "Clínicas & Locais (aba)", link: `${BASE}/configuracoes/empresa` },
      { num: 58, nome: "Clínicas & Locais", funcao: "Cadastro das unidades físicas", menu: "✅", necessidade: "★★★★★", fusao: "★★★★☆", candidata: "Empresa & Clínicas", link: `${BASE}/cadastros/clinicas` },
      { num: 59, nome: "Corpo Clínico", funcao: "Profissionais, médicos e enfermeiros", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "PADTEAM", link: `${BASE}/professionals` },
      { num: 60, nome: "Agendas Google", funcao: "Calendários Google conectados", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Motor de Agenda", link: `${BASE}/cadastros/agendas-google` },
      { num: 61, nome: "Listas (Categorias/Tipos)", funcao: "Categorias e tipos de dados", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/cadastros/listas` },
      { num: 62, nome: "Textos & Vídeos", funcao: "Conteúdos para comunicação e e-mails", menu: "✅", necessidade: "★★★☆☆", fusao: "★★★★☆", candidata: "Mensageria", link: `${BASE}/cadastros/textos` },
      { num: 63, nome: "Auditoria", funcao: "Log de ações administrativas internas", menu: "✅", necessidade: "★★★★★", fusao: "★★★★☆", candidata: "Central de Auditoria", link: `${BASE}/cadastros/auditoria` },
      { num: 64, nome: "Cadernos Jurídicos", funcao: "Contratos e documentos jurídicos", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "Arsenal Clínico", link: `${BASE}/juridico/contratos` },
      { num: 65, nome: "Certificados Digitais", funcao: "Certificado ICP-Brasil A1 para assinatura", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/configuracoes/certificados` },
      { num: 66, nome: "Assinatura (ZapSign)", funcao: "Assinatura eletrônica via ZapSign", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Certificados Digitais", link: `${BASE}/configuracoes/assinatura` },
      { num: 67, nome: "Portas de Pagamento", funcao: "Config Asaas / chaves de pagamento", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/configuracoes/pagamentos` },
      { num: 68, nome: "Faixas do Receituário", funcao: "Templates visuais de receituário", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Modelo de Receituários", link: `${BASE}/configuracoes/receituario` },
      { num: 69, nome: "Modelo de Receituários", funcao: "Modelos ativos de receituário ANVISA", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Faixas do Receituário", link: `${BASE}/modelo-receituario` },
      { num: 70, nome: "Vitrine (Pública)", funcao: "Página pública de apresentação de serviços", menu: "✅", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/vitrine` },
    ],
  },
  {
    nome: "11 — ESTRUTURA & GOVERNANÇA",
    cor: { red: 0.839, green: 0.863, blue: 0.894 },
    telas: [
      { num: 71, nome: "CEO Command Center", funcao: "Dashboard executivo com KPIs em tempo real", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "Metas & Crescimento (aba)", link: `${BASE}/ceo/command-center` },
      { num: 72, nome: "PADTEAM — Equipe & Demandas", funcao: "Gestão de equipe remota e demandas internas", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Absorve Agentes + Hierarquia", link: `${BASE}/padteam` },
      { num: 73, nome: "Agentes Virtuais", funcao: "Configuração dos agentes de Inteligência Artificial", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "PADTEAM (aba Agentes)", link: `${BASE}/agentes` },
      { num: 74, nome: "Hierarquia", funcao: "Organograma da empresa", menu: "✅", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "PADTEAM (aba Organograma)", link: `${BASE}/hierarquia` },
      { num: 75, nome: "Governança", funcao: "Matriz de permissões por papel de usuário", menu: "✅", necessidade: "★★★★★", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/cadastros/governanca` },
    ],
  },
  {
    nome: "12 — TELAS OCULTAS (existem mas fora do menu)",
    cor: { red: 1.0, green: 0.851, blue: 0.702 },
    telas: [
      { num: 76, nome: "Cockpit Real do Cliente", funcao: "A tela mais importante — só acessível com ID do cliente", menu: "❌", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/cockpit/44` },
      { num: 77, nome: "Prontuário Individual", funcao: "Prontuário clínico detalhado por cliente", menu: "❌", necessidade: "★★★★★", fusao: "★★★★★", candidata: "Já está dentro do Cockpit como aba", link: `${BASE}/clients/44/prontuario` },
      { num: 78, nome: "Editar Cliente", funcao: "Formulário de edição de cadastro do cliente", menu: "❌", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Acessível pelo botão Editar na lista", link: `${BASE}/clients/44/edit` },
      { num: 79, nome: "Detalhe de Protocolo", funcao: "Detalhes e sessões de um protocolo ativo", menu: "❌", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "Acessível pela lista de Protocolos", link: `${BASE}/protocols/1` },
      { num: 80, nome: "Nova Demanda PADTEAM", funcao: "Formulário de abertura de nova demanda", menu: "❌", necessidade: "★★★★☆", fusao: "★★★★★", candidata: "Modal dentro do PADTEAM", link: `${BASE}/padteam/nova` },
      { num: 81, nome: "Apresentação de Orçamento", funcao: "Tela de vendas do orçamento ao cliente", menu: "❌", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/orcamentos/1/apresentacao` },
    ],
  },
  {
    nome: "13 — TELAS PÚBLICAS (do cliente, sem sidebar)",
    cor: { red: 0.831, green: 0.929, blue: 0.855 },
    telas: [
      { num: 82, nome: "Área do Cliente (Home)", funcao: "Home do cliente logado no sistema", menu: "❌", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/area` },
      { num: 83, nome: "Anamnese V2", funcao: "Formulário de anamnese preenchido pelo cliente", menu: "❌", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/anamnese/v2` },
      { num: 84, nome: "Agendar Consulta (Público)", funcao: "Cliente agenda horário sem login", menu: "❌", necessidade: "★★★★★", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/agendar` },
      { num: 85, nome: "Foto de Perfil", funcao: "Upload de foto pelo cliente", menu: "❌", necessidade: "★★★★☆", fusao: "★★★★☆", candidata: "Área do Cliente (aba Foto)", link: `${BASE}/foto` },
      { num: 86, nome: "Cadastro (Público / Voz)", funcao: "Cadastro público por voz ou formulário", menu: "❌", necessidade: "★★★★★", fusao: "★★★★☆", candidata: "Área do Cliente (entrada)", link: `${BASE}/cadastro` },
      { num: 87, nome: "Abertura — Landing PAXTER", funcao: "Tela de entrada da marca PAXTER", menu: "❌", necessidade: "★★★★☆", fusao: "★★☆☆☆", candidata: "—", link: `${BASE}/abertura` },
      { num: 88, nome: "Vitrine Pública", funcao: "Catálogo público de serviços da clínica", menu: "❌", necessidade: "★★★★☆", fusao: "★★★☆☆", candidata: "—", link: `${BASE}/vitrine` },
    ],
  },
];

const COLUNAS = ["Nº", "Nome da Tela", "Função", "Menu?", "Necessidade (0-5★)", "Fusão Possível (0-5★)", "Candidata a Fundir Com", "Link Direto"];

function rgb(r: number, g: number, b: number) {
  return { red: r, green: g, blue: b };
}

function fixCor(cor: any): { red: number; green: number; blue: number } {
  return { red: cor.red ?? 0.9, green: cor.green ?? 0.9, blue: cor.blue ?? 0.9 };
}

router.post("/admin/gerar-planilha-menus", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const drive = await getGoogleDriveClientRaw();
    const TARGET_FOLDER = "1dvLoSjqDT35LrI7yqXQZ-2uVxqE5Egpz";

    // Criar planilha
    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: "ORGANOGRAMA DE MENUS E LINKS" },
        sheets: [{ properties: { title: "TELAS", gridProperties: { frozenRowCount: 1 } } }],
      },
    });

    const spreadsheetId = created.data.spreadsheetId!;
    const sheetId = created.data.sheets![0].properties!.sheetId!;

    // Montar todas as linhas
    const allRows: string[][] = [COLUNAS];
    const groupRanges: { startRow: number; endRow: number; cor: { red: number; green: number; blue: number }; isHeader: boolean; nomeGrupo: string }[] = [];

    let currentRow = 1;

    for (const grupo of GRUPOS) {
      // Linha de grupo (header do bloco)
      groupRanges.push({ startRow: currentRow, endRow: currentRow, cor: fixCor(grupo.cor), isHeader: true, nomeGrupo: grupo.nome });
      allRows.push([grupo.nome, "", "", "", "", "", "", ""]);
      currentRow++;

      // Linhas das telas
      const telaStart = currentRow;
      for (const t of grupo.telas) {
        allRows.push([String(t.num), t.nome, t.funcao, t.menu, t.necessidade, t.fusao, t.candidata, t.link]);
        currentRow++;
      }
      groupRanges.push({ startRow: telaStart, endRow: currentRow - 1, cor: fixCor(grupo.cor), isHeader: false, nomeGrupo: "" });

      // Linha em branco entre grupos
      allRows.push(["", "", "", "", "", "", "", ""]);
      currentRow++;
    }

    // Escrever dados
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "TELAS!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: allRows },
    });

    // Formatar
    const requests: any[] = [];

    // Cabeçalho fixo (row 0)
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(0.133, 0.141, 0.173),
            textFormat: { bold: true, foregroundColor: rgb(1, 1, 1), fontSize: 10 },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
      },
    });

    // Linhas de grupo e de telas
    for (const gr of groupRanges) {
      if (gr.isHeader) {
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: gr.startRow, endRowIndex: gr.endRow + 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: gr.cor,
                textFormat: { bold: true, fontSize: 10, foregroundColor: rgb(0.1, 0.1, 0.1) },
                horizontalAlignment: "LEFT",
                verticalAlignment: "MIDDLE",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
          },
        });
        // Merge da linha de grupo
        requests.push({
          mergeCells: {
            range: { sheetId, startRowIndex: gr.startRow, endRowIndex: gr.endRow + 1, startColumnIndex: 0, endColumnIndex: 8 },
            mergeType: "MERGE_ALL",
          },
        });
      } else {
        // Linhas de tela — cor levemente clarificada
        const lighter = { red: Math.min(1, gr.cor.red * 0.15 + 0.85), green: Math.min(1, gr.cor.green * 0.15 + 0.85), blue: Math.min(1, gr.cor.blue * 0.15 + 0.85) };
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: gr.startRow, endRowIndex: gr.endRow + 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: lighter,
                textFormat: { fontSize: 9 },
                verticalAlignment: "MIDDLE",
                wrapStrategy: "WRAP",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)",
          },
        });
      }
    }

    // Bordas externas em todo o conteúdo
    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex: 0, endRowIndex: allRows.length, startColumnIndex: 0, endColumnIndex: 8 },
        innerHorizontal: { style: "SOLID_MEDIUM", color: rgb(0.8, 0.8, 0.8) },
        innerVertical: { style: "SOLID", color: rgb(0.85, 0.85, 0.85) },
        top: { style: "SOLID_THICK", color: rgb(0.1, 0.1, 0.1) },
        bottom: { style: "SOLID_THICK", color: rgb(0.1, 0.1, 0.1) },
        left: { style: "SOLID_THICK", color: rgb(0.1, 0.1, 0.1) },
        right: { style: "SOLID_THICK", color: rgb(0.1, 0.1, 0.1) },
      },
    });

    // Larguras das colunas
    const colWidths = [40, 220, 320, 60, 130, 130, 220, 400];
    for (let i = 0; i < colWidths.length; i++) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: colWidths[i] },
          fields: "pixelSize",
        },
      });
    }

    // Altura das linhas de tela (28px)
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: allRows.length },
        properties: { pixelSize: 28 },
        fields: "pixelSize",
      },
    });

    // Altura das linhas de grupo (36px)
    for (const gr of groupRanges.filter(g => g.isHeader)) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "ROWS", startIndex: gr.startRow, endIndex: gr.startRow + 1 },
          properties: { pixelSize: 36 },
          fields: "pixelSize",
        },
      });
    }

    // Aplicar formatação
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

    // Hyperlinks na coluna H (col index 7) para todas as linhas de tela
    const hyperlinkRequests: any[] = [];
    let rowIdx = 1;
    for (const grupo of GRUPOS) {
      rowIdx++; // header do grupo
      for (const t of grupo.telas) {
        hyperlinkRequests.push({
          updateCells: {
            range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 7, endColumnIndex: 8 },
            rows: [{
              values: [{
                userEnteredValue: { formulaValue: `=HYPERLINK("${t.link}","Abrir →")` },
                userEnteredFormat: {
                  textFormat: { foregroundColor: rgb(0.15, 0.39, 0.78), underline: true, fontSize: 9 },
                },
              }],
            }],
            fields: "userEnteredValue,userEnteredFormat.textFormat",
          },
        });
        rowIdx++;
      }
      rowIdx++; // linha em branco
    }

    if (hyperlinkRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: hyperlinkRequests } });
    }

    // Mover para a pasta alvo
    const fileMetadata = await drive.files.get({ fileId: spreadsheetId, fields: "parents" });
    const previousParents = fileMetadata.data.parents?.join(",") ?? "";
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: TARGET_FOLDER,
      removeParents: previousParents,
      fields: "id, parents",
    });

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    logger.info({ spreadsheetId, url }, "[AdminSheets] planilha gerada e movida");
    res.json({ ok: true, spreadsheetId, url });
  } catch (err: any) {
    logger.error({ err: err.message }, "[AdminSheets] erro ao gerar planilha");
    res.status(500).json({ error: err.message });
  }
});

export default router;
