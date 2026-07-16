import { Router } from "express";
import { db } from "@workspace/db";
import { empresasTable, cargosTable, colaboradoresTable } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const router = Router();

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

  // Busca cargos e colaboradores junto
  const cargos = await db.select().from(cargosTable).where(eq(cargosTable.empresaId, id));
  const colaboradores = await db.select().from(colaboradoresTable).where(eq(colaboradoresTable.empresaId, id));
  res.json({ ...row, cargos, colaboradores });
});

router.post("/empresas", async (req, res): Promise<void> => {
  const { nome, nick, cnpj, tipo, tipoUnidade, status, ativa, donoNome, slug, timezone,
    endereco, cep, bairro, cidade, estado, telefone, emailGeral, emailAgenda,
    emailEnfermagem, emailFinanceiro, googleCalendarId, googleDriveFolderId,
    modulosAtivos, tipoContrato, fatMetaMensal } = req.body;

  if (!nome) { res.status(400).json({ error: "nome é obrigatório" }); return; }

  const [inserted] = await db.insert(empresasTable).values({
    nome, nick, cnpj, tipo: tipo || "clinic", tipoUnidade, status: status || "ATIVO",
    ativa: ativa ?? true, donoNome, slug, timezone,
    endereco, cep, bairro, cidade, estado, telefone,
    emailGeral, emailAgenda, emailEnfermagem, emailFinanceiro,
    googleCalendarId, googleDriveFolderId,
    modulosAtivos: modulosAtivos || {},
    tipoContrato, fatMetaMensal,
  }).returning();
  res.status(201).json(inserted);
});

router.put("/empresas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const fields = [
    "nome","nick","cnpj","tipo","tipoUnidade","status","ativa","donoNome","slug","timezone",
    "endereco","cep","bairro","cidade","estado","telefone","emailGeral","emailAgenda",
    "emailEnfermagem","emailFinanceiro","googleCalendarId","googleDriveFolderId",
    "modulosAtivos","tipoContrato","fatMetaMensal",
  ];
  const updates: Record<string, unknown> = { atualizadoEm: new Date() };
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const [updated] = await db.update(empresasTable).set(updates).where(eq(empresasTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
  res.json(updated);
});

router.delete("/empresas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  // Verifica se é genesis_seed (protegido)
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
  const rows = await db.select().from(cargosTable).where(eq(cargosTable.empresaId, id)).orderBy(cargosTable.id);
  res.json(rows);
});

router.post("/empresas/:id/cargos", async (req, res): Promise<void> => {
  const empresaId = parseInt(req.params.id);
  if (isNaN(empresaId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { cargo, indice, codigoCompleto, modalidade, slaDefault, reportaA, descricaoFuncao, objetivos,
    podeAcessarFinanceiro, podeEditarProtocolos, podeAprovarDespesas, podeAuditarCards,
    podeVerOuvidoria, podeSupervisionar } = req.body;
  if (!cargo) { res.status(400).json({ error: "cargo é obrigatório" }); return; }
  const [inserted] = await db.insert(cargosTable).values({
    empresaId, cargo, indice, codigoCompleto, modalidade, slaDefault,
    reportaA, descricaoFuncao, objetivos,
    podeAcessarFinanceiro: podeAcessarFinanceiro ?? false,
    podeEditarProtocolos: podeEditarProtocolos ?? false,
    podeAprovarDespesas: podeAprovarDespesas ?? false,
    podeAuditarCards: podeAuditarCards ?? false,
    podeVerOuvidoria: podeVerOuvidoria ?? false,
    podeSupervisionar: podeSupervisionar ?? false,
    ativa: true,
  }).returning();
  res.status(201).json(inserted);
});

router.put("/cargos/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const updates: Record<string, unknown> = {};
  const fields = ["cargo","indice","codigoCompleto","modalidade","slaDefault","reportaA","descricaoFuncao",
    "objetivos","podeAcessarFinanceiro","podeEditarProtocolos","podeAprovarDespesas",
    "podeAuditarCards","podeVerOuvidoria","podeSupervisionar","ativa"];
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  const [updated] = await db.update(cargosTable).set(updates).where(eq(cargosTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Cargo não encontrado" }); return; }
  res.json(updated);
});

router.delete("/cargos/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  await db.delete(cargosTable).where(eq(cargosTable.id, id));
  res.json({ ok: true });
});

// ── COLABORADORES ─────────────────────────────────────────────────────────────

router.get("/empresas/:id/colaboradores", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const rows = await db
    .select({
      colaborador: colaboradoresTable,
      cargoNome: cargosTable.cargo,
      cargoModalidade: cargosTable.modalidade,
    })
    .from(colaboradoresTable)
    .leftJoin(cargosTable, eq(colaboradoresTable.cargoId, cargosTable.id))
    .where(eq(colaboradoresTable.empresaId, id))
    .orderBy(colaboradoresTable.id);
  res.json(rows.map(r => ({ ...r.colaborador, cargoNome: r.cargoNome, cargoModalidade: r.cargoModalidade })));
});

router.post("/empresas/:id/colaboradores", async (req, res): Promise<void> => {
  const empresaId = parseInt(req.params.id);
  if (isNaN(empresaId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { nomeCompleto, cpf, emailFuncional, telefone, statusAtivo, cargoId, dataAdmissao, dataDemissao, observacoes } = req.body;
  if (!nomeCompleto) { res.status(400).json({ error: "nomeCompleto é obrigatório" }); return; }
  const [inserted] = await db.insert(colaboradoresTable).values({
    empresaId, cargoId: cargoId || null,
    nomeCompleto, cpf, emailFuncional, telefone,
    statusAtivo: statusAtivo ?? true,
    dataAdmissao: dataAdmissao || null,
    dataDemissao: dataDemissao || null,
    observacoes,
  }).returning();
  res.status(201).json(inserted);
});

router.put("/colaboradores/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const updates: Record<string, unknown> = { atualizadoEm: new Date() };
  const fields = ["nomeCompleto","cpf","emailFuncional","telefone","statusAtivo","cargoId","dataAdmissao","dataDemissao","observacoes"];
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  const [updated] = await db.update(colaboradoresTable).set(updates).where(eq(colaboradoresTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }
  res.json(updated);
});

router.delete("/colaboradores/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  await db.delete(colaboradoresTable).where(eq(colaboradoresTable.id, id));
  res.json({ ok: true });
});

export default router;
