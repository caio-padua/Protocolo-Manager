import { Router, type IRouter } from "express";
import { db, documentTemplatesTable, insertDocumentTemplateSchema } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router: IRouter = Router();

// Corpos-semente com variáveis {{...}} (espelham o catálogo de doc-variaveis do front).
const SEED_ATESTADO_COMPARECIMENTO = [
  "Atesto para os devidos fins que o(a) Sr(a). {{cliente.nome}}, portador(a) do CPF {{cliente.cpf}}, esteve sob meus cuidados nesta data ({{data.hoje}}), com finalidade de {{finalidade}}.",
  "",
  "Fica o(a) mesmo(a) liberado(a) para retorno às suas atividades habituais.",
].join("\n");

const SEED_ENCAMINHAMENTO = [
  "Encaminho o(a) Sr(a). {{cliente.nome}}, portador(a) do CPF {{cliente.cpf}}, à especialidade de {{especialidade}}.",
  "",
  "Motivo: {{motivo}}.",
  "",
  "Coloco-me à disposição para as informações adicionais que se fizerem necessárias.",
].join("\n");

// GET /api/document-templates?tipo= — lista modelos ativos; filtro opcional por tipo.
router.get("/document-templates", async (req, res): Promise<void> => {
  const tipo = typeof req.query.tipo === "string" ? req.query.tipo.trim() : "";
  const rows = await db
    .select()
    .from(documentTemplatesTable)
    .where(
      tipo
        ? and(eq(documentTemplatesTable.ativo, true), eq(documentTemplatesTable.tipo, tipo))
        : eq(documentTemplatesTable.ativo, true),
    )
    .orderBy(desc(documentTemplatesTable.id));
  res.json(rows);
});

// GET /api/document-templates/:id
router.get("/document-templates/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [tpl] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, id));
  if (!tpl) {
    res.status(404).json({ error: "Modelo não encontrado" });
    return;
  }
  res.json(tpl);
});

// POST /api/document-templates — cria um modelo.
router.post("/document-templates", async (req, res): Promise<void> => {
  const parsed = insertDocumentTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tpl] = await db.insert(documentTemplatesTable).values(parsed.data).returning();
  res.status(201).json(tpl);
});

// PUT /api/document-templates/:id — edita; atualiza updatedAt.
router.put("/document-templates/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const parsed = insertDocumentTemplateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tpl] = await db
    .update(documentTemplatesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(documentTemplatesTable.id, id))
    .returning();
  if (!tpl) {
    res.status(404).json({ error: "Modelo não encontrado" });
    return;
  }
  res.json(tpl);
});

// DELETE /api/document-templates/:id — soft delete (ativo=false).
router.delete("/document-templates/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [tpl] = await db
    .update(documentTemplatesTable)
    .set({ ativo: false, updatedAt: new Date() })
    .where(eq(documentTemplatesTable.id, id))
    .returning();
  if (!tpl) {
    res.status(404).json({ error: "Modelo não encontrado" });
    return;
  }
  res.json({ ok: true, id });
});

// POST /api/document-templates/seed — idempotente: se não houver NENHUM modelo,
// insere 1 modelo padrão de atestado de comparecimento e 1 de encaminhamento.
router.post("/document-templates/seed", async (req, res): Promise<void> => {
  const existentes = await db.select({ id: documentTemplatesTable.id }).from(documentTemplatesTable).limit(1);
  if (existentes.length > 0) {
    res.json({ seeded: false, message: "Já existem modelos — seed ignorado (idempotente)." });
    return;
  }
  const criados = await db
    .insert(documentTemplatesTable)
    .values([
      {
        tipo: "atestado",
        nome: "Atestado de Comparecimento (padrão)",
        descricao: "Modelo padrão de atestado de comparecimento com finalidade.",
        corpo: SEED_ATESTADO_COMPARECIMENTO,
        variaveis: ["cliente.nome", "cliente.cpf", "data.hoje", "finalidade"],
        isDefault: true,
      },
      {
        tipo: "encaminhamento",
        nome: "Encaminhamento a Especialista (padrão)",
        descricao: "Modelo padrão de encaminhamento a especialidade de destino.",
        corpo: SEED_ENCAMINHAMENTO,
        variaveis: ["cliente.nome", "cliente.cpf", "especialidade", "motivo"],
        isDefault: true,
      },
    ])
    .returning();
  req.log.info({ count: criados.length }, "Modelos de documento semeados");
  res.status(201).json({ seeded: true, count: criados.length, templates: criados });
});

export default router;
