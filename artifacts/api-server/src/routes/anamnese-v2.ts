import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  anamneseQuestionarioTable,
  anamneseSessionsTable,
  anamneseSessionAnswersTable,
  anamneseRefusalsTable,
  anamneseFindingsTable,
  anamneseGroupNotesTable,
  type AnamneseSessionRow,
} from "@workspace/db";
import { buildFindings, type AdapterQuestion } from "../lib/anamnese-findings-adapter";
import { verifyPortalToken } from "../lib/portal-token";

const router: IRouter = Router();

// ---- validacao local (espelha os schemas do OpenAPI) ----
const sessionInput = z.object({
  // `clientId` cru do corpo NAO e confiavel no fluxo publico (anti-IDOR): a
  // amarracao ao cliente vem SOMENTE de um `portalToken` HMAC verificado.
  clientId: z.number().int().nullable().optional(),
  mode: z.string().optional(),
  portalToken: z.string().optional(),
});
// Contrato de valor: uniao discriminada por `tipo` (blinda o JSONB e o adapter).
const valorSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("boolean"), bool: z.boolean() }),
  z.object({
    tipo: z.literal("single"),
    opcao: z.string(),
    valor: z.union([z.string(), z.number()]).optional(),
  }),
  z.object({ tipo: z.literal("multi"), selecionados: z.array(z.string()) }),
  z.object({ tipo: z.literal("escala"), escala: z.number(), max: z.number().optional() }),
  z.object({ tipo: z.literal("number"), numero: z.number() }),
  z.object({ tipo: z.literal("texto"), texto: z.string() }),
]);
const answerInput = z.object({
  questionRowId: z.number().int(),
  perguntaId: z.string().optional(),
  valor: valorSchema,
  tempoSeg: z.number().int().optional(),
});
const refusalInput = z.object({
  escopo: z.string().min(1),
  alvo: z.string().min(1),
  motivo: z.string().optional(),
});
const refusalTarget = z.object({ escopo: z.string().min(1), alvo: z.string().min(1) });
const groupNoteInput = z.object({
  grupo: z.string().min(1),
  observacao: z.string().min(1),
  autorProfId: z.number().int().optional(),
});

async function findSession(token: string): Promise<AnamneseSessionRow | undefined> {
  const [s] = await db
    .select()
    .from(anamneseSessionsTable)
    .where(eq(anamneseSessionsTable.token, token))
    .limit(1);
  return s;
}

// Blocos que contem ao menos uma pergunta de alarme — NUNCA podem ser recusados.
async function alarmeBlocoSet(): Promise<Set<string>> {
  const rows = await db
    .select({ bloco: anamneseQuestionarioTable.bloco })
    .from(anamneseQuestionarioTable)
    .where(eq(anamneseQuestionarioTable.eSinalAlarme, true));
  const set = new Set<string>();
  for (const r of rows) if (r.bloco) set.add(r.bloco);
  return set;
}

async function loadState(session: AnamneseSessionRow) {
  const [answers, refusalsRaw, findings, notes, blocosAlarme] = await Promise.all([
    db.select().from(anamneseSessionAnswersTable).where(eq(anamneseSessionAnswersTable.sessionId, session.id)),
    db.select().from(anamneseRefusalsTable).where(eq(anamneseRefusalsTable.sessionId, session.id)),
    db.select().from(anamneseFindingsTable).where(eq(anamneseFindingsTable.sessionId, session.id)),
    db.select().from(anamneseGroupNotesTable).where(eq(anamneseGroupNotesTable.sessionId, session.id)),
    alarmeBlocoSet(),
  ]);
  // LINHA VERMELHA defensiva: ignora recusas orfas/legadas de blocos com alarme.
  const refusals = refusalsRaw.filter(
    (r) => !(r.escopo === "bloco" && blocosAlarme.has(r.alvo)),
  );
  return { session, answers, refusals, findings, notes };
}

// GET /anamnese-v2/questions — questionario completo
router.get("/anamnese-v2/questions", async (req, res) => {
  const rows = await db
    .select({
      id: anamneseQuestionarioTable.id,
      perguntaId: anamneseQuestionarioTable.perguntaId,
      bloco: anamneseQuestionarioTable.bloco,
      sistema: anamneseQuestionarioTable.sistema,
      pergunta: anamneseQuestionarioTable.pergunta,
      tipoResposta: anamneseQuestionarioTable.tipoResposta,
      opcoes: anamneseQuestionarioTable.opcoes,
      eSinalAlarme: anamneseQuestionarioTable.eSinalAlarme,
      obrigatorio: anamneseQuestionarioTable.obrigatorio,
      ordem: anamneseQuestionarioTable.ordem,
      pesoGravidade: anamneseQuestionarioTable.pesoGravidade,
      exemplo: anamneseQuestionarioTable.exemplo,
      observacao: anamneseQuestionarioTable.observacao,
      escalaValidada: anamneseQuestionarioTable.escalaValidada,
      aplicavelEm: anamneseQuestionarioTable.aplicavelEm,
      videoUrl: anamneseQuestionarioTable.videoUrl,
      dependeDe: anamneseQuestionarioTable.dependeDe,
    })
    .from(anamneseQuestionarioTable)
    .orderBy(asc(anamneseQuestionarioTable.bloco), asc(anamneseQuestionarioTable.ordem), asc(anamneseQuestionarioTable.id));
  return res.json(rows);
});

// POST /anamnese-v2/sessions — cria (ou retoma) sessao.
// Amarracao ao cliente: SO via `portalToken` HMAC verificado (anti-IDOR). Um
// `clientId` cru no corpo e ignorado de proposito no fluxo publico.
router.post("/anamnese-v2/sessions", async (req, res) => {
  const parsed = sessionInput.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  let clientId: number | null = null;
  if (parsed.data.portalToken) {
    const verified = verifyPortalToken(parsed.data.portalToken);
    if (verified === null) {
      return res.status(401).json({ error: "Identificacao expirada. Identifique-se novamente." });
    }
    clientId = verified;
  }

  // Retomar rascunho: se ja existe sessao NAO concluida deste cliente, devolve-a.
  if (clientId !== null) {
    const [existing] = await db
      .select()
      .from(anamneseSessionsTable)
      .where(
        and(
          eq(anamneseSessionsTable.clientId, clientId),
          eq(anamneseSessionsTable.status, "rascunho"),
        ),
      )
      .orderBy(asc(anamneseSessionsTable.id))
      .limit(1);
    if (existing) {
      req.log.info({ sessionId: existing.id }, "anamnese-v2 session resumed");
      return res.status(200).json(existing);
    }
  }

  const token = randomBytes(24).toString("hex");
  const [s] = await db
    .insert(anamneseSessionsTable)
    .values({
      token,
      clientId,
      mode: parsed.data.mode ?? "paciente",
    })
    .returning();
  req.log.info({ sessionId: s.id, mode: s.mode, bound: clientId !== null }, "anamnese-v2 session created");
  return res.status(201).json(s);
});

// GET /anamnese-v2/sessions/:token — estado completo
router.get("/anamnese-v2/sessions/:token", async (req, res) => {
  const session = await findSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Sessao nao encontrada" });
  return res.json(await loadState(session));
});

// PATCH /anamnese-v2/sessions/:token/answers — upsert de resposta
router.patch("/anamnese-v2/sessions/:token/answers", async (req, res) => {
  const session = await findSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Sessao nao encontrada" });
  if (session.status === "concluida") return res.status(409).json({ error: "Sessao ja concluida" });
  const parsed = answerInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  if (parsed.data.valor === undefined) return res.status(400).json({ error: "valor obrigatorio" });
  try {
    const [row] = await db
      .insert(anamneseSessionAnswersTable)
      .values({
        sessionId: session.id,
        questionRowId: parsed.data.questionRowId,
        perguntaId: parsed.data.perguntaId ?? null,
        valor: parsed.data.valor,
        tempoSeg: parsed.data.tempoSeg ?? 0,
      })
      .onConflictDoUpdate({
        target: [anamneseSessionAnswersTable.sessionId, anamneseSessionAnswersTable.questionRowId],
        set: {
          valor: parsed.data.valor,
          perguntaId: parsed.data.perguntaId ?? null,
          tempoSeg: parsed.data.tempoSeg ?? 0,
          respondidoEm: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    await db
      .update(anamneseSessionsTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(anamneseSessionsTable.id, session.id));
    return res.json(row);
  } catch (err) {
    req.log.warn({ err }, "anamnese-v2 upsert answer failed");
    return res.status(400).json({ error: "Pergunta invalida ou conflito de gravacao" });
  }
});

// POST /anamnese-v2/sessions/:token/refusals — recusa de bloco/grupo
router.post("/anamnese-v2/sessions/:token/refusals", async (req, res) => {
  const session = await findSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Sessao nao encontrada" });
  const parsed = refusalInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  // LINHA VERMELHA: bloco que contem pergunta de alarme NUNCA pode ser recusado.
  if (parsed.data.escopo === "bloco") {
    const [alarme] = await db
      .select({ id: anamneseQuestionarioTable.id })
      .from(anamneseQuestionarioTable)
      .where(
        and(
          eq(anamneseQuestionarioTable.bloco, parsed.data.alvo),
          eq(anamneseQuestionarioTable.eSinalAlarme, true),
        ),
      )
      .limit(1);
    if (alarme) {
      return res
        .status(409)
        .json({ error: "Bloco com pergunta de alarme nao pode ser recusado" });
    }
  }
  let [row] = await db
    .insert(anamneseRefusalsTable)
    .values({
      sessionId: session.id,
      escopo: parsed.data.escopo,
      alvo: parsed.data.alvo,
      motivo: parsed.data.motivo ?? null,
    })
    .onConflictDoNothing({
      target: [anamneseRefusalsTable.sessionId, anamneseRefusalsTable.escopo, anamneseRefusalsTable.alvo],
    })
    .returning();
  if (!row) {
    [row] = await db
      .select()
      .from(anamneseRefusalsTable)
      .where(
        and(
          eq(anamneseRefusalsTable.sessionId, session.id),
          eq(anamneseRefusalsTable.escopo, parsed.data.escopo),
          eq(anamneseRefusalsTable.alvo, parsed.data.alvo),
        ),
      );
  }
  return res.json(row);
});

// POST /anamnese-v2/sessions/:token/refusals/remove — desfaz recusa
router.post("/anamnese-v2/sessions/:token/refusals/remove", async (req, res) => {
  const session = await findSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Sessao nao encontrada" });
  const parsed = refusalTarget.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  await db
    .delete(anamneseRefusalsTable)
    .where(
      and(
        eq(anamneseRefusalsTable.sessionId, session.id),
        eq(anamneseRefusalsTable.escopo, parsed.data.escopo),
        eq(anamneseRefusalsTable.alvo, parsed.data.alvo),
      ),
    );
  return res.json({ ok: true });
});

// POST /anamnese-v2/sessions/:token/notes — observacao por grupo
router.post("/anamnese-v2/sessions/:token/notes", async (req, res) => {
  const session = await findSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Sessao nao encontrada" });
  const parsed = groupNoteInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(anamneseGroupNotesTable)
    .values({
      sessionId: session.id,
      grupo: parsed.data.grupo,
      observacao: parsed.data.observacao,
      autorProfId: parsed.data.autorProfId ?? null,
    })
    .returning();
  return res.json(row);
});

// POST /anamnese-v2/sessions/:token/complete — conclui (idempotente) + achados
router.post("/anamnese-v2/sessions/:token/complete", async (req, res) => {
  const session = await findSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Sessao nao encontrada" });

  await db.transaction(async (tx) => {
    const answers = await tx
      .select({ questionRowId: anamneseSessionAnswersTable.questionRowId, valor: anamneseSessionAnswersTable.valor })
      .from(anamneseSessionAnswersTable)
      .where(eq(anamneseSessionAnswersTable.sessionId, session.id));
    const questions: AdapterQuestion[] = await tx
      .select({
        id: anamneseQuestionarioTable.id,
        perguntaId: anamneseQuestionarioTable.perguntaId,
        pergunta: anamneseQuestionarioTable.pergunta,
        bloco: anamneseQuestionarioTable.bloco,
        sistema: anamneseQuestionarioTable.sistema,
        eSinalAlarme: anamneseQuestionarioTable.eSinalAlarme,
        pesoGravidade: anamneseQuestionarioTable.pesoGravidade,
        tipoResposta: anamneseQuestionarioTable.tipoResposta,
      })
      .from(anamneseQuestionarioTable);

    const findings = buildFindings(questions, answers);
    if (findings.length > 0) {
      await tx
        .insert(anamneseFindingsTable)
        .values(findings.map((f) => ({ sessionId: session.id, ...f })))
        .onConflictDoNothing({
          target: [
            anamneseFindingsTable.sessionId,
            anamneseFindingsTable.tipo,
            anamneseFindingsTable.rotulo,
            anamneseFindingsTable.origemPerguntaId,
          ],
        });
    }
    await tx
      .update(anamneseSessionsTable)
      .set({ status: "concluida", completedAt: session.completedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(anamneseSessionsTable.id, session.id));
  });

  const fresh = await findSession(req.params.token);
  req.log.info({ sessionId: session.id }, "anamnese-v2 session completed");
  return res.json(await loadState(fresh ?? session));
});

export default router;
