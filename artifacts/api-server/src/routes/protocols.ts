import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, protocolsTable, protocolItemsTable, clientsTable, substancesTable, professionalsTable, sessionsTable, substanceApplicationsTable, paymentsTable } from "@workspace/db";
import { generateProtocolDocumentPdf } from "../lib/pdf-signer";
import {
  ensureClientFolderStructure,
  uploadFileToDrive,
  uploadToFolderById,
  shareWithClient,
  isDriveConnected,
} from "../lib/google-drive";
import { sendProtocolEmail } from "../lib/email-service";
import { isGmailConnected } from "../lib/google-gmail";
import {
  ListProtocolsQueryParams,
  CreateProtocolBody,
  GetProtocolParams,
  UpdateProtocolParams,
  UpdateProtocolBody,
  ValidateProtocolParams,
  GenerateProtocolICSParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function buildProtocolResponse(protocol: typeof protocolsTable.$inferSelect) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
  
  let professionalName: string | null = null;
  if (protocol.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
    professionalName = prof?.name ?? null;
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

  return {
    id: protocol.id,
    clientId: protocol.clientId,
    clientName: client?.name ?? "",
    clientCpf: client?.cpf ?? "",
    title: protocol.title,
    status: protocol.status,
    startDate: protocol.startDate,
    endDate: protocol.endDate ?? null,
    professionalId: protocol.professionalId ?? null,
    professionalName,
    unit: protocol.unit ?? null,
    serviceType: protocol.serviceType,
    totalSessions: protocol.totalSessions,
    completedSessions: protocol.completedSessions,
    totalValue: protocol.totalValue,
    notes: protocol.notes ?? null,
    items: items.map(item => ({
      id: item.id,
      substanceId: item.substanceId,
      substanceName: substances[item.substanceId]?.name ?? "",
      substanceColor: substances[item.substanceId]?.color ?? "#888888",
      dose: item.dose,
      totalSessions: item.totalSessions,
      completedSessions: item.completedSessions,
      intervalDays: item.intervalDays,
      startDate: item.startDate,
      frequency: item.frequency,
    })),
    sessions: formattedSessions,
    createdAt: protocol.createdAt.toISOString(),
    updatedAt: protocol.updatedAt.toISOString(),
  };
}

router.get("/protocols", async (req, res): Promise<void> => {
  const query = ListProtocolsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let protocols;
  if (query.data.clientId && query.data.status) {
    protocols = await db.select().from(protocolsTable)
      .where(eq(protocolsTable.clientId, query.data.clientId));
    protocols = protocols.filter(p => p.status === query.data.status);
  } else if (query.data.clientId) {
    protocols = await db.select().from(protocolsTable)
      .where(eq(protocolsTable.clientId, query.data.clientId));
  } else if (query.data.status) {
    protocols = await db.select().from(protocolsTable)
      .where(eq(protocolsTable.status, query.data.status));
  } else {
    protocols = await db.select().from(protocolsTable);
  }

  const results = await Promise.all(protocols.map(buildProtocolResponse));
  res.json(results);
});

router.post("/protocols", async (req, res): Promise<void> => {
  const parsed = CreateProtocolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, ...protocolData } = parsed.data;

  const totalSessions = Math.max(...items.map((i: { totalSessions: number }) => i.totalSessions), 0);

  const [protocol] = await db.insert(protocolsTable).values({
    ...protocolData,
    totalSessions,
  }).returning();

  await Promise.all(items.map((item: { substanceId: number; dose: string; totalSessions: number; intervalDays: number; frequency: string }) =>
    db.insert(protocolItemsTable).values({
      protocolId: protocol.id,
      substanceId: item.substanceId,
      dose: item.dose,
      totalSessions: item.totalSessions,
      intervalDays: item.intervalDays,
      startDate: protocolData.startDate,
      frequency: item.frequency,
    })
  ));

  const result = await buildProtocolResponse(protocol);
  res.status(201).json(result);
});

router.get("/protocols/:id/document-pdf", async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params.id);
  if (isNaN(protocolId)) {
    res.status(400).json({ error: "Invalid protocol id" });
    return;
  }

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }

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
  const nurseProf = allProfs.find(p => (p.specialty ?? "").toLowerCase().includes("enf"));
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
    });

    const pdfBuffer = Buffer.from(pdfBytes);
    const clientSlug = client.name.replace(/\s+/g, "_");
    const filename = `PROTOCOLO_${clientSlug}_${protocolId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(pdfBuffer);

    const SHARED_RAS_FOLDER_ID = "1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep";

    (async () => {
      try {
        if (await isDriveConnected()) {
          const yy = protocol.startDate.slice(2, 4);
          const mm = protocol.startDate.slice(5, 7);
          const dd = protocol.startDate.slice(8, 10);
          const driveFileName = `${yy}.${mm}.${dd} PROTOCOLO ${client.name.toUpperCase()} (${protocol.title.toUpperCase()}).pdf`;

          const uploadPromises: Promise<any>[] = [];

          uploadPromises.push(
            uploadToFolderById(SHARED_RAS_FOLDER_ID, driveFileName, "application/pdf", pdfBuffer)
              .then(() => console.log(`Protocol document uploaded to shared folder: ${driveFileName}`))
              .catch(err => console.error("Shared folder upload error:", err.message))
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
                  console.log(`Protocol document uploaded to client PROTOCOLOS: ${driveFileName}`);
                }
              })
              .catch(err => console.error("Client folder upload error:", err.message))
          );

          await Promise.all(uploadPromises);
        }
      } catch (err: any) {
        console.error("Protocol document Drive upload error:", err.message);
      }

      try {
        if (client.email && await isGmailConnected()) {
          const yy = protocol.startDate.slice(2, 4);
          const mm = protocol.startDate.slice(5, 7);
          const dd = protocol.startDate.slice(8, 10);
          const driveFileName = `${yy}.${mm}.${dd} PROTOCOLO ${client.name.toUpperCase()} (${protocol.title.toUpperCase()}).pdf`;
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
          });
          if (emailResult.success) {
            console.log(`Protocol document email sent to ${client.email}`);
          } else {
            console.error("Protocol document email failed:", emailResult.error);
          }
        }
      } catch (err: any) {
        console.error("Protocol document email error:", err.message);
      }
    })();
  } catch (err: any) {
    console.error("Protocol document PDF error:", err);
    res.status(500).json({ error: "Erro ao gerar documento do protocolo", details: err.message });
  }
});

router.get("/protocols/:id", async (req, res): Promise<void> => {
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

  const result = await buildProtocolResponse(protocol);
  res.json(result);
});

router.put("/protocols/:id", async (req, res): Promise<void> => {
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

  const [protocol] = await db.update(protocolsTable).set(parsed.data).where(eq(protocolsTable.id, params.data.id)).returning();
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }

  const result = await buildProtocolResponse(protocol);
  res.json(result);
});

// Validate protocol and auto-generate sessions with weekly consolidation logic
router.post("/protocols/:id/validate", async (req, res): Promise<void> => {
  const params = ValidateProtocolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, params.data.id));
  if (!protocol) {
    res.status(404).json({ error: "Protocol not found" });
    return;
  }

  const items = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocol.id));

  // Delete existing sessions for this protocol
  const existingSessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocol.id));
  for (const session of existingSessions) {
    await db.delete(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, session.id));
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.protocolId, protocol.id));

  // Build schedule map: week -> { date, substances[] }
  const startDate = new Date(protocol.startDate);
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
  const defaultTime = "09:00";
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
      professionalId: protocol.professionalId,
      scheduledDate: bestDate,
      scheduledTime: defaultTime,
      status: "scheduled",
      unit: protocol.unit,
      serviceType: protocol.serviceType,
      weekNumber,
    }).returning();

    // Determine which substances are DISP (applied this week) vs PROX (coming next weeks)
    // All substances in this week are DISP; substancesTotal - items in this week for future weeks = PROX display only
    for (const app of weekData.substanceApplications) {
      await db.insert(substanceApplicationsTable).values({
        sessionId: session.id,
        substanceId: app.substanceId,
        dose: app.dose,
        sessionNumber: app.sessionNumber,
        totalSessions: app.totalSessions,
        status: "pending",
        availability: "disp",
      });
    }

    // Find substances that have future sessions — add them as PROX for visibility
    for (const item of items) {
      const hasInThisWeek = weekData.substanceApplications.some(a => a.substanceId === item.substanceId);
      if (!hasInThisWeek) {
        // Check if this substance has any session at all and has remaining sessions
        const futureSessionExists = weekData.substanceApplications.length > 0;
        if (futureSessionExists) {
          await db.insert(substanceApplicationsTable).values({
            sessionId: session.id,
            substanceId: item.substanceId,
            dose: item.dose,
            sessionNumber: 0,
            totalSessions: item.totalSessions,
            status: "pending",
            availability: "prox",
          });
        }
      }
    }
  }

  // Update protocol status to validated
  const [updatedProtocol] = await db.update(protocolsTable)
    .set({ status: "validated" })
    .where(eq(protocolsTable.id, params.data.id))
    .returning();

  const result = await buildProtocolResponse(updatedProtocol);
  res.json(result);
});

// Generate ICS file content
router.post("/protocols/:id/generate-ics", async (req, res): Promise<void> => {
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

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocol.id));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PADCOM//Protocolo Injetavel//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const session of sessions) {
    const applications = await db.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, session.id));

    const dispApps = applications.filter(a => a.availability === "disp");
    const proxApps = applications.filter(a => a.availability === "prox");

    const substanceNames: Record<number, string> = {};
    for (const app of applications) {
      if (!substanceNames[app.substanceId]) {
        const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
        if (s) substanceNames[app.substanceId] = s.name;
      }
    }

    const dispLines = dispApps
      .filter(a => a.sessionNumber > 0)
      .map(a => `${substanceNames[a.substanceId] ?? "Substância"} ${a.sessionNumber}/${a.totalSessions} (DISP)`)
      .join("\\n");

    const proxLines = proxApps
      .map(a => `${substanceNames[a.substanceId] ?? "Substância"} (PROX)`)
      .join("\\n");

    const description = [dispLines, proxLines].filter(Boolean).join("\\n");

    const dateStr = session.scheduledDate.replace(/-/g, "");
    const [h, m] = session.scheduledTime.split(":").map(Number);
    const endH = String(h + 1).padStart(2, "0");
    const dtStart = `${dateStr}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
    const dtEnd = `${dateStr}T${endH}${String(m).padStart(2, "0")}00`;

    const uid = `padcom-session-${session.id}@padcom.clinic`;
    const summary = `${client?.name ?? "Cliente"} - ${client?.cpf ?? ""} | Semana ${session.weekNumber}`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push(`LOCATION:${session.unit ?? "Clínica"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const icsContent = lines.join("\r\n");
  const filename = `protocolo_${protocol.id}_${client?.name?.replace(/\s+/g, "_") ?? "cliente"}.ics`;

  res.json({ icsContent, filename });
});

export default router;
