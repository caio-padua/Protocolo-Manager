import { Router } from "express";
import { db } from "@workspace/db";
import { empresasTable, cargosTable, colaboradoresTable, locationsTable } from "@workspace/db/schema";
import { eq, isNull, or } from "drizzle-orm";
import { isDriveConnected } from "../lib/google-drive";
import { google } from "googleapis";

const router = Router();

// ── CAMPOS SENSÍVEIS — nunca retornam no GET público ──────────────────────────
// Falha 1 (IHE audit): tokens de integração vazavam via GET sem auth.
// Falha 5 (IHE audit): CPF do responsável legal e colaboradores expostos em texto.
const CAMPOS_CREDENCIAL = new Set([
  "zapsignToken",
  "waToken",
  "twilioAuthToken",
  "telegramBotToken",
  "certFileId",           // localização do certificado A1 no Drive
  "certDriveFolderId",
]);

// CPF: exibe só os 4 últimos dígitos visíveis — "***.***.***-06"
function mascaraCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return "***.***.***-**";
  return `***.***.*${limpo[7]}${limpo[8]}-${limpo[9]}${limpo[10]}`;
}

type EmpresaRow = typeof empresasTable.$inferSelect;

// Remove credenciais e mascara CPF antes de enviar ao cliente
function sanitizarEmpresa(row: EmpresaRow) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (CAMPOS_CREDENCIAL.has(k)) {
      // Retorna indicador booleano: o campo está configurado (true) ou vazio (false)
      // O front pode mostrar "✓ Configurado" sem expor o valor
      out[k + "Configurado"] = !!v;
    } else if (k === "responsavelLegalCpf") {
      out[k] = mascaraCpf(v as string);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Todos os campos editáveis da tabela empresas (exceto credenciais — essas têm rota própria)
const CAMPOS_EMPRESA = [
  "nome","razaoSocial","nick","cnpj","tipo","tipoUnidade","status","ativa","donoNome","slug","timezone",
  // Fiscal/Jurídico
  "cnae","cnaeDescricao","cnaesSecundarios","naturezaJuridica","regimeTributario",
  "inscricaoEstadual","inscricaoMunicipal","dataAbertura","capitalSocial",
  // Responsável + Contador
  "responsavelLegalNome","responsavelLegalCpf",
  "contadorNome","contadorCrc","contadorEmail","contadorTelefone",
  // Endereço comercial
  "endereco","cep","bairro","cidade","estado","zona",
  // Endereço fiscal
  "enderecoFiscal","cepFiscal","bairroFiscal","cidadeFiscal","estadoFiscal","codigoIbge",
  // Contatos
  "telefone","emailGeral","emailAgenda","emailEnfermagem","emailFinanceiro",
  // NF-e / NFS-e
  "nfeAmbiente","nfeSerie","nfeProximoNumero","nfeCodigoServico","nfeAliquotaIss",
  "nfeCodigoIss","nfeDiscriminacaoPadrao","optanteSimples",
  // Certificado digital (campos públicos — sem certFileId/certDriveFolderId)
  "certTipo","certFileName","certValidade","certStatus",
  // ZapSign (campos públicos — sem zapsignToken)
  "zapsignContaCriada","zapsignEmail",
  // WhatsApp (campos públicos — sem waToken)
  "waNumero","waPhoneNumberId","waBusinessAccountId",
  // Twilio (campos públicos — sem twilioAuthToken)
  "twilioAccountSid","twilioNumero",
  // Telegram (campos públicos — sem telegramBotToken)
  "telegramChatId","telegramBotUsername",
  // Zoho / Google
  "zohoEmail","zohoStatus","googleCalendarId","googleDriveFolderId",
  // Drive/Documentos
  "driveFolderEmpresaId","driveContratoSocialId","driveAlvaraId","driveCrmId",
  // Módulos e contrato
  "modulosAtivos","tipoContrato","fatMetaMensal",
  // Pirâmide de licenciamento (16/07/2026)
  "tipoLicenciamento","empresaMaeId","royaltyPercent","valorMensalContrato","isPlatformOwner",
];

// Campos que aceitam credencial no PUT (gravação — protegida pelo collaboratorGuard global)
const CAMPOS_CREDENCIAL_ESCRITA = [
  "zapsignToken","waToken","twilioAuthToken","telegramBotToken","certFileId","certDriveFolderId",
];

// ── HELPERS INTERNOS ──────────────────────────────────────────────────────────

async function getDriveClient() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken || !hostname) throw new Error("Drive: token de acesso ausente");

  const conn = await fetch("https://" + hostname + "/api/v2/connection?include_secrets=true", {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  }).then(r => r.json()).then((d: any) => d.items?.find((i: any) => i.connector_name === "google-drive"));

  const token = conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new Error("Google Drive não conectado");

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.drive({ version: "v3", auth });
}

async function driveCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
  const meta: any = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];
  const r = await drive.files.create({ requestBody: meta, fields: "id" });
  return r.data.id!;
}

async function driveFindFolder(drive: any, name: string, parentId?: string): Promise<string | null> {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const r = await drive.files.list({ q, fields: "files(id)", spaces: "drive" });
  return r.data.files?.[0]?.id ?? null;
}

async function driveFindOrCreate(drive: any, name: string, parentId?: string): Promise<string> {
  const found = await driveFindFolder(drive, name, parentId);
  if (found) return found;
  return driveCreateFolder(drive, name, parentId);
}

// ── EMPRESAS ──────────────────────────────────────────────────────────────────

// ── GET /empresas/hierarquia — árvore da pirâmide (antes do /:id para não colidir) ──
router.get("/empresas/hierarquia", async (req, res): Promise<void> => {
  const todasEmpresas = await db.select().from(empresasTable).orderBy(empresasTable.id);
  const todasLocations = await db.select({
    id: locationsTable.id,
    name: locationsTable.name,
    empresaId: locationsTable.empresaId,
  }).from(locationsTable);

  // Agrupar unidades por empresa
  const unidadesPorEmpresa: Record<number, string[]> = {};
  for (const loc of todasLocations) {
    const eid = loc.empresaId ?? 0;
    if (!unidadesPorEmpresa[eid]) unidadesPorEmpresa[eid] = [];
    unidadesPorEmpresa[eid].push(loc.name);
  }

  type EmpresaNo = {
    id: number; nome: string; tipoLicenciamento: string; status: string;
    donoNome: string | null; valorMensalContrato: string | null;
    royaltyPercent: string | null; isPlatformOwner: boolean;
    driveFolderEmpresaId: string | null; empresaMaeId: number | null;
    locations: string[]; filhos: EmpresaNo[];
  };

  const map = new Map<number, EmpresaNo>();
  for (const e of todasEmpresas) {
    map.set(e.id, {
      id: e.id, nome: e.nome, tipoLicenciamento: e.tipoLicenciamento,
      status: e.status, donoNome: e.donoNome, valorMensalContrato: e.valorMensalContrato,
      royaltyPercent: e.royaltyPercent, isPlatformOwner: e.isPlatformOwner,
      driveFolderEmpresaId: e.driveFolderEmpresaId,
      empresaMaeId: e.empresaMaeId,
      locations: unidadesPorEmpresa[e.id] ?? [],
      filhos: [],
    });
  }

  // Montar árvore
  const raizes: EmpresaNo[] = [];
  for (const node of map.values()) {
    if (node.empresaMaeId && map.has(node.empresaMaeId)) {
      map.get(node.empresaMaeId)!.filhos.push(node);
    } else {
      raizes.push(node);
    }
  }

  // Platform owner no topo; o resto como filhos
  const owner = raizes.find(r => r.isPlatformOwner) ?? null;
  const semOwner = raizes.filter(r => !r.isPlatformOwner);
  if (owner) {
    owner.filhos.push(...semOwner);
    res.json({ raiz: owner });
  } else {
    res.json({ raiz: null, raizes: semOwner });
  }
});

router.get("/empresas", async (req, res): Promise<void> => {
  const rows = await db.select().from(empresasTable).orderBy(empresasTable.id);
  res.json(rows.map(sanitizarEmpresa));
});

router.get("/empresas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(empresasTable).where(eq(empresasTable.id, id));
  if (!row) { res.status(404).json({ error: "Empresa não encontrada" }); return; }

  const cargos = await db.select().from(cargosTable).where(eq(cargosTable.empresaId, id));
  const colaboradores = await db
    .select().from(colaboradoresTable).where(eq(colaboradoresTable.empresaId, id))
    .then(rows => rows.map(c => ({ ...c, cpf: mascaraCpf(c.cpf) })));

  res.json({ ...sanitizarEmpresa(row), cargos, colaboradores });
});

// ── Rota de credenciais — exclusiva para o CEO (protegida) ───────────────────
// TODO Fase 1: adicionar guard de role "ceo" quando o sistema de roles existir.
// Por ora: rota separada documentada — não retorna no GET padrão.
router.get("/empresas/:id/integracoes", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(empresasTable).where(eq(empresasTable.id, id));
  if (!row) { res.status(404).json({ error: "Empresa não encontrada" }); return; }

  // Retorna SOMENTE os campos de credencial — nada mais
  res.json({
    zapsignToken: row.zapsignToken ? "••••" + row.zapsignToken.slice(-4) : null,
    waToken: row.waToken ? "••••" + row.waToken.slice(-4) : null,
    twilioAuthToken: row.twilioAuthToken ? "••••" + row.twilioAuthToken.slice(-4) : null,
    telegramBotToken: row.telegramBotToken ? "••••" + row.telegramBotToken.slice(-4) : null,
    certFileId: row.certFileId,
    certDriveFolderId: row.certDriveFolderId,
  });
});

router.post("/empresas", async (req, res): Promise<void> => {
  const body = req.body;
  if (!body.nome) { res.status(400).json({ error: "nome é obrigatório" }); return; }

  const nick = (body.nick || body.nome).toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "").slice(0, 20);
  const zohoSugerido = body.zohoEmail || `${nick}@padcon.com.br`;

  const payload: Record<string, unknown> = {
    nome: body.nome,
    tipo: body.tipo || "clinic",
    status: body.status || "ATIVO",
    ativa: body.ativa ?? true,
    modulosAtivos: body.modulosAtivos || {},
    zohoEmail: zohoSugerido,
    zohoStatus: body.zohoStatus || "sugerido",
  };

  const todosCampos = [...CAMPOS_EMPRESA, ...CAMPOS_CREDENCIAL_ESCRITA];
  for (const campo of todosCampos) {
    if (campo in body && payload[campo] === undefined) {
      payload[campo] = body[campo];
    }
  }

  const [inserted] = await db.insert(empresasTable).values(payload as never).returning();
  res.status(201).json(sanitizarEmpresa(inserted));
});

router.put("/empresas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const updates: Record<string, unknown> = { atualizadoEm: new Date() };
  const todosCampos = [...CAMPOS_EMPRESA, ...CAMPOS_CREDENCIAL_ESCRITA];
  for (const f of todosCampos) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const [updated] = await db.update(empresasTable).set(updates).where(eq(empresasTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  res.json(sanitizarEmpresa(updated));
});

router.delete("/empresas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [emp] = await db.select().from(empresasTable).where(eq(empresasTable.id, id));
  if (!emp) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  if (emp.tipo === "genesis_seed") { res.status(409).json({ error: "Template Genesis não pode ser apagado." }); return; }
  await db.delete(empresasTable).where(eq(empresasTable.id, id));
  res.json({ ok: true });
});

// ── POST /empresas/:id/setup-drive — cria pasta raiz no Drive por empresa ────
router.post("/empresas/:id/setup-drive", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [empresa] = await db.select().from(empresasTable).where(eq(empresasTable.id, id));
  if (!empresa) { res.status(404).json({ error: "Empresa não encontrada" }); return; }

  // Idempotente: se já tem pasta, retorna existente
  if (empresa.driveFolderEmpresaId) {
    res.json({
      ok: true,
      folderId: empresa.driveFolderEmpresaId,
      folderUrl: `https://drive.google.com/drive/folders/${empresa.driveFolderEmpresaId}`,
      existente: true,
    });
    return;
  }

  // Verificar se Drive está conectado
  const driveOk = await isDriveConnected().catch(() => false);
  if (!driveOk) {
    res.status(503).json({ error: "Google Drive não conectado. Configure a integração em Configurações." });
    return;
  }

  try {
    const drive = await getDriveClient();

    // Nome da pasta: "EMPRESAS/NOME [CNPJ]" ou "EMPRESAS/NOME"
    const nomePasta = empresa.cnpj
      ? `${empresa.nome.toUpperCase()} [${empresa.cnpj}]`
      : empresa.nome.toUpperCase();

    // Criar/encontrar pasta raiz EMPRESAS
    const raizId = await driveFindOrCreate(drive, "EMPRESAS");

    // Criar pasta da empresa dentro de EMPRESAS
    const empresaPastaId = await driveFindOrCreate(drive, nomePasta, raizId);

    // Criar subpastas da empresa
    const SUBPASTAS = ["CLIENTES", "CONTRATOS", "CERTIFICADOS", "FINANCEIRO", "COMUNICAÇÃO", "DOCUMENTOS", "EQUIPE"];
    await Promise.all(SUBPASTAS.map(sub => driveFindOrCreate(drive, sub, empresaPastaId)));

    // Salvar no banco
    await db.update(empresasTable)
      .set({ driveFolderEmpresaId: empresaPastaId, atualizadoEm: new Date() })
      .where(eq(empresasTable.id, id));

    res.json({
      ok: true,
      folderId: empresaPastaId,
      folderUrl: `https://drive.google.com/drive/folders/${empresaPastaId}`,
      subpastas: SUBPASTAS,
    });
  } catch (err: any) {
    req.log?.error({ err }, "setup-drive error");
    res.status(500).json({ error: `Falha ao criar pasta no Drive: ${err?.message ?? "erro desconhecido"}` });
  }
});

// ── CARGOS ────────────────────────────────────────────────────────────────────

router.get("/empresas/:id/cargos", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const rows = await db.select().from(cargosTable).where(eq(cargosTable.empresaId, id));
  res.json(rows);
});

router.post("/empresas/:id/cargos", async (req, res): Promise<void> => {
  const empresaId = parseInt(req.params.id);
  const { cargo, indice, codigoCompleto, modalidade, slaDefault, descricaoFuncao,
    podeAcessarFinanceiro, podeEditarProtocolos, podeAprovarDespesas,
    podeAuditarCards, podeVerOuvidoria, podeSupervisionar } = req.body;
  if (!cargo) { res.status(400).json({ error: "cargo é obrigatório" }); return; }
  const [inserted] = await db.insert(cargosTable).values({
    empresaId, cargo, indice, codigoCompleto, modalidade, slaDefault, descricaoFuncao,
    podeAcessarFinanceiro: podeAcessarFinanceiro ?? false,
    podeEditarProtocolos: podeEditarProtocolos ?? false,
    podeAprovarDespesas: podeAprovarDespesas ?? false,
    podeAuditarCards: podeAuditarCards ?? false,
    podeVerOuvidoria: podeVerOuvidoria ?? false,
    podeSupervisionar: podeSupervisionar ?? false,
  }).returning();
  res.status(201).json(inserted);
});

router.put("/empresas/:id/cargos/:cargoId", async (req, res): Promise<void> => {
  const cargoId = parseInt(req.params.cargoId);
  if (isNaN(cargoId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const fields = ["cargo","indice","codigoCompleto","modalidade","slaDefault","descricaoFuncao",
    "podeAcessarFinanceiro","podeEditarProtocolos","podeAprovarDespesas",
    "podeAuditarCards","podeVerOuvidoria","podeSupervisionar","ativa"];
  const updates: Record<string, unknown> = {};
  for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  const [updated] = await db.update(cargosTable).set(updates).where(eq(cargosTable.id, cargoId)).returning();
  if (!updated) { res.status(404).json({ error: "Cargo não encontrado" }); return; }
  res.json(updated);
});

router.delete("/empresas/:id/cargos/:cargoId", async (req, res): Promise<void> => {
  const cargoId = parseInt(req.params.cargoId);
  if (isNaN(cargoId)) { res.status(400).json({ error: "ID inválido" }); return; }
  await db.delete(cargosTable).where(eq(cargosTable.id, cargoId));
  res.json({ ok: true });
});

// ── COLABORADORES ─────────────────────────────────────────────────────────────

router.get("/empresas/:id/colaboradores", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const rows = await db.select().from(colaboradoresTable).where(eq(colaboradoresTable.empresaId, id));
  // CPF mascarado — LGPD (Falha 5 auditoria IHE)
  res.json(rows.map(c => ({ ...c, cpf: mascaraCpf(c.cpf) })));
});

router.post("/empresas/:id/colaboradores", async (req, res): Promise<void> => {
  const empresaId = parseInt(req.params.id);
  const { nomeCompleto, cpf, emailFuncional, telefone, statusAtivo, dataAdmissao, dataDemissao, cargoId } = req.body;
  if (!nomeCompleto) { res.status(400).json({ error: "nomeCompleto é obrigatório" }); return; }
  const [inserted] = await db.insert(colaboradoresTable).values({
    empresaId, nomeCompleto, cpf, emailFuncional, telefone,
    statusAtivo: statusAtivo ?? true, dataAdmissao, dataDemissao, cargoId,
  }).returning();
  // Retorna com CPF mascarado
  res.status(201).json({ ...inserted, cpf: mascaraCpf(inserted.cpf) });
});

router.put("/empresas/:id/colaboradores/:colabId", async (req, res): Promise<void> => {
  const colabId = parseInt(req.params.colabId);
  if (isNaN(colabId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const fields = ["nomeCompleto","cpf","emailFuncional","telefone","statusAtivo","dataAdmissao","dataDemissao","cargoId"];
  const updates: Record<string, unknown> = {};
  for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  const [updated] = await db.update(colaboradoresTable).set(updates).where(eq(colaboradoresTable.id, colabId)).returning();
  if (!updated) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }
  res.json({ ...updated, cpf: mascaraCpf(updated.cpf) });
});

router.delete("/empresas/:id/colaboradores/:colabId", async (req, res): Promise<void> => {
  const colabId = parseInt(req.params.colabId);
  if (isNaN(colabId)) { res.status(400).json({ error: "ID inválido" }); return; }
  await db.delete(colaboradoresTable).where(eq(colaboradoresTable.id, colabId));
  res.json({ ok: true });
});

export default router;
