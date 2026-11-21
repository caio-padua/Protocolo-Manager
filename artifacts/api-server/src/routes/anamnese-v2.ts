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
import { sql } from "drizzle-orm";
import {
  ehCirurgia, ehIdentidade, garantirColunasSexoReferencia, gravarSexoSeVazio, SEXO_QUESTION_ID, sexoDaResposta, sexoDoCadastro, fatosBloqueados, garantirIndiceRascunhoUnico, garantirTabelaCorrecoes, idadeDe, identidadeDoCadastro, retiraFato,
  type ValorResposta,
} from "../lib/anamnese-retorno";

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
  // Retorno: so em sessao amarrada a cliente (token verificado). Identidade vem do cadastro;
  // fatos de cirurgia ja registrados vem como bloqueados (somente leitura).
  let retorno: unknown = null;
  if (session.clientId !== null) {
    const identidade = await identidadeDoCadastro(session.clientId);
    const bloqueados = await fatosBloqueados(session.clientId, session.id);
    await garantirTabelaCorrecoes();
    const correcoes = (await db.execute(sql`SELECT id, question_row_id AS "questionRowId", texto, status, criado_em AS "criadoEm" FROM anamnese_correcoes WHERE client_id=${session.clientId} ORDER BY id DESC LIMIT 50`)).rows;
    retorno = { identidade, bloqueados: Object.fromEntries(bloqueados), correcoes };
  }
  return { session, answers, refusals, findings, notes, retorno };
}

// GET /anamnese-v2/questions — questionario completo
router.get("/anamnese-v2/questions", async (req, res) => {
  await garantirColunasSexoReferencia();
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
      referencia: anamneseQuestionarioTable.referencia,
      videoUrl: anamneseQuestionarioTable.videoUrl,
      dependeDe: anamneseQuestionarioTable.dependeDe,
      audioUrl: anamneseQuestionarioTable.audioUrl,
      voiceLabel: anamneseQuestionarioTable.voiceLabel,
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
          // Nunca devolver ao paciente a sessao de CONSULTA (token do profissional).
          eq(anamneseSessionsTable.mode, "paciente"),
        ),
      )
      .orderBy(asc(anamneseSessionsTable.id))
      .limit(1);
    if (existing) {
      req.log.info({ sessionId: existing.id }, "anamnese-v2 session resumed");
      return res.status(200).json(existing);
    }
  }

  // Rota publica: o modo e sempre "paciente" (o corpo nao escolhe). Sessao de consulta so nasce na rota do colaborador.
  await garantirIndiceRascunhoUnico();
  let empresaId: number | null = null;
  if (clientId !== null) {
    empresaId = ((await db.execute(sql`SELECT empresa_id FROM clients WHERE id=${clientId}`)).rows[0] as { empresa_id: number | null } | undefined)?.empresa_id ?? null;
  }
  const token = randomBytes(24).toString("hex");
  const [s] = await db
    .insert(anamneseSessionsTable)
    .values({ token, clientId, mode: "paciente" })
    .onConflictDoNothing()
    .returning();
  // empresa_id existe so no banco (fora do schema Drizzle): gravado por SQL.
  if (s && empresaId !== null) await db.execute(sql`UPDATE anamnese_sessions SET empresa_id=${empresaId} WHERE id=${s.id}`);
  if (!s && clientId !== null) {
    // Corrida: outra requisicao criou o rascunho primeiro; devolve-o.
    const [ja] = await db.select().from(anamneseSessionsTable)
      .where(and(eq(anamneseSessionsTable.clientId, clientId), eq(anamneseSessionsTable.status, "rascunho"), eq(anamneseSessionsTable.mode, "paciente")))
      .limit(1);
    if (ja) return res.status(200).json(ja);
  }
  if (!s) return res.status(500).json({ error: "Nao foi possivel abrir a sessao" });
  req.log.info({ sessionId: s.id, mode: s.mode, bound: clientId !== null }, "anamnese-v2 session created");
  return res.status(201).json(empresaId !== null ? { ...s, empresaId } : s);
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
  if (session.status !== "rascunho") return res.status(409).json({ error: "Sessao ja encerrada" });
  const parsed = answerInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  if (parsed.data.valor === undefined) return res.status(400).json({ error: "valor obrigatorio" });
  if (session.clientId !== null) {
    if (ehIdentidade(parsed.data.questionRowId)) {
      return res.status(409).json({ codigo: "IDENTIDADE_DO_CADASTRO", error: "Nome, CPF e idade vêm do cadastro e não são respondidos aqui." });
    }
    if (parsed.data.questionRowId === SEXO_QUESTION_ID && (await sexoDoCadastro(session.clientId)) !== null) {
      return res.status(409).json({ codigo: "SEXO_DO_CADASTRO", error: "O sexo biológico vem do cadastro e não é alterado aqui. Para a identidade de gênero, use a pergunta própria." });
    }
    if (ehCirurgia(parsed.data.questionRowId)) {
      const base = (await fatosBloqueados(session.clientId, session.id)).get(parsed.data.questionRowId);
      if (retiraFato(base, parsed.data.valor as ValorResposta)) {
        return res.status(409).json({ codigo: "RETIRADA_BLOQUEADA", error: "Fatos já registrados não podem ser retirados. Use 'Comunicar erro' para pedir correção a um profissional." });
      }
    }
  }
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
  if (session.status !== "rascunho") return res.status(409).json({ error: "Sessao ja encerrada" });
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
  if (session.status !== "rascunho") return res.status(409).json({ error: "Sessao ja encerrada" });
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
  if (session.status !== "rascunho") return res.status(409).json({ error: "Sessao ja encerrada" });
  const parsed = groupNoteInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(anamneseGroupNotesTable)
    .values({
      sessionId: session.id,
      grupo: parsed.data.grupo,
      observacao: parsed.data.observacao,
      // rota publica: autoria nunca vem do corpo (anti-falsificacao)
      autorProfId: null,
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
    // Idade calculada da data de nascimento do cadastro (nunca digitada) em sessao amarrada.
    if (session.clientId !== null) {
      const c = (await tx.execute(sql`SELECT birth_date FROM clients WHERE id=${session.clientId}`)).rows[0] as { birth_date: string | null } | undefined;
      const idade = idadeDe(c?.birth_date);
      if (idade !== null) {
        const valor = { tipo: "number", numero: idade };
        await tx.execute(sql`INSERT INTO anamnese_session_answers (session_id, question_row_id, pergunta_id, valor, tempo_seg) SELECT ${session.id}, 41, 'A03', ${JSON.stringify(valor)}::jsonb, 0 WHERE EXISTS (SELECT 1 FROM anamnese_questionario WHERE id=41) ON CONFLICT (session_id, question_row_id) DO UPDATE SET valor=EXCLUDED.valor, updated_at=now()`);
        const i = answers.findIndex((a) => a.questionRowId === 41);
        if (i >= 0) answers[i] = { questionRowId: 41, valor }; else answers.push({ questionRowId: 41, valor });
      }
    }
    // Sexo biologico: se o cadastro ainda nao tem, grava a resposta da A04 UMA vez (nunca sobrescreve).
    if (session.clientId !== null) {
      const sx = sexoDaResposta(answers.find((a) => a.questionRowId === SEXO_QUESTION_ID)?.valor);
      if (sx) await gravarSexoSeVazio(session.clientId, sx);
    }
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

// POST /anamnese-v2/sessions/:token/correcao — cliente comunica erro em fato registrado.
// Nao altera nada: abre pedido para um profissional resolver, com trilha.
router.post("/anamnese-v2/sessions/:token/correcao", async (req, res) => {
  const session = await findSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Sessao nao encontrada" });
  if (session.clientId === null) return res.status(403).json({ error: "Identifique-se para comunicar um erro." });
  const parsed = z.object({ questionRowId: z.number().int(), texto: z.string().trim().min(3).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Descreva o erro com pelo menos 3 caracteres." });
  await garantirTabelaCorrecoes();
  const emp = (await db.execute(sql`SELECT empresa_id FROM clients WHERE id=${session.clientId}`)).rows[0] as { empresa_id: number | null } | undefined;
  const row = (await db.execute(sql`INSERT INTO anamnese_correcoes (client_id, empresa_id, session_id, question_row_id, texto) VALUES (${session.clientId}, ${emp?.empresa_id ?? null}, ${session.id}, ${parsed.data.questionRowId}, ${parsed.data.texto}) RETURNING id, status`)).rows[0];
  return res.status(201).json(row);
});

export default router;
