import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  nursingAssessmentsTable,
  sessionsTable,
  clientsTable,
  protocolsTable,
  professionalsTable,
  taskCardsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/nursing-assessments", async (req, res): Promise<void> => {
  const { sessionId, clientId, protocolId } = req.query as Record<string, string>;

  let assessments = await db.select().from(nursingAssessmentsTable);

  if (sessionId) assessments = assessments.filter(a => a.sessionId === parseInt(sessionId));
  if (clientId) assessments = assessments.filter(a => a.clientId === parseInt(clientId));
  if (protocolId) assessments = assessments.filter(a => a.protocolId === parseInt(protocolId));

  const results = await Promise.all(assessments.map(async (a) => {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, a.professionalId));
    return {
      ...a,
      professionalName: prof?.name ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }));

  res.json(results);
});

router.get("/nursing-assessments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [assessment] = await db.select().from(nursingAssessmentsTable).where(eq(nursingAssessmentsTable.id, id));
  if (!assessment) { res.status(404).json({ error: "Not found" }); return; }

  const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, assessment.professionalId));
  res.json({ ...assessment, professionalName: prof?.name ?? null, createdAt: assessment.createdAt.toISOString() });
});

router.post("/nursing-assessments", async (req, res): Promise<void> => {
  const {
    sessionId, clientId, protocolId, professionalId,
    weeklyQuestion, alertColor, observation, adherenceLevel,
    tolerance, symptoms, needsTeamContact, startTime, endTime,
  } = req.body;

  if (!sessionId || !clientId || !protocolId || !professionalId || !weeklyQuestion) {
    res.status(400).json({ error: "Campos obrigatórios: sessionId, clientId, protocolId, professionalId, weeklyQuestion" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) { res.status(404).json({ error: "Sessão não encontrada" }); return; }

  const existing = await db.select().from(nursingAssessmentsTable)
    .where(eq(nursingAssessmentsTable.sessionId, sessionId));
  if (existing.length > 0) {
    res.status(409).json({ error: "Avaliação de enfermagem já registrada para esta sessão" });
    return;
  }

  const [assessment] = await db.insert(nursingAssessmentsTable).values({
    sessionId,
    clientId,
    protocolId,
    professionalId,
    weeklyQuestion,
    alertColor: alertColor ?? "green",
    observation: observation ?? null,
    adherenceLevel: adherenceLevel ?? "alta",
    tolerance: tolerance ?? "excelente",
    symptoms: symptoms ?? null,
    needsTeamContact: needsTeamContact ?? false,
    startTime: startTime ?? null,
    endTime: endTime ?? null,
  }).returning();

  const color = alertColor ?? "green";
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  const clientName = client?.name ?? "Cliente";

  if (color === "yellow") {
    await db.insert(taskCardsTable).values({
      type: "followup",
      assignedRole: "enfermeira_02",
      clientId,
      protocolId,
      sessionId,
      priority: "high",
      status: "pending",
      title: `ATENÇÃO — ${clientName}`,
      description: `Alerta amarelo na sessão. Observação da enfermeira: ${observation ?? weeklyQuestion}. Entrar em contato em até 36h.`,
    });
  }

  if (color === "red") {
    await db.insert(taskCardsTable).values([
      {
        type: "alert",
        assignedRole: "enfermeira_02",
        clientId,
        protocolId,
        sessionId,
        priority: "urgent",
        status: "pending",
        title: `ALERTA VERMELHO — ${clientName}`,
        description: `Alerta vermelho na sessão. Observação: ${observation ?? weeklyQuestion}. Contato imediato necessário.`,
      },
      {
        type: "alert",
        assignedRole: "medico_02",
        clientId,
        protocolId,
        sessionId,
        priority: "urgent",
        status: "pending",
        title: `ALERTA VERMELHO — ${clientName}`,
        description: `Alerta vermelho na sessão. Observação: ${observation ?? weeklyQuestion}. Avaliação médica necessária.`,
      },
    ]);
  }

  res.status(201).json({
    ...assessment,
    createdAt: assessment.createdAt.toISOString(),
    cardsGenerated: color === "green" ? 0 : color === "yellow" ? 1 : 2,
  });
});

router.get("/nursing-assessments/by-session/:sessionId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid sessionId" }); return; }

  const [assessment] = await db.select().from(nursingAssessmentsTable)
    .where(eq(nursingAssessmentsTable.sessionId, sessionId));

  if (!assessment) { res.json(null); return; }

  const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, assessment.professionalId));
  res.json({ ...assessment, professionalName: prof?.name ?? null, createdAt: assessment.createdAt.toISOString() });
});

export default router;
