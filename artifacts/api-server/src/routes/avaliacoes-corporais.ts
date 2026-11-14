import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, clientsTable, clientAvaliacoesTable } from "@workspace/db";
import { ehTipoAvaliacao, validaValores } from "@workspace/avaliacoes-corporais";
import { requireCollaborator } from "./collaborator";
import { requireClientWriter } from "./clients";
import { brtISODate } from "../lib/brt";

const router: IRouter = Router();

function sessaoValida(req: Request, res: Response): number | null {
  if (!req.tenantContext?.authenticated || req.tenantContext.professionalId !== req.collaborator?.professionalId) {
    res.status(401).json({ error: "Entre com seu acesso profissional." });
    return null;
  }
  return req.tenantContext.empresaId;
}

// Cliente precisa existir, estar ativo no cadastro e pertencer a clinica do acesso.
async function clienteDaClinica(clientId: number, empresaId: number) {
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.empresaId, empresaId), isNull(clientsTable.deletedAt)));
  return c ?? null;
}

const idDe = (v: unknown) => (/^\d{1,9}$/.test(String(v)) ? Number(v) : null);

router.get("/clients/:id/avaliacoes", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = sessaoValida(req, res);
  if (empresaId === null) return;
  const clientId = idDe(req.params.id);
  if (clientId === null) { res.status(400).json({ error: "Cliente inválido." }); return; }
  if (!(await clienteDaClinica(clientId, empresaId))) { res.status(404).json({ error: "Cliente não encontrado." }); return; }
  const linhas = await db.select().from(clientAvaliacoesTable)
    .where(and(eq(clientAvaliacoesTable.clientId, clientId), eq(clientAvaliacoesTable.empresaId, empresaId),
      isNull(clientAvaliacoesTable.deletedAt)))
    .orderBy(asc(clientAvaliacoesTable.dataAvaliacao), asc(clientAvaliacoesTable.id));
  res.json(linhas.map((l) => ({
    id: l.id, tipo: l.tipo, data: l.dataAvaliacao, valores: l.valores,
    observacoes: l.observacoes, criadoEm: l.createdAt.toISOString(),
  })));
});

router.post("/clients/:id/avaliacoes", requireClientWriter, async (req, res): Promise<void> => {
  const empresaId = sessaoValida(req, res);
  if (empresaId === null) return;
  const clientId = idDe(req.params.id);
  if (clientId === null) { res.status(400).json({ error: "Cliente inválido." }); return; }
  const { tipo, data, valores, observacoes } = (req.body ?? {}) as Record<string, unknown>;
  if (!ehTipoAvaliacao(tipo)) { res.status(400).json({ error: "Tipo de avaliação inválido." }); return; }
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
      Number.isNaN(Date.parse(`${data}T00:00:00Z`)) ||
      new Date(`${data}T00:00:00Z`).toISOString().slice(0, 10) !== data) {
    res.status(400).json({ error: "Informe uma data válida." }); return;
  }
  if (data > brtISODate()) { res.status(400).json({ error: "A data da medição não pode ser futura." }); return; }
  if (data < "1990-01-01") { res.status(400).json({ error: "Data anterior a 1990 não é aceita." }); return; }
  const obs = typeof observacoes === "string" ? observacoes.trim().slice(0, 1000) : "";
  if (observacoes != null && typeof observacoes !== "string") { res.status(400).json({ error: "Observação inválida." }); return; }
  const v = validaValores(tipo, valores);
  if (!v.ok) { res.status(400).json({ error: v.erro }); return; }
  if (!(await clienteDaClinica(clientId, empresaId))) { res.status(404).json({ error: "Cliente não encontrado." }); return; }
  const [criada] = await db.insert(clientAvaliacoesTable).values({
    clientId, empresaId, tipo, dataAvaliacao: data, valores: v.valores,
    observacoes: obs || null, criadoPor: req.tenantContext.professionalId,
  }).returning();
  res.status(201).json({ id: criada.id, tipo: criada.tipo, data: criada.dataAvaliacao, valores: criada.valores,
    observacoes: criada.observacoes, criadoEm: criada.createdAt.toISOString() });
});

// Remover = marcar como removida (o dado fica guardado).
router.delete("/clients/:id/avaliacoes/:avId", requireClientWriter, async (req, res): Promise<void> => {
  const empresaId = sessaoValida(req, res);
  if (empresaId === null) return;
  const clientId = idDe(req.params.id), avId = idDe(req.params.avId);
  if (clientId === null || avId === null) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const r = await db.update(clientAvaliacoesTable).set({ deletedAt: new Date() })
    .where(and(eq(clientAvaliacoesTable.id, avId), eq(clientAvaliacoesTable.clientId, clientId),
      eq(clientAvaliacoesTable.empresaId, empresaId), isNull(clientAvaliacoesTable.deletedAt)))
    .returning({ id: clientAvaliacoesTable.id });
  if (!r.length) { res.status(404).json({ error: "Medição não encontrada." }); return; }
  res.status(204).end();
});

export default router;
