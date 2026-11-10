import { Router, type IRouter, type Request } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { eq, and, inArray, desc } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { db, protocolsTable, protocolItemsTable, clientsTable, substancesTable, professionalsTable, sessionsTable, substanceApplicationsTable, paymentsTable, assinaturaSolicitacoesTable, assinaturaTemplatesTable, protocolEmissoesTable, locationProfessionalsTable } from "@workspace/db";
import { substanceDurationMinutes } from "../lib/substance-duration";
import { enviarAssinatura } from "../lib/assinatura/service";
import { resolverCodigosCadernos } from "../lib/cadernos-resolver";
import { ClinicalIdentityError } from "../lib/clinical-emitter";
import { resolveProtocolDoctor, withLoggedDoctorCertificate } from "../lib/prescription-signing";
import { generateProtocolDocumentPdf, generatePhysicalRASPdf, getCertInfo } from "../lib/pdf-signer";
import { generateProtocolLetterPdf, buildCartaTratamentoDto } from "../lib/pdf-carta-tratamento";
import { contarAplicacoesRealizadas } from "../lib/contagem-aplicacoes-realizadas";
import {
  ensureClientFolderStructure,
  uploadFileToDrive,
  uploadToFolderById,
  shareWithClient,
  isDriveConnected,
  formatPhysicalRASFileName,
} from "../lib/google-drive";
import { sendProtocolEmail, sendProtocolOnboardingEmail, sendCartaTratamentoEmail } from "../lib/email-service";
import { postSlackAlert } from "../lib/slack-reporter";
import { notifySlackRasFapFailure } from "../lib/ras-fap-alert";
import { buildEventsForSessions } from "../lib/session-ics";
import { buildVCalendar } from "../lib/ics";
import { buildExactProtocolSchedule } from "../lib/protocol-exact-schedule";
import { loadProtocolRasGrid } from "../lib/protocol-ras-grid";
import { loadProtocolRasRegistros } from "../lib/ras-fap-registros";
import { requireCollaborator } from "./collaborator";
import { ClientProtocolAgendaError, loadClientProtocolAgendas } from "../lib/protocol-client-agendas";
import { isGmailConnected } from "../lib/google-gmail";
import { resolveClinicalMember } from "../lib/clinical-emitter";
import {
  ListProtocolsQueryParams,
  CreateProtocolBody,
  GetProtocolParams,
  UpdateProtocolParams,
  UpdateProtocolBody,
  ValidateProtocolParams,
  ValidateProtocolQueryParams,
  GenerateProtocolICSParams,
} from "@workspace/api-zod";

// ── Boot: garantir tabela de auditoria de emissões ───────────────────────────
export async function ensureProtocolEmissoesTable(): Promise<void> {
  const { pool } = await import("@workspace/db");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS protocol_emissoes (
      id            SERIAL PRIMARY KEY,
      protocol_id   INTEGER      NOT NULL,
      emitido_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      autorizado_por TEXT        NOT NULL DEFAULT 'CEO',
      email_sent    BOOLEAN      NOT NULL DEFAULT FALSE,
      email_error   TEXT,
      drive_uploaded BOOLEAN     NOT NULL DEFAULT FALSE,
      cadernos_count INTEGER     NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_protocol_emissoes_protocol_id
      ON protocol_emissoes (protocol_id, emitido_at DESC);
  `);
}

const router: IRouter = Router();
router.use(moduleGuard("protocolos"));

class ProtocolValidationConflict extends Error {}

type ClinicalMember = Awaited<ReturnType<typeof resolveClinicalMember>>;

async function authorizeProtocolClient(
  req: import("express").Request,
  clientId: unknown,
  res: import("express").Response,
): Promise<ClinicalMember | null> {
  if (!req.collaborator) {
    res.status(401).json({ error: "Acesso restrito: faça login de colaborador" });
    return null;
  }

  try {
    const member = await resolveClinicalMember(req, clientId);
    if (member.clinic.empresaId !== resolveEmpresaId(req)) {
      res.status(404).json({ error: "Registro não encontrado" });
      return null;
    }
    return member;
  } catch {
    // Não confirmar a existência de clientes de outra clínica.
    res.status(404).json({ error: "Registro não encontrado" });
    return null;
  }
}

export async function authorizeProtocol(
  req: import("express").Request,
  protocol: typeof protocolsTable.$inferSelect,
  res: import("express").Response,
): Promise<ClinicalMember | null> {
  const member = await authorizeProtocolClient(req, protocol.clientId, res);
  if (!member) return null;
  if (protocol.empresaId !== member.clinic.empresaId) {
    res.status(404).json({ error: "Registro não encontrado" });
    return null;
  }
  return member;
}

async function professionalLinkedToClinic(professionalId: number, locationId: number): Promise<boolean> {
  const [professional] = await db.select({ id: professionalsTable.id, active: professionalsTable.active })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, professionalId))
    .limit(1);
  if (!professional?.active) return false;

  const [membership] = await db.select({ id: locationProfessionalsTable.id })
    .from(locationProfessionalsTable)
    .where(and(
      eq(locationProfessionalsTable.professionalId, professionalId),
      eq(locationProfessionalsTable.locationId, locationId),
    ))
    .limit(1);
  return Boolean(membership);
}

async function buildProtocolResponse(protocol: typeof protocolsTable.$inferSelect) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
  
  let professionalName: string | null = null;
  if (protocol.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
    professionalName = prof?.name ?? null;
  }

  let nurseId: number | null = (protocol as any).nurseId ?? null;
  let nurseServiceFee: number | null = (protocol as any).nurseServiceFee ?? null;
  let nurseName: string | null = null;
  if (nurseId) {
    const [nurse] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, nurseId));
    nurseName = nurse?.name ?? null;
  }

  const items = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocol.id));
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocol.id));

  const substanceIds = [...new Set(items.map(i => i.substanceId))];
  const substances: Record<number, typeof substancesTable.$inferSelect> = {};
  for (const sid of substanceIds) {
    const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, sid));
    if (s) substances[sid] = s;
  }

  const professionalIds = [...new Set(sessions.filter(s => s.professionalId).map(s => s.professionalId!))];
  const professionalMap: Record<number, string> = {};
  for (const pid of professionalIds) {
    const [p] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, pid));
    if (p) professionalMap[pid] = p.name;
  }

  const formattedSessions = await Promise.all(sessions.map(async session => {
    const applications = await db.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, session.id));
    const substanceApplicationIds = [...new Set(applications.map(a => a.substanceId))];
    const appSubstances: Record<number, typeof substancesTable.$inferSelect> = {};
    for (const sid of substanceApplicationIds) {
      if (!substances[sid]) {
        const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, sid));
        if (s) appSubstances[sid] = s;
      } else {
        appSubstances[sid] = substances[sid];
      }
    }

    return {
      id: session.id,
      protocolId: session.protocolId,
      clientId: session.clientId,
      resourceId: session.resourceId ?? null,
      durationMinutes: session.durationMinutes ?? null,
      clientName: client?.name ?? "",
      clientCpf: client?.cpf ?? "",
      scheduledDate: session.scheduledDate,
      scheduledTime: session.scheduledTime,
      status: session.status,
      professionalId: session.professionalId ?? null,
      professionalName: session.professionalId ? (professionalMap[session.professionalId] ?? null) : null,
      unit: session.unit ?? null,
      serviceType: session.serviceType,
      weekNumber: session.weekNumber,
      notes: session.notes ?? null,
      substanceApplications: applications.map(app => ({
        id: app.id,
        substanceId: app.substanceId,
        substanceName: appSubstances[app.substanceId]?.name ?? "",
        substanceColor: appSubstances[app.substanceId]?.color ?? "#888888",
        dose: app.dose,
        sessionNumber: app.sessionNumber,
        totalSessions: app.totalSessions,
        status: app.status,
        availability: app.availability,
        appliedAt: app.appliedAt ?? null,
        notes: app.notes ?? null,
      })),
      createdAt: session.createdAt.toISOString(),
    };
  }));

  // Histórico de emissões oficiais (mais recente primeiro)
  const emissoes = await db
    .select()
    .from(protocolEmissoesTable)
    .where(eq(protocolEmissoesTable.protocolId, protocol.id))
    .orderBy(desc(protocolEmissoesTable.emitidoAt));

  return {
    id: protocol.id,
    clientId: protocol.clientId,
    clientName: client?.name ?? "",
    clientCpf: client?.cpf ?? "",
    title: protocol.title,
    status: protocol.status,
    startDate: protocol.startDate,
    scheduledTime: protocol.scheduledTime,
    schedulingMode: protocol.schedulingMode,
    endDate: protocol.endDate ?? null,
    professionalId: protocol.professionalId ?? null,
    professionalName,
    nurseId,
    nurseServiceFee,
    nurseName,
    unit: protocol.unit ?? null,
    serviceType: protocol.serviceType,
    totalSessions: protocol.totalSessions,
    completedSessions: protocol.completedSessions,
    totalValue: protocol.totalValue,
    notes: protocol.notes ?? null,
    linhaVenda: (protocol as any).linhaVenda ?? null,
    emissoes: emissoes.map(e => ({
      id: e.id,
      emitidoAt: e.emitidoAt.toISOString(),
      autorizadoPor: e.autorizadoPor,
      emailSent: e.emailSent,
      emailError: e.emailError ?? null,
      driveUploaded: e.driveUploaded,
      cadernosCount: e.cadernosCount,
    })),
    items: items.map(item => {
      const unitPrice = item.unitPrice || substances[item.substanceId]?.pricePerUnit || 0;
      const lineTotal = unitPrice * item.totalSessions;
      return {
        id: item.id,
        substanceId: item.substanceId,
        substanceName: substances[item.substanceId]?.name ?? "",
        substanceColor: substances[item.substanceId]?.color ?? "#888888",
        dose: item.dose,
        unitPrice,
        lineTotal,
        totalSessions: item.totalSessions,
        completedSessions: item.completedSessions,
        intervalDays: item.intervalDays,
        startDate: item.startDate,
        frequency: item.frequency,
      };
    }),
    sessions: formattedSessions,
    createdAt: protocol.createdAt.toISOString(),
    updatedAt: protocol.updatedAt.toISOString(),
  };
}

router.get("/protocols", requireCollaborator, async (req, res): Promise<void> => {
  const query = ListProtocolsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const empresaId = resolveEmpresaId(req);
  const tenantFilter = eq(protocolsTable.empresaId, empresaId);

  let protocols;
  if (query.data.clientId && query.data.status) {
    protocols = await db.select().from(protocolsTable)
      .where(and(tenantFilter, eq(protocolsTable.clientId, query.data.clientId)));
    protocols = protocols.filter(p => p.status === query.data.status);
  } else if (query.data.clientId) {
    protocols = await db.select().from(protocolsTable)
      .where(and(tenantFilter, eq(protocolsTable.clientId, query.data.clientId)));
  } else if (query.data.status) {
    protocols = await db.select().from(protocolsTable)
      .where(and(tenantFilter, eq(protocolsTable.status, query.data.status)));
  } else {
    protocols = await db.select().from(protocolsTable)
      .where(tenantFilter);
  }

  if (query.data.clientId) {
    const member = await authorizeProtocolClient(req, query.data.clientId, res);
    if (!member) return;
    protocols = protocols.filter(protocol => protocol.empresaId === member.clinic.empresaId);
  } else {
    const visibility = await Promise.all(protocols.map(async protocol => {
      try {
        const member = await resolveClinicalMember(req, protocol.clientId);
        return protocol.empresaId === member.clinic.empresaId &&
          member.clinic.empresaId === empresaId;
      } catch {
        return false;
      }
    }));
    protocols = protocols.filter((_protocol, index) => visibility[index]);
  }

  const results = await Promise.all(protocols.map(buildProtocolResponse));
  res.json(results);
});

router.post("/protocols", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = CreateProtocolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, ...protocolData } = parsed.data;
  const member = await authorizeProtocolClient(req, protocolData.clientId, res);
  if (!member) return;
  let clientAgendas;
  try {
    clientAgendas = await loadClientProtocolAgendas(protocolData.clientId, member.clinic.empresaId);
  } catch (error) {
    if (error instanceof ClientProtocolAgendaError) {
      res.status(error.status).json({ code: error.code, error: error.message });
      return;
    }
    throw error;
  }
  if (protocolData.schedulingMode === "exact") {
    try {
      buildExactProtocolSchedule(protocolData.startDate, items);
    } catch {
      res.status(400).json({ error: "Confira as datas, as substâncias e os intervalos do protocolo." });
      return;
    }
  }

  if (!protocolData.professionalId ||
      !clientAgendas.doctors.some(professional => professional.id === protocolData.professionalId)) {
    res.status(403).json({ code: "medico_fora_do_cadastro", error: "Selecione um médico vinculado à agenda médica cadastrada para este cliente." });
    return;
  }

  // nurseId e nurseServiceFee chegam no body mas podem não estar no schema Zod; ler direto.
  const rawNurseId = req.body.nurseId != null ? parseInt(String(req.body.nurseId)) : null;
  const rawNurseServiceFee = req.body.nurseServiceFee != null ? parseFloat(String(req.body.nurseServiceFee)) : null;
  if (req.body.nurseId != null && (!Number.isSafeInteger(rawNurseId) || rawNurseId! <= 0)) {
    res.status(400).json({ error: "O profissional de enfermagem selecionado é inválido." });
    return;
  }
  if (rawNurseId != null && !clientAgendas.nurses.some(professional => professional.id === rawNurseId)) {
    res.status(403).json({ code: "enfermagem_fora_do_cadastro", error: "A profissional de enfermagem não está vinculada à agenda cadastrada para este cliente." });
    return;
  }

  const totalSessions = Math.max(...items.map((i: { totalSessions: number }) => i.totalSessions), 0);

  // Busca o valor da ampola de cada substância para montar o orçamento.
  const subIds = [...new Set(items.map((i: { substanceId: number }) => i.substanceId))];
  const priceMap: Record<number, number> = {};
  for (const sid of subIds) {
    const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, sid));
    priceMap[sid] = s?.pricePerUnit ?? 0;
  }
  const computedBudget = items.reduce(
    (sum: number, i: { substanceId: number; totalSessions: number }) =>
      sum + (priceMap[i.substanceId] ?? 0) * i.totalSessions,
    0,
  );
  const finalTotalValue =
    protocolData.totalValue && protocolData.totalValue > 0 ? protocolData.totalValue : computedBudget;

  const protocol = await db.transaction(async tx => {
  const [created] = await tx.insert(protocolsTable).values({
    ...protocolData,
    serviceType: "clinic",
    unit: clientAgendas.nursingAgenda.locationName,
    totalValue: finalTotalValue,
    totalSessions,
    empresaId: member.clinic.empresaId,
    ...(rawNurseId != null && !isNaN(rawNurseId) ? { nurseId: rawNurseId } : {}),
    ...(rawNurseServiceFee != null && !isNaN(rawNurseServiceFee) ? { nurseServiceFee: rawNurseServiceFee } : {}),
  }).returning();

  await Promise.all(items.map((item: { substanceId: number; dose: string; totalSessions: number; intervalDays: number; frequency: string; startDate?: string }) =>
    tx.insert(protocolItemsTable).values({
      protocolId: created.id,
      substanceId: item.substanceId,
      dose: item.dose,
      unitPrice: priceMap[item.substanceId] ?? 0,
      totalSessions: item.totalSessions,
      intervalDays: item.intervalDays,
      startDate: item.startDate ?? protocolData.startDate,
      frequency: item.frequency,
    })
  ));
  return created;
  });

  const result = await buildProtocolResponse(protocol);
  res.status(201).json(result);
});

router.get("/protocols/:id/document-pdf", requireCollaborator, async (req, res): Promise<void> => {
  const protocolId = Number.parseInt(String(req.params.id), 10);
  if (isNaN(protocolId)) {
    res.status(400).json({ error: "Invalid protocol id" });
    return;
  }

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  if (!await authorizeProtocol(req, protocol, res)) return;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  let professionalName = "Profissional";
  let professionalCrm: string | null = null;
  let nurseName: string | undefined;
  if (protocol.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
    if (prof) {
      professionalName = prof.name;
      professionalCrm = prof.crm ?? null;
    }
  }

  const allProfs = await db.select().from(professionalsTable);
  const nurseProf = protocol.nurseId ? allProfs.find(p => p.id === protocol.nurseId) : undefined;
  if (nurseProf) nurseName = nurseProf.name;

  const protocolItems = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocolId));
  const allSubstances = await db.select().from(substancesTable);
  const substMap = new Map(allSubstances.map(s => [s.id, s]));

  const substances = protocolItems.map(item => {
    const sub = substMap.get(item.substanceId);
    return {
      name: sub?.name ?? `Substancia ${item.substanceId}`,
      dose: item.dose,
      color: sub?.color ?? "yellow",
      totalSessions: item.totalSessions,
      intervalDays: item.intervalDays,
      startDate: item.startDate,
      procedureType: sub?.procedureType ?? "iv",
      categoryType: sub?.categoryType ?? null,
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
      composicao: sub?.composicao ?? undefined,
      posologia: sub?.posologia ?? undefined,
      // Classificação do cadastro — vai ao cabeçalho de identidade da ficha (spec R3).
      category: sub?.category ?? undefined,
      // Campos de posologia & logística auditados em task-266.
      concentrationMg: sub?.concentrationMg ?? undefined,
      volumeAmpola: sub?.volumeAmpola ?? undefined,
      durationMinutes: sub ? substanceDurationMinutes(sub) : undefined,
    };
  });

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocolId));
  sessions.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.weekNumber - b.weekNumber);

  const docSessions = [];
  for (const sess of sessions) {
    const apps = await db.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, sess.id));
    const substanceStatuses = apps
      .filter(a => a.availability === "disp")
      .map(a => {
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

  try {
    const { pdfBytes } = await withLoggedDoctorCertificate(req, protocol.clientId, () => generateProtocolDocumentPdf({
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
      unit: protocol.unit ?? "Instituto Pádua",
      serviceType: protocol.serviceType,
      startDate: protocol.startDate,
      endDate: protocol.endDate,
      totalValue: protocol.totalValue,
      notes: protocol.notes,
      substances,
      sessions: docSessions,
      payments: payments.map(p => ({
        amount: p.amount,
        method: p.method,
        status: p.status,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        description: p.description,
        installments: p.installments,
        cardLabel: p.cardLabel,
      })),
    }), { expectedProfessionalId: protocol.professionalId });

    const pdfBuffer = Buffer.from(pdfBytes);
    const clientSlug = client.name.replace(/\s+/g, "_");
    const filename = `PROTOCOLO_${clientSlug}_${protocolId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(pdfBuffer);
    // ── FIM da pré-visualização. Nenhum efeito colateral aqui. ───────────────
    // Para subir no Drive, enviar e-mail e despachar cadernos jurídicos,
    // use POST /protocols/:id/emit-document (ação explícita e distinta).
  } catch (err: any) {
    if (err instanceof ClinicalIdentityError) { res.status(err.status).json({ error: err.message }); return; }
    console.error("Protocol document PDF error:", err);
    res.status(500).json({ error: "Erro ao gerar documento do protocolo", details: err.message });
  }
});

// ── Emissão oficial com efeitos colaterais ────────────────────────────────────
// POST /protocols/:id/emit-document
// Gera o PDF do protocolo + RAS FAP, sobe os dois no Drive, envia e-mail ao
// paciente e despacha os cadernos jurídicos (idempotente por escopo).
// Ação DISTINTA e INTENCIONAL — use apenas quando o CEO decidir entregar.
router.post("/protocols/:id/emit-document", requireCollaborator, async (req, res): Promise<void> => {
  const protocolId = Number.parseInt(String(req.params.id), 10);
  if (isNaN(protocolId)) {
    res.status(400).json({ error: "Invalid protocol id" });
    return;
  }

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  if (!await authorizeProtocol(req, protocol, res)) return;

  // A autoria clínica é validada antes até do alerta preventivo ao Slack.
  try {
    await resolveProtocolDoctor(req, protocol.clientId, protocol.professionalId);
  } catch (err: any) {
    if (err instanceof ClinicalIdentityError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Falha ao validar o médico responsável pelo protocolo");
    res.status(500).json({ error: "Não foi possível validar o médico responsável." });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  // ── Alerta preventivo: paciente sem e-mail cadastrado ────────────────────
  // Enviado e aguardado ANTES de qualquer geração de PDF, upload ou outro
  // efeito colateral, para que o CEO seja avisado antes da emissão.
  if (!client.email) {
    const slackChannel = process.env.PADAXOR_SLACK_CHANNEL_ID;
    if (slackChannel) {
      try {
        await postSlackAlert(
          slackChannel,
          `⚠️ *Protocolo #${protocol.id} sendo emitido, mas o e-mail NÃO será enviado.*\nPaciente *${client.name}* não possui e-mail cadastrado.\nCadastre o e-mail do paciente e reenvie manualmente se necessário.`,
        );
      } catch (slackErr: any) {
        console.error("[emit] Falha ao enviar alerta Slack (sem e-mail):", slackErr.message);
      }
    } else {
      console.warn(`[emit] Paciente ${client.id} (${client.name}) não tem e-mail — e-mail do protocolo não será enviado. (Slack não configurado)`);
    }
  }

  let professionalName = "Profissional";
  let professionalCrm: string | null = null;
  let nurseName: string | undefined;
  if (protocol.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
    if (prof) {
      professionalName = prof.name;
      professionalCrm = prof.crm ?? null;
    }
  }

  const allProfs = await db.select().from(professionalsTable);
  const nurseProf = protocol.nurseId ? allProfs.find(p => p.id === protocol.nurseId) : undefined;
  if (nurseProf) nurseName = nurseProf.name;

  const protocolItems = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocolId));
  const allSubstances = await db.select().from(substancesTable);
  const substMap = new Map(allSubstances.map(s => [s.id, s]));

  const substances = protocolItems.map(item => {
    const sub = substMap.get(item.substanceId);
    return {
      name: sub?.name ?? `Substancia ${item.substanceId}`,
      dose: item.dose,
      color: sub?.color ?? "yellow",
      totalSessions: item.totalSessions,
      intervalDays: item.intervalDays,
      startDate: item.startDate,
      procedureType: sub?.procedureType ?? "iv",
      categoryType: sub?.categoryType ?? null,
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
      composicao: sub?.composicao ?? undefined,
      posologia: sub?.posologia ?? undefined,
      category: sub?.category ?? undefined,
      concentrationMg: sub?.concentrationMg ?? undefined,
      volumeAmpola: sub?.volumeAmpola ?? undefined,
      durationMinutes: sub ? substanceDurationMinutes(sub) : undefined,
    };
  });

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocolId));
  sessions.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.weekNumber - b.weekNumber);

  const docSessions = [];
  for (const sess of sessions) {
    const apps = await db.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, sess.id));
    const substanceStatuses = apps
      .filter(a => a.availability === "disp")
      .map(a => {
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

  try {
    // 1. Gerar PDF do protocolo
    const { pdfBytes } = await withLoggedDoctorCertificate(req, protocol.clientId, () => generateProtocolDocumentPdf({
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
      unit: protocol.unit ?? "Instituto Pádua",
      serviceType: protocol.serviceType,
      startDate: protocol.startDate,
      endDate: protocol.endDate,
      totalValue: protocol.totalValue,
      notes: protocol.notes,
      substances,
      sessions: docSessions,
      payments: payments.map(p => ({
        amount: p.amount,
        method: p.method,
        status: p.status,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        description: p.description,
        installments: p.installments,
        cardLabel: p.cardLabel,
      })),
    }), { expectedProfessionalId: protocol.professionalId });

    const pdfBuffer = Buffer.from(pdfBytes);

    const yy = protocol.startDate.slice(2, 4);
    const mm = protocol.startDate.slice(5, 7);
    const dd = protocol.startDate.slice(8, 10);
    const driveFileName = `${yy}.${mm}.${dd} PROTOCOLO ${client.name.toUpperCase()} (${protocol.title.toUpperCase()}).pdf`;

    const SHARED_RAS_FOLDER_ID = "1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep";

    // 2. Upload Drive (protocolo)
    // driveActuallyUploaded = true somente quando pelo menos um upload CONCLUIU.
    let driveActuallyUploaded = false;
    if (await isDriveConnected()) {
      const uploadPromises: Promise<any>[] = [];

      uploadPromises.push(
        uploadToFolderById(SHARED_RAS_FOLDER_ID, driveFileName, "application/pdf", pdfBuffer)
          .then(() => { driveActuallyUploaded = true; console.log(`[emit] Protocol uploaded to shared folder: ${driveFileName}`); })
          .catch(err => console.error("[emit] Shared folder upload error:", err.message))
      );

      uploadPromises.push(
        ensureClientFolderStructure(client.name, client.cpf)
          .then(async ({ subfolders }) => {
            const protocolosFolderId = subfolders["PROTOCOLOS"];
            if (protocolosFolderId) {
              const result = await uploadFileToDrive(protocolosFolderId, driveFileName, "application/pdf", pdfBuffer);
              if (client.email) {
                await shareWithClient(result.fileId, client.email);
              }
              driveActuallyUploaded = true;
              console.log(`[emit] Protocol uploaded to client PROTOCOLOS: ${driveFileName}`);
            }
          })
          .catch(err => console.error("[emit] Client folder upload error:", err.message))
      );

      await Promise.all(uploadPromises);
    }

    // 3. Gerar RAS FAP + upload Drive
    let rasFapBuffer: Buffer | undefined;
    const rasFapFileName = `${yy}.${mm}.${dd} RAS FAP ${client.name.toUpperCase()}.pdf`;
    try {
      const physicalSessions = docSessions.map(sess => ({
        number: sess.number,
        scheduledDate: sess.scheduledDate,
        effectiveDate: sess.status === "completed" ? sess.scheduledDate : null,
        nurseName: null as string | null,
        substanceStatuses: sess.substanceStatuses,
      }));

      let clientAge: number | undefined;
      if (client.birthDate) {
        const birth = new Date(client.birthDate);
        const now = new Date();
        clientAge = now.getFullYear() - birth.getFullYear();
        if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) clientAge--;
      }

      const rasFapBytes = await generatePhysicalRASPdf({
        persistedGrid: await loadProtocolRasGrid(protocol, protocolItems.map(item => item.substanceId)),
        registros: await loadProtocolRasRegistros(protocol, protocolItems.map(item => item.substanceId)),
        clientName: client.name,
        clientCpf: client.cpf ?? "000.000.000-00",
        clientPhone: client.phone ?? "",
        clientAge,
        professionalName,
        nurseName,
        unit: protocol.unit ?? "Instituto Padua",
        startDate: protocol.startDate,
        protocolNumber: `FAP-${yy}${mm}${dd}-${protocol.id}`,
        valorTratamento: protocol.totalValue
          ? `R$ ${Number(protocol.totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : undefined,
        substances: substances.map(s => ({
          name: s.name,
          color: s.color,
          totalSessions: s.totalSessions,
          frequencyDays: s.intervalDays ?? 7,
          startDate: s.startDate ?? protocol.startDate,
          procedureType: s.procedureType as "iv" | "im" | "sc" | "implant",
          dose: s.dose,
        })),
        sessions: physicalSessions,
      }, "PREMIUM");
      rasFapBuffer = Buffer.from(rasFapBytes);
      console.log(`[emit] RAS FAP gerado para ${client.name} (${rasFapBuffer.length} bytes)`);

      if (await isDriveConnected()) {
        const rasFapPromises: Promise<any>[] = [];
        rasFapPromises.push(
          uploadToFolderById(SHARED_RAS_FOLDER_ID, rasFapFileName, "application/pdf", rasFapBuffer)
            .then(() => console.log(`[emit] RAS FAP uploaded to shared folder: ${rasFapFileName}`))
            .catch(err => console.error("[emit] RAS FAP shared folder upload error:", err.message))
        );
        rasFapPromises.push(
          ensureClientFolderStructure(client.name, client.cpf ?? "")
            .then(async ({ subfolders }) => {
              const protocolosFolderId = subfolders["PROTOCOLOS"];
              if (protocolosFolderId && rasFapBuffer) {
                const result = await uploadFileToDrive(protocolosFolderId, rasFapFileName, "application/pdf", rasFapBuffer);
                if (client.email) {
                  await shareWithClient(result.fileId, client.email);
                }
                console.log(`[emit] RAS FAP uploaded to client PROTOCOLOS: ${rasFapFileName}`);
              }
            })
            .catch(err => console.error("[emit] RAS FAP client folder upload error:", err.message))
        );
        await Promise.all(rasFapPromises);
      }
    } catch (rasFapErr: any) {
      console.error("[emit] RAS FAP generation error:", rasFapErr.message);
      await notifySlackRasFapFailure(
        "drive",
        client.name,
        protocol.id,
        protocol.title,
        rasFapErr.message,
        process.env.PADAXOR_SLACK_CHANNEL_ID,
      );
    }

    // 4. E-mail ao paciente
    let emailSent = false;
    let emailError: string | undefined;
    let cadernosDispatched = 0;
    if (!client.email) {
      emailError = "Cliente sem e-mail cadastrado.";
    } else if (!await isGmailConnected()) {
      emailError = "Gmail indisponível ou não autorizado. Verifique a conexão.";
    } else {
      try {
        const emailResult = await sendProtocolEmail({
          clientName: client.name,
          clientEmail: client.email,
          protocolTitle: protocol.title,
          professionalName,
          startDate: protocol.startDate,
          substances: substances.map(s => ({
            name: s.name,
            color: s.color,
            totalSessions: s.totalSessions,
          })),
          pdfBuffer,
          pdfFileName: driveFileName,
          rasFapBuffer,
          rasFapFileName,
        });
        emailSent = emailResult.success;
        emailError = emailResult.error;

        if (emailResult.success) {
          console.log(`[emit] E-mail enviado a ${client.email}${rasFapBuffer ? " (+ RAS FAP)" : ""}`);

          // 5. Cadernos Jurídicos (idempotente por escopo)
          if (!rasFapBuffer) {
            console.warn(`[emit] Cadernos jurídicos não despachados: RAS FAP ausente para paciente ${client.id}`);
          } else try {
            const escopoEntrega = `RAS_FAP_ENTREGA:${protocolId}`;

            const { codigos: codigosRequeridos } = resolverCodigosCadernos(
              substances.map(s => ({
                nome: s.name,
                procedureType: s.procedureType,
                categoryType: s.categoryType,
              })),
            );

            const jaEnviados = await db
              .select({ codigo: assinaturaTemplatesTable.codigo })
              .from(assinaturaSolicitacoesTable)
              .innerJoin(
                assinaturaTemplatesTable,
                eq(assinaturaSolicitacoesTable.templateId, assinaturaTemplatesTable.id),
              )
              .where(
                and(
                  eq(assinaturaSolicitacoesTable.pacienteId, client.id),
                  eq(assinaturaSolicitacoesTable.escopo, escopoEntrega),
                  inArray(assinaturaSolicitacoesTable.status as any, ["ENVIADO", "CONCLUIDO"] as any),
                ),
              );
            const codigosJaEnviados = new Set(jaEnviados.map(r => r.codigo));
            const codigosFaltantes = [...codigosRequeridos].filter(c => !codigosJaEnviados.has(c));

            if (codigosFaltantes.length === 0) {
              console.log(`[emit] Cadernos jurídicos: todos já enviados para paciente ${client.id}`);
            } else {
              const templates = await db
                .select({
                  id: assinaturaTemplatesTable.id,
                  codigo: assinaturaTemplatesTable.codigo,
                  titulo: assinaturaTemplatesTable.titulo,
                  tipoDoc: assinaturaTemplatesTable.tipoDoc,
                })
                .from(assinaturaTemplatesTable)
                .where(
                  and(
                    inArray(assinaturaTemplatesTable.codigo, codigosFaltantes),
                    eq(assinaturaTemplatesTable.ativo, true),
                  ),
                );

              if (templates.length > 0) {
                const clientBirthDateFmt = client.birthDate
                  ? new Date(client.birthDate + "T12:00:00").toLocaleDateString("pt-BR")
                  : "";
                const startDateFmt = protocol.startDate
                  ? new Date(protocol.startDate + "T12:00:00").toLocaleDateString("pt-BR")
                  : "";
                const maxSessoes = substances.reduce((m, s) => Math.max(m, s.totalSessions), 0);
                const viasUnicas = [...new Set(substances.map(s => {
                  const viaLabel: Record<string, string> = { iv: "Endovenosa (IV)", im: "Intramuscular (IM)", implant: "Implante Subcutâneo", sc: "Subcutânea (SC)" };
                  return viaLabel[s.procedureType] ?? s.procedureType;
                }))].join(", ");
                const viaMapHid: Record<string, string> = {
                  iv: "Endovenosa (IV)", im: "Intramuscular (IM)",
                  implant: "Implante Subcutâneo", sc: "Subcutânea (SC)",
                };
                const substanciasTable =
                  `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:11px">` +
                  `<thead><tr style="background:#f0f4f2">` +
                  `<th style="text-align:left;padding:5px 10px;border-bottom:1.5px solid #c8d0cc">Substância</th>` +
                  `<th style="text-align:left;padding:5px 10px;border-bottom:1.5px solid #c8d0cc">Dose</th>` +
                  `<th style="text-align:center;padding:5px 10px;border-bottom:1.5px solid #c8d0cc">Sessões</th>` +
                  `<th style="text-align:left;padding:5px 10px;border-bottom:1.5px solid #c8d0cc">Frequência</th>` +
                  `<th style="text-align:left;padding:5px 10px;border-bottom:1.5px solid #c8d0cc">Via</th>` +
                  `</tr></thead><tbody>` +
                  substances.map((s, idx) =>
                    `<tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f7faf8"}">` +
                    `<td style="padding:5px 10px;border-bottom:1px solid #e8ede9"><strong>${s.name}</strong></td>` +
                    `<td style="padding:5px 10px;border-bottom:1px solid #e8ede9">${s.dose.replace(/\s*\/\s*\d+[\.,]?\d*\s*(ml|mL|ML)/gi, "").trim()}</td>` +
                    `<td style="text-align:center;padding:5px 10px;border-bottom:1px solid #e8ede9">${s.totalSessions}</td>` +
                    `<td style="padding:5px 10px;border-bottom:1px solid #e8ede9">${s.intervalDays > 0 ? `a cada ${s.intervalDays} dias` : "dose única"}</td>` +
                    `<td style="padding:5px 10px;border-bottom:1px solid #e8ede9">${viaMapHid[s.procedureType] ?? s.procedureType.toUpperCase()}</td>` +
                    `</tr>`
                  ).join("") +
                  `</tbody></table>`;

                const hidratacao: Record<string, string> = {
                  "cliente.nome":           client.name,
                  "cliente.cpf":            client.cpf ?? "",
                  "cliente.dataNascimento": clientBirthDateFmt,
                  "cliente.email":          client.email ?? "",
                  "cliente.telefone":       client.phone ?? "",
                  "data.hoje":              new Date().toLocaleDateString("pt-BR"),
                  "medico.nome":            professionalName,
                  "medico.crm":             professionalCrm ?? "XXXXX",
                  "medico.uf":              "SP",
                  "clinica.nome":           protocol.unit ?? "Clínica Tatuapé — Padcon Conect",
                  "clinica.endereco":       "São Paulo — SP",
                  "clinica.email":          "contato@padconconect.com.br",
                  "protocolo.titulo":       protocol.title,
                  "protocolo.substancias":  substanciasTable,
                  "protocolo.vias":         viasUnicas,
                  "protocolo.dataInicio":   startDateFmt,
                  "protocolo.totalSessoes": String(maxSessoes),
                  "protocolo.sessoes":      String(maxSessoes),
                  "protocolo.valorTotal":   protocol.totalValue
                    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(protocol.totalValue))
                    : "",
                  "protocolo.valor":        protocol.totalValue
                    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(protocol.totalValue))
                    : "",
                  "pagamento.metodo":       "PIX",
                  "pagamento.parcelas":     "1",
                };

                for (const tpl of templates) {
                  try {
                    await enviarAssinatura({
                      pacienteId: client.id,
                      templateCodigo: tpl.codigo,
                      tipoDoc: tpl.tipoDoc as "TCLE" | "TERMO" | "RAS" | "OUTRO",
                      titulo: tpl.titulo,
                      escopo: escopoEntrega,
                      externalId: `ras-fap-${client.id}-${protocolId}-${tpl.codigo}`,
                      canais: ["EMAIL"],
                      dados: hidratacao,
                      incluirMedico: true,
                    });
                    cadernosDispatched++;
                    console.log(`[emit] Caderno ${tpl.codigo} despachado para paciente ${client.id}`);
                  } catch (cErr: any) {
                    console.error(`[emit] Caderno ${tpl.codigo} falhou para paciente ${client.id}: ${cErr.message}`);
                  }
                }
              } else {
                console.warn(`[emit] Cadernos jurídicos: nenhum template ativo para [${codigosFaltantes.join(",")}]`);
              }
            }
          } catch (cadernosErr: any) {
            console.error(`[emit] Cadernos jurídicos erro geral: ${cadernosErr.message}`);
          }
        } else {
          console.error("[emit] E-mail falhou:", emailResult.error);
          const slackChannel = process.env.PADAXOR_SLACK_CHANNEL_ID;
          if (slackChannel) {
            postSlackAlert(
              slackChannel,
              `🚨 *E-mail do protocolo não entregue* ao paciente *${client.name}* (Protocolo #${protocol.id} — ${protocol.title}).\nE-mail destino: ${client.email}\nMotivo: ${emailResult.error ?? "desconhecido"}`,
            ).catch(() => {});
          }
        }
      } catch (mailErr: any) {
        emailError = mailErr.message;
        console.error("[emit] Erro ao enviar e-mail:", mailErr.message);
        const slackChannel = process.env.PADAXOR_SLACK_CHANNEL_ID;
        if (slackChannel) {
          postSlackAlert(
            slackChannel,
            `🚨 *Falha ao enviar e-mail do protocolo* para *${client.name}* (Protocolo #${protocol.id}).\nErro: ${mailErr.message}`,
          ).catch(() => {});
        }
        if (rasFapBuffer) {
          // O RAS FAP estava pronto mas não pôde ser enviado junto com o e-mail.
          await notifySlackRasFapFailure(
            "email",
            client.name,
            protocol.id,
            protocol.title,
            mailErr.message,
            process.env.PADAXOR_SLACK_CHANNEL_ID,
          );
        }
      }
    }

    // ── Auditoria de emissão ──────────────────────────────────────────────────
    // Identifica quem autorizou (collaborator token → nome do profissional ou "CEO").
    let autorizadoPor = "CEO";
    if (req.collaborator?.professionalId) {
      try {
        const [prof] = await db
          .select({ name: professionalsTable.name })
          .from(professionalsTable)
          .where(eq(professionalsTable.id, req.collaborator.professionalId));
        if (prof?.name) autorizadoPor = prof.name;
      } catch { /* mantém "CEO" */ }
    }

    // ── Gravar auditoria (falha-ruidosa: alerta no Slack + HTTP 500) ─────────
    // A entrega já ocorreu; o INSERT de auditoria NÃO pode ser silenciado.
    // Retornar 200 sem registro persistido seria enganoso — reportamos 500 com
    // o resultado real da entrega para que o CEO saiba exatamente o que ocorreu
    // e possa acionar suporte sem risco de re-emissão acidental.
    try {
      await db.insert(protocolEmissoesTable).values({
        protocolId,
        autorizadoPor,
        emailSent,
        emailError: emailError ?? null,
        driveUploaded: driveActuallyUploaded,
        cadernosCount: cadernosDispatched,
      });
    } catch (auditErr: any) {
      const msg = `🚨 *Falha ao gravar auditoria de emissão* do Protocolo #${protocolId} (${client.name}).\n` +
        `A entrega JÁ OCORREU (email=${emailSent}, drive=${driveActuallyUploaded}, cadernos=${cadernosDispatched}), ` +
        `mas o registro em protocol_emissoes falhou — o histórico ficará incompleto.\nErro: ${auditErr.message}`;
      console.error("[emit] " + msg);
      const slackChannel = process.env.PADAXOR_SLACK_CHANNEL_ID;
      if (slackChannel) await postSlackAlert(slackChannel, msg).catch(() => {});
      // Retornar 500 para que o CEO saiba que o registro de auditoria falhou.
      // A entrega em si JÁ aconteceu — não re-emitir; acionar suporte.
      res.status(500).json({
        ok: false,
        auditFailed: true,
        emailSent,
        driveUploaded: driveActuallyUploaded,
        cadernosCount: cadernosDispatched,
        error: "Entrega concluída, mas o registro de auditoria falhou. Não re-emitir — acionar suporte.",
        details: auditErr.message,
      });
      return;
    }

    res.json({
      ok: true,
      emailSent,
      emailError: emailError ?? null,
      driveUploaded: driveActuallyUploaded,
      rasFapGenerated: Boolean(rasFapBuffer?.length),
      message: emailSent
        ? `E-mail do protocolo aceito pelo Gmail para ${client.email}.`
        : `E-mail do protocolo não confirmado${emailError ? ": " + emailError : "; motivo não informado."}`,
    });
  } catch (err: any) {
    if (err instanceof ClinicalIdentityError) { res.status(err.status).json({ error: err.message }); return; }
    console.error("[emit] Erro geral:", err);
    res.status(500).json({ error: "Erro ao emitir documento do protocolo", details: err.message });
  }
});

// ── Diagnóstico de certificado para a Carta de Tratamento ────────────────────
// ATENÇÃO: esta rota DEVE ficar antes de qualquer rota /:id para evitar que
// "carta-pdf-certcheck" seja capturado como id numérico pelo Express.
// Rota protegida (requireCollaborator): apenas metadados de validade e emissor
// são retornados — CPF e dados sensíveis do titular NÃO são expostos.
router.get("/protocols/carta-pdf-certcheck", requireCollaborator, async (_req, res): Promise<void> => {
  try {
    const info = getCertInfo();
    const now = Date.now();
    const startsAt = Date.parse(info.validFrom);
    const expiresAt = Date.parse(info.validTo);
    const state = now < startsAt ? "not_yet_valid" : now > expiresAt ? "expired" : "valid";
    const msRemaining = expiresAt - now;
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    res.json({
      ok: state === "valid",
      state,
      message: state === "valid"
        ? "Certificado global válido; assinatura digital disponível."
        : state === "expired" ? "Certificado global vencido; assinatura digital indisponível."
          : "Certificado global ainda não vigente; assinatura digital indisponível.",
      cert: {
        issuer:       info.issuer,
        serial:       info.serial,
        validFrom:    info.validFrom,
        validTo:      info.validTo,
        daysRemaining,
      },
    });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      state: "unavailable",
      message: "Certificado não configurado ou senha incorreta.",
    });
  }
});

router.get("/protocols/:id", requireCollaborator, async (req, res): Promise<void> => {
  const params = GetProtocolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, params.data.id));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  if (!await authorizeProtocol(req, protocol, res)) return;

  const result = await buildProtocolResponse(protocol);
  res.json(result);
});

router.put("/protocols/:id", requireCollaborator, async (req, res): Promise<void> => {
  const params = UpdateProtocolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProtocolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(protocolsTable)
    .where(eq(protocolsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  const member = await authorizeProtocol(req, existing, res);
  if (!member) return;
  if (parsed.data.professionalId != null &&
      !await professionalLinkedToClinic(parsed.data.professionalId, member.clinic.id)) {
    res.status(403).json({ error: "O profissional selecionado não está vinculado a esta clínica." });
    return;
  }

  const [protocol] = await db.update(protocolsTable).set(parsed.data)
    .where(and(
      eq(protocolsTable.id, params.data.id),
      eq(protocolsTable.empresaId, member.clinic.empresaId),
    )).returning();
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }

  const result = await buildProtocolResponse(protocol);
  res.json(result);
});

// Legacy route: never creates sessions, because it does not reserve agenda slots.
router.post("/protocols/:id/validate", requireCollaborator, async (req, res): Promise<void> => {
  const params = ValidateProtocolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = ValidateProtocolQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, params.data.id));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  if (!await authorizeProtocol(req, protocol, res)) return;

  let generated = false;
  let updatedProtocol: typeof protocolsTable.$inferSelect;
  try {
  updatedProtocol = await db.transaction(async (tx) => {
  // Serializa validações concorrentes, sem reconstruir ou apagar sessões.
  // A autorização acima continua obrigatória; identidade é reconferida no lock.
  const [lockedProtocol] = await tx.select().from(protocolsTable)
    .where(eq(protocolsTable.id, protocol.id)).for("update");
  if (!lockedProtocol ||
      lockedProtocol.clientId !== protocol.clientId ||
      lockedProtocol.empresaId !== protocol.empresaId ||
      lockedProtocol.professionalId !== protocol.professionalId) {
    throw new ProtocolValidationConflict("O protocolo mudou; recarregue e confira antes de validar.");
  }
  // Refaz a autorização depois de eventual espera pelo bloqueio do protocolo.
  try {
    const currentMember = await resolveClinicalMember(req, lockedProtocol.clientId);
    if (currentMember.clinic.empresaId !== resolveEmpresaId(req) ||
        currentMember.clinic.empresaId !== lockedProtocol.empresaId) {
      throw new Error("clinical_scope_changed");
    }
  } catch {
    throw new ProtocolValidationConflict("O acesso clínico mudou; recarregue e confira antes de validar.");
  }
  const db = tx;
  const existingSessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocol.id));
  if (lockedProtocol.status === "validated" && existingSessions.length > 0) {
    if (existingSessions.some(session => !session.resourceId || !session.durationMinutes)) {
      throw new ProtocolValidationConflict(
        "Este protocolo tem sessões antigas sem reserva. Elas foram preservadas; não podem ser tratadas como agendadas.",
      );
    }
    return lockedProtocol;
  }
  if (lockedProtocol.status === "suggested" && existingSessions.length === 0) {
    throw new ProtocolValidationConflict(
      "A validação antiga não reserva horários. Use a prévia e a confirmação em “Agendar protocolo”. Nada foi gravado.",
    );
  }
  if (lockedProtocol.status !== "suggested" || existingSessions.length > 0) {
    throw new ProtocolValidationConflict("Protocolo já processado ou com sessões existentes; confira o histórico sem recriar os agendamentos.");
  }
  const items = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocol.id));
  if (items.length === 0 || items.some(item =>
    !Number.isSafeInteger(item.totalSessions) || item.totalSessions <= 0 ||
    !Number.isSafeInteger(item.intervalDays) || item.intervalDays <= 0)) {
    throw new ProtocolValidationConflict("Confira as substâncias, as quantidades de sessões e os intervalos antes de validar.");
  }
  const defaultTime = query.data.scheduledTime ?? lockedProtocol.scheduledTime ?? "09:00";
  if (lockedProtocol.schedulingMode === "exact") {
    let appointments;
    try {
      appointments = buildExactProtocolSchedule(lockedProtocol.startDate, items);
    } catch {
      throw new ProtocolValidationConflict("Confira as datas e os intervalos das substâncias antes de validar.");
    }
    for (const [index, appointment] of appointments.entries()) {
      const [session] = await db.insert(sessionsTable).values({
        protocolId: lockedProtocol.id, clientId: lockedProtocol.clientId,
        professionalId: lockedProtocol.professionalId, scheduledDate: appointment.date,
        scheduledTime: defaultTime, status: "scheduled", unit: lockedProtocol.unit,
        serviceType: lockedProtocol.serviceType, weekNumber: index + 1,
      }).returning();
      for (const application of appointment.applications) {
        await db.insert(substanceApplicationsTable).values({
          sessionId: session.id, ...application, status: "pending", availability: "disp",
        });
      }
      for (const item of appointment.upcoming) {
        await db.insert(substanceApplicationsTable).values({
          sessionId: session.id, substanceId: item.substanceId, dose: item.dose,
          sessionNumber: 0, totalSessions: item.totalSessions,
          status: "pending", availability: "prox",
        });
      }
    }
  } else {

  // Build schedule map: week -> { date, substances[] }
  const startDate = new Date(lockedProtocol.startDate);
  const weekMap: Map<number, { date: string; substanceApplications: Array<{ substanceId: number; dose: string; sessionNumber: number; totalSessions: number; weekNumber: number; dayOfWeek: number; }> }> = new Map();

  for (const item of items) {
    for (let sessionNum = 1; sessionNum <= item.totalSessions; sessionNum++) {
      const daysFromStart = (sessionNum - 1) * item.intervalDays;
      const sessionDate = new Date(startDate);
      sessionDate.setDate(startDate.getDate() + daysFromStart);

      // Get ISO week number
      const weekNumber = Math.ceil((daysFromStart + 1) / 7);
      const dayOfWeek = sessionDate.getDay(); // 0=Sun, 1=Mon... 6=Sat

      const dateStr = sessionDate.toISOString().split("T")[0];

      if (!weekMap.has(weekNumber)) {
        weekMap.set(weekNumber, { date: dateStr, substanceApplications: [] });
      }

      const weekEntry = weekMap.get(weekNumber)!;
      weekEntry.substanceApplications.push({
        substanceId: item.substanceId,
        dose: item.dose,
        sessionNumber: sessionNum,
        totalSessions: item.totalSessions,
        weekNumber,
        dayOfWeek,
      });

      // Use the day with most applications (keep earliest date for tiebreaking)
      if (weekEntry.substanceApplications.length === 1) {
        weekEntry.date = dateStr;
      }
    }
  }

  // For each week, elect the best date (day with most applications) — weekly consolidation rule
  for (const [weekNumber, weekData] of weekMap.entries()) {
    // Count applications per day
    const dayCount: Record<string, number> = {};
    for (const app of weekData.substanceApplications) {
      const daysFromStart = (app.sessionNumber - 1) * (items.find(i => i.substanceId === app.substanceId)?.intervalDays ?? 7);
      const sessionDate = new Date(startDate);
      sessionDate.setDate(startDate.getDate() + daysFromStart);
      const dateStr = sessionDate.toISOString().split("T")[0];
      dayCount[dateStr] = (dayCount[dateStr] || 0) + 1;
    }

    // Elect day with most applications
    let bestDate = weekData.date;
    let bestCount = 0;
    for (const [date, count] of Object.entries(dayCount)) {
      if (count > bestCount) {
        bestCount = count;
        bestDate = date;
      }
    }

    // Create one consolidated session per week
    const [session] = await db.insert(sessionsTable).values({
      protocolId: protocol.id,
      clientId: protocol.clientId,
      professionalId: lockedProtocol.professionalId,
      scheduledDate: bestDate,
      scheduledTime: defaultTime,
      status: "scheduled",
      unit: lockedProtocol.unit,
      serviceType: lockedProtocol.serviceType,
      weekNumber,
    }).returning();

    // Determine which substances are DISP (applied this week) vs PROX (coming next weeks)
    // All substances in this week are DISP; substancesTotal - items in this week for future weeks = PROX display only
    for (const app of weekData.substanceApplications) {
      try {
        await db.insert(substanceApplicationsTable).values({
          sessionId: session.id,
          substanceId: app.substanceId,
          dose: app.dose,
          sessionNumber: app.sessionNumber,
          totalSessions: app.totalSessions,
          status: "pending",
          availability: "disp",
        });
      } catch (insertErr: any) {
        // Drizzle wraps pg errors: check both err.code and err.cause.code
        if (insertErr?.code === "23505" || insertErr?.cause?.code === "23505") {
          const slackChannel = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";
          void postSlackAlert(
            slackChannel,
            `⚠️ *Aplicação duplicada recusada pelo banco* (DISP)\n` +
            `Protocolo: *#${protocol.id}* | Sessão: *#${session.id}* (semana ${weekNumber}) | Substância ID: *${app.substanceId}* | Sessão nº ${app.sessionNumber}\n` +
            `O motor de consolidação tentou inserir uma linha já existente. Nenhum dado foi corrompido — a duplicata foi bloqueada na origem.`,
          );
          throw new ProtocolValidationConflict("Aplicação duplicada detectada; nenhuma sessão desta validação foi gravada.");
        }
        throw insertErr;
      }
    }

    // Find substances that have future sessions — add them as PROX for visibility
    for (const item of items) {
      const hasInThisWeek = weekData.substanceApplications.some(a => a.substanceId === item.substanceId);
      if (!hasInThisWeek) {
        // Check if this substance has any session at all and has remaining sessions
        const futureSessionExists = weekData.substanceApplications.length > 0;
        if (futureSessionExists) {
          try {
            await db.insert(substanceApplicationsTable).values({
              sessionId: session.id,
              substanceId: item.substanceId,
              dose: item.dose,
              sessionNumber: 0,
              totalSessions: item.totalSessions,
              status: "pending",
              availability: "prox",
            });
          } catch (insertErr: any) {
            if (insertErr?.code === "23505" || insertErr?.cause?.code === "23505") {
              const slackChannel = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";
              void postSlackAlert(
                slackChannel,
                `⚠️ *Aplicação duplicada recusada pelo banco* (PROX)\n` +
                `Protocolo: *#${protocol.id}* | Sessão: *#${session.id}* (semana ${weekNumber}) | Substância ID: *${item.substanceId}* | Sessão nº 0\n` +
                `O motor de consolidação tentou inserir uma linha já existente. Nenhum dado foi corrompido — a duplicata foi bloqueada na origem.`,
              );
              throw new ProtocolValidationConflict("Aplicação futura duplicada detectada; nenhuma sessão desta validação foi gravada.");
            }
            throw insertErr;
          }
        }
      }
    }
  }
  }

  // Update protocol status to validated
  const [updatedProtocol] = await db.update(protocolsTable)
    .set({ status: "validated", scheduledTime: defaultTime })
    .where(eq(protocolsTable.id, params.data.id))
    .returning();
  generated = true;
  return updatedProtocol;
  });
  } catch (err) {
    if (err instanceof ProtocolValidationConflict) {
      res.status(409).json({ error: "protocol_validation_conflict", message: err.message });
      return;
    }
    throw err;
  }
  if (!generated) {
    req.log.info({ protocolId: protocol.id }, "Validação já concluída; sessões e comunicações preservadas");
    res.json(await buildProtocolResponse(updatedProtocol));
    return;
  }

  // SUB-04 item 5: onboarding ao fechar/validar o protocolo — e-mail de boas-vindas
  // com o .ics consolidado das sessões recém-geradas. Best-effort: cliente sem
  // e-mail ou falha no envio NÃO quebra a validação (caso extremo 1).
  // Só enviar horários que já tenham reserva real na agenda. As sessões
  // geradas pela validação ainda são previsões, não reservas.
  const skipOnboarding = query.data.skipOnboardingEmail === "true";

  try {
    if (skipOnboarding) {
      req.log.warn(
        { protocolId: protocol.id },
        "Onboarding NAO enviado: supressao explicita via skipOnboardingEmail=true",
      );
    } else if (await isGmailConnected()) {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
      if (client?.email) {
        const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocol.id));
        if (sessions.length === 0 || sessions.some(s => !s.resourceId || !s.durationMinutes || s.durationMinutes <= 0)) {
          req.log.warn({ protocolId: protocol.id }, "Convite não enviado: sessões ainda não têm horários reservados.");
        } else {
          sessions.sort((a, b) =>
            a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime),
          );
          const events = await buildEventsForSessions(sessions, client.name);
          const onboarding = await sendProtocolOnboardingEmail({
            clientName: client.name,
            clientEmail: client.email,
            events,
          });
          if (!onboarding.success) {
            req.log.warn({ protocolId: protocol.id, error: onboarding.error }, "Onboarding email não confirmado");
          }
        }
      } else {
        req.log.info({ protocolId: protocol.id }, "Cliente sem e-mail — onboarding pulado");
      }
    }
  } catch (err) {
    req.log.warn({ protocolId: protocol.id, err }, "Falha ao enviar onboarding (ignorada)");
  }

  const result = await buildProtocolResponse(updatedProtocol);
  res.json(result);
});

// Generate ICS file content
router.post("/protocols/:id/generate-ics", requireCollaborator, async (req, res): Promise<void> => {
  const params = GenerateProtocolICSParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, params.data.id));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }
  if (!await authorizeProtocol(req, protocol, res)) return;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocol.id));
  sessions.sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime),
  );

  // SUB-04: motor de .ics ÚNICO (lib/ics.ts) — sem duplicar a geração.
  const events = await buildEventsForSessions(sessions, client?.name ?? "Cliente");
  const icsContent = buildVCalendar(events, { calName: `Instituto Pádua — ${client?.name ?? "Cliente"}` });
  const filename = `protocolo_${protocol.id}_${client?.name?.replace(/\s+/g, "_") ?? "cliente"}.ics`;

  res.json({ icsContent, filename });
});

// ── Carta de Tratamento Premium PAXMED (layout Dr. Manus Item #88) ───────────
// Rota nova — não interfere com document-pdf (Regra de Ouro).
//
// A montagem vive numa função única, usada por DUAS rotas: a que só desenha
// (GET carta-pdf) e a que envia ao paciente (POST carta-email). Duplicar esta
// consulta faria as duas divergirem com o tempo — e o paciente receberia um
// documento diferente do que o CEO conferiu na tela.
type CartaMontada = {
  pdfBytes: Uint8Array;
  certInfo: Record<string, unknown> | null;
  filename: string;
  protocol: typeof protocolsTable.$inferSelect;
  client: typeof clientsTable.$inferSelect;
  professionalName: string;
  professionalCrm: string | null;
  substances: Array<{
    name: string;
    dose: string;
    color: string;
    totalSessions: number;
    completedSessions: number;
    intervalDays: number | null;
    [extra: string]: unknown;
  }>;
  totalSessions: number;
  completedSessions: number;
};

async function montarCartaDeTratamento(
  req: Request,
  protocolId: number,
): Promise<{ ok: true; carta: CartaMontada } | { ok: false; status: number; error: string }> {
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
  if (!protocol) return { ok: false, status: 404, error: "Protocolo não encontrado" };

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
  if (!client) return { ok: false, status: 404, error: "Cliente não encontrado" };

  let professionalName = "Profissional";
  let professionalCrm: string | null = null;
  if (protocol.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
    if (prof) { professionalName = prof.name; professionalCrm = prof.crm ?? null; }
  }

  const items      = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocolId));
  const allSubs    = await db.select().from(substancesTable);
  const subMap     = new Map(allSubs.map(s => [s.id, s]));
  const sessions   = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocolId));

  // Sessão encerrada pode conter faltas; contar apenas aplicações comprovadas.
  const sessionIds = sessions.map(s => s.id);
  const applications = sessionIds.length
    ? await db.select().from(substanceApplicationsTable)
      .where(inArray(substanceApplicationsTable.sessionId, sessionIds))
    : [];
  const actual = contarAplicacoesRealizadas(sessionIds, applications);

  const substances = items.map(item => {
    const sub = subMap.get(item.substanceId);
    return {
      name:               sub?.name              ?? `Substancia ${item.substanceId}`,
      dose:               item.dose,
      color:              sub?.color             ?? "navy",
      totalSessions:      item.totalSessions,
      completedSessions:  actual.bySubstance.get(item.substanceId) ?? 0,
      intervalDays:       item.intervalDays,
      startDate:          item.startDate,
      procedureType:      sub?.procedureType     ?? "iv",
      timeToEffect:       sub?.timeToEffect,
      starRating:         sub?.starRating,
      bodySystemEffects:  (sub?.bodySystemEffects as Record<string, string>) ?? {},
      description:        sub?.description,
      mainFunction:       sub?.mainFunction,
      perceivedEffects:   sub?.perceivedEffects,
      contraindications:  sub?.contraindications,
      scientificEvidence: sub?.scientificEvidence,
      longevityBenefit:   sub?.longevityBenefit,
      qualityOfLifeImpact: sub?.qualityOfLifeImpact,
      sleepBenefit:       sub?.sleepBenefit,
      energyBenefit:      sub?.energyBenefit,
      libidoBenefit:      sub?.libidoBenefit,
      physicalPerformance: sub?.physicalPerformance,
      muscleStrength:     sub?.muscleStrength,
      mentalClarity:      sub?.mentalClarity,
      skinHairNails:      sub?.skinHairNails,
      immuneSupport:      sub?.immuneSupport,
    };
  });

  const dto = buildCartaTratamentoDto({
    protocolId:       protocol.id,
    protocolTitle:    protocol.title,
    clientName:       client.name,
    clientCpf:        client.cpf,
    professionalName,
    professionalCrm,
    unit:             protocol.unit ?? "Instituto Padua",
    startDate:        protocol.startDate,
    substances,
    sessions: sessions.map(s => ({ status: s.status, hasRecordedApplication: actual.visits.has(s.id) })),
  });

  const { pdfBytes, certInfo } = await withLoggedDoctorCertificate(req, protocol.clientId, () => generateProtocolLetterPdf(dto),
    { expectedProfessionalId: protocol.professionalId });
  const slug = client.name.replace(/\s+/g, "_");

  return {
    ok: true,
    carta: {
      pdfBytes,
      certInfo: (certInfo ?? null) as Record<string, unknown> | null,
      filename: `CARTA_TRATAMENTO_${slug}_${protocolId}.pdf`,
      protocol,
      client,
      professionalName,
      professionalCrm,
      substances,
      totalSessions: dto.totalSessions,
      completedSessions: dto.completedSessions,
    },
  };
}

router.get("/protocols/:id/carta-pdf", requireCollaborator, async (req, res): Promise<void> => {
  const protocolId = Number.parseInt(String(req.params.id), 10);
  if (isNaN(protocolId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const [protocol] = await db.select().from(protocolsTable)
      .where(eq(protocolsTable.id, protocolId));
    if (!protocol || !await authorizeProtocol(req, protocol, res)) {
      if (!res.headersSent) res.status(404).json({ error: "Registro não encontrado" });
      return;
    }
    const r = await montarCartaDeTratamento(req, protocolId);
    if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
    const { pdfBytes, certInfo, filename, client } = r.carta;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.length);

    // Expõe informações do certificado PAdES nos headers de resposta para que
    // o CEO possa confirmar (via DevTools / curl -I) que a assinatura ICP-Brasil
    // foi embutida corretamente antes de enviar a carta a um cliente real.
    const ci = certInfo as Record<string, unknown>;
    if (ci?.subject)    res.setHeader("X-Cert-Subject",    String(ci.subject));
    if (ci?.issuer)     res.setHeader("X-Cert-Issuer",     String(ci.issuer));
    if (ci?.validFrom)  res.setHeader("X-Cert-Valid-From", String(ci.validFrom));
    if (ci?.validTo)    res.setHeader("X-Cert-Valid-To",   String(ci.validTo));
    if (ci?.cpf)        res.setHeader("X-Cert-CPF",        String(ci.cpf));
    if (ci?.signerName) res.setHeader("X-Cert-Signer",     String(ci.signerName));

    console.info(
      `[carta-pdf] protocolo=${protocolId} cliente="${client.name}" cert-subject="${ci?.subject ?? "N/A"}" cert-valid-to="${ci?.validTo ?? "N/A"}"`,
    );

    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    if (err instanceof ClinicalIdentityError) { res.status(err.status).json({ error: err.message }); return; }
    console.error("[carta-pdf] erro:", err.message);
    res.status(500).json({ error: "Erro ao gerar carta", details: err.message });
  }
});

// ── Envio da Carta de Tratamento ao paciente ─────────────────────────────────
// Esta rota ESCREVE PARA UMA PESSOA DE VERDADE. É a única do módulo da Carta
// com efeito colateral externo — a irmã (GET carta-pdf) apenas desenha.
// Exige colaborador autenticado: ninguém dispara e-mail a paciente sem crachá.
router.post("/protocols/:id/carta-email", requireCollaborator, async (req, res): Promise<void> => {
  const protocolId = parseInt(String(req.params.id));
  if (isNaN(protocolId)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    // Checagens BARATAS primeiro. Assinar um PDF de 2,4 MB para só depois
    // descobrir que o paciente não é desta clínica, que não tem e-mail ou que
    // o Gmail está fora seria trabalho jogado fora — e, no caso do tenant,
    // porta aberta para colaborador de outra clínica escrever a paciente alheio.
    const [protocoloPrevio] = await db
      .select({ id: protocolsTable.id, clientId: protocolsTable.clientId, empresaId: protocolsTable.empresaId })
      .from(protocolsTable)
      .where(eq(protocolsTable.id, protocolId));
    if (!protocoloPrevio) { res.status(404).json({ sent: false, error: "Protocolo não encontrado" }); return; }

    const [fullProtocol] = await db.select().from(protocolsTable)
      .where(eq(protocolsTable.id, protocolId));
    if (!fullProtocol || !await authorizeProtocol(req, fullProtocol, res)) {
      if (!res.headersSent) res.status(404).json({ sent: false, error: "Protocolo não encontrado" });
      return;
    }

    const empresaDoColaborador = resolveEmpresaId(req);
    if (protocoloPrevio.empresaId !== empresaDoColaborador) {
      console.warn(
        `[carta-email] BLOQUEADO por tenant: protocolo=${protocolId} empresa_do_protocolo=${protocoloPrevio.empresaId} empresa_do_colaborador=${empresaDoColaborador}`,
      );
      // 404 de propósito: confirmar que o protocolo existe já entregaria
      // informação de outra clínica a quem não tem direito a ela.
      res.status(404).json({ sent: false, error: "Protocolo não encontrado" });
      return;
    }

    const [clientePrevio] = await db
      .select({ email: clientsTable.email })
      .from(clientsTable)
      .where(eq(clientsTable.id, protocoloPrevio.clientId));
    const email = (clientePrevio?.email ?? "").trim();
    if (!email) {
      res.status(422).json({ sent: false, error: "Cliente sem e-mail cadastrado" });
      return;
    }
    if (!(await isGmailConnected())) {
      res.status(503).json({ sent: false, error: "Gmail não está conectado" });
      return;
    }

    const r = await montarCartaDeTratamento(req, protocolId);
    if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
    const c = r.carta;

    const envio = await sendCartaTratamentoEmail({
      clientName:        c.client.name,
      clientEmail:       email,
      protocolTitle:     c.protocol.title,
      professionalName:  c.professionalName,
      professionalCrm:   c.professionalCrm,
      startDate:         c.protocol.startDate,
      totalSessions:     c.totalSessions,
      completedSessions: c.completedSessions,
      substances: c.substances.map(s => ({
        name:              s.name,
        color:             s.color,
        dose:              s.dose,
        totalSessions:     s.totalSessions,
        completedSessions: s.completedSessions,
        intervalDays:      s.intervalDays,
      })),
      pdfBuffer:   Buffer.from(c.pdfBytes),
      pdfFileName: c.filename,
    });

    if (!envio.success) {
      console.error(`[carta-email] FALHOU protocolo=${protocolId} destino=${email} motivo="${envio.error}"`);
      res.status(502).json({ sent: false, error: envio.error ?? "Falha no envio" });
      return;
    }

    console.info(
      `[carta-email] ENVIADO protocolo=${protocolId} cliente="${c.client.name}" destino=${email} arquivo=${c.filename} bytes=${c.pdfBytes.length}`,
    );
    res.json({
      sent: true,
      email,
      filename: c.filename,
      bytes: c.pdfBytes.length,
      completedSessions: c.completedSessions,
      totalSessions: c.totalSessions,
    });
  } catch (err: any) {
    if (err instanceof ClinicalIdentityError) { res.status(err.status).json({ sent: false, error: err.message }); return; }
    console.error("[carta-email] erro:", err.message);
    res.status(500).json({ sent: false, error: "Erro ao enviar carta", details: err.message });
  }
});

export default router;
