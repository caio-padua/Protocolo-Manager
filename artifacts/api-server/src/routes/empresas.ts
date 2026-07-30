import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { empresasTable, cargosTable, colaboradoresTable, locationsTable, empresaContratosTable } from "@workspace/db/schema";
import { eq, isNull, or } from "drizzle-orm";
import { isDriveConnected, uploadFileToDrive, driveListChildren, removeDiacritics, driveDownloadFile } from "../lib/google-drive";
import { google } from "googleapis";
import { ai } from "@workspace/integrations-gemini-ai";
import { requireAiTenant } from "../lib/ai-central";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

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
  "endereco","complemento","cep","bairro","cidade","estado","zona",
  // Endereço fiscal
  "enderecoFiscal","complementoFiscal","cepFiscal","bairroFiscal","cidadeFiscal","estadoFiscal","codigoIbge",
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

// Normaliza string para comparação: minúsculo, sem acento, sem pontuação
function norm(s: string | null | undefined): string {
  return removeDiacritics(s ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

// ── GET /empresas/drive-scan — escaneia pasta Drive e casa arquivos com empresas ──
router.get("/empresas/drive-scan", async (req, res): Promise<void> => {
  const folderId = String(req.query.folderId ?? "").trim();
  if (!folderId) { res.status(400).json({ error: "folderId obrigatório" }); return; }

  const driveOk = await isDriveConnected().catch(() => false);
  if (!driveOk) { res.status(503).json({ error: "Google Drive não conectado" }); return; }

  // Carrega empresas para o casamento
  const empresas = await db.select({
    id: empresasTable.id,
    nome: empresasTable.nome,
    razaoSocial: empresasTable.razaoSocial,
    ativa: empresasTable.ativa,
    isPlatformOwner: empresasTable.isPlatformOwner,
  }).from(empresasTable);

  const ativos = empresas.filter(e => e.ativa && !e.isPlatformOwner);

  // Coleta arquivos: nível raiz + um nível dentro de subpastas
  const raiz = await driveListChildren(folderId);
  const arquivos: Array<{ id: string; name: string; mimeType: string; size: number | null; parentFolder: string | null }> = [];

  for (const item of raiz) {
    if (item.isFolder) {
      const filhos = await driveListChildren(item.id);
      for (const f of filhos) {
        if (!f.isFolder) arquivos.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, parentFolder: item.name });
      }
    } else {
      arquivos.push({ id: item.id, name: item.name, mimeType: item.mimeType, size: item.size, parentFolder: null });
    }
  }

  // Casa cada arquivo com a melhor empresa
  const resultado = arquivos.map(arq => {
    const nomeNorm = norm(arq.name) + " " + norm(arq.parentFolder);
    let melhorId: number | null = null;
    let melhorScore = 0;

    for (const emp of ativos) {
      const termos = [emp.nome, emp.razaoSocial].flatMap(t =>
        norm(t).split(/\s+/).filter(w => w.length >= 4)
      );
      const score = termos.filter(t => nomeNorm.includes(t)).length;
      if (score > melhorScore) { melhorScore = score; melhorId = emp.id; }
    }

    return {
      driveFileId: arq.id,
      name: arq.name,
      mimeType: arq.mimeType,
      size: arq.size,
      parentFolder: arq.parentFolder,
      driveUrl: `https://drive.google.com/file/d/${arq.id}/view`,
      suggestedEmpresaId: melhorScore >= 1 ? melhorId : null,
    };
  });

  res.json({ total: resultado.length, arquivos: resultado, empresas: ativos.map(e => ({ id: e.id, nome: e.nome })) });
});

// ── POST /empresas/drive-import — vincula arquivos Drive à empresa_contratos (sem baixar) ──
router.post("/empresas/drive-import", async (req, res): Promise<void> => {
  const itens: Array<{ driveFileId: string; empresaId: number; tipo: string; nome: string; mimeType?: string; size?: number; driveUrl?: string }> = req.body.itens ?? [];
  if (!itens.length) { res.status(400).json({ error: "itens vazio" }); return; }

  const inseridos: number[] = [];
  for (const item of itens) {
    if (!item.driveFileId || !item.empresaId || !item.tipo || !item.nome) continue;
    const [doc] = await db.insert(empresaContratosTable).values({
      empresaId: item.empresaId,
      nome: item.nome,
      tipo: item.tipo,
      tamanhoBytes: item.size ?? null,
      mimeType: item.mimeType ?? null,
      driveFileId: item.driveFileId,
      driveUrl: item.driveUrl ?? `https://drive.google.com/file/d/${item.driveFileId}/view`,
      driveFolderId: null,
      observacao: "Importado do Drive",
    }).returning({ id: empresaContratosTable.id });
    if (doc) inseridos.push(doc.id);
  }

  res.json({ inseridos: inseridos.length, ids: inseridos });
});

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

// ── GET /empresas/:id/contratos — lista documentos da empresa ────────────────
router.get("/empresas/:id/contratos", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const docs = await db.select().from(empresaContratosTable)
    .where(eq(empresaContratosTable.empresaId, id))
    .orderBy(empresaContratosTable.criadoEm);
  res.json(docs);
});

// ── POST /empresas/:id/contratos — upload de documento ──────────────────────
router.post("/empresas/:id/contratos", upload.single("file"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  if (!req.file) { res.status(400).json({ error: "Arquivo não enviado" }); return; }

  const [empresa] = await db.select().from(empresasTable).where(eq(empresasTable.id, id));
  if (!empresa) { res.status(404).json({ error: "Empresa não encontrada" }); return; }

  const tipo = (req.body.tipo as string) || "outro";
  const observacao = (req.body.observacao as string) || null;
  const nomeOriginal = req.file.originalname;

  let driveFileId: string | null = null;
  let driveUrl: string | null = null;
  let driveFolderId: string | null = null;

  // Upload ao Drive: subfolder CONTRATOS dentro da pasta da empresa (se existir)
  const driveOk = await isDriveConnected().catch(() => false);
  if (driveOk && empresa.driveFolderEmpresaId) {
    try {
      const drive = await getDriveClient();
      const contratosFolderId = await driveFindOrCreate(drive, "CONTRATOS", empresa.driveFolderEmpresaId);
      const up = await uploadFileToDrive(contratosFolderId, nomeOriginal, req.file.mimetype, req.file.buffer, true);
      driveFileId = up.fileId;
      driveUrl = up.webViewLink;
      driveFolderId = contratosFolderId;
    } catch (driveErr: any) {
      req.log?.warn({ err: driveErr }, "Falha ao fazer upload ao Drive — metadado salvo sem arquivo Drive");
    }
  }

  const [doc] = await db.insert(empresaContratosTable).values({
    empresaId: id,
    nome: nomeOriginal,
    tipo,
    tamanhoBytes: req.file.size,
    mimeType: req.file.mimetype,
    driveFileId,
    driveUrl,
    driveFolderId,
    observacao,
  }).returning();

  res.status(201).json(doc);
});

// ── DELETE /empresas/:id/contratos/:docId — remove documento ─────────────────
router.delete("/empresas/:id/contratos/:docId", async (req, res): Promise<void> => {
  const docId = parseInt(req.params.docId);
  if (isNaN(docId)) { res.status(400).json({ error: "ID inválido" }); return; }
  await db.delete(empresaContratosTable).where(eq(empresaContratosTable.id, docId));
  res.json({ ok: true });
});

// ── POST /empresas/:id/auto-fill — extrai dados dos PDFs do Drive e preenche o cadastro ──
async function downloadPdfText(fileId: string): Promise<string> {
  let buffer: Buffer;
  try {
    buffer = await driveDownloadFile(fileId);
  } catch {
    return "";
  }
  // 1ª tentativa: pdf-parse (rápido, para PDFs com texto embutido)
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = (typeof result === "string" ? result : result?.text || "").trim();
    if (text.length > 150) return text;
  } catch { /* cai para visão */ }
  // 2ª tentativa: Gemini visão (PDFs escaneados / imagens incorporadas)
  try {
    requireAiTenant(0, "ocr");
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [
        { text: "Extraia TODO o texto deste documento exatamente como está escrito. Sem resumos, sem análises — apenas o texto bruto completo." },
        { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } }
      ]}],
      config: { maxOutputTokens: 8192 },
    });
    return resp.text?.trim() || "";
  } catch {
    return "";
  }
}

const EMPRESA_PROMPT = `Você é um extrator de dados cadastrais de empresas brasileiras.
Receberá texto bruto de documentos (CNPJ, contrato social, certidão) de uma empresa.
Extraia em JSON estrito os seguintes campos (use null quando não encontrar):

{
  "cnpj": "XX.XXX.XXX/XXXX-XX",
  "razaoSocial": "Razão social completa",
  "nomeFantasia": "Nome fantasia se houver",
  "cep": "XXXXX-XXX",
  "logradouro": "Rua/Av",
  "numero": "123",
  "complemento": "Sala/Apto",
  "bairro": "Bairro",
  "cidade": "Cidade",
  "estado": "UF (2 letras)",
  "telefone": "telefone principal",
  "email": "e-mail se houver",
  "responsavelLegalNome": "Nome do responsável legal / sócio administrador",
  "responsavelLegalCpf": "CPF do responsável legal",
  "cnaeDescricao": "Atividade principal (descrição do CNAE)",
  "capitalSocial": "Valor do capital social como string (ex: R$ 100.000,00)",
  "dataAbertura": "DD/MM/AAAA de abertura da empresa"
}

Responda SOMENTE com o JSON, sem markdown, sem comentários.`;

router.post("/empresas/:id/auto-fill", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [empresa] = await db.select().from(empresasTable).where(eq(empresasTable.id, id));
  if (!empresa) { res.status(404).json({ error: "Empresa não encontrada" }); return; }

  const contratos = await db.select().from(empresaContratosTable).where(eq(empresaContratosTable.empresaId, id));
  if (!contratos.length) { res.status(400).json({ error: "Nenhum documento vinculado" }); return; }

  const MIME_PDF = "application/pdf";
  const PDFs = contratos
    .filter(c => c.mimeType === MIME_PDF && c.driveFileId)
    .slice(0, 3);

  if (!PDFs.length) {
    res.status(400).json({ error: "Nenhum PDF disponível para extração" });
    return;
  }

  const textos: string[] = [];
  for (const doc of PDFs) {
    const t = await downloadPdfText(doc.driveFileId!);
    if (t.length > 50) textos.push(`=== ${doc.nome} ===\n${t.slice(0, 6000)}`);
  }

  if (!textos.length) {
    res.status(422).json({ error: "Não foi possível extrair texto dos PDFs" });
    return;
  }

  const combinedText = textos.join("\n\n").slice(0, 20000);
  let extracted: Record<string, string | null> = {};
  try {
    requireAiTenant(0, "ocr");
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: EMPRESA_PROMPT + "\n\nTEXTO:\n" + combinedText }] }],
    });
    const raw = resp.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw.trim().replace(/^```(?:json)?|```$/gm, "").trim();
    extracted = JSON.parse(clean);
  } catch (err) {
    res.status(502).json({ error: "Falha na extração AI: " + (err as Error).message });
    return;
  }

  const updates: Record<string, unknown> = {};
  const set = (dest: string, val: unknown) => { if (val != null && val !== "") updates[dest] = val; };

  set("cnpj", extracted.cnpj);
  set("razaoSocial", extracted.razaoSocial);
  set("cep", extracted.cep);
  set("bairro", extracted.bairro);
  set("cidade", extracted.cidade);
  set("estado", extracted.estado);
  set("telefone", extracted.telefone);
  set("responsavelLegalNome", extracted.responsavelLegalNome);
  set("responsavelLegalCpf", extracted.responsavelLegalCpf);
  set("cnaeDescricao", extracted.cnaeDescricao);

  // Endereço: logradouro+numero → enderecoFiscal; complemento → complementoFiscal separado
  const endParts = [extracted.logradouro, extracted.numero].filter(Boolean);
  if (endParts.length) set("enderecoFiscal", endParts.join(", "));
  if (extracted.complemento) set("complementoFiscal", extracted.complemento);

  // capitalSocial: tirar R$ e espaços, manter só número
  if (extracted.capitalSocial) {
    const num = String(extracted.capitalSocial).replace(/[R$\s.]/g, "").replace(",", ".");
    const parsed = parseFloat(num);
    if (!isNaN(parsed)) set("capitalSocial", parsed.toFixed(2));
  }

  // dataAbertura: converter DD/MM/AAAA → AAAA-MM-DD para coluna date
  if (extracted.dataAbertura) {
    const parts = String(extracted.dataAbertura).match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (parts) set("dataAbertura", `${parts[3]}-${parts[2]}-${parts[1]}`);
  }

  const [updated] = await db.update(empresasTable)
    .set(updates as never)
    .where(eq(empresasTable.id, id))
    .returning();

  res.json({ ok: true, empresa: updated, extraido: extracted, camposAtualizados: Object.keys(updates) });
});

export default router;
