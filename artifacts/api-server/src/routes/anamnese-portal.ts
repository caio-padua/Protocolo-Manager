import { Router, type IRouter, type Request, type Response } from "express";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  anamneseQuestionarioTable,
  anamneseRespostaTable,
  motorEscoreBlocoTable,
  motorSugestaoTable,
  motorSugestaoItemTable,
  clientsTable,
} from "@workspace/db";
import { verifyPortalToken } from "../lib/portal-token";
import { computeMotor, type RespostaMotor } from "../lib/motor-anamnese";

const router: IRouter = Router();

// =============================================================================
// PORTAL DE ANAMNESE (ONDA C)
// - GET  /anamnese-portal/questionario  : publico, devolve perguntas para render
// - POST /anamnese-portal/submit        : token-bound, grava respostas + roda motor
// - GET  /anamnese-portal/fila          : admin, fila de validacao do dashboard
// - POST /anamnese-portal/sugestao/:id/decidir : admin, valida/recusa o pacote
// =============================================================================

// ---- Questionario publico (apenas campos necessarios para renderizar) ----
router.get("/anamnese-portal/questionario", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      perguntaId: anamneseQuestionarioTable.perguntaId,
      bloco: anamneseQuestionarioTable.bloco,
      pergunta: anamneseQuestionarioTable.pergunta,
      tipoResposta: anamneseQuestionarioTable.tipoResposta,
      opcoes: anamneseQuestionarioTable.opcoes,
      ordem: anamneseQuestionarioTable.ordem,
      sistema: anamneseQuestionarioTable.sistema,
      escalaValidada: anamneseQuestionarioTable.escalaValidada,
      eSinalAlarme: anamneseQuestionarioTable.eSinalAlarme,
      obrigatorio: anamneseQuestionarioTable.obrigatorio,
    })
    .from(anamneseQuestionarioTable)
    .orderBy(asc(anamneseQuestionarioTable.bloco), asc(anamneseQuestionarioTable.ordem));

  // Agrupa por bloco preservando a ordem
  const blocosMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const bloco = r.bloco ?? "SEM BLOCO";
    if (!blocosMap.has(bloco)) blocosMap.set(bloco, []);
    blocosMap.get(bloco)!.push(r);
  }
  const blocos = Array.from(blocosMap.entries()).map(([bloco, perguntas]) => ({ bloco, perguntas }));
  res.json({ totalPerguntas: rows.length, blocos });
});

// ---- Submissao (token-bound) ----
const submitSchema = z.object({
  token: z.string().min(1),
  respostas: z
    .array(
      z.object({
        perguntaId: z.string().min(1),
        valor: z.union([z.string(), z.number()]),
      }),
    )
    .min(1),
});

router.post("/anamnese-portal/submit", async (req: Request, res: Response): Promise<void> => {
  const parsed = submitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos" });
    return;
  }

  const clientId = verifyPortalToken(parsed.data.token);
  if (clientId === null) {
    res.status(401).json({ error: "Sessao expirada. Identifique-se novamente." });
    return;
  }

  const clients = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (clients.length === 0) {
    res.status(404).json({ error: "Cliente nao encontrado" });
    return;
  }

  const respostas: RespostaMotor[] = parsed.data.respostas;
  const resultado = await computeMotor(respostas);

  // Tudo numa transacao unica: ou grava o pacote completo (sugestao + sessaoId +
  // respostas + escores + itens) ou nada. Evita registros parciais na fila.
  const sugestaoId = await db.transaction(async (tx) => {
    // Cria o pacote (sessao = id do proprio pacote) em dois passos por causa do
    // sessaoId notNull. resumo guarda o resultado completo do motor.
    const [created] = await tx
      .insert(motorSugestaoTable)
      .values({ sessaoId: 0, clienteId: clientId, status: "AGUARDA_VALIDACAO", resumo: resultado })
      .returning({ id: motorSugestaoTable.id });
    const id = created.id;
    const sessaoId = id;
    await tx.update(motorSugestaoTable).set({ sessaoId }).where(eq(motorSugestaoTable.id, id));

    // Grava respostas brutas
    if (respostas.length) {
      await tx.insert(anamneseRespostaTable).values(
        respostas.map((r) => ({
          sessaoId,
          clienteId: clientId,
          perguntaId: r.perguntaId,
          valor: String(r.valor),
          valorNumerico: typeof r.valor === "number" ? r.valor : null,
        })),
      );
    }

    // Grava escore por bloco
    if (resultado.blocos.length) {
      await tx.insert(motorEscoreBlocoTable).values(
        resultado.blocos.map((b) => ({
          sessaoId,
          blocoCodigo: b.bloco,
          escore: b.escore,
          gradeCalculada: b.grade,
        })),
      );
    }

    // Grava exames sugeridos como itens do pacote (a validar pela equipe)
    if (resultado.exames.length) {
      await tx.insert(motorSugestaoItemTable).values(
        resultado.exames.map((nome) => ({
          sugestaoId: id,
          tipo: "exame",
          refNome: nome,
          status: "AGUARDA_VALIDACAO",
        })),
      );
    }

    return id;
  });

  res.json({ ok: true, sugestaoId });
});

// ---- Fila de validacao (admin) ----
router.get("/anamnese-portal/fila", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      id: motorSugestaoTable.id,
      sessaoId: motorSugestaoTable.sessaoId,
      clienteId: motorSugestaoTable.clienteId,
      status: motorSugestaoTable.status,
      resumo: motorSugestaoTable.resumo,
      createdAt: motorSugestaoTable.createdAt,
      clientName: clientsTable.name,
      totalItens: sql<number>`(select count(*)::int from ${motorSugestaoItemTable} where ${motorSugestaoItemTable.sugestaoId} = ${motorSugestaoTable.id})`,
    })
    .from(motorSugestaoTable)
    .leftJoin(clientsTable, eq(clientsTable.id, motorSugestaoTable.clienteId))
    .where(eq(motorSugestaoTable.status, "AGUARDA_VALIDACAO"))
    .orderBy(desc(motorSugestaoTable.createdAt));
  res.json(rows);
});

// ---- Decidir (validar / recusar) ----
const decidirSchema = z.object({ decisao: z.enum(["validado", "recusado"]) });

router.post("/anamnese-portal/sugestao/:id/decidir", async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const parsed = decidirSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "decisao deve ser validado ou recusado" });
    return;
  }

  const updated = await db
    .update(motorSugestaoTable)
    .set({ status: parsed.data.decisao })
    .where(eq(motorSugestaoTable.id, id))
    .returning({ id: motorSugestaoTable.id });
  if (updated.length === 0) {
    res.status(404).json({ error: "sugestao nao encontrada" });
    return;
  }
  await db
    .update(motorSugestaoItemTable)
    .set({ status: parsed.data.decisao })
    .where(eq(motorSugestaoItemTable.sugestaoId, id));

  res.json({ ok: true });
});

export default router;
