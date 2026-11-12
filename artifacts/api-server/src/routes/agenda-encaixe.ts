import { Router, type IRouter, type Response } from "express";
import { z } from "zod/v4";
import { and, eq, sql } from "drizzle-orm";
import { db, agendaResourcesTable, clientsTable, locationsTable } from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import { requireCollaborator } from "./collaborator";
import { autorizarEncaixeInterno } from "../lib/agenda-encaixe-acesso";
import {
  ANTECEDENCIA_INTERNA_PADRAO_MIN, DURACAO_MAX, DURACAO_MIN, avaliarEncaixeDoDia, encaixarConsultaAvulsa,
  lerAntecedenciaInterna, mensagemDoMotivo, sugerirAlternativas,
} from "../lib/agenda-encaixe";

/**
 * Encaixe rápido interno. O CANAL é a própria rota + a identidade da sessão, conferidas no servidor:
 * nenhum campo do navegador (corpo, query ou cabeçalho) escolhe a regra de antecedência. As rotas padrão
 * (/agenda/slots, /agenda/book-avulsa, /agenda/book) seguem com 24 horas e liberação em cadeia.
 */
const router: IRouter = Router();
router.use(moduleGuard("agenda"));

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const consultaSchema = z.object({
  resourceId: z.coerce.number().int().positive(),
  date: z.string().regex(ISO_DATE, "date inválida (YYYY-MM-DD)"),
  durationMinutes: z.coerce.number().int().min(DURACAO_MIN).max(DURACAO_MAX),
  clientId: z.coerce.number().int().positive().optional(),
}).strict();

const encaixeSchema = z.object({
  resourceId: z.number().int().positive(),
  clientId: z.number().int().positive(),
  date: z.string().regex(ISO_DATE, "date inválida (YYYY-MM-DD)"),
  time: z.string().regex(HHMM, "horário inválido (HH:mm)"),
  durationMinutes: z.number().int().min(DURACAO_MIN).max(DURACAO_MAX),
  syncGoogle: z.boolean().optional(),
}).strict();

function parseOr400<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const r = schema.safeParse(body);
  if (!r.success) { res.status(400).json({ error: r.error.issues[0]?.message ?? "dados inválidos" }); return null; }
  return r.data;
}

router.get("/agenda/encaixe/politica", requireCollaborator, async (req, res): Promise<void> => {
  const acesso = await autorizarEncaixeInterno(req);
  const regra = await lerAntecedenciaInterna();
  if (!acesso.ok && acesso.status === 401) { res.status(401).json({ error: acesso.error }); return; }
  res.json({
    canal: "encaixe-interno",
    autorizado: acesso.ok,
    motivo: acesso.ok ? null : acesso.error,
    codigo: acesso.ok ? null : acesso.code,
    antecedenciaMinutos: regra.minutos,
    antecedenciaConfigurada: regra.configurada,
    antecedenciaSugeridaMinutos: ANTECEDENCIA_INTERNA_PADRAO_MIN,
  });
});

router.get("/agenda/encaixe/disponibilidade", requireCollaborator, async (req, res): Promise<void> => {
  const acesso = await autorizarEncaixeInterno(req);
  if (!acesso.ok) { res.status(acesso.status).json({ error: acesso.error, codigo: acesso.code }); return; }
  const q = parseOr400(consultaSchema, req.query, res);
  if (!q) return;

  const dono = await db.select({ id: agendaResourcesTable.id }).from(agendaResourcesTable)
    .leftJoin(locationsTable, eq(agendaResourcesTable.locationId, locationsTable.id))
    .where(and(eq(agendaResourcesTable.id, q.resourceId),
      sql`COALESCE(${agendaResourcesTable.empresaId}, ${locationsTable.empresaId}) = ${acesso.empresaId}`));
  if (!dono.length) { res.status(404).json({ error: "Agenda não encontrada." }); return; }
  if (q.clientId != null) {
    const [cliente] = await db.select({ empresaId: clientsTable.empresaId }).from(clientsTable).where(eq(clientsTable.id, q.clientId));
    if (!cliente || cliente.empresaId !== acesso.empresaId) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  }

  const { minutos } = await lerAntecedenciaInterna();
  const av = await avaliarEncaixeDoDia(
    { resourceId: q.resourceId, date: q.date, durationMinutes: q.durationMinutes, clientId: q.clientId ?? null }, db, minutos);
  if (!av) { res.status(404).json({ error: "Agenda não encontrada" }); return; }
  const alternativas = await sugerirAlternativas(av, { resourceId: q.resourceId, date: q.date, clientId: q.clientId ?? null }, db);

  res.json({
    canal: "encaixe-interno",
    resourceId: q.resourceId,
    date: q.date,
    agora: av.agora,
    antecedenciaMinutos: av.leadMinutes,
    motivoDia: av.motivoDia,
    integracao: {
      atualizada: av.integracaoAtualizada,
      mensagem: av.integracaoAtualizada ? null : mensagemDoMotivo("integracao", av.leadMinutes),
    },
    clienteVerificado: av.clienteVerificado,
    durationMinutes: av.durationMinutes,
    slotMinutes: av.slotMinutes,
    slots: av.slots,
    alternativas,
  });
});

router.post("/agenda/encaixe", requireCollaborator, async (req, res): Promise<void> => {
  const acesso = await autorizarEncaixeInterno(req);
  if (!acesso.ok) { res.status(acesso.status).json({ error: acesso.error, codigo: acesso.code }); return; }
  const data = parseOr400(encaixeSchema, req.body, res);
  if (!data) return;
  const r = await encaixarConsultaAvulsa({ ...data, empresaId: acesso.empresaId });
  req.log?.info({
    canal: "encaixe-interno", profissionalId: acesso.me, empresaId: acesso.empresaId, resourceId: data.resourceId,
    resultado: r.ok ? (r.duplicada ? "duplicada" : "criada") : `recusada_${r.status}`, codigo: r.ok ? null : r.codigo ?? null,
  }, "encaixe interno");
  if (!r.ok) {
    res.status(r.status).json({ error: r.error, codigo: r.codigo ?? null, alternativas: r.alternativas ?? null });
    return;
  }
  res.status(r.status).json({
    canal: "encaixe-interno",
    duplicada: r.duplicada,
    session: r.session,
    googleEventId: r.googleEventId,
    googleSyncWarning: r.googleSyncWarning,
  });
});

export default router;
