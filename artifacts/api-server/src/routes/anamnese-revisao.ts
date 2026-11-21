import { Router, type IRouter } from "express";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import {
  db,
  clientsTable,
  anamneseSessionsTable,
  anamneseFindingsTable,
  anamneseRefusalsTable,
  anamneseGroupNotesTable,
  anamneseSessionAnswersTable,
  anamneseQuestionarioTable,
} from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { requireMessageClinic } from "../middleware/messageClinic";
import { volatilidadeDa } from "../lib/anamnese-volatilidade.js";
import { avaliarSessaoNoMotor } from "../lib/anamnese-motor-ponte";
import { ehIdentidade, identidadeDoCadastro } from "../lib/anamnese-retorno";

const router: IRouter = Router();

// ----------------------------------------------------------------------------
// Revisao da Anamnese (PII clinica) — SO colaborador autenticado
// ----------------------------------------------------------------------------

// GET /collaborator/anamnese/sessions — lista com resumo + nome do cliente
router.get(
  "/collaborator/anamnese/sessions",
  requireCollaborator,
  requireMessageClinic,
  async (req, res): Promise<void> => {
    const filterClientId = req.query.clientId ? Number(req.query.clientId) : null;
    const filterStatus = typeof req.query.status === "string" ? req.query.status : null;

    const conds = [] as ReturnType<typeof eq>[];
    if (filterClientId !== null && Number.isFinite(filterClientId)) {
      conds.push(eq(anamneseSessionsTable.clientId, filterClientId));
    }
    if (filterStatus) {
      conds.push(eq(anamneseSessionsTable.status, filterStatus));
    }

    // Isolamento por clinica: sessao de cliente so da propria clinica; sessao sem cliente so da propria (ou sem clinica).
    conds.push(sql`(${clientsTable.empresaId} = ${req.messageEmpresaId!} OR (${anamneseSessionsTable.clientId} IS NULL AND (anamnese_sessions.empresa_id = ${req.messageEmpresaId!})))` as never);
    const rows = await db
      .select({
        id: anamneseSessionsTable.id,
        clientId: anamneseSessionsTable.clientId,
        clientName: clientsTable.name,
        mode: anamneseSessionsTable.mode,
        status: anamneseSessionsTable.status,
        startedAt: anamneseSessionsTable.startedAt,
        completedAt: anamneseSessionsTable.completedAt,
      })
      .from(anamneseSessionsTable)
      .leftJoin(clientsTable, eq(clientsTable.id, anamneseSessionsTable.clientId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(anamneseSessionsTable.completedAt), desc(anamneseSessionsTable.startedAt));

    const ids = rows.map((r) => r.id);
    const findings = ids.length
      ? await db
          .select({
            sessionId: anamneseFindingsTable.sessionId,
            tipo: anamneseFindingsTable.tipo,
            severidade: anamneseFindingsTable.severidade,
          })
          .from(anamneseFindingsTable)
          .where(inArray(anamneseFindingsTable.sessionId, ids))
      : [];

    const contagem = ids.length
      ? (await db.execute(sql`SELECT session_id, COUNT(*)::int AS n FROM anamnese_session_answers WHERE session_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`,`)}) GROUP BY session_id`)).rows as Array<{ session_id: number; n: number }>
      : [];
    const respondidasPor = new Map(contagem.map((c) => [Number(c.session_id), Number(c.n)]));
    const bySession = new Map<number, { diagnosticado: number; suspeito: number; temAlarme: boolean }>();
    for (const f of findings) {
      const cur = bySession.get(f.sessionId) ?? { diagnosticado: 0, suspeito: 0, temAlarme: false };
      if (f.tipo === "diagnosticado") cur.diagnosticado += 1;
      else if (f.tipo === "suspeito") cur.suspeito += 1;
      if ((f.severidade ?? "").toLowerCase() === "alta") cur.temAlarme = true;
      bySession.set(f.sessionId, cur);
    }

    res.json(
      rows.map((r) => {
        const c = bySession.get(r.id) ?? { diagnosticado: 0, suspeito: 0, temAlarme: false };
        return {
          id: r.id,
          clientId: r.clientId,
          clientName: r.clientName ?? null,
          mode: r.mode,
          status: r.status,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          respondidas: respondidasPor.get(r.id) ?? 0,
          diagnosticado: c.diagnosticado,
          suspeito: c.suspeito,
          temAlarme: c.temAlarme,
        };
      }),
    );
  },
);

// GET /collaborator/anamnese/sessions/:id — detalhe completo por id da sessao
router.get(
  "/collaborator/anamnese/sessions/:id",
  requireCollaborator,
  requireMessageClinic,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "id invalido" });
      return;
    }
    const [session] = await db
      .select({
        id: anamneseSessionsTable.id,
        clientId: anamneseSessionsTable.clientId,
        clientName: clientsTable.name,
        mode: anamneseSessionsTable.mode,
        status: anamneseSessionsTable.status,
        startedAt: anamneseSessionsTable.startedAt,
        completedAt: anamneseSessionsTable.completedAt,
      })
      .from(anamneseSessionsTable)
      .leftJoin(clientsTable, eq(clientsTable.id, anamneseSessionsTable.clientId))
      .where(and(
        eq(anamneseSessionsTable.id, id),
        sql`(${clientsTable.empresaId} = ${req.messageEmpresaId!} OR (${anamneseSessionsTable.clientId} IS NULL AND (anamnese_sessions.empresa_id = ${req.messageEmpresaId!})))`,
      ))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Sessao nao encontrada" });
      return;
    }
    const identidade = session.clientId !== null ? await identidadeDoCadastro(session.clientId) : null;

    const [findings, refusals, notes, respostas] = await Promise.all([
      db
        .select()
        .from(anamneseFindingsTable)
        .where(eq(anamneseFindingsTable.sessionId, id))
        .orderBy(desc(anamneseFindingsTable.tipo)),
      db
        .select()
        .from(anamneseRefusalsTable)
        .where(eq(anamneseRefusalsTable.sessionId, id)),
      db
        .select()
        .from(anamneseGroupNotesTable)
        .where(eq(anamneseGroupNotesTable.sessionId, id)),
      // Respostas cruas + enunciado da pergunta (join por questionRowId -> id
      // numerico do questionario; perguntaId REPETE e nunca e chave).
      db
        .select({
          id: anamneseSessionAnswersTable.id,
          questionRowId: anamneseSessionAnswersTable.questionRowId,
          perguntaId: anamneseSessionAnswersTable.perguntaId,
          valor: anamneseSessionAnswersTable.valor,
          respondidoEm: anamneseSessionAnswersTable.respondidoEm,
          pergunta: anamneseQuestionarioTable.pergunta,
          bloco: anamneseQuestionarioTable.bloco,
          sistema: anamneseQuestionarioTable.sistema,
          tipoResposta: anamneseQuestionarioTable.tipoResposta,
          ordem: anamneseQuestionarioTable.ordem,
        })
        .from(anamneseSessionAnswersTable)
        .leftJoin(
          anamneseQuestionarioTable,
          eq(anamneseQuestionarioTable.id, anamneseSessionAnswersTable.questionRowId),
        )
        .where(eq(anamneseSessionAnswersTable.sessionId, id)),
    ]);

    const respostasOrdenadas = [...respostas].sort((a, b) => {
      const blocoA = a.bloco ?? "";
      const blocoB = b.bloco ?? "";
      if (blocoA !== blocoB) return blocoA.localeCompare(blocoB, "pt-BR");
      return (a.ordem ?? 0) - (b.ordem ?? 0);
    });

    res.json({
      id: session.id,
      clientId: session.clientId,
      clientName: session.clientName ?? null,
      mode: session.mode,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt ? session.completedAt.toISOString() : null,
      findings: findings.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        rotulo: f.rotulo,
        severidade: f.severidade ?? null,
        origemPerguntaId: f.origemPerguntaId,
      })),
      refusals: refusals.map((r) => ({
        id: r.id,
        escopo: r.escopo,
        alvo: r.alvo,
        motivo: r.motivo ?? null,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        grupo: n.grupo,
        observacao: n.observacao,
      })),
      identidade,
      respostas: respostasOrdenadas.map((r) => ({
        origemCadastro: ehIdentidade(r.questionRowId),
        id: r.id,
        questionRowId: r.questionRowId,
        volatilidade: volatilidadeDa(r.questionRowId),
        perguntaId: r.perguntaId ?? null,
        pergunta: r.pergunta ?? null,
        bloco: r.bloco ?? null,
        sistema: r.sistema ?? null,
        tipoResposta: r.tipoResposta ?? null,
        valor: r.valor,
        respondidoEm: r.respondidoEm.toISOString(),
      })),
    });
  },
);

// GET /collaborator/anamnese/sessions/:id/motor — resultado do motor deterministico sobre as respostas da V2.
// Somente leitura, mesmo isolamento por clinica do detalhe. Nao e diagnostico: e o rastro das regras cadastradas.
router.get(
  "/collaborator/anamnese/sessions/:id/motor",
  requireCollaborator,
  requireMessageClinic,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ error: "id invalido" }); return; }
    const [session] = await db
      .select({ id: anamneseSessionsTable.id, status: anamneseSessionsTable.status })
      .from(anamneseSessionsTable)
      .leftJoin(clientsTable, eq(clientsTable.id, anamneseSessionsTable.clientId))
      .where(and(
        eq(anamneseSessionsTable.id, id),
        sql`(${clientsTable.empresaId} = ${req.messageEmpresaId!} OR (${anamneseSessionsTable.clientId} IS NULL AND (anamnese_sessions.empresa_id = ${req.messageEmpresaId!})))`,
      ))
      .limit(1);
    if (!session) { res.status(404).json({ error: "Sessao nao encontrada" }); return; }
    const [perguntas, respostas] = await Promise.all([
      db.select({
        id: anamneseQuestionarioTable.id, perguntaId: anamneseQuestionarioTable.perguntaId, pergunta: anamneseQuestionarioTable.pergunta,
        tipoResposta: anamneseQuestionarioTable.tipoResposta, opcoes: anamneseQuestionarioTable.opcoes,
      }).from(anamneseQuestionarioTable),
      db.select({ questionRowId: anamneseSessionAnswersTable.questionRowId, valor: anamneseSessionAnswersTable.valor, respondidoEm: anamneseSessionAnswersTable.respondidoEm })
        .from(anamneseSessionAnswersTable).where(eq(anamneseSessionAnswersTable.sessionId, id)),
    ]);
    const r = await avaliarSessaoNoMotor(perguntas, respostas);
    res.json({
      natureza: "Resultado do motor deterministico (regras cadastradas). Nao e diagnostico; exige avaliacao profissional.",
      sessaoConcluida: session.status === "concluida",
      escoreTotal: r.resultado.escoreTotal, gradeGlobal: r.resultado.gradeGlobal, redFlag: r.resultado.redFlag,
      blocos: r.resultado.blocos, alarmes: r.resultado.alarmes, examesSugeridos: r.resultado.exames,
      regrasDisparadas: r.disparadas, regrasSemResposta: r.semResposta, naoAvaliadas: r.naoAvaliadas, conflitos: r.conflitos,
    });
  },
);

export default router;
