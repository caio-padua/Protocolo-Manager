import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

// ── DADOS ────────────────────────────────────────────────────────────────────

const linhaDeProducao = [
  ["Nº","Título","Responsável","Depende de","Estado","Prioridade","Esforço","Como será feito (resumo)"],
  [1,  "Banco PostgreSQL Railway",                        "Dr. Code",            "-",   "Concluído",     "P0","P","Railway + Drizzle; snapshot diário ativo"],
  [2,  "API Server deployado no Railway",                 "Dr. Code",            "1",   "Concluído",     "P0","M","esbuild + start script; PORT dinâmica; logs Pino"],
  [3,  "Token de colaborador no perímetro (Bearer)",      "Dr. Code",            "2",   "Concluído",     "P0","P","basicAuth aceita Bearer HMAC; PR #5 mesclado"],
  [4,  "Site/vitrine pública (parxis-site)",              "Dr. Replit",          "-",   "Concluído",     "P1","M","Artifact separado; captação de leads ativa"],
  [5,  "Portão de captação da vitrine",                   "Dr. Replit",          "4",   "Concluído",     "P1","P","Login gate + lead salvo no banco"],
  [6,  "Login do Padaxor sem segunda senha",              "Dr. Code / Dr. Replit","3",  "Concluído",     "P0","P","PR #5 + Bearer injetado; Railway aguarda redeploy"],
  [7,  "Backup automático do banco",                      "Dr. Code",            "1",   "Concluído",     "P0","P","Snapshot diário Railway configurado"],
  [8,  "Linha de produção sincronizada entre agentes",    "Dr. Replit",          "-",   "Concluído",     "P1","P","Este arquivo; Drive + repositório; CEO marca Estado"],
  [9,  "Isolamento multi-tenant entre clínicas",          "Dr. Replit",          "1",   "Aberto",        "P0","G","tenantContextMiddleware em TODAS as rotas; nenhuma venda antes disto"],
  [10, "Auditoria de rotas: vazamento entre empresas",    "Dr. Replit",          "9",   "Aberto",        "P0","M","varrer pages/ vs rotas vs sidebar; rota sem empresa_id = bloqueio"],
  [11, "RBAC por empresa (licenciado só vê a própria)",   "Dr. Code",            "9",   "Aberto",        "P0","G","requireRole por empresa_id; specs/governanca-multiclinica-PENDENTE.md"],
  [12, "DNS padaxor.com.br → Cloudflare",                 "Dr. Caio",            "-",   "Aguarda CEO",   "P1","P","Trocar NS no Registro.br; CEO clica no painel — DECISÃO 1"],
  [13, "Domínio próprio configurado no Railway",          "Dr. Code",            "12",  "Aguarda 12",    "P1","P","Custom domain no painel Railway após Cloudflare"],
  [14, "Login do licenciado (separado do CEO)",           "Dr. Replit",          "11",  "Aberto",        "P1","M","Tela própria; role=licenciado; acesso restrito à empresa"],
  [15, "Rebrand PAXTER → PADAXOR (telas internas)",       "Dr. Replit",          "-",   "Aguarda CEO",   "P1","M","Trocar textos visíveis; preservar identificadores técnicos — DECISÃO 5"],
  [16, "Catálogo de módulos com preços",                  "Dr. Replit",          "CEO", "Aguarda CEO",   "P2","M","Lista de módulos + R$ por módulo — DECISÃO 2 trava isto"],
  [17, "Cadeado nos módulos (moduleGuard por plano)",     "Dr. Replit",          "16",  "Aberto",        "P2","G","moduleGuard fábrica; contrato define quais módulos ativos"],
  [18, "Mensagem de desejo / upsell",                     "Dr. Replit",          "16",  "Aberto",        "P2","M","Banner ao tentar acessar módulo bloqueado; link de contato"],
  [19, "Bilhetagem de uso por clínica",                   "Dr. Code",            "17",  "Aberto",        "P2","G","Log de uso por empresa_id; relatório mensal para o CEO"],
  [20, "Onboarding automático ao fechar contrato",        "Dr. Replit",          "17",  "Aberto",        "P2","G","Webhook Asaas pago → cria empresa + usuário + ativa módulos"],
  [21, "Painel de domínios: credenciais Zoho",            "Dr. Caio",            "-",   "Aguarda CEO",   "P2","P","ZOHO_ORG_ID + ZOHO_ADMIN_TOKEN no Railway — DECISÃO 3"],
  [22, "E-mail transacional via Zoho por clínica",        "Dr. Replit",          "21",  "Aguarda 21",    "P2","M","CRUD aliases Zoho; e-mail branded por clínica licenciada"],
  [23, "ZapSign em produção (assinatura digital)",        "Dr. Code",            "-",   "Aguarda CEO",   "P2","P","Trocar token sandbox→produção — DECISÃO 4"],
  [24, "Portal do paciente (Área do Cliente)",            "Dr. Replit",          "17",  "Aberto",        "P2","G","Login pelo CPF; exames, receituário, agendamento"],
  [25, "Versão mobile PWA do Portal do Paciente",         "Dr. Lovable",         "24",  "Aguarda 24",    "P2","G","Lovable monta UI mobile-first; PWA instalável"],
  [26, "Notificações WhatsApp pós-consulta",              "Dr. Replit",          "24",  "Aberto",        "P2","M","Twilio; janela 24h; template aprovado Meta"],
  [27, "Dashboard SaaS CEO (receita, MRR, inadimplência)","Dr. Replit",          "19",  "Aberto",        "P3","G","Painel PADAXOR: clínicas ativas, MRR, alertas"],
  [28, "CI/CD automático (GitHub Actions)",               "Dr. Code",            "-",   "Aberto",        "P3","G","Sem CI hoje; erros só em produção; lint+build+test"],
  [29, "Suíte de testes end-to-end (Playwright)",         "Dr. Replit",          "28",  "Aberto",        "P3","G","Cobrir login, agenda, receituário, exames"],
  [30, "Renomear artifact padcom → padaxor",              "Dr. Replit",          "-",   "Aberto",        "P3","P","Slug + previewPath; preservar colunas banco e package name"],
  [31, "Planos do paciente (assinatura recorrente)",      "Dr. Lovable",         "24",  "Aguarda 24",    "P3","G","Lovable monta tela; Asaas assinatura recorrente"],
  [32, "Cockpit CEO v3 (SSE real-time)",                  "Dr. Replit",          "27",  "Aberto",        "P3","M","SSE /api/ceo/stream; push 30s; alertas de anomalia"],
  [33, "Documentação técnica viva (CODIGO-PAXTER.md)",    "Dr. Replit",          "-",   "Aberto",        "P3","P","Atualizar após cada onda; artefato .md no repositório"],
  [34, "Dr. Manus: varredura autônoma de tenant filter",  "Dr. Manus",           "28",  "Sem frente",    "P3","G","Auditar 35 tabelas, mapear gaps, gerar relatório de brechas"],
  [35, "Dr. Manus: testes de carga (10 clínicas)",        "Dr. Manus",           "28",  "Sem frente",    "P3","G","Simular 10 clínicas simultâneas; achar gargalos de performance"],
  [36, "Integração Telegram (canal alternativo)",         "Dr. Replit",          "26",  "Aberto",        "P3","M","Bot separado por clínica; sem conflito com WhatsApp"],
];

const matrizEquipe = [
  ["Membro","Território principal","Nunca toca sem avisar","Fase atual"],
  ["Dr. Caio (CEO)","Decisões de produto, preços, DNS, aprovações","Nenhum código — só responde decisões","CEO — desbloqueia a fila respondendo decisões"],
  ["Dr. Code","Infraestrutura Railway, CI/CD, migrations SQL, jobs, banco, deploy","Telas React e UX visual","Executa P0 infra + banco (itens 9–11, 13, 19, 23, 28)"],
  ["Dr. Replit","API routes, lógica de negócio, telas React, módulos clínicos, plantilha de produção","Infra Railway, CI config, banco em produção","Executa P0 isolamento multi-tenant + P1 login licenciado (itens 9–10, 14–18, 20, 22, 24)"],
  ["Dr. Lovable","UI mobile (PWA), telas do paciente, design system do front","Rotas de API, banco, jobs, deploy","Aguarda Portal do Paciente (item 24) para começar items 25 e 31"],
  ["Dr. Manus","Missões autônomas de análise, varredura, testes de carga, pesquisa","Deploy e banco em produção diretamente","Sem frente nesta fase; candidato natural para items 34 e 35"],
];

const decisoesCeo = [
  ["Nº","Decisão","Por que trava","Itens desbloqueados","Sua resposta (escreva aqui)"],
  [1,"Migrar DNS para Cloudflare (trocar NS no Registro.br)","Sem DNS próprio, padaxor.com.br não aponta para Railway","12, 13",""],
  [2,"Valores em reais de cada módulo (ex: Agenda R$X/mês, Exames R$Y/mês)","Sem preço não se monta catálogo nem cadeado de acesso","16, 17, 18",""],
  [3,"Credenciais Zoho (ZOHO_ORG_ID + ZOHO_ADMIN_TOKEN)","Sem credenciais o e-mail da clínica não é criado automaticamente","21, 22",""],
  [4,"Token ZapSign de produção","Receituários assinados vão para o ambiente de testes enquanto não trocar","23",""],
  [5,"Aprovar rebrand PAXTER → PADAXOR nas telas internas","Sem ordem explícita, mantemos PAXTER nas telas para não errar","15",""],
  [6,"Módulos no plano básico vs premium","Define o que o moduleGuard libera por padrão ao criar nova clínica","17",""],
  [7,"Política de multi-local para médicos (quantas clínicas por médico?)","Agenda virtual por cidade depende disto","14, 20",""],
  [8,"Portal do paciente: login por CPF ou por convite com link?","Afeta segurança e UX do item 24","24, 25",""],
  [9,"MRR mínimo para onboarding automático (abaixo = manual)","Abaixo de R$X, onboarding é manual; acima, dispara webhook Asaas","20",""],
  [10,"Repositório Parlegis: regra de isolamento entre projetos","Dois repositórios com mesmo esqueleto; sem regra, agente pode cair no lugar errado","Todos",""],
];

const leiame = [
  ["PADAXOR — Linha de Produção · versão 29/07/2026"],
  [""],
  ["Como usar esta planilha:"],
  [""],
  ["1.  Aba LINHA DE PRODUCAO"],
  ["    — Lista mestre de tudo que existe ou precisa ser feito (36 itens)."],
  ["    — Coluna ESTADO: Aberto / Em andamento / Concluído / Bloqueado / Aguarda CEO."],
  ["    — Coluna PRIORIDADE: P0 = incêndio, P1 = urgente, P2 = importante, P3 = pode esperar."],
  ["    — Coluna ESFORÇO: P = pequeno (< 1 dia), M = médio (1–3 dias), G = grande (> 3 dias)."],
  ["    — As outras colunas são território dos agentes. Não altere."],
  [""],
  ["2.  Aba MATRIZ DA EQUIPE"],
  ["    — Território de cada membro e o que ninguém toca sem avisar."],
  [""],
  ["3.  Aba DECISOES DO CEO"],
  ["    — Preencha APENAS a coluna 'Sua resposta'."],
  ["    — Cada resposta destrava os itens da coluna ao lado."],
  ["    — Comece pela decisão 1 (DNS) ou decisão 2 (preços dos módulos)."],
  ["    — Não responda as 10 de uma vez. Uma por vez."],
  [""],
  ["4.  Onde este arquivo vive:"],
  ["    — Google Drive / PADAXOR PROJETO → Dr. Caio edita aqui."],
  ["    — Repositório / docs/LINHA_DE_PRODUCAO/ → agentes leem aqui."],
  [""],
  ["Regra de ouro: um passo de cada vez."],
  ["Responda UMA decisão e avise o agente responsável pelo item desbloqueado."],
];

// ── WORKBOOK ─────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

const ws1 = XLSX.utils.aoa_to_sheet(linhaDeProducao);
ws1['!cols'] = [{wch:4},{wch:52},{wch:22},{wch:12},{wch:14},{wch:10},{wch:8},{wch:58}];
XLSX.utils.book_append_sheet(wb, ws1, "LINHA DE PRODUCAO");

const ws2 = XLSX.utils.aoa_to_sheet(matrizEquipe);
ws2['!cols'] = [{wch:18},{wch:58},{wch:50},{wch:40}];
XLSX.utils.book_append_sheet(wb, ws2, "MATRIZ DA EQUIPE");

const ws3 = XLSX.utils.aoa_to_sheet(decisoesCeo);
ws3['!cols'] = [{wch:4},{wch:58},{wch:55},{wch:22},{wch:32}];
XLSX.utils.book_append_sheet(wb, ws3, "DECISOES DO CEO");

const ws4 = XLSX.utils.aoa_to_sheet(leiame);
ws4['!cols'] = [{wch:95}];
XLSX.utils.book_append_sheet(wb, ws4, "LEIA-ME");

// Salvar
const outDir = '.agents/outputs';
fs.mkdirSync(outDir, { recursive: true });
const fileName = 'PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx';
const filePath = path.join(outDir, fileName);
XLSX.writeFile(wb, filePath);

const stat = fs.statSync(filePath);
console.log(`OK: ${filePath} — ${stat.size} bytes`);
