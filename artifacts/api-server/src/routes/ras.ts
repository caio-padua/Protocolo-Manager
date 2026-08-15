import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { eq, and, inArray, desc } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { db, rasTable, sessionsTable, substanceApplicationsTable, substancesTable, professionalsTable, clientsTable, protocolsTable, protocolItemsTable, assinaturaSolicitacoesTable, assinaturaTemplatesTable, emailLogTable } from "@workspace/db";
import { enviarAssinatura } from "../lib/assinatura/service";
import { resolverCodigosCadernos } from "../lib/cadernos-resolver";
import {
  ListRASQueryParams,
  CreateRASBody,
  GetRASParams,
} from "@workspace/api-zod";
import { generateSignedRASPdf, generatePhysicalRASPdf, getCertInfo } from "../lib/pdf-signer";
import type { ModoRasFap } from "../lib/ras-fap";
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
import { enviarMensagemPaxter, absoluteBaseUrl, type PaxterDoc } from "../lib/messaging/index.js";

const router: IRouter = Router();
router.use(moduleGuard("ras"));

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

  const empresaId = resolveEmpresaId(req);
  let rasRecords = await db.select().from(rasTable).where(eq(rasTable.empresaId, empresaId));
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

  const empresaId = resolveEmpresaId(req);
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
    empresaId,
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
            const folders = await ensureClientFolderStructure(client.name, client.cpf ?? "");
            const driveFileName = formatRASFileName(ras.serviceDate, client.name, client.cpf ?? "");
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

    const folders = await ensureClientFolderStructure(client.name, client.cpf ?? "");
    const driveFileName = formatRASFileName(ras.serviceDate, client.name, client.cpf ?? "");
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
      clientCpf: client.cpf ?? "",
      clientPhone: client.phone ?? undefined,
      clientAge,
      professionalName,
      nurseName: nurseName || undefined,
      unit: protocol.unit ?? "Instituto Pádua",
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
            ensureClientFolderStructure(client.name, client.cpf ?? "")
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

// ===== Reenviar RAS FAP por e-mail (sem download) =====
router.post("/ras/physical/:protocolId/reenviar-email", async (req, res): Promise<void> => {
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

  if (!client.email) {
    res.status(422).json({ error: "O cliente não possui e-mail cadastrado. Atualize o cadastro antes de reenviar." });
    return;
  }

  if (!(await isGmailConnected())) {
    res.status(503).json({ error: "Gmail não está conectado. Configure a integração Gmail para reenviar por e-mail." });
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
      clientCpf: client.cpf ?? "",
      clientPhone: client.phone ?? undefined,
      clientAge,
      professionalName,
      nurseName: nurseName || undefined,
      unit: protocol.unit ?? "Instituto Pádua",
      startDate: protocol.startDate,
      protocolNumber: protocol.id,
      valorTratamento: `R$ ${(protocol.totalValue ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      substances,
      sessions: physicalSessions,
    });

    const pdfBuffer = Buffer.from(pdfBytes);
    const driveFileName = formatPhysicalRASFileName(protocol.startDate, client.name, protocol.title);

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

    if (!emailResult.success) {
      // Grava falha no log antes de retornar erro
      try {
        await db.insert(emailLogTable).values({
          tipo: "ras_fap_reenviado",
          clienteNome: client.name,
          destinatario: client.email,
          assunto: `PAXTER | RAS FAP Reenviado | ${protocol.title}`,
          status: "falhou",
          erro: emailResult.error ?? null,
          protocolId,
          provider: "gmail",
        });
      } catch (_logErr) { /* log não pode derrubar o fluxo */ }
      res.status(502).json({ error: `Falha ao enviar e-mail: ${emailResult.error}` });
      return;
    }

    // Grava auditoria de reenvio bem-sucedido
    try {
      await db.insert(emailLogTable).values({
        tipo: "ras_fap_reenviado",
        clienteNome: client.name,
        destinatario: client.email,
        assunto: `PAXTER | RAS FAP Reenviado | ${protocol.title}`,
        status: "enviado",
        protocolId,
        provider: "gmail",
      });
    } catch (_logErr) { /* log não pode derrubar o fluxo */ }

    res.json({ success: true, message: `RAS FAP reenviado com sucesso para ${client.email}` });
  } catch (err: any) {
    console.error("Reenviar RAS FAP error:", err);
    // Grava falha operacional no log (geração de PDF / erro inesperado)
    try {
      const [protocolFallback] = await db.select({ clientId: protocolsTable.clientId, title: protocolsTable.title }).from(protocolsTable).where(eq(protocolsTable.id, protocolId));
      if (protocolFallback) {
        const [clientFallback] = await db.select({ name: clientsTable.name, email: clientsTable.email }).from(clientsTable).where(eq(clientsTable.id, protocolFallback.clientId));
        if (clientFallback?.email) {
          await db.insert(emailLogTable).values({
            tipo: "ras_fap_reenviado",
            clienteNome: clientFallback.name,
            destinatario: clientFallback.email,
            assunto: `PAXTER | RAS FAP Reenviado | ${protocolFallback.title}`,
            status: "falhou",
            erro: err.message ?? "Erro operacional",
            protocolId,
            provider: "gmail",
          });
        }
      }
    } catch (_logErr) { /* log não pode derrubar o fluxo */ }
    res.status(500).json({ error: "Erro ao gerar ou enviar o RAS FAP" });
  }
});

// ===== Histórico de reenvios de RAS FAP por e-mail =====
router.get("/ras/physical/:protocolId/email-logs", async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params.protocolId);
  if (isNaN(protocolId)) {
    res.status(400).json({ error: "Invalid protocol id" });
    return;
  }

  const logs = await db
    .select()
    .from(emailLogTable)
    .where(and(
      eq(emailLogTable.tipo, "ras_fap_reenviado"),
      eq(emailLogTable.protocolId, protocolId),
    ))
    .orderBy(desc(emailLogTable.criadoEm))
    .limit(20);

  // Mascara destinatário na resposta
  const masked = logs.map(l => ({
    id: l.id,
    status: l.status,
    erro: l.erro ?? null,
    criadoEm: l.criadoEm.toISOString(),
    destinatarioMascarado: (() => {
      const [local, domain] = l.destinatario.split("@");
      if (!domain) return "***";
      return `${local.substring(0, Math.min(3, local.length))}***@${domain}`;
    })(),
  }));

  res.json({ total: masked.length, items: masked });
});

// ===== Demonstracao do RAS FAP (cliente ficticio, substancias reais) =====
// GET /ras-fap-demo            -> baixa o PDF de exemplo
// GET /ras-fap-demo?send=1&to=email@x.com  -> envia por e-mail + sobe ao Drive
interface DemoSub {
  name: string; dose: string; color: string; via: string;
  procedureType: string; frequencyDays: number; totalSessions: number;
  startDate: string; stars: number; func: string;
}

function buildDemoSubstances(): DemoSub[] {
  return [
    { name: "Glutationa", dose: "600 mg", color: "#8B5CF6", via: "Endovenosa", procedureType: "iv", frequencyDays: 7, totalSessions: 12, startDate: "2026-06-15", stars: 5, func: "Neutraliza radicais livres, desintoxica o organismo e clareia e uniformiza a pele." },
    { name: "Coenzima Q10", dose: "100 MG / 2 ML", color: "#3D7A7A", via: "Intramuscular", procedureType: "im", frequencyDays: 15, totalSessions: 6, startDate: "2026-06-15", stars: 5, func: "Produz energia celular, protege o coracao e combate o cansaco." },
    { name: "Acido Alfa Lipoico", dose: "600 MG / 24 ML", color: "#45B8CC", via: "Intramuscular", procedureType: "im", frequencyDays: 21, totalSessions: 5, startDate: "2026-06-18", stars: 5, func: "Combate o estresse oxidativo, melhora a sensibilidade a insulina e protege os nervos." },
    { name: "Cloreto de Magnesio", dose: "2 G / 10 ML", color: "#F59E0B", via: "Intramuscular", procedureType: "im", frequencyDays: 10, totalSessions: 8, startDate: "2026-06-16", stars: 5, func: "Relaxa musculos e nervos, melhora o sono e participa da producao de energia." },
    { name: "Acetil L-Carnitina", dose: "800 MG / 2 ML", color: "#F97316", via: "Intramuscular", procedureType: "im", frequencyDays: 14, totalSessions: 8, startDate: "2026-06-15", stars: 5, func: "Transforma gordura em energia, melhora o desempenho fisico e apoia o foco mental." },
    { name: "L-Carnitina", dose: "600 MG / 2 ML", color: "#14B8A6", via: "Intramuscular", procedureType: "im", frequencyDays: 7, totalSessions: 10, startDate: "2026-06-20", stars: 5, func: "Converte gordura em energia utilizavel e melhora o desempenho fisico." },
    { name: "Estradiol Pellet", dose: "25 MG - 1 pellet", color: "#EC4899", via: "Implante", procedureType: "implant", frequencyDays: 90, totalSessions: 2, startDate: "2026-06-15", stars: 5, func: "Repor estrogenio: alivia fogachos, ressecamento e insonia; protege a massa ossea." },
    { name: "Vitamina C (Ac. Ascorbico)", dose: "1 G / 5 ML", color: "#10B981", via: "Endovenosa", procedureType: "iv", frequencyDays: 7, totalSessions: 10, startDate: "2026-06-17", stars: 5, func: "Antioxidante, apoia a imunidade e a sintese de colageno para pele e vasos." },
  ];
}

// Cenario "folha cheia": 3 substancias semanais com 26 aplicacoes cada ->
// 26 idas reais > 20 linhas por folha, forcando a quebra de pagina (prova da
// regra das 20 linhas reiterada pelo CEO). Acessado via ?big=1.
function buildBigDemoSubstances(): DemoSub[] {
  return [
    { name: "Glutationa", dose: "600 mg", color: "#8B5CF6", via: "Endovenosa", procedureType: "iv", frequencyDays: 7, totalSessions: 26, startDate: "2026-06-15", stars: 5, func: "Cenario de folha cheia para demonstrar a quebra de pagina." },
    { name: "Vitamina C (Ac. Ascorbico)", dose: "1 G / 5 ML", color: "#10B981", via: "Endovenosa", procedureType: "iv", frequencyDays: 7, totalSessions: 26, startDate: "2026-06-15", stars: 5, func: "Cenario de folha cheia para demonstrar a quebra de pagina." },
    { name: "Cloreto de Magnesio", dose: "2 G / 10 ML", color: "#F59E0B", via: "Intramuscular", procedureType: "im", frequencyDays: 7, totalSessions: 26, startDate: "2026-06-15", stars: 5, func: "Cenario de folha cheia para demonstrar a quebra de pagina." },
  ];
}

// Cenario de STRESS: 1 substancia semanal com N aplicacoes (teste de paginacao
// e numeracao continua da coluna APLIC sem corte de dado). Acessado via ?n=150.
// Cap em 400 para evitar abuso.
function buildCountDemoSubstances(n: number): DemoSub[] {
  const total = Math.max(1, Math.min(400, Math.floor(n)));
  return [
    { name: "Glutationa", dose: "600 mg", color: "#8B5CF6", via: "Endovenosa", procedureType: "iv", frequencyDays: 7, totalSessions: total, startDate: "2026-06-15", stars: 5, func: `Cenario de stress: ${total} aplicacoes semanais para testar paginacao e numeracao continua da coluna APLIC.` },
  ];
}

// Cenario de MULTIPLAS SUBSTANCIAS: N substancias (cada uma com 8 aplicacoes
// semanais). Como cabem 5 substancias por folha, N>5 gera grupos extras e cada
// GRUPO comeca uma nova folha com a coluna APLIC reiniciando em 1..20 (regra do
// CEO). Acessado via ?subs=6 (2 folhas) ou ?subs=12 (3 folhas). Cap em 20.
function buildSubsDemoSubstances(n: number): DemoSub[] {
  const total = Math.max(1, Math.min(20, Math.floor(n)));
  const palette = ["#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#3D7A7A", "#EC4899", "#14B8A6", "#F97316", "#45B8CC", "#6366F1"];
  const out: DemoSub[] = [];
  for (let i = 0; i < total; i++) {
    out.push({
      name: `Substancia ${String(i + 1).padStart(2, "0")}`,
      dose: "1 G / 5 ML",
      color: palette[i % palette.length],
      via: i % 2 === 0 ? "Endovenosa" : "Intramuscular",
      procedureType: i % 2 === 0 ? "iv" : "im",
      frequencyDays: 7,
      totalSessions: 8,
      startDate: "2026-06-15",
      stars: 5,
      func: `Substancia ${i + 1} (teste de multiplas folhas por grupo; APLIC reinicia em cada folha de substancia nova).`,
    });
  }
  return out;
}

function demoBlocks(subs: DemoSub[], clientName: string, valor: string): string[] {
  const stars = (n: number) => "&#9733;".repeat(n) + "&#9734;".repeat(5 - n);
  const rows = subs.map((s) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid rgba(201,162,79,.12);font-size:13px;color:#f3ead6;font-weight:600;">
        <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${s.color};margin-right:7px;"></span>${s.name}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid rgba(201,162,79,.12);font-size:12px;color:#c2cee0;">${s.dose}</td>
      <td style="padding:10px 12px;border-bottom:1px solid rgba(201,162,79,.12);font-size:12px;color:#c2cee0;">${s.via}</td>
      <td style="padding:10px 12px;border-bottom:1px solid rgba(201,162,79,.12);font-size:12px;color:#c2cee0;text-align:center;">${s.frequencyDays} / ${s.frequencyDays} dias</td>
      <td style="padding:10px 12px;border-bottom:1px solid rgba(201,162,79,.12);font-size:12px;color:#c2cee0;text-align:center;">${s.totalSessions}</td>
      <td style="padding:10px 12px;border-bottom:1px solid rgba(201,162,79,.12);color:#c9a24f;font-size:13px;letter-spacing:1px;text-align:center;">${stars(s.stars)}</td>
    </tr>
    <tr>
      <td colspan="6" style="padding:0 12px 12px 31px;border-bottom:1px solid rgba(201,162,79,.12);font-size:11.5px;color:#7e90ab;font-style:italic;">${s.func}</td>
    </tr>`).join("");

  return [`
    <p style="font-size:13px;color:#c2cee0;line-height:1.6;margin:0 0 18px 0;">Segue o modelo premium do <strong style="color:#c9a24f;">RAS FAP</strong> (planilha de auditoria de procedimentos, em PDF paisagem, anexa a este e-mail). Abaixo, o resumo do protocolo-exemplo com as substancias, vias, frequencias e numero de aplicacoes.</p>
    <div style="background:#0f1d3a;border:1px solid rgba(201,162,79,.25);border-left:4px solid #c9a24f;border-radius:8px;padding:14px 18px;margin-bottom:18px;">
      <span style="font-size:12px;color:#7e90ab;">CLIENTE-EXEMPLO</span><br>
      <span style="font-size:16px;font-weight:bold;color:#f3ead6;">${clientName}</span>
      <span style="float:right;font-size:15px;font-weight:bold;color:#c9a24f;">${valor}</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid rgba(201,162,79,.25);border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#102043;">
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:#c9a24f;letter-spacing:.5px;">SUBSTANCIA</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:#c9a24f;">DOSE</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:#c9a24f;">VIA</th>
          <th style="padding:9px 12px;text-align:center;font-size:11px;color:#c9a24f;">FREQUENCIA</th>
          <th style="padding:9px 12px;text-align:center;font-size:11px;color:#c9a24f;">APLIC.</th>
          <th style="padding:9px 12px;text-align:center;font-size:11px;color:#c9a24f;">EFICACIA</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:11px;color:#7e90ab;margin-top:18px;font-style:italic;">Documento gerado automaticamente pelo Paxter &mdash; desenvolvido pela PADCON | Motor Clinico | Protocolos Injetaveis. Dados ficticios, apenas para demonstracao de layout.</p>`];
}

router.get("/ras-fap-demo", async (req, res) => {
  const clientName = "MARIANA DEMONSTRACAO SILVA";
  const valor = "R$ 14.890,00";
  const big = req.query.big === "1";
  const nParam = parseInt(typeof req.query.n === "string" ? req.query.n : "", 10);
  const subsParam = parseInt(typeof req.query.subs === "string" ? req.query.subs : "", 10);
  const demoSubs = Number.isFinite(subsParam) && subsParam > 0
    ? buildSubsDemoSubstances(subsParam)
    : Number.isFinite(nParam) && nParam > 0
    ? buildCountDemoSubstances(nParam)
    : big ? buildBigDemoSubstances() : buildDemoSubstances();
  const temaParam = (typeof req.query.tema === "string" ? req.query.tema : "").toUpperCase();
  const TEMAS_OK = ["PREMIUM", "MARCA", "MINIMAL", "BRONZE", "SIMPLES"] as const satisfies readonly ModoRasFap[];
  const modo: ModoRasFap = (TEMAS_OK as readonly string[]).includes(temaParam)
    ? (temaParam as ModoRasFap)
    : "PREMIUM";

  try {
    const pdfBytes = await generatePhysicalRASPdf({
      clientName,
      clientCpf: "000.000.000-00",
      clientPhone: "(11) 90000-0000",
      clientAge: 42,
      professionalName: "Dra. Ana Beatriz Santos",
      nurseName: "Enf. Carlos Mendes",
      unit: "Clinica Tatuape",
      startDate: "2026-06-15",
      protocolNumber: "DEMO-08",
      valorTratamento: valor,
      substances: demoSubs.map(s => ({
        name: s.name,
        color: s.color,
        totalSessions: s.totalSessions,
        frequencyDays: s.frequencyDays,
        startDate: s.startDate,
        procedureType: s.procedureType,
        dose: s.dose,
      })),
      sessions: [],
    }, modo);
    const pdfBuffer = Buffer.from(pdfBytes);
    const driveFileName = `26.06.17 RAS FAP DEMO ${clientName}.pdf`;

    const send = req.query.send === "1";
    const to = (typeof req.query.to === "string" ? req.query.to : "").trim().toLowerCase();
    const key = typeof req.query.key === "string" ? req.query.key : "";

    // Allowlist de destinatarios aprovados para a demonstracao (evita uso como relay aberto).
    const ALLOWED_DEMO_RECIPIENTS = new Set([
      "carlucia.fernandes.vendas@gmail.com",
    ]);
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);
    // Efeitos colaterais (e-mail + Drive) exigem a chave secreta E destinatario na allowlist.
    const authorizedSend =
      send &&
      validEmail &&
      !!process.env.SESSION_SECRET &&
      key === process.env.SESSION_SECRET &&
      ALLOWED_DEMO_RECIPIENTS.has(to);

    if (send && !authorizedSend) {
      req.log.warn(`RAS FAP demo: tentativa de envio nao autorizada (to=${to || "vazio"})`);
    }

    if (authorizedSend) {
      (async () => {
        try {
          const doc: PaxterDoc = {
            eyebrow: "Modelo de apresentacao",
            titulo: "RAS FAP — Modelo Premium",
            paragrafos: ["Demonstracao do modelo premium do RAS FAP (dados ficticios)."],
            blocosHtml: demoBlocks(demoSubs, clientName, valor),
            anexos: [{ filename: driveFileName, content: pdfBuffer, contentType: "application/pdf" }],
            assunto: "Paxter | RAS FAP - Modelo Premium (Demonstracao)",
          };
          const envio = await enviarMensagemPaxter(doc, { email: to, nome: clientName }, ["EMAIL"], { baseUrl: absoluteBaseUrl(req) });
          const r0 = envio.resultados[0];
          if (r0?.sent) req.log.info(`RAS FAP demo email ${r0?.mock ? "mock" : "sent"} to ${to} (via=${r0?.via ?? "?"})`);
          else req.log.warn(`RAS FAP demo email nao enviado: ${r0?.error ?? "sem provedor"}`);
        } catch (err: any) {
          req.log.error(`RAS FAP demo email error: ${err.message}`);
        }
        try {
          if (await isDriveConnected()) {
            const SHARED_RAS_FOLDER_ID = "1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep";
            await uploadToFolderById(SHARED_RAS_FOLDER_ID, driveFileName, "application/pdf", pdfBuffer);
            req.log.info(`RAS FAP demo uploaded to Drive: ${driveFileName}`);
          }
        } catch (err: any) {
          req.log.error(`RAS FAP demo Drive error: ${err.message}`);
        }
      })();
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="RAS_FAP_DEMO.pdf"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(pdfBuffer);
  } catch (err: any) {
    req.log.error(`RAS FAP demo error: ${err.message}`);
    res.status(500).json({ error: "Erro ao gerar RAS FAP demo", details: err.message });
  }
});

// ===== Demonstracao das FICHAS DE SUBSTANCIA (RAS assinado premium) =====
// GET /ras-fichas-demo            -> baixa o PDF (RAS com 1 ficha por substancia)
// GET /ras-fichas-demo?send=1&to=email@x.com&key=SECRET -> envia + Drive
interface FichaDemoSpec {
  dbName: string; dose: string; via: string; color: string; session: number; total: number;
}

const FICHAS_DEMO_SPECS: FichaDemoSpec[] = [
  { dbName: "GLUTATIONA", dose: "600 mg", via: "Endovenosa", color: "#8B5CF6", session: 3, total: 12 },
  { dbName: "COENZIMA Q10", dose: "100 MG / 2 ML", via: "Intramuscular", color: "#3D7A7A", session: 2, total: 6 },
  { dbName: "ACIDO ALFA LIPOICO", dose: "600 MG / 24 ML", via: "Intramuscular", color: "#45B8CC", session: 1, total: 5 },
  { dbName: "CLORETO DE MAGNESIO", dose: "2 G / 10 ML", via: "Intramuscular", color: "#F59E0B", session: 4, total: 8 },
  { dbName: "ACETIL L-CARNITINA", dose: "800 MG / 2 ML", via: "Intramuscular", color: "#F97316", session: 3, total: 8 },
  { dbName: "L-CARNITINA", dose: "600 MG / 2 ML", via: "Intramuscular", color: "#14B8A6", session: 5, total: 10 },
  { dbName: "ESTRADIOL PELLET", dose: "25 MG - 1 pellet", via: "Implante", color: "#EC4899", session: 1, total: 2 },
  { dbName: "VITAMINA C (ACIDO ASCORBICO)", dose: "1 G / 5 ML", via: "Intramuscular", color: "#10B981", session: 3, total: 10 },
];

function firstSentence(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const dot = t.indexOf(". ");
  return dot > 0 ? t.slice(0, dot + 1) : t;
}

function fichasBlocks(
  items: Array<{ name: string; dose: string; via: string; color: string; stars: number; whatIs: string }>,
  clientName: string,
): string[] {
  const stars = (n: number) => "&#9733;".repeat(n) + "&#9734;".repeat(5 - n);
  const cards = items.map((s) => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid rgba(201,162,79,.12);vertical-align:top;width:46%;">
        <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${s.color};margin-right:7px;"></span>
        <span style="font-size:13px;color:#f3ead6;font-weight:bold;">${s.name}</span>
        <div style="font-size:11px;color:#7e90ab;margin-top:3px;">${s.dose} &middot; ${s.via}</div>
      </td>
      <td style="padding:12px 14px;border-bottom:1px solid rgba(201,162,79,.12);color:#c9a24f;font-size:13px;letter-spacing:1px;text-align:center;width:14%;">${stars(s.stars)}</td>
      <td style="padding:12px 14px;border-bottom:1px solid rgba(201,162,79,.12);font-size:11.5px;color:#c2cee0;font-style:italic;vertical-align:top;">${s.whatIs}</td>
    </tr>`).join("");

  return [`
    <p style="font-size:13px;color:#c2cee0;line-height:1.6;margin:0 0 18px 0;">Segue o modelo premium do <strong style="color:#c9a24f;">RAS assinado</strong> com as <strong style="color:#c9a24f;">fichas de substancia</strong> (uma folha por substancia, em PDF retrato, anexo a este e-mail). Cada ficha traz: o que e a substancia, sua funcao principal, o impacto por sistema do corpo em barras, os efeitos percebidos e o tempo para perceber o efeito &mdash; tudo a partir da base de dados clinica.</p>
    <div style="background:#0f1d3a;border:1px solid rgba(201,162,79,.25);border-left:4px solid #c9a24f;border-radius:8px;padding:14px 18px;margin-bottom:18px;">
      <span style="font-size:12px;color:#7e90ab;">CLIENTE-EXEMPLO</span><br>
      <span style="font-size:16px;font-weight:bold;color:#f3ead6;">${clientName}</span>
      <span style="float:right;font-size:13px;color:#c9a24f;">${items.length} fichas</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid rgba(201,162,79,.25);border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#102043;">
          <th style="padding:9px 14px;text-align:left;font-size:11px;color:#c9a24f;letter-spacing:.5px;">SUBSTANCIA</th>
          <th style="padding:9px 14px;text-align:center;font-size:11px;color:#c9a24f;">EFICACIA</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;color:#c9a24f;">O QUE E</th>
        </tr>
      </thead>
      <tbody>${cards}</tbody>
    </table>
    <p style="font-size:11px;color:#7e90ab;margin-top:18px;font-style:italic;">Documento gerado automaticamente pelo Paxter &mdash; desenvolvido pela PADCON | Motor Clinico | Protocolos Injetaveis. Dados ficticios, apenas para demonstracao de layout.</p>`];
}

router.get("/ras-fichas-demo", async (req, res) => {
  const clientName = "MARIANA DEMONSTRACAO SILVA";
  const clientCpf = "000.000.000-00";

  try {
    const allSubstances = await db.select().from(substancesTable);
    const byName = new Map(allSubstances.map(s => [s.name.toUpperCase().trim(), s]));

    const substances = FICHAS_DEMO_SPECS.map(spec => {
      const db = byName.get(spec.dbName);
      const route = db?.procedureType === "im" ? "IM" : db?.procedureType === "implant" ? "Impl" : "IV";
      return {
        substanceName: db?.name ?? spec.dbName,
        dose: spec.dose,
        route,
        sessionNumber: spec.session,
        totalSessions: spec.total,
        lot: "DEMO-2026",
        validity: "06/2027",
        status: "Aplicado",
        description: db?.description ?? undefined,
        mainFunction: db?.mainFunction ?? undefined,
        perceivedEffects: db?.perceivedEffects ?? undefined,
        timeToEffect: db?.timeToEffect ?? undefined,
        starRating: db?.starRating ?? undefined,
        bodySystemEffects: (db?.bodySystemEffects as Record<string, string>) ?? undefined,
        procedureType: db?.procedureType ?? undefined,
      };
    });

    const { pdfBytes } = await generateSignedRASPdf({
      id: 990017,
      sessionId: 0,
      clientName,
      clientCpf,
      professionalName: "Dra. Ana Beatriz Santos",
      professionalCrm: "CRM-SP 123456",
      unit: "Clinica Tatuape",
      serviceDate: "2026-06-17",
      serviceType: "clinic",
      observations: null,
      substances,
    });
    const pdfBuffer = Buffer.from(pdfBytes);
    const driveFileName = `26.06.17 RAS FICHAS DEMO ${clientName}.pdf`;

    const emailItems = FICHAS_DEMO_SPECS.map(spec => {
      const db = byName.get(spec.dbName);
      return {
        name: db?.name ?? spec.dbName,
        dose: spec.dose,
        via: spec.via,
        color: spec.color,
        stars: db?.starRating ?? 5,
        whatIs: firstSentence(db?.description),
      };
    });

    const send = req.query.send === "1";
    const to = (typeof req.query.to === "string" ? req.query.to : "").trim().toLowerCase();
    const key = typeof req.query.key === "string" ? req.query.key : "";

    // Allowlist de destinatarios aprovados para a demonstracao (evita uso como relay aberto).
    const ALLOWED_DEMO_RECIPIENTS = new Set([
      "carlucia.fernandes.vendas@gmail.com",
    ]);
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);
    // Efeitos colaterais (e-mail + Drive) exigem a chave secreta E destinatario na allowlist.
    const authorizedSend =
      send &&
      validEmail &&
      !!process.env.SESSION_SECRET &&
      key === process.env.SESSION_SECRET &&
      ALLOWED_DEMO_RECIPIENTS.has(to);

    if (send && !authorizedSend) {
      req.log.warn(`RAS fichas demo: tentativa de envio nao autorizada (to=${to || "vazio"})`);
    }

    if (authorizedSend) {
      (async () => {
        try {
          const doc: PaxterDoc = {
            eyebrow: "Modelo de apresentacao",
            titulo: "RAS — Fichas de Substancia",
            paragrafos: ["Demonstracao do modelo premium das fichas de substancia (dados ficticios)."],
            blocosHtml: fichasBlocks(emailItems, clientName),
            anexos: [{ filename: driveFileName, content: pdfBuffer, contentType: "application/pdf" }],
            assunto: "Paxter | RAS - Fichas de Substancia (Modelo Premium)",
          };
          const envio = await enviarMensagemPaxter(doc, { email: to, nome: clientName }, ["EMAIL"], { baseUrl: absoluteBaseUrl(req) });
          const r0 = envio.resultados[0];
          if (r0?.sent) req.log.info(`RAS fichas demo email ${r0?.mock ? "mock" : "sent"} to ${to} (via=${r0?.via ?? "?"})`);
          else req.log.warn(`RAS fichas demo email nao enviado: ${r0?.error ?? "sem provedor"}`);
        } catch (err: any) {
          req.log.error(`RAS fichas demo email error: ${err.message}`);
        }
        try {
          if (await isDriveConnected()) {
            const SHARED_RAS_FOLDER_ID = "1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep";
            await uploadToFolderById(SHARED_RAS_FOLDER_ID, driveFileName, "application/pdf", pdfBuffer);
            req.log.info(`RAS fichas demo uploaded to Drive: ${driveFileName}`);
          }
        } catch (err: any) {
          req.log.error(`RAS fichas demo Drive error: ${err.message}`);
        }
      })();
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="RAS_FICHAS_DEMO.pdf"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(pdfBuffer);
  } catch (err: any) {
    req.log.error(`RAS fichas demo error: ${err.message}`);
    res.status(500).json({ error: "Erro ao gerar RAS fichas demo", details: err.message });
  }
});

// ============================================================================
// POST /ras-fap/entregar-protocolo
// Geração e envio do RAS FAP real para o paciente.
// Na primeira entrega, o e-mail lista os RAS jurídicos relevantes ao protocolo.
// Corpo: { clientId, substancias, titulo?, incluirCadernosJuridicos? }
//   substancias[]: { nome, dose, via, sessoes, frequenciaDias, inicio, cor?, procedureType? }
// Retorna 200 { queued: true, email } imediatamente; envio é assíncrono.
// ============================================================================
function buildEntregaBlocks(
  substancias: Array<{ nome: string; dose: string; via: string; sessoes: number; frequenciaDias: number; inicio: string; cor?: string }>,
  clientName: string,
  titulo: string,
  dataHojeBR: string,
  incluirCadernosJuridicos: boolean,
): string[] {
  const primeiro = clientName.split(" ")[0] ?? clientName;
  const cores: Record<string, string> = {
    "COENZIMA Q10": "#3D7A7A",
    "PQQ": "#c9a24f",
    "TESTOSTERONA": "#7c9cf0",
    "TIRZEPATIDA": "#45B8CC",
    "PROGESTERONA": "#EC4899",
    "GESTRINONA": "#8B5CF6",
    "IMPLANTE": "#c9a24f",
  };
  function corDa(nome: string, explicit?: string): string {
    if (explicit) return explicit;
    const up = nome.toUpperCase();
    for (const [k, v] of Object.entries(cores)) if (up.includes(k)) return v;
    return "#7e90ab";
  }
  function freqLabel(dias: number): string {
    if (dias === 0 || dias === 1) return "no ato";
    if (dias === 7) return "a cada 7 dias";
    if (dias === 15) return "a cada 15 dias";
    if (dias === 30) return "a cada 30 dias";
    if (dias >= 150) return "após 6 meses";
    return `a cada ${dias} dias`;
  }
  const linhas = substancias.map(s => {
    const cor = corDa(s.nome, s.cor);
    return `
      <tr>
        <td style="padding:11px 14px;border-bottom:1px solid rgba(201,162,79,.10);vertical-align:top;">
          <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${cor};margin-right:7px;vertical-align:middle;"></span>
          <span style="font-size:13px;color:#f3ead6;font-weight:700;">${s.nome}</span>
          <div style="font-size:11px;color:#7e90ab;margin-top:2px;">${s.dose} · ${s.via}</div>
        </td>
        <td style="padding:11px 14px;border-bottom:1px solid rgba(201,162,79,.10);text-align:center;font-size:13px;color:#c9a24f;font-weight:700;">${s.sessoes}</td>
        <td style="padding:11px 14px;border-bottom:1px solid rgba(201,162,79,.10);font-size:12px;color:#c2cee0;">${freqLabel(s.frequenciaDias)}</td>
      </tr>`;
  }).join("");

  const tabelaHtml = `
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border-collapse:collapse;border:1px solid rgba(201,162,79,.25);border-radius:8px;overflow:hidden;margin-bottom:18px;">
      <thead>
        <tr style="background:#102043;">
          <th style="padding:9px 14px;text-align:left;font-size:11px;color:#c9a24f;letter-spacing:.5px;">SUBSTÂNCIA</th>
          <th style="padding:9px 14px;text-align:center;font-size:11px;color:#c9a24f;width:80px;">SESSÕES</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;color:#c9a24f;width:160px;">FREQUÊNCIA</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;

  const avisoRAS = incluirCadernosJuridicos ? `
    <div style="background:#0f1d3a;border:1px solid rgba(201,162,79,.25);border-left:4px solid #c9a24f;border-radius:8px;padding:14px 18px;margin-top:16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#c9a24f;">Documentos jurídicos incluídos nesta entrega</p>
      <p style="margin:0;font-size:12px;color:#c2cee0;line-height:1.7;">
        Junto ao RAS FAP em anexo, você receberá separadamente os Consentimentos Informados referentes ao seu protocolo:<br>
        <strong style="color:#f3ead6;">CGLO</strong> (Consentimento Global) · <strong style="color:#f3ead6;">CIMU</strong> (Injetáveis IM) ·
        <strong style="color:#f3ead6;">CSUB</strong> (Substâncias Especiais) · <strong style="color:#f3ead6;">CINC</strong> (GLP-1/Incretinas) ·
        <strong style="color:#f3ead6;">CIMP</strong> (Implantes e Pellets) · <strong style="color:#f3ead6;">TCLE</strong> (Consentimento Livre e Esclarecido) ·
        <strong style="color:#f3ead6;">RAS-JUR</strong> (Registro Jurídico).<br>
        Leia, assine e devolva antes da primeira sessão.
      </p>
    </div>` : "";

  const avisoApresentar = `
    <div style="background:#0f1d3a;border:1px solid rgba(201,162,79,.25);border-radius:8px;padding:14px 18px;margin-top:16px;">
      <p style="margin:0;font-size:12px;color:#c2cee0;line-height:1.6;">
        <strong style="color:#c9a24f;">Importante:</strong>
        Apresente o <strong style="color:#f3ead6;">RAS FAP</strong> em TODAS as sessões presenciais para rubrica da equipe de enfermagem.
        Ele é o seu controle oficial de aplicações — guarde-o com cuidado.
      </p>
    </div>`;

  return [`
    <p style="font-size:15px;color:#c2cee0;margin:0 0 14px;line-height:1.7;">
      ${primeiro}, o seu protocolo médico personalizado <strong style="color:#c9a24f;">${titulo}</strong>
      foi elaborado pelo <strong style="color:#f3ead6;">Dr. Caio Henrique Fernandes Pádua</strong>
      com início em <strong style="color:#c9a24f;">${dataHojeBR}</strong>.
    </p>
    <p style="font-size:15px;color:#c2cee0;margin:0 0 18px;line-height:1.7;">
      O documento <strong style="color:#c9a24f;">RAS FAP</strong>
      (Registro de Administração de Substâncias — Formulário de Auditoria de Procedimentos)
      segue <strong style="color:#f3ead6;">em anexo</strong>, em formato PDF pronto para impressão.
      Ele contém o cronograma completo das sessões e os espaços para rubrica presencial a cada aplicação.
    </p>
    ${tabelaHtml}
    ${avisoApresentar}
    ${avisoRAS}
  `];
}

router.post("/ras-fap/entregar-protocolo", async (req, res): Promise<void> => {
  const { clientId, substancias, titulo, incluirCadernosJuridicos } = req.body as {
    clientId: number;
    titulo?: string;
    incluirCadernosJuridicos?: boolean;
    substancias: Array<{
      nome: string;
      dose: string;
      via: string;
      sessoes: number;
      frequenciaDias: number;
      inicio: string; // YYYY-MM-DD
      cor?: string;
      procedureType?: string;
    }>;
  };

  if (!clientId || !Array.isArray(substancias) || substancias.length === 0) {
    res.status(400).json({ error: "clientId e substancias sao obrigatorios" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) { res.status(404).json({ error: "Cliente nao encontrado" }); return; }
  if (!client.email) { res.status(400).json({ error: "Cliente sem e-mail cadastrado" }); return; }

  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000); // BRT
  const dd = String(agora.getUTCDate()).padStart(2, "0");
  const mm = String(agora.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(agora.getUTCFullYear()).slice(2);
  const anoFull = agora.getUTCFullYear();
  const dataHojeBR = `${dd}/${mm}/${anoFull}`;
  const driveFileName = `${yy}.${mm}.${dd} RAS FAP ${client.name.toUpperCase()}.pdf`;
  const protocoloTitulo = titulo ?? "Protocolo de Longevidade Personalizado";

  const idadeAnos = client.birthDate
    ? Math.floor((Date.now() - new Date(client.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : undefined;

  let pdfBuffer: Buffer;
  try {
    const pdfBytes = await generatePhysicalRASPdf({
      clientName: client.name,
      clientCpf: client.cpf ?? "000.000.000-00",
      clientPhone: client.phone ?? "",
      clientAge: idadeAnos,
      professionalName: "Dr. Caio Henrique Fernandes Padua",
      nurseName: "Instituto Padua",
      unit: "Instituto Padua — Clinica Avancada",
      startDate: substancias[0]?.inicio ?? agora.toISOString().slice(0, 10),
      protocolNumber: `FAP-${yy}${mm}${dd}-${clientId}`,
      valorTratamento: undefined,
      substances: substancias.map(s => ({
        name: s.nome,
        color: s.cor ?? "#c9a24f",
        totalSessions: s.sessoes,
        frequencyDays: s.frequenciaDias,
        startDate: s.inicio,
        procedureType: s.procedureType ?? (s.via.toLowerCase().includes("implant") ? "implant" : "injection"),
        dose: s.dose,
      })),
      sessions: [],
    }, "PREMIUM");
    pdfBuffer = Buffer.from(pdfBytes);
  } catch (pdfErr: any) {
    res.status(500).json({ error: "Erro ao gerar RAS FAP PDF", details: pdfErr.message });
    return;
  }

  // Responde imediatamente; envio é assíncrono (não bloqueia cliente)
  res.json({ queued: true, email: client.email, driveFileName });

  (async () => {
    // Rastreia se o e-mail do RAS FAP foi entregue com sucesso.
    // Os cadernos jurídicos SÓ são despachados após entrega confirmada —
    // se o e-mail falhar, a próxima tentativa de entrega reenviará tudo.
    let rasEmailEnviado = false;

    try {
      const blocos = buildEntregaBlocks(
        substancias, client.name, protocoloTitulo, dataHojeBR,
        incluirCadernosJuridicos ?? false,
      );
      const doc: PaxterDoc = {
        eyebrow: `Olá, ${client.name.split(" ")[0]}`,
        titulo: protocoloTitulo,
        paragrafos: [],
        blocosHtml: blocos,
        anexos: [{ filename: driveFileName, content: pdfBuffer, contentType: "application/pdf" }],
        assunto: `PAXTER | ${protocoloTitulo} — RAS FAP`,
      };
      const envio = await enviarMensagemPaxter(
        doc,
        { email: client.email!, nome: client.name },
        ["EMAIL"],
        { baseUrl: absoluteBaseUrl(req) },
      );
      const r0 = envio.resultados[0];
      if (r0?.sent) {
        rasEmailEnviado = true;
        req.log.info(`RAS FAP entregue ${r0.mock ? "(mock)" : ""} para ${client.email}`);
      } else {
        req.log.warn(`RAS FAP entrega falhou para ${client.email}: ${r0?.error ?? "sem provedor"}`);
      }
    } catch (err: any) {
      req.log.error(`RAS FAP entrega email error: ${err.message}`);
    }

    try {
      if (await isDriveConnected()) {
        const SHARED_RAS_FOLDER_ID = "1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep";
        await uploadToFolderById(SHARED_RAS_FOLDER_ID, driveFileName, "application/pdf", pdfBuffer);
        req.log.info(`RAS FAP salvo no Drive: ${driveFileName}`);
      }
    } catch (err: any) {
      req.log.error(`RAS FAP Drive error: ${err.message}`);
    }

    // ── Cadernos Jurídicos (idempotente por código, gateado no e-mail) ──────
    // Só despacha se o RAS FAP chegou ao paciente. Se o e-mail falhou, os
    // cadernos ficam pendentes e a próxima chamada a entregar-protocolo tentará
    // novamente (o check de faltantes garante que só os ausentes são enviados).
    if (!rasEmailEnviado) {
      req.log.warn(`Cadernos jurídicos não despachados: e-mail do RAS FAP não foi entregue para ${client.email}`);
    } else {
      try {
        // ── Enriquecer substâncias com categoryType do banco ─────────────
        // Necessário para detectar fórmulas magistrais (CFOR) via campo DB.
        const nomesSubstancias = substancias.map((s) => s.nome);
        const substanciasDb = nomesSubstancias.length > 0
          ? await db
              .select({ name: substancesTable.name, categoryType: substancesTable.categoryType })
              .from(substancesTable)
              .where(inArray(substancesTable.name, nomesSubstancias))
          : [];
        const categoryTypeByNome = new Map(substanciasDb.map((s) => [s.name, s.categoryType]));

        // ── Seleção canônica via função compartilhada ─────────────────────
        const { codigos: codigosRequeridos } = resolverCodigosCadernos(
          substancias.map((s) => ({
            nome: s.nome,
            procedureType: s.procedureType,
            via: s.via,
            categoryType: categoryTypeByNome.get(s.nome) ?? null,
          })),
        );

        // ── Quais códigos já foram despachados com sucesso? ───────────────
        // Escopo scoped por clientId para dar idempotência por paciente.
        // Faz join com template para obter o código; considera ENVIADO e CONCLUIDO.
        const escopoEntrega = `RAS_FAP_ENTREGA:${clientId}`;
        const jaEnviados = await db
          .select({ codigo: assinaturaTemplatesTable.codigo })
          .from(assinaturaSolicitacoesTable)
          .innerJoin(
            assinaturaTemplatesTable,
            eq(assinaturaSolicitacoesTable.templateId, assinaturaTemplatesTable.id),
          )
          .where(
            and(
              eq(assinaturaSolicitacoesTable.pacienteId, clientId),
              eq(assinaturaSolicitacoesTable.escopo, escopoEntrega),
              inArray(assinaturaSolicitacoesTable.status as any, ["ENVIADO", "CONCLUIDO"] as any),
            ),
          );
        const codigosJaEnviados = new Set(jaEnviados.map((r) => r.codigo));

        // ── Faltantes = requeridos − já enviados ──────────────────────────
        const codigosFaltantes = [...codigosRequeridos].filter(
          (c) => !codigosJaEnviados.has(c),
        );

        if (codigosFaltantes.length === 0) {
          req.log.info(`Cadernos jurídicos: todos já enviados para paciente ${clientId}`);
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

          if (templates.length === 0) {
            req.log.warn(
              `Cadernos jurídicos: nenhum template ativo para [${codigosFaltantes.join(",")}] — execute /api/cadernos-juridicos/seed`,
            );
          } else {
            const maxSessoes = substancias.reduce((m, s) => Math.max(m, s.sessoes), 0);
            const viasUnicas = [...new Set(substancias.map((s) => s.via))].join(", ");

            const hidratacao: Record<string, string> = {
              "cliente.nome":           client.name,
              "cliente.cpf":            client.cpf ?? "",
              "cliente.dataNascimento": client.birthDate
                ? new Date(client.birthDate + "T12:00:00").toLocaleDateString("pt-BR")
                : "",
              "cliente.email":          client.email ?? "",
              "cliente.telefone":       client.phone ?? "",
              "data.hoje":              dataHojeBR,
              "medico.nome":            "Dr. Caio Henrique Fernandes Pádua",
              "medico.crm":             "XXXXX",
              "medico.uf":              "SP",
              "clinica.nome":           "Clínica Tatuapé — Padcon Conect",
              "clinica.endereco":       "São Paulo — SP",
              "clinica.email":          "contato@padconconect.com.br",
              "protocolo.titulo":       protocoloTitulo,
              "protocolo.substancias":  substancias.map((s) => s.nome).join(", "),
              "protocolo.vias":         viasUnicas,
              "protocolo.dataInicio":   dataHojeBR,
              "protocolo.totalSessoes": String(maxSessoes),
              "protocolo.sessoes":      String(maxSessoes),
              "protocolo.valor":        "",
              "protocolo.valorTotal":   "",
              "pagamento.metodo":       "PIX",
              "pagamento.parcelas":     "1",
            };

            for (const tpl of templates) {
              try {
                // externalId determinístico: impede envelope duplicado no ZapSign
                // mesmo em retries concorrentes para o mesmo paciente+caderno.
                await enviarAssinatura({
                  pacienteId: clientId,
                  templateCodigo: tpl.codigo,
                  tipoDoc: tpl.tipoDoc as "TCLE" | "TERMO" | "RAS" | "OUTRO",
                  titulo: tpl.titulo,
                  escopo: escopoEntrega,
                  externalId: `ras-fap-${clientId}-${tpl.codigo}`,
                  canais: ["EMAIL"],
                  dados: hidratacao,
                  incluirMedico: true,
                });
                req.log.info(`Caderno ${tpl.codigo} despachado para paciente ${clientId}`);
              } catch (cErr: any) {
                req.log.error(`Caderno ${tpl.codigo} falhou para paciente ${clientId}: ${cErr.message}`);
              }
            }
          }
        }
      } catch (cadernosErr: any) {
        req.log.error(`Cadernos jurídicos erro geral: ${cadernosErr.message}`);
      }
    }
    // ── fim cadernos ───────────────────────────────────────────────────────
  })();
});

export default router;

