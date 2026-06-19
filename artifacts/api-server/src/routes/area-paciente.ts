import { Router, type IRouter, Request, Response } from "express";
import { eq, and, gte, lte, asc, desc } from "drizzle-orm";
import {
  db,
  clientsTable,
  protocolsTable,
  protocolItemsTable,
  substancesTable,
  sessionsTable,
  substanceApplicationsTable,
  paymentsTable,
  rasTable,
  examRequestPdfsTable,
  professionalsTable,
  validationCodesTable,
} from "@workspace/db";
import { verifyPortalToken } from "../lib/portal-token";
import { generateSignedRASPdf, generateProtocolDocumentPdf } from "../lib/pdf-signer";

// ===========================================================================
// AREA DO PACIENTE (token-bound, sem auth de admin)
// Todos os endpoints derivam o clientId do TOKEN do paciente (HMAC, 30min).
// NUNCA aceitam clientId vindo do client (query/body) -> evita IDOR.
// Os GET /pdf reusam os geradores de pdf-signer, mas SEM efeitos colaterais
// (sem upload ao Drive / envio de e-mail) que as rotas admin disparam.
// ===========================================================================

const router: IRouter = Router();

// Le o token de Authorization: Bearer <token> ou de ?token= (necessario para
// links de download abertos em nova aba, onde nao se envia header). Retorna o
// clientId ou null.
function getClientId(req: Request): number | null {
  const auth = req.headers.authorization;
  let token: string | undefined;
  if (auth && auth.startsWith("Bearer ")) token = auth.slice(7);
  if (!token && typeof req.query.token === "string") token = req.query.token;
  if (!token) return null;
  return verifyPortalToken(token);
}

function unauthorized(res: Response) {
  res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- RESUMO -----------------------------------------------------------------
router.get("/area-paciente/resumo", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  try {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

    const protocols = await db.select().from(protocolsTable).where(eq(protocolsTable.clientId, clientId));
    const activeProtocols = protocols.filter((p) => p.status !== "cancelled" && p.status !== "completed");

    const upcoming = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.clientId, clientId), gte(sessionsTable.scheduledDate, todayISO())))
      .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.scheduledTime));

    const nextSession = upcoming.find((s) => s.status === "scheduled" || s.status === "confirmed") ?? upcoming[0] ?? null;

    const totalSessions = protocols.reduce((acc, p) => acc + (p.totalSessions || 0), 0);
    const completedSessions = protocols.reduce((acc, p) => acc + (p.completedSessions || 0), 0);

    res.json({
      client: { id: client.id, name: client.name, cpf: client.cpf, email: client.email, phone: client.phone },
      protocolsCount: protocols.length,
      activeProtocolsCount: activeProtocols.length,
      totalSessions,
      completedSessions,
      nextSession: nextSession
        ? {
            id: nextSession.id,
            scheduledDate: nextSession.scheduledDate,
            scheduledTime: nextSession.scheduledTime,
            unit: nextSession.unit,
            status: nextSession.status,
          }
        : null,
    });
  } catch (err: any) {
    console.error("[AreaPaciente] resumo:", err.message);
    res.status(500).json({ error: "Erro ao carregar resumo" });
  }
});

// --- PROTOCOLOS -------------------------------------------------------------
router.get("/area-paciente/protocolos", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  try {
    const protocols = await db
      .select()
      .from(protocolsTable)
      .where(eq(protocolsTable.clientId, clientId))
      .orderBy(desc(protocolsTable.startDate));

    const allSubstances = await db.select().from(substancesTable);
    const subMap = new Map(allSubstances.map((s) => [s.id, s]));

    const result = [];
    for (const p of protocols) {
      const items = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, p.id));
      result.push({
        id: p.id,
        title: p.title,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        unit: p.unit,
        serviceType: p.serviceType,
        totalSessions: p.totalSessions,
        completedSessions: p.completedSessions,
        totalValue: p.totalValue,
        items: items.map((it) => {
          const sub = subMap.get(it.substanceId);
          return {
            id: it.id,
            substanceName: sub?.name ?? `Substância ${it.substanceId}`,
            color: sub?.color ?? "yellow",
            procedureType: sub?.procedureType ?? "iv",
            dose: it.dose,
            totalSessions: it.totalSessions,
            completedSessions: it.completedSessions,
            intervalDays: it.intervalDays,
            startDate: it.startDate,
            frequency: it.frequency,
            mainFunction: sub?.mainFunction ?? null,
          };
        }),
      });
    }

    res.json(result);
  } catch (err: any) {
    console.error("[AreaPaciente] protocolos:", err.message);
    res.status(500).json({ error: "Erro ao carregar protocolos" });
  }
});

// --- SESSOES / AGENDA -------------------------------------------------------
router.get("/area-paciente/sessoes", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  try {
    const sessions = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.clientId, clientId))
      .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.scheduledTime));

    const allSubstances = await db.select().from(substancesTable);
    const subMap = new Map(allSubstances.map((s) => [s.id, s]));

    const result = [];
    for (const s of sessions) {
      const apps = await db
        .select()
        .from(substanceApplicationsTable)
        .where(eq(substanceApplicationsTable.sessionId, s.id));
      result.push({
        id: s.id,
        scheduledDate: s.scheduledDate,
        scheduledTime: s.scheduledTime,
        status: s.status,
        unit: s.unit,
        serviceType: s.serviceType,
        weekNumber: s.weekNumber,
        substances: apps.map((a) => {
          const sub = subMap.get(a.substanceId);
          return {
            substanceName: sub?.name ?? `Substância ${a.substanceId}`,
            color: sub?.color ?? "yellow",
            dose: a.dose,
            sessionNumber: a.sessionNumber,
            totalSessions: a.totalSessions,
            status: a.status,
            availability: a.availability,
          };
        }),
      });
    }

    res.json(result);
  } catch (err: any) {
    console.error("[AreaPaciente] sessoes:", err.message);
    res.status(500).json({ error: "Erro ao carregar agenda" });
  }
});

// --- FINANCEIRO -------------------------------------------------------------
router.get("/area-paciente/financeiro", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  try {
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.clientId, clientId))
      .orderBy(desc(paymentsTable.createdAt));

    const totalPago = payments.filter((p) => p.status === "paid").reduce((a, p) => a + p.amount, 0);
    const totalPendente = payments.filter((p) => p.status !== "paid").reduce((a, p) => a + p.amount, 0);

    res.json({
      totalPago,
      totalPendente,
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        status: p.status,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        description: p.description,
        installments: p.installments,
        cardLabel: p.cardLabel,
      })),
    });
  } catch (err: any) {
    console.error("[AreaPaciente] financeiro:", err.message);
    res.status(500).json({ error: "Erro ao carregar financeiro" });
  }
});

// --- EXAMES (solicitacoes) --------------------------------------------------
router.get("/area-paciente/exames", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  try {
    const exams = await db
      .select({
        id: examRequestPdfsTable.id,
        token: examRequestPdfsTable.token,
        tipo: examRequestPdfsTable.tipo,
        fileName: examRequestPdfsTable.fileName,
        examCount: examRequestPdfsTable.examCount,
        observacao: examRequestPdfsTable.observacao,
        createdAt: examRequestPdfsTable.createdAt,
      })
      .from(examRequestPdfsTable)
      .where(eq(examRequestPdfsTable.clientId, clientId))
      .orderBy(desc(examRequestPdfsTable.createdAt));

    res.json(exams);
  } catch (err: any) {
    console.error("[AreaPaciente] exames:", err.message);
    res.status(500).json({ error: "Erro ao carregar exames" });
  }
});

// --- DOCUMENTOS (lista RAS + protocolos para download) ----------------------
router.get("/area-paciente/documentos", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  try {
    const rasList = await db
      .select({
        id: rasTable.id,
        serviceDate: rasTable.serviceDate,
        unit: rasTable.unit,
        serviceType: rasTable.serviceType,
        professionalName: rasTable.professionalName,
      })
      .from(rasTable)
      .where(eq(rasTable.clientId, clientId))
      .orderBy(desc(rasTable.serviceDate));

    const protocols = await db
      .select({
        id: protocolsTable.id,
        title: protocolsTable.title,
        startDate: protocolsTable.startDate,
        status: protocolsTable.status,
      })
      .from(protocolsTable)
      .where(eq(protocolsTable.clientId, clientId))
      .orderBy(desc(protocolsTable.startDate));

    res.json({ ras: rasList, protocols });
  } catch (err: any) {
    console.error("[AreaPaciente] documentos:", err.message);
    res.status(500).json({ error: "Erro ao carregar documentos" });
  }
});

// --- DOWNLOAD RAS (PDF assinado) — token-bound, sem efeitos colaterais ------
router.get("/area-paciente/ras/:id/pdf", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "RAS inválido" }); return; }

  try {
    const [ras] = await db.select().from(rasTable).where(eq(rasTable.id, id));
    if (!ras || ras.clientId !== clientId) { res.status(404).json({ error: "RAS não encontrado" }); return; }

    const rawSubstances = (ras.substances as Array<{
      substanceName: string; dose: string; route: string; sessionNumber: number;
      totalSessions: number; lot: string | null; validity: string | null;
      appliedAt: string | null; status: string;
    }>) ?? [];

    const allSubstances = await db.select().from(substancesTable);
    const substanceMap = new Map(allSubstances.map((s) => [s.name, s]));

    const enrichedSubstances = rawSubstances.map((sub) => {
      const dbSub = substanceMap.get(sub.substanceName);
      return {
        ...sub,
        description: dbSub?.description ?? undefined,
        mainFunction: dbSub?.mainFunction ?? undefined,
        perceivedEffects: dbSub?.perceivedEffects ?? undefined,
        timeToEffect: dbSub?.timeToEffect ?? undefined,
        starRating: dbSub?.starRating ?? undefined,
        bodySystemEffects: (dbSub?.bodySystemEffects as Record<string, string>) ?? undefined,
        procedureType: dbSub?.procedureType ?? undefined,
      };
    });

    const { pdfBytes } = await generateSignedRASPdf({
      id: ras.id,
      sessionId: ras.sessionId,
      clientName: ras.clientName,
      clientCpf: ras.clientCpf,
      professionalName: ras.professionalName,
      professionalCrm: ras.professionalCrm ?? null,
      unit: ras.unit,
      serviceDate: ras.serviceDate,
      serviceType: ras.serviceType,
      observations: ras.observations ?? null,
      substances: enrichedSubstances,
    });

    const clientSlug = ras.clientName.replace(/\s+/g, "_");
    const dateSlug = ras.serviceDate.replace(/-/g, "");
    const filename = `RAS_${String(ras.id).padStart(6, "0")}_${clientSlug}_${dateSlug}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error("[AreaPaciente] ras pdf:", err.message);
    res.status(500).json({ error: "Erro ao gerar PDF" });
  }
});

// --- DOWNLOAD PROTOCOLO COMPLETO (PDF) — token-bound, sem efeitos colaterais
router.get("/area-paciente/protocolo/:id/pdf", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  const protocolId = parseInt(req.params.id);
  if (isNaN(protocolId)) { res.status(400).json({ error: "Protocolo inválido" }); return; }

  try {
    const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
    if (!protocol || protocol.clientId !== clientId) { res.status(404).json({ error: "Protocolo não encontrado" }); return; }

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

    let professionalName = "Profissional";
    let professionalCrm: string | null = null;
    let nurseName: string | undefined;
    if (protocol.professionalId) {
      const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
      if (prof) { professionalName = prof.name; professionalCrm = prof.crm ?? null; }
    }
    const allProfs = await db.select().from(professionalsTable);
    const nurseProf = allProfs.find((p) => (p.specialty ?? "").toLowerCase().includes("enf"));
    if (nurseProf) nurseName = nurseProf.name;

    const protocolItems = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocolId));
    const allSubstances = await db.select().from(substancesTable);
    const substMap = new Map(allSubstances.map((s) => [s.id, s]));

    const substances = protocolItems.map((item) => {
      const sub = substMap.get(item.substanceId);
      return {
        name: sub?.name ?? `Substancia ${item.substanceId}`,
        dose: item.dose,
        color: sub?.color ?? "yellow",
        totalSessions: item.totalSessions,
        intervalDays: item.intervalDays,
        startDate: item.startDate,
        procedureType: sub?.procedureType ?? "iv",
        unitPrice: item.unitPrice || sub?.pricePerUnit || 0,
        description: sub?.description ?? undefined,
        mainFunction: sub?.mainFunction ?? undefined,
        perceivedEffects: sub?.perceivedEffects ?? undefined,
        timeToEffect: sub?.timeToEffect ?? undefined,
        starRating: sub?.starRating ?? undefined,
        bodySystemEffects: (sub?.bodySystemEffects as Record<string, string>) ?? undefined,
        contraindications: sub?.contraindications ?? undefined,
        scientificEvidence: sub?.scientificEvidence ?? undefined,
        longevityBenefit: sub?.longevityBenefit ?? undefined,
        qualityOfLifeImpact: sub?.qualityOfLifeImpact ?? undefined,
        sleepBenefit: sub?.sleepBenefit ?? undefined,
        energyBenefit: sub?.energyBenefit ?? undefined,
        libidoBenefit: sub?.libidoBenefit ?? undefined,
        physicalPerformance: sub?.physicalPerformance ?? undefined,
        muscleStrength: sub?.muscleStrength ?? undefined,
        mentalClarity: sub?.mentalClarity ?? undefined,
        skinHairNails: sub?.skinHairNails ?? undefined,
        immuneSupport: sub?.immuneSupport ?? undefined,
      };
    });

    const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocolId));
    sessions.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.weekNumber - b.weekNumber);

    const docSessions = [];
    for (const sess of sessions) {
      const apps = await db.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, sess.id));
      const substanceStatuses = apps
        .filter((a) => a.availability === "disp")
        .map((a) => {
          const sub = substMap.get(a.substanceId);
          return {
            substanceName: sub?.name ?? "",
            sessionNumber: a.sessionNumber,
            totalSessions: a.totalSessions,
            status: a.status,
          };
        });
      docSessions.push({
        number: sess.weekNumber,
        scheduledDate: sess.scheduledDate,
        status: sess.status,
        substanceStatuses,
      });
    }

    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.protocolId, protocolId));

    const { pdfBytes } = await generateProtocolDocumentPdf({
      protocolId: protocol.id,
      protocolTitle: protocol.title,
      clientName: client.name,
      clientCpf: client.cpf,
      clientEmail: client.email,
      clientPhone: client.phone ?? undefined,
      clientBirthDate: client.birthDate ?? undefined,
      professionalName,
      professionalCrm,
      nurseName,
      unit: protocol.unit ?? "Clinica Padua",
      serviceType: protocol.serviceType,
      startDate: protocol.startDate,
      endDate: protocol.endDate,
      totalValue: protocol.totalValue,
      notes: protocol.notes,
      substances,
      sessions: docSessions,
      payments: payments.map((p) => ({
        amount: p.amount,
        method: p.method,
        status: p.status,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        description: p.description,
        installments: p.installments,
        cardLabel: p.cardLabel,
      })),
    });

    const clientSlug = client.name.replace(/\s+/g, "_");
    const filename = `PROTOCOLO_${clientSlug}_${protocolId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error("[AreaPaciente] protocolo pdf:", err.message);
    res.status(500).json({ error: "Erro ao gerar PDF" });
  }
});

// --- VALIDAR CÓDIGO DE PRESENÇA -----------------------------------------
// Aceita: código do dia (validation_codes) OU senha permanente (clients.validationPassword)
// Retorna { ok, mensagem, sessaoId? }
router.post("/area-paciente/validar-codigo", async (req: Request, res: Response): Promise<void> => {
  const clientId = getClientId(req);
  if (clientId === null) { unauthorized(res); return; }

  const { codigo } = req.body as { codigo?: string };
  if (!codigo || typeof codigo !== "string" || codigo.trim().length === 0) {
    res.status(400).json({ ok: false, error: "Código obrigatório" });
    return;
  }

  const codigoLimpo = codigo.trim().toUpperCase();

  try {
    // 1) Verificar se é a senha permanente do protocolo (validationPassword do cliente)
    const [client] = await db
      .select({ id: clientsTable.id, validationPassword: clientsTable.validationPassword })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId));

    if (!client) { unauthorized(res); return; }

    if (client.validationPassword && client.validationPassword.toUpperCase() === codigoLimpo) {
      res.json({ ok: true, mensagem: "Senha permanente verificada. Obrigado!" });
      return;
    }

    // 2) Verificar nos códigos diários (tabela validation_codes)
    // Aceita código não expirado e ainda não utilizado
    const now = new Date();
    const [vcode] = await db
      .select()
      .from(validationCodesTable)
      .where(
        and(
          eq(validationCodesTable.clientId, clientId),
          eq(validationCodesTable.code, codigoLimpo),
          eq(validationCodesTable.used, false),
          gte(validationCodesTable.expiresAt, now)
        )
      )
      .limit(1);

    if (!vcode) {
      res.status(400).json({ ok: false, mensagem: "Código inválido ou expirado. Verifique o WhatsApp e tente novamente." });
      return;
    }

    // Marcar como usado
    await db
      .update(validationCodesTable)
      .set({ used: true, usedAt: now })
      .where(eq(validationCodesTable.id, vcode.id));

    res.json({
      ok: true,
      sessaoId: vcode.sessionId,
      mensagem: "Presença confirmada com sucesso. Bom atendimento!",
    });
  } catch (err: any) {
    req.log?.error({ err }, "[AreaPaciente] validar-codigo error");
    res.status(500).json({ ok: false, error: "Erro interno" });
  }
});

export default router;

