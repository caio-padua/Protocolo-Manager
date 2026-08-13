import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { eq, and, inArray } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { db, protocolsTable, protocolItemsTable, clientsTable, substancesTable, professionalsTable, sessionsTable, substanceApplicationsTable, paymentsTable, assinaturaSolicitacoesTable, assinaturaTemplatesTable } from "@workspace/db";
import { enviarAssinatura } from "../lib/assinatura/service";
import { resolverCodigosCadernos } from "../lib/cadernos-resolver";
import { generateProtocolDocumentPdf, generatePhysicalRASPdf, getCertInfo } from "../lib/pdf-signer";
import { generateProtocolLetterPdf, buildCartaTratamentoDto } from "../lib/pdf-carta-tratamento";
import {
  ensureClientFolderStructure,
  uploadFileToDrive,
  uploadToFolderById,
  shareWithClient,
  isDriveConnected,
  formatPhysicalRASFileName,
} from "../lib/google-drive";
import { sendProtocolEmail, sendProtocolOnboardingEmail } from "../lib/email-service";
import { postSlackAlert } from "../lib/slack-reporter";
import { notifySlackRasFapFailure } from "../lib/ras-fap-alert";
import { buildEventsForSessions } from "../lib/session-ics";
import { buildVCalendar } from "../lib/ics";
import { requireCollaborator } from "./collaborator";
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
router.use(moduleGuard("protocolos"));

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

router.get("/protocols", async (req, res): Promise<void> => {
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

  // nurseId e nurseServiceFee chegam no body mas podem não estar no schema Zod; ler direto.
  const rawNurseId = req.body.nurseId != null ? parseInt(String(req.body.nurseId)) : null;
  const rawNurseServiceFee = req.body.nurseServiceFee != null ? parseFloat(String(req.body.nurseServiceFee)) : null;

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

  const empresaId = resolveEmpresaId(req);
  const [protocol] = await db.insert(protocolsTable).values({
    ...protocolData,
    totalValue: finalTotalValue,
    totalSessions,
    empresaId,
    ...(rawNurseId != null && !isNaN(rawNurseId) ? { nurseId: rawNurseId } : {}),
    ...(rawNurseServiceFee != null && !isNaN(rawNurseServiceFee) ? { nurseServiceFee: rawNurseServiceFee } : {}),
  }).returning();

  await Promise.all(items.map((item: { substanceId: number; dose: string; totalSessions: number; intervalDays: number; frequency: string }) =>
    db.insert(protocolItemsTable).values({
      protocolId: protocol.id,
      substanceId: item.substanceId,
      dose: item.dose,
      unitPrice: priceMap[item.substanceId] ?? 0,
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

      // === RAS FAP PREMIUM: gerar + salvar no Drive ===
      let rasFapBuffer: Buffer | undefined;
      let rasFapFileName: string | undefined;
      try {
        // Monta sessoes no formato esperado pelo motor do RAS FAP.
        const physicalSessions = docSessions.map(sess => ({
          number: sess.number,
          scheduledDate: sess.scheduledDate,
          effectiveDate: sess.status === "completed" ? sess.scheduledDate : null,
          nurseName: null as string | null,
          substanceStatuses: sess.substanceStatuses,
        }));

        // Calcula idade do cliente.
        let clientAge: number | undefined;
        if (client.birthDate) {
          const birth = new Date(client.birthDate);
          const now = new Date();
          clientAge = now.getFullYear() - birth.getFullYear();
          if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) clientAge--;
        }

        const rasFapBytes = await generatePhysicalRASPdf({
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
          substances: substances.map(s => ({
            name: s.name,
            color: s.color,
            totalSessions: s.totalSessions,
            frequencyDays: s.intervalDays,
            startDate: s.startDate,
            procedureType: s.procedureType,
            dose: s.dose,
          })),
          sessions: physicalSessions,
        });

        rasFapBuffer = Buffer.from(rasFapBytes);
        rasFapFileName = formatPhysicalRASFileName(protocol.startDate, client.name, protocol.title);

        // Salvar RAS FAP no Drive (pasta compartilhada + pasta PROTOCOLOS do cliente).
        if (await isDriveConnected()) {
          const rasFapPromises: Promise<any>[] = [];

          rasFapPromises.push(
            uploadToFolderById(SHARED_RAS_FOLDER_ID, rasFapFileName, "application/pdf", rasFapBuffer)
              .then(() => console.log(`RAS FAP uploaded to shared folder: ${rasFapFileName}`))
              .catch(err => console.error("RAS FAP shared folder upload error:", err.message))
          );

          rasFapPromises.push(
            ensureClientFolderStructure(client.name, client.cpf ?? "")
              .then(async ({ subfolders }) => {
                const protocolosFolderId = subfolders["PROTOCOLOS"];
                if (protocolosFolderId && rasFapBuffer && rasFapFileName) {
                  const result = await uploadFileToDrive(protocolosFolderId, rasFapFileName, "application/pdf", rasFapBuffer);
                  if (client.email) {
                    await shareWithClient(result.fileId, client.email);
                  }
                  console.log(`RAS FAP uploaded to client PROTOCOLOS: ${rasFapFileName}`);
                }
              })
              .catch(err => console.error("RAS FAP client folder upload error:", err.message))
          );

          await Promise.all(rasFapPromises);
        }
      } catch (err: any) {
        console.error("RAS FAP auto-generation error (non-blocking):", err.message);
        await notifySlackRasFapFailure(
          "drive",
          client.name,
          protocol.id,
          protocol.title,
          err.message,
          process.env.PADAXOR_SLACK_CHANNEL_ID,
        );
      }

      try {
        if (client.email && await isGmailConnected()) {
          const yy = protocol.startDate.slice(2, 4);
          const mm = protocol.startDate.slice(5, 7);
          const dd = protocol.startDate.slice(8, 10);
          const driveFileName = `${yy}.${mm}.${dd} PROTOCOLO ${client.name.toUpperCase()} (${protocol.title.toUpperCase()}).pdf`;
          const rasFapFileName = `${yy}.${mm}.${dd} RAS FAP ${client.name.toUpperCase()}.pdf`;

          // Gera o RAS FAP PDF para incluir como segundo anexo no mesmo e-mail
          let rasFapBuffer: Buffer | undefined;
          try {
            const rasFapBytes = await generatePhysicalRASPdf({
              clientName: client.name,
              clientCpf: client.cpf ?? "000.000.000-00",
              clientPhone: client.phone ?? "",
              clientAge: client.birthDate
                ? Math.floor((Date.now() - new Date(client.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
                : undefined,
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
              sessions: [],
            }, "PREMIUM");
            rasFapBuffer = Buffer.from(rasFapBytes);
            console.log(`RAS FAP gerado para ${client.name} (${rasFapBuffer.length} bytes)`);
          } catch (rasFapErr: any) {
            console.error("RAS FAP generation error (email seguirá sem ele):", rasFapErr.message);
            await notifySlackRasFapFailure(
              "email",
              client.name,
              protocol.id,
              protocol.title,
              rasFapErr.message,
              process.env.PADAXOR_SLACK_CHANNEL_ID,
            );
          }

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
          if (emailResult.success) {
            console.log(`Protocol document email sent to ${client.email}${rasFapBuffer ? " (+ RAS FAP)" : ""}`);

            // ── Cadernos Jurídicos na primeira entrega (idempotente por código) ──
            // Gateado em: (a) sucesso do e-mail E (b) presença do RAS FAP em anexo.
            // Se o RAS FAP não foi gerado, o paciente não recebeu o RAS — não despacha.
            // Escopo inclui protocolId para distinguir entregas de protocolos distintos
            // para o mesmo paciente. externalId determinístico impede duplicatas no ZapSign.
            if (!rasFapBuffer) {
              console.warn(`Cadernos jurídicos não despachados: RAS FAP ausente do e-mail para paciente ${client.id}`);
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
                console.log(`Cadernos jurídicos: todos já enviados para paciente ${client.id}`);
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
                  console.warn(`Cadernos jurídicos: nenhum template ativo para [${codigosFaltantes.join(",")}] — execute /api/cadernos-juridicos/seed`);
                } else {
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
                  // Tabela HTML enriquecida: substância ↓ dose ↓ sessões ↓ frequência ↓ via
                  // Usada em {{protocolo.substancias}} nos cadernos jurídicos via ZapSign.
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
                  const substanciasList = substanciasTable;

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
                    "protocolo.substancias":  substanciasList,
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
                      // externalId determinístico: impede envelope duplicado no ZapSign
                      // mesmo em retries concorrentes para o mesmo paciente+protocolo+caderno.
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
                      console.log(`Caderno ${tpl.codigo} despachado para paciente ${client.id}`);
                    } catch (cErr: any) {
                      console.error(`Caderno ${tpl.codigo} falhou para paciente ${client.id}: ${cErr.message}`);
                    }
                  }
                }
              }
            } catch (cadernosErr: any) {
              console.error(`Cadernos jurídicos erro geral: ${cadernosErr.message}`);
            }
            // ── fim cadernos ─────────────────────────────────────────────────────
          } else {
            console.error("Protocol document email failed:", emailResult.error);
            const slackChannel = process.env.PADAXOR_SLACK_CHANNEL_ID;
            if (slackChannel) {
              postSlackAlert(
                slackChannel,
                `🚨 *E-mail do protocolo não entregue* ao paciente *${client.name}* (Protocolo #${protocol.id} — ${protocol.title}).\nE-mail destino: ${client.email}\nMotivo: ${emailResult.error ?? "desconhecido"}`,
              ).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        console.error("Protocol document email error:", err.message);
        const slackChannel = process.env.PADAXOR_SLACK_CHANNEL_ID;
        if (slackChannel) {
          postSlackAlert(
            slackChannel,
            `🚨 *Falha ao tentar enviar e-mail do protocolo* para *${client.name}* (Protocolo #${protocol.id} — ${protocol.title}).\nE-mail destino: ${client.email ?? "não informado"}\nErro inesperado: ${err.message}`,
          ).catch(() => {});
        }
      }
    })();
  } catch (err: any) {
    console.error("Protocol document PDF error:", err);
    res.status(500).json({ error: "Erro ao gerar documento do protocolo", details: err.message });
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
    res.json({
      ok: true,
      message: "Certificado carregado com sucesso — assinatura PAdES disponível.",
      cert: {
        issuer:    info.issuer,
        serial:    info.serial,
        validFrom: info.validFrom,
        validTo:   info.validTo,
      },
    });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      message: "Certificado não configurado ou senha incorreta.",
      details: err.message,
    });
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

  // SUB-04 item 5: onboarding ao fechar/validar o protocolo — e-mail de boas-vindas
  // com o .ics consolidado das sessões recém-geradas. Best-effort: cliente sem
  // e-mail ou falha no envio NÃO quebra a validação (caso extremo 1).
  try {
    if (await isGmailConnected()) {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
      if (client?.email) {
        const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocol.id));
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
          req.log.warn({ protocolId: protocol.id, error: onboarding.error }, "Onboarding email não enviado");
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
  sessions.sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime),
  );

  // SUB-04: motor de .ics ÚNICO (lib/ics.ts) — sem duplicar a geração.
  const events = await buildEventsForSessions(sessions, client?.name ?? "Cliente");
  const icsContent = buildVCalendar(events, { calName: `Instituto Pádua — ${client?.name ?? "Cliente"}` });
  const filename = `protocolo_${protocol.id}_${client?.name?.replace(/\s+/g, "_") ?? "cliente"}.ics`;

  res.json({ icsContent, filename });
});

// ── Carta de Tratamento Premium PADAXOR (layout Dr. Manus Item #88) ──────────
// Rota nova — não interfere com document-pdf (Regra de Ouro).
router.get("/protocols/:id/carta-pdf", async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params.id);
  if (isNaN(protocolId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
  if (!protocol) { res.status(404).json({ error: "Protocolo não encontrado" }); return; }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, protocol.clientId));
  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

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

  const substances = items.map(item => {
    const sub = subMap.get(item.substanceId);
    return {
      name:               sub?.name              ?? `Substancia ${item.substanceId}`,
      dose:               item.dose,
      color:              sub?.color             ?? "navy",
      totalSessions:      item.totalSessions,
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

  try {
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
      sessions: sessions.map(s => ({ status: s.status })),
    });

    const { pdfBytes, certInfo } = await generateProtocolLetterPdf(dto);

    const slug     = client.name.replace(/\s+/g, "_");
    const filename = `CARTA_TRATAMENTO_${slug}_${protocolId}.pdf`;
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
    console.error("[carta-pdf] erro:", err.message);
    res.status(500).json({ error: "Erro ao gerar carta", details: err.message });
  }
});

export default router;
