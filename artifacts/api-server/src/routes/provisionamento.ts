/**
 * provisionamento.ts — Simulação a seco do loop de abertura de clínica (Art. 58)
 *
 * GET /api/provisionamento/dry-run?nome=<ficticio>&cnpj=<teste>
 *
 * NUNCA cria nada. Mostra o que SERIA feito em cada um dos 6 passos,
 * o que já existe no código hoje, e o que falta para cada etapa.
 *
 * Regra absoluta: use nome e CNPJ fictícios. Jamais dados reais.
 */

import { Router } from "express";
import { isDriveConnected } from "../lib/google-drive";

// Subpastas criadas para EMPRESA (POST /empresas/:id/setup-drive)
const EMPRESA_SUBFOLDERS = [
  "CLIENTES",
  "CONTRATOS",
  "CERTIFICADOS",
  "FINANCEIRO",
  "COMUNICAÇÃO",
  "DOCUMENTOS",
  "EQUIPE",
];

// Subpastas criadas para PACIENTES (CLIENT_SUBFOLDERS em google-drive.ts)
// Essas 15 existem no código mas são para a pasta do PACIENTE, não da clínica.
const PACIENTE_SUBFOLDERS = [
  "CADASTRO", "PATOLOGIAS", "EXAMES", "AVALIACOES", "RECEITAS",
  "PROTOCOLOS", "FINANCEIRO", "CONTRATOS", "ATESTADOS", "LAUDOS",
  "TERMOS", "FOTO PERFIL", "IMAGENS", "PESQUISA", "OUVIDORIA",
];

const DRIVE_ROOT_EMPRESAS = "12QD1LsvJuPK3jC6-lqXSbPeiry9ocUob";

const router = Router();

// ── GET /api/provisionamento/dry-run ──────────────────────────────────────────
// Simula o loop completo de abertura de clínica sem criar nada.
// Parâmetros: ?nome=CLINICA+FICTICIA&cnpj=00.000.000/0001-00
router.get("/provisionamento/dry-run", async (req, res): Promise<void> => {
  const nome = String(req.query.nome ?? "CLINICA DEMO TESTE").trim();
  const cnpj = String(req.query.cnpj ?? "00.000.000/0001-00").trim();

  if (nome.length < 3) {
    res.status(400).json({ error: "Parâmetro 'nome' precisa ter ao menos 3 caracteres." });
    return;
  }

  const nomeUpper  = nome.toUpperCase().replace(/-/g, " ").trim();
  const slug       = nome.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "").slice(0, 20);
  const nomePasta  = cnpj ? `${nomeUpper} ${cnpj}` : nomeUpper;
  const driveOk    = await isDriveConnected();

  // ── Passo 1: Gatilho de contrato / pagamento ────────────────────────────────
  const passo1 = {
    passo: 1,
    titulo: "Contrato assinado / pagamento confirmado",
    item_fila: "—",
    existe_hoje: false,
    descricao_atual:
      "Não existe gatilho automático. O CEO abre a clínica manualmente " +
      "via painel (POST /api/empresas) ou via importação. " +
      "O Asaas já está integrado (webhooks de pagamento), mas o " +
      "listener que dispara o provisionamento automático não foi construído.",
    seria_criado: null,
    falta:
      "Webhook automático: Asaas confirma pagamento → POST /api/provisionamento/iniciar " +
      "→ executa passos 2-6 em sequência. " +
      "Depende de: item 19 (bilhetagem) e decisão do CEO sobre MRR mínimo (Decisão 9).",
    depende_de: "Item 19 da fila + Decisão 9 do CEO",
  };

  // ── Passo 2: Pasta raiz da empresa no Drive ─────────────────────────────────
  const passo2 = {
    passo: 2,
    titulo: "Pasta raiz da empresa no Google Drive",
    item_fila: "ensureEmpresaFolder() — já existe",
    existe_hoje: true,
    descricao_atual:
      "Função ensureEmpresaFolder(nomeFantasia, cnpj, rootFolderId) " +
      "em lib/google-drive.ts. Idempotente. " +
      "Rota de disparo: POST /api/empresas/:id/setup-drive.",
    seria_criado: {
      nome_pasta: nomePasta,
      dentro_de: `Drive → ID ${DRIVE_ROOT_EMPRESAS}`,
      nomenclatura: "[NOME FANTASIA MAIÚSCULO] [CNPJ]",
      url_exemplo: `https://drive.google.com/drive/folders/<id-gerado>`,
    },
    falta: driveOk
      ? null
      : "ATENÇÃO: Drive não está conectado neste ambiente. " +
        "Reconectar via OAuth (painel → Integrações).",
    drive_conectado: driveOk,
  };

  // ── Passo 3: Subpastas dentro da pasta da empresa ───────────────────────────
  const passo3 = {
    passo: 3,
    titulo: "Subpastas dentro da pasta da empresa",
    item_fila: "POST /api/empresas/:id/setup-drive — parcialmente existe",
    existe_hoje: "parcial",
    descricao_atual:
      "O setup-drive cria 7 subpastas para a empresa: " +
      EMPRESA_SUBFOLDERS.join(", ") + ". " +
      "As 15 subpastas que o CEO listou (CADASTRO, PATOLOGIAS etc.) " +
      "existem no código em CLIENT_SUBFOLDERS, mas são para a pasta " +
      "do PACIENTE — não da clínica.",
    subpastas_empresa_existentes: EMPRESA_SUBFOLDERS,
    subpastas_paciente_existentes: PACIENTE_SUBFOLDERS,
    seria_criado: EMPRESA_SUBFOLDERS.map(sub => ({
      nome: sub,
      dentro_de: nomePasta,
    })),
    falta:
      "Se o CEO quiser as mesmas 15 subpastas dos pacientes também " +
      "dentro da pasta da clínica, é nova funcionalidade " +
      "(não está construída para empresas — apenas para pacientes).",
  };

  // ── Passo 4: E-mail da clínica no domínio do CEO ────────────────────────────
  const emailClinica = `${slug}@padaxor.com.br`;
  const passo4 = {
    passo: 4,
    titulo: "E-mail da clínica no domínio padaxor.com.br",
    item_fila: "Item 22 (Zoho) — NÃO EXISTE",
    existe_hoje: false,
    seria_criado: null,
    descricao_atual:
      "Nenhum código de criação de e-mail implementado. " +
      "AVISO IMPORTANTE: criar conta Gmail por programa viola os " +
      "Termos de Serviço do Google. O caminho correto é criar o e-mail " +
      `no domínio padaxor.com.br via Zoho (ex.: ${emailClinica}).`,
    email_exemplo: emailClinica,
    falta: [
      "1. CEO migra DNS para Cloudflare (item 13 — Decisão 1)",
      "2. CEO fornece credenciais Zoho: ZOHO_ORG_ID + ZOHO_ADMIN_TOKEN (item 21 — Decisão 3)",
      "3. Dr. Replit constrói a rota POST /api/empresas/:id/setup-email via Zoho API (item 22)",
    ],
    depende_de: "Decisão 1 do CEO (DNS) + Decisão 3 do CEO (Zoho) + itens 21 e 22 da fila",
  };

  // ── Passo 5: Subdomínio clinica-x.padaxor.com.br ────────────────────────────
  const subdomain = `${slug}.padaxor.com.br`;
  const passo5 = {
    passo: 5,
    titulo: `Subdomínio ${subdomain}`,
    item_fila: "Item 27 (DNS automático) — NÃO EXISTE, bloqueado pelo item 13",
    existe_hoje: false,
    seria_criado: null,
    descricao_atual:
      "Não existe código de provisionamento de DNS. " +
      "O CF_API_TOKEN (Cloudflare) com permissão DNS Write já está " +
      "disponível nos Secrets do Replit — o código pode criar o subdomínio " +
      "via Cloudflare API assim que o DNS for migrado.",
    subdomain_exemplo: subdomain,
    falta: [
      "1. CEO migra nameservers do Registro.br para Cloudflare (item 13 — Decisão 1)",
      "   Como: dash.cloudflare.com → Adicionar site → padaxor.com.br → copiar 2 nameservers → Registro.br → alterar NS",
      "2. Após DNS ativo: Dr. Replit constrói POST /api/empresas/:id/setup-dns",
      "   (CF_API_TOKEN já tem DNS Write — leva ~1 dia de código)",
    ],
    depende_de: "Decisão 1 do CEO (DNS padaxor.com.br → Cloudflare)",
    token_cloudflare_disponivel: true,
  };

  // ── Passo 6: Linha na tabela de empresas ────────────────────────────────────
  const passo6 = {
    passo: 6,
    titulo: "Linha na tabela de empresas (empresa_id gerado)",
    item_fila: "POST /api/empresas — já existe",
    existe_hoje: true,
    descricao_atual:
      "Tabela 'empresas' existe com todas as colunas necessárias. " +
      "Rota POST /api/empresas cria a linha e retorna o empresa_id gerado.",
    seria_criado: {
      id: "(próximo serial do banco — ex.: 12)",
      nome: nomeUpper,
      razaoSocial: `${nomeUpper} LTDA`,
      cnpj: cnpj,
      slug: slug,
      ativa: true,
      isPlatformOwner: false,
      status: "ativo",
      tipoLicenciamento: "saas_basico",
      driveFolderEmpresaId: "(preenchido após passo 2 — setup-drive)",
      emailGeral: `${slug}@padaxor.com.br`,
      createdAt: new Date().toISOString(),
    },
    falta: null,
  };

  // ── Tabela resumo ────────────────────────────────────────────────────────────
  const tabela = [
    { passo: 1, titulo: "Gatilho contrato/pagamento",         existe: "❌ NÃO EXISTE", falta: "Webhook Asaas + item 19" },
    { passo: 2, titulo: "Pasta raiz no Drive",                existe: "✅ EXISTE",      falta: driveOk ? "—" : "Drive desconectado" },
    { passo: 3, titulo: "Subpastas da empresa (7)",           existe: "✅ EXISTE (7)",  falta: "15 subpastas = só para PACIENTE" },
    { passo: 4, titulo: "E-mail @padaxor.com.br",            existe: "❌ NÃO EXISTE", falta: "Zoho (Decisão 3) + DNS (Decisão 1)" },
    { passo: 5, titulo: `Subdomínio ${subdomain}`,            existe: "❌ NÃO EXISTE", falta: "DNS Cloudflare (Decisão 1 do CEO)" },
    { passo: 6, titulo: "Linha na tabela de empresas",        existe: "✅ EXISTE",      falta: "—" },
  ];

  res.json({
    dry_run: true,
    aviso: "SIMULAÇÃO A SECO — nenhuma pasta, e-mail, DNS ou linha de banco foi criada.",
    clinica_ficticia: {
      nome: nomeUpper,
      cnpj: cnpj,
      slug: slug,
      subdomain: subdomain,
      email_previsto: `${slug}@padaxor.com.br`,
    },
    resumo: tabela,
    detalhes: [passo1, passo2, passo3, passo4, passo5, passo6],
    proximos_passos_para_o_ceo: [
      "Decisão 1: Migrar DNS padaxor.com.br → Cloudflare (destrava itens 12, 13, 22, 27)",
      "Decisão 3: Fornecer ZOHO_ORG_ID + ZOHO_ADMIN_TOKEN (destrava itens 21, 22)",
      "Decisão 9: Definir MRR mínimo para onboarding automático (destrava item 20)",
    ],
  });
});

export default router;
