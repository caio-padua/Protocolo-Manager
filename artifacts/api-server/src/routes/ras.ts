import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, rasTable, sessionsTable, substanceApplicationsTable, substancesTable, professionalsTable, clientsTable, protocolsTable, protocolItemsTable } from "@workspace/db";
import {
  ListRASQueryParams,
  CreateRASBody,
  GetRASParams,
} from "@workspace/api-zod";
import { generateSignedRASPdf, generatePhysicalRASPdf, getCertInfo } from "../lib/pdf-signer";
import {
  ensureClientFolderStructure,
  uploadFileToDrive,
  uploadToFolderById,
  shareWithClient,
  isDriveConnected,
  formatRASFileName,
  formatPhysicalRASFileName,
} from "../lib/google-drive";
import { sendProtocolEmail } from "../lib/email-service";
import { isGmailConnected } from "../lib/google-gmail";

const router: IRouter = Router();

function formatRAS(r: typeof rasTable.$inferSelect) {
  return {
    ...r,
    professionalCrm: r.professionalCrm ?? null,
    observations: r.observations ?? null,
    substances: r.substances as Array<{ substanceName: string; dose: string; route: string; sessionNumber: number; totalSessions: number; lot: string | null; validity: string | null; appliedAt: string | null; status: string }>,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/ras", async (req, res): Promise<void> => {
  const query = ListRASQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let rasRecords = await db.select().from(rasTable);
  if (query.data.clientId) rasRecords = rasRecords.filter(r => r.clientId === query.data.clientId);
  if (query.data.protocolId) rasRecords = rasRecords.filter(r => r.protocolId === query.data.protocolId);

  res.json(rasRecords.map(formatRAS));
});

router.post("/ras", async (req, res): Promise<void> => {
  const parsed = CreateRASBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, parsed.data.sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));

  let professionalName = "Profissional";
  let professionalCrm: string | null = null;
  if (session.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, session.professionalId));
    if (prof) {
      professionalName = prof.name;
      professionalCrm = prof.crm ?? null;
    }
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, session.id));

  const dispApps = applications.filter(a => a.availability === "disp" && a.sessionNumber > 0);

  const substanceMap: Record<number, typeof substancesTable.$inferSelect> = {};
  for (const app of dispApps) {
    if (!substanceMap[app.substanceId]) {
      const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (s) substanceMap[app.substanceId] = s;
    }
  }

  const substances = dispApps.map(app => ({
    substanceName: substanceMap[app.substanceId]?.name ?? "Substância",
    dose: app.dose,
    route: "IV",
    sessionNumber: app.sessionNumber,
    totalSessions: app.totalSessions,
    lot: null,
    validity: null,
    appliedAt: app.appliedAt ?? null,
    status: app.status,
  }));

  const [ras] = await db.insert(rasTable).values({
    sessionId: parsed.data.sessionId,
    protocolId: session.protocolId,
    clientId: session.clientId,
    clientName: client?.name ?? "",
    clientCpf: client?.cpf ?? "",
    professionalName,
    professionalCrm,
    unit: session.unit ?? "Clínica Principal",
    serviceDate: session.scheduledDate,
    serviceType: session.serviceType,
    substances,
    observations: parsed.data.observations ?? null,
    patientSignature: false,
    professionalSignature: false,
  }).returning();

  res.status(201).json(formatRAS(ras));
});

router.get("/ras/certificate-info", async (_req, res): Promise<void> => {
  try {
    const info = getCertInfo();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao ler certificado", details: err.message });
  }
});

router.get("/ras/:id", async (req, res): Promise<void> => {
  const params = GetRASParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ras] = await db.select().from(rasTable).where(eq(rasTable.id, params.data.id));
  if (!ras) {
    res.status(404).json({ error: "RAS not found" });
    return;
  }

  res.json(formatRAS(ras));
});

router.get("/ras/:id/pdf", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid RAS id" });
    return;
  }

  const [ras] = await db.select().from(rasTable).where(eq(rasTable.id, id));
  if (!ras) {
    res.status(404).json({ error: "RAS not found" });
    return;
  }

  try {
    const formatted = formatRAS(ras);

    const allSubstances = await db.select().from(substancesTable);
    const substanceMap = new Map(allSubstances.map(s => [s.name, s]));

    const enrichedSubstances = formatted.substances.map(sub => {
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

    const { pdfBytes, certInfo } = await generateSignedRASPdf({
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

    (async () => {
      try {
        if (await isDriveConnected()) {
          const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, ras.clientId));
          if (client) {
            const folders = await ensureClientFolderStructure(client.name, client.cpf);
            const driveFileName = formatRASFileName(ras.serviceDate, client.name, client.cpf);
            const result = await uploadFileToDrive(folders.subfolders["PROTOCOLOS"], driveFileName, "application/pdf", Buffer.from(pdfBytes));
            if (client.email) {
              await shareWithClient(result.fileId, client.email);
            }
            console.log(`RAS ${ras.id} uploaded to Drive: ${result.webViewLink}`);
          }
        }
      } catch (driveErr: any) {
        console.error("Auto-upload RAS to Drive failed (non-blocking):", driveErr.message);
      }
    })();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Erro ao gerar PDF assinado", details: err.message });
  }
});

router.post("/ras/:id/upload-drive", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid RAS id" });
    return;
  }

  const [ras] = await db.select().from(rasTable).where(eq(rasTable.id, id));
  if (!ras) {
    res.status(404).json({ error: "RAS not found" });
    return;
  }

  if (!(await isDriveConnected())) {
    res.status(503).json({ error: "Google Drive nao conectado" });
    return;
  }

  try {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, ras.clientId));
    if (!client) {
      res.status(404).json({ error: "Cliente nao encontrado" });
      return;
    }

    const formatted = formatRAS(ras);
    const allSubstances = await db.select().from(substancesTable);
    const substanceMap = new Map(allSubstances.map(s => [s.name, s]));
    const enrichedSubstances = formatted.substances.map(sub => {
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

    const folders = await ensureClientFolderStructure(client.name, client.cpf);
    const driveFileName = formatRASFileName(ras.serviceDate, client.name, client.cpf);
    const result = await uploadFileToDrive(folders.subfolders["PROTOCOLOS"], driveFileName, "application/pdf", Buffer.from(pdfBytes));

    if (client.email) {
      await shareWithClient(result.fileId, client.email);
    }

    res.json({
      success: true,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
      fileName: driveFileName,
      message: `RAS enviado para Google Drive na pasta PROTOCOLOS de ${client.name}`,
    });
  } catch (err: any) {
    console.error("RAS Drive upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/ras/physical/:protocolId", async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params.protocolId);
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
  let nurseName = "";
  if (protocol.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
    if (prof) professionalName = prof.name;
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
      color: sub?.color ?? "yellow",
      totalSessions: item.totalSessions,
      frequencyDays: item.intervalDays,
      startDate: item.startDate,
      procedureType: sub?.procedureType ?? "iv",
      dose: item.dose,
    };
  });

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocolId));
  sessions.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.weekNumber - b.weekNumber);

  const physicalSessions = [];
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

    let sessNurse: string | null = null;
    if (sess.professionalId) {
      const sp = allProfs.find(p => p.id === sess.professionalId);
      if (sp && (sp.specialty ?? "").toLowerCase().includes("enf")) {
        sessNurse = sp.name.split(" ").map(w => w[0]?.toUpperCase()).join(".");
      }
    }

    physicalSessions.push({
      number: sess.weekNumber,
      scheduledDate: sess.scheduledDate,
      effectiveDate: sess.status === "completed" ? sess.scheduledDate : null,
      nurseName: sessNurse,
      substanceStatuses,
    });
  }

  let clientAge: number | undefined;
  if (client.birthDate) {
    const birth = new Date(client.birthDate);
    const now = new Date();
    clientAge = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) clientAge--;
  }

  try {
    const pdfBytes = await generatePhysicalRASPdf({
      clientName: client.name,
      clientCpf: client.cpf,
      clientPhone: client.phone ?? undefined,
      clientAge,
      professionalName,
      nurseName: nurseName || undefined,
      unit: protocol.unit ?? "Clinica Padua",
      startDate: protocol.startDate,
      protocolNumber: protocol.id,
      valorTratamento: `R$ ${(protocol.totalValue ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      substances,
      sessions: physicalSessions,
    });

    const pdfBuffer = Buffer.from(pdfBytes);
    const driveFileName = formatPhysicalRASFileName(protocol.startDate, client.name, protocol.title);
    const clientSlug = client.name.replace(/\s+/g, "_");
    const filename = `RAS_FAP_${clientSlug}_${protocolId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(pdfBuffer);

    const SHARED_RAS_FOLDER_ID = "1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep";

    (async () => {
      try {
        if (await isDriveConnected()) {
          const uploadPromises: Promise<any>[] = [];

          uploadPromises.push(
            uploadToFolderById(SHARED_RAS_FOLDER_ID, driveFileName, "application/pdf", pdfBuffer)
              .then(() => console.log(`Physical RAS uploaded to shared folder: ${driveFileName}`))
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
                  console.log(`Physical RAS uploaded to client PROTOCOLOS: ${driveFileName}`);
                }
              })
              .catch(err => console.error("Client folder upload error:", err.message))
          );

          await Promise.all(uploadPromises);
        }
      } catch (err: any) {
        console.error("Physical RAS Drive upload error:", err.message);
      }

      try {
        if (client.email && await isGmailConnected()) {
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
            console.log(`Protocol email sent to ${client.email}`);
          } else {
            console.error("Protocol email failed:", emailResult.error);
          }
        }
      } catch (err: any) {
        console.error("Protocol email error:", err.message);
      }
    })();
  } catch (err: any) {
    console.error("Physical RAS PDF error:", err);
    res.status(500).json({ error: "Erro ao gerar RAS FAP", details: err.message });
  }
});

export default router;
