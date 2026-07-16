import { Router } from "express";
import { db } from "@workspace/db";
import { empresasTable, cargosTable, colaboradoresTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Todos os campos editáveis da tabela empresas
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
  // Certificado digital
  "certTipo","certDriveFolderId","certFileId","certFileName","certValidade","certStatus",
  // ZapSign
  "zapsignToken","zapsignContaCriada","zapsignEmail",
  // WhatsApp
  "waNumero","waPhoneNumberId","waBusinessAccountId","waToken",
  // Twilio por empresa
  "twilioAccountSid","twilioAuthToken","twilioNumero",
  // Telegram
  "telegramBotToken","telegramChatId","telegramBotUsername",
  // Zoho
  "zohoEmail","zohoStatus",
  // Google
  "googleCalendarId","googleDriveFolderId",
  // Drive/Documentos
  "driveFolderEmpresaId","driveContratoSocialId","driveAlvaraId","driveCrmId",
  // Módulos e contrato
  "modulosAtivos","tipoContrato","fatMetaMensal",
];

// ── EMPRESAS ──────────────────────────────────────────────────────────────────

router.get("/empresas", async (req, res): Promise<void> => {
  const rows = await db.select().from(empresasTable).orderBy(empresasTable.id);
  res.json(rows);
});

router.get("/empresas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(empresasTable).where(eq(empresasTable.id, id));
  if (!row) { res.status(404).json({ error: "Empresa não encontrada" }); return; }

  const cargos = await db.select().from(cargosTable).where(eq(cargosTable.empresaId, id));
  const colaboradores = await db.select().from(colaboradoresTable).where(eq(colaboradoresTable.empresaId, id));
  res.json({ ...row, cargos, colaboradores });
});

router.post("/empresas", async (req, res): Promise<void> => {
  const body = req.body;
  if (!body.nome) { res.status(400).json({ error: "nome é obrigatório" }); return; }

  // Sugestão automática de e-mail Zoho ao criar
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

  for (const campo of CAMPOS_EMPRESA) {
    if (campo in body && payload[campo] === undefined) {
      payload[campo] = body[campo];
    }
  }

  const [inserted] = await db.insert(empresasTable).values(payload as never).returning();
  res.status(201).json(inserted);
});

router.put("/empresas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const updates: Record<string, unknown> = { atualizadoEm: new Date() };
  for (const f of CAMPOS_EMPRESA) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const [updated] = await db.update(empresasTable).set(updates).where(eq(empresasTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  res.json(updated);
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
  res.json(rows);
});

router.post("/empresas/:id/colaboradores", async (req, res): Promise<void> => {
  const empresaId = parseInt(req.params.id);
  const { nomeCompleto, cpf, emailFuncional, telefone, statusAtivo, dataAdmissao, dataDemissao, cargoId } = req.body;
  if (!nomeCompleto) { res.status(400).json({ error: "nomeCompleto é obrigatório" }); return; }
  const [inserted] = await db.insert(colaboradoresTable).values({
    empresaId, nomeCompleto, cpf, emailFuncional, telefone,
    statusAtivo: statusAtivo ?? true, dataAdmissao, dataDemissao, cargoId,
  }).returning();
  res.status(201).json(inserted);
});

router.put("/empresas/:id/colaboradores/:colabId", async (req, res): Promise<void> => {
  const colabId = parseInt(req.params.colabId);
  if (isNaN(colabId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const fields = ["nomeCompleto","cpf","emailFuncional","telefone","statusAtivo","dataAdmissao","dataDemissao","cargoId"];
  const updates: Record<string, unknown> = {};
  for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  const [updated] = await db.update(colaboradoresTable).set(updates).where(eq(colaboradoresTable.id, colabId)).returning();
  if (!updated) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }
  res.json(updated);
});

router.delete("/empresas/:id/colaboradores/:colabId", async (req, res): Promise<void> => {
  const colabId = parseInt(req.params.colabId);
  if (isNaN(colabId)) { res.status(400).json({ error: "ID inválido" }); return; }
  await db.delete(colaboradoresTable).where(eq(colaboradoresTable.id, colabId));
  res.json({ ok: true });
});

export default router;
