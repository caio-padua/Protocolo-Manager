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

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (!client.email) {
      res.status(400).json({ error: "Cliente sem e-mail cadastrado" });
      return;
    }

    let professionalName = "Profissional";
  let professionalCrm: string | null = null;
  if (session.professionalId) {
      const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
    if (prof) {
      professionalName = prof.name;
      professionalCrm = prof.crm ?? null;
    }
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, session.id));

  const dispApps = applications.filter(a => a.availability === "disp" && a.sessionNumber > 0);
  const substanceIds = [...new Set(dispApps.map(a => a.substanceId))];
    const allSubstances = await db.select().from(substancesTable);
    const substanceMap = new Map(allSubstances.map(s => [s.name, s]));

    const substances = FICHAS_DEMO_SPECS.map(spec => {
      const db = byName.get(spec.dbName.toUpperCase().trim());
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

  const empresaId = resolveEmpresaId(req);

  const [ras] = await db.select().from(rasTable).where(eq(rasTable.id, id));

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

  const [ras] = await db.select().from(rasTable).where(eq(rasTable.id, id));
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

    const [yy, mm, dd] = [
      ras.serviceDate.slice(2, 4),
      ras.serviceDate.slice(5, 7),
      ras.serviceDate.slice(8, 10),
    ];
    const filename = driveFileName;

    const clientId = protocol.clientId;

    const clientId = protocol.clientId;

    const clientId = protocol.clientId;
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
          if (client) {
    const folders = await ensureClientFolderStructure(client.name, client.cpf ?? "");
    const result = await uploadFileToDrive(folders.subfolders["PROTOCOLOS"] ?? "", driveFileName, "application/pdf", Buffer.from(pdfBytes));
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
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
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
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
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

    const [yy, mm, dd] = [
      ras.serviceDate.slice(2, 4),
      ras.serviceDate.slice(5, 7),
      ras.serviceDate.slice(8, 10),
    ];

  const driveFileName = `${yy}.${mm}.${dd} RAS FAP ${client.name.toUpperCase()}.pdf`;
    const folders = await ensureClientFolderStructure(client.name, client.cpf ?? "");
    const result = await uploadFileToDrive(folders.subfolders["PROTOCOLOS"] ?? "", driveFileName, "application/pdf", Buffer.from(pdfBytes));

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

  try {
    const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
    if (!protocol) {
      res.status(404).json({ error: "Protocol not found" });
      return;
    }

    const clientId = protocol.clientId;
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    let professionalName = "Profissional";
    if (protocol.professionalId) {
      const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
      if (prof) professionalName = prof.name;
    }

    const protocolItems = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocolId));
    const allSubstances = await db.select().from(substancesTable);
    const substMap = new Map(allSubstances.map(s => [s.id, s]));

    const substancias = protocolItems.map(item => {
      const sub = substMap.get(item.substanceId);
      const via = sub?.procedureType === "im" ? "Intramuscular"
        : sub?.procedureType === "implant" ? "Implante"
        : "Endovenosa";
      return {
        nome: sub?.name ?? "Substância",
        dose: item.dose,
        via,
        sessoes: item.totalSessions,
        frequenciaDias: item.intervalDays,
        inicio: item.startDate,
        cor: sub?.color ?? "#c9a24f",
        procedureType: sub?.procedureType ?? "iv",
      };
    });

    const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const yy = String(agora.getFullYear()).slice(2);
    const mm = String(agora.getMonth() + 1).padStart(2, "0");
    const dd = String(agora.getDate()).padStart(2, "0");

    const idadeAnos = (client as any).birthDate
      ? Math.floor((Date.now() - new Date((client as any).birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      : undefined;

    const pdfBytes = await generatePhysicalRASPdf({
      clientName: client.name,
      clientCpf: client.cpf ?? "000.000.000-00",
      clientPhone: client.phone ?? "",
      clientAge: idadeAnos,
      professionalName,
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

    const driveFileName = `${yy}.${mm}.${dd} RAS FAP ${client.name.toUpperCase()}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${driveFileName}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error("Physical RAS PDF generation error:", err);
    res.status(500).json({ error: "Erro ao gerar RAS FAP", details: err.message });
  }
});

router.post("/ras/physical/:protocolId/reenviar-email", async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params.protocolId);
  if (isNaN(protocolId)) {
    res.status(400).json({ error: "Invalid protocol id" });
    return;
  }

  try {
    const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (!client.email) {
      res.status(400).json({ error: "Cliente sem e-mail cadastrado" });
      return;
    }

    let professionalName = "Profissional";
      const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, protocol.professionalId));
    const protocolItems = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocolId));
    const allSubstances = await db.select().from(substancesTable);
    const substMap = new Map(allSubstances.map(s => [s.id, s]));

    const substancias = protocolItems.map(item => {
      const sub = substMap.get(item.substanceId);
      const via = sub?.procedureType === "im" ? "Intramuscular"
        : sub?.procedureType === "implant" ? "Implante"
        : "Endovenosa";
      return {
        nome: sub?.name ?? "Substância",
        dose: item.dose,
        via,
        sessoes: item.totalSessions,
        frequenciaDias: item.intervalDays,
        inicio: item.startDate,
        cor: sub?.color ?? "#c9a24f",
        procedureType: sub?.procedureType ?? "iv",
      };
    });

        if (sp) sessNurse = sp.name;
      }

      physicalSessions.push({
        number: sess.weekNumber,
        scheduledDate: sess.scheduledDate,
        effectiveDate: sess.status === "completed" ? sess.scheduledDate : null,
        nurseName: sessNurse,
        substanceStatuses,
      });
    }

  const idadeAnos = (client as any).birthDate
    ? Math.floor((Date.now() - new Date((client as any).birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : undefined;

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

  let pdfBuffer: Buffer;
  const driveFileName = `${yy}.${mm}.${dd} RAS FAP ${client.name.toUpperCase()}.pdf`;
    const emailResult = await sendProtocolEmail({
      clientName: client.name,
      clientEmail: client.email,
      protocolTitle: protocol.title,
      professionalName,
      startDate: protocol.startDate,
      substances: substancias.map(s => ({
        name: s.nome,
        color: s.cor ?? "#c9a24f",
        totalSessions: s.sessoes,
      })),
      pdfBuffer,
      pdfFileName: driveFileName,
    });

    try {
      await db.insert(emailLogTable).values({
        tipo: "ras_fap_reenviado",
        clienteNome: client.name,
        destinatario: client.email,
        assunto: `PAXTER | ${protocol.title} — RAS FAP`,
        status: emailResult.success ? "enviado" : "falhou",
        erro: emailResult.success ? null : (emailResult.error ?? null),
        protocolId: protocol.id,
        provider: "gmail",
      });
    } catch (logErr) {
      // log não pode derrubar o fluxo principal
      console.error("Erro ao gravar email_log do reenvio RAS FAP (non-blocking):", logErr);
    }

    if (!emailResult.success) {
      res.status(502).json({ error: `Falha ao enviar e-mail: ${emailResult.error}` });
      return;
    }

    res.json({ success: true, message: `RAS FAP reenviado com sucesso para ${client.email}` });
  } catch (err: any) {
    console.error("Reenviar RAS FAP error:", err);
    res.status(500).json({ error: "Erro ao gerar ou enviar o RAS FAP", details: err.message });
  }
});

router.get("/ras/physical/:protocolId/email-logs", async (req, res): Promise<void> => {
  const protocolId = parseInt(req.params.protocolId);
  if (isNaN(protocolId)) {
    res.status(400).json({ error: "Invalid protocol id" });
    return;
  }

  const logs = await db.select().from(emailLogTable)
    .where(and(eq(emailLogTable.tipo, "ras_fap_reenviado"), eq(emailLogTable.protocolId, protocolId)))
    .orderBy(desc(emailLogTable.criadoEm));

  res.json({
    items: logs.map(l => ({
      id: l.id,
      status: l.status,
      destinatario: maskEmailLocal(l.destinatario),
      erro: l.erro ?? null,
      criadoEm: l.criadoEm.toISOString(),
    })),
  });
});

/** Mascara e-mail: primeiros 3 chars + ***@domínio. */
function maskEmailLocal(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const prefix = local.substring(0, Math.min(3, local.length));
  return `${prefix}***@${domain}`;
}

// ===== Demonstracao do RAS FAP (cliente ficticio, substancias reais) =====
// GET /api/ras-fap-demo            -> tema PREMIUM padrao, poucas substancias
// GET /api/ras-fap-demo?big=1      -> forca o cenario com muitas substancias/sessoes

interface DemoSub {
  name: string;
  dose: string;
  color: string;
  via: string;
  procedureType: string;
  frequencyDays: number;
  totalSessions: number;
  startDate: string;
  stars: number;
  func: string;
}

function buildDemoSubstances(): DemoSub[] {
  return [
    { name: "NAD+", dose: "250mg", color: "#c9a24f", via: "Endovenosa", procedureType: "iv", frequencyDays: 7, totalSessions: 8, startDate: "2026-06-17", stars: 5, func: "Reparo celular e producao de energia mitocondrial" },
    { name: "Glutationa", dose: "1200mg", color: "#7a9a6d", via: "Endovenosa", procedureType: "iv", frequencyDays: 14, totalSessions: 6, startDate: "2026-06-17", stars: 4, func: "Antioxidante mestre — detox hepatico" },
    { name: "Vitamina C", dose: "10g", color: "#5b8bb0", via: "Endovenosa", procedureType: "iv", frequencyDays: 7, totalSessions: 8, startDate: "2026-06-17", stars: 4, func: "Imunidade e sintese de colageno" },
  ];
}

function buildBigDemoSubstances(): DemoSub[] {
  return [
    ...buildDemoSubstances(),
    { name: "Complexo B", dose: "2ml", color: "#a56dc9", via: "Intramuscular", procedureType: "im", frequencyDays: 7, totalSessions: 8, startDate: "2026-06-17", stars: 3, func: "Metabolismo energetico e sistema nervoso" },
    { name: "Magnesio", dose: "2g", color: "#c96d8f", via: "Endovenosa", procedureType: "iv", frequencyDays: 14, totalSessions: 6, startDate: "2026-06-17", stars: 3, func: "Relaxamento muscular e funcao cardiovascular" },
    { name: "Zinco", dose: "30mg", color: "#6dc9b8", via: "Intramuscular", procedureType: "im", frequencyDays: 30, totalSessions: 3, startDate: "2026-06-17", stars: 3, func: "Imunidade e cicatrizacao" },
    { name: "Implante Hormonal", dose: "1 implante", color: "#c9b06d", via: "Implante", procedureType: "implant", frequencyDays: 180, totalSessions: 1, startDate: "2026-06-17", stars: 5, func: "Reposicao hormonal de longa duracao" },
  ];
}

function buildCountDemoSubstances(n: number): DemoSub[] {
  const base = buildBigDemoSubstances();
  const out: DemoSub[] = [];
  for (let i = 0; i < n; i++) {
    const src = base[i % base.length];
    out.push({ ...src, name: n > base.length ? `${src.name} ${Math.floor(i / base.length) + 1}` : src.name });
  }
  return out;
}

function buildSubsDemoSubstances(n: number): DemoSub[] {
  return buildCountDemoSubstances(n);
}

function demoBlocks(subs: DemoSub[], clientName: string, valor: string): string[] {
  const primeiroNome = clientName.split(" ")[0];
  const blocks: string[] = [];
  blocks.push(`<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a1a;">Ola, ${primeiroNome}. Segue em anexo o seu RAS FAP — Registro de Administracao de Substancias para Fisico Acompanhamento de Protocolo, documento de controle das aplicacoes do seu tratamento.</p>`);
  blocks.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">
    <tr style="background:#0a1e3d;">
      <td style="padding:10px 14px;color:#e8c766;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Substancia</td>
      <td style="padding:10px 14px;color:#e8c766;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Dose</td>
      <td style="padding:10px 14px;color:#e8c766;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Via</td>
      <td style="padding:10px 14px;color:#e8c766;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Sessoes</td>
    </tr>
    ${subs.map((s, i) => `<tr style="background:${i % 2 === 0 ? "#f7f5f0" : "#ffffff"};">
      <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e8e4d8;">${s.name}</td>
      <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e8e4d8;">${s.dose}</td>
      <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e8e4d8;">${s.via}</td>
      <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e8e4d8;">${s.totalSessions}x / ${s.frequencyDays}d</td>
    </tr>`).join("")}
  </table>`);
  blocks.push(`<p style="margin:16px 0 0;font-size:13px;color:#555;">Valor do tratamento: <strong>${valor}</strong></p>`);
  return blocks;
}

router.get("/ras-fap-demo", async (req, res) => {
  const clientName = "MARIANA DEMONSTRACAO SILVA";
  const clientCpf = "000.000.000-00";
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
  const TEMAS_OK = ["PREMIUM", "MARCA", "MINIMAL", "BRONZE", "SIMPLES"] as const;
  const modo: ModoRasFap = (TEMAS_OK as readonly string[]).includes(temaParam)
    ? (temaParam as ModoRasFap)
    : "PREMIUM";

  const agoraDemo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const yyDemo = String(agoraDemo.getFullYear()).slice(2);
  const mmDemo = String(agoraDemo.getMonth() + 1).padStart(2, "0");
  const ddDemo = String(agoraDemo.getDate()).padStart(2, "0");
  const driveFileNameFapDemo = `${yyDemo}.${mmDemo}.${ddDemo} RAS FAP ${clientName.toUpperCase()}.pdf`;
  const protocoloTitulo = "Protocolo de Longevidade Personalizado";
  const blocos = demoBlocks(demoSubs, clientName, valor);

  try {
    const pdfBytes = await generatePhysicalRASPdf({
      clientName,
      clientCpf: "000.000.000-00",
      clientPhone: "",
      clientAge: 45,
      professionalName: "Dr. Caio Henrique Fernandes Padua",
      nurseName: "Instituto Padua",
      unit: "Instituto Padua — Clinica Avancada",
      startDate: demoSubs[0]?.startDate ?? agoraDemo.toISOString().slice(0, 10),
      protocolNumber: `FAP-${yyDemo}${mmDemo}${ddDemo}-DEMO`,
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
    const driveFileName = driveFileNameFapDemo;
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
            await uploadToFolderById(SHARED_RAS_FOLDER_ID, driveFileNameFapDemo, "application/pdf", pdfBuffer);
            req.log.info(`RAS FAP demo uploaded to Drive: ${driveFileNameFapDemo}`);
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
// GET /api/ras-fichas-demo -> cliente ficticio, substancias reais do catalogo

const FICHAS_DEMO_SPECS: Array<{ dbName: string; dose: string; via: string; color: string; session: number; total: number }> = [
  { dbName: "NAD+", dose: "250mg", via: "Endovenosa", color: "#c9a24f", session: 3, total: 8 },
  { dbName: "Glutationa", dose: "1200mg", via: "Endovenosa", color: "#7a9a6d", session: 2, total: 6 },
  { dbName: "Vitamina C", dose: "10g", via: "Endovenosa", color: "#5b8bb0", session: 3, total: 8 },
];

/** Primeira frase de um texto (ate o primeiro ponto final), ou string vazia. */
function firstSentence(text?: string | null): string {
  if (!text) return "";
  const idx = text.indexOf(".");
  return idx > 0 ? text.slice(0, idx + 1) : text;
}

function fichasBlocks(items: Array<{ name: string; dose: string; via: string; color: string; stars: number; whatIs: string }>, clientName: string): string[] {
  const primeiroNome = clientName.split(" ")[0];
  const blocks: string[] = [];
  blocks.push(`<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a1a;">Ola, ${primeiroNome}. Em anexo estao as fichas individuais de cada substancia do seu protocolo, com a assinatura digital do medico responsavel.</p>`);
  for (const it of items) {
    blocks.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border-collapse:collapse;border-left:4px solid ${it.color};background:#f7f5f0;">
      <tr><td style="padding:12px 16px;">
        <div style="font-size:14px;font-weight:700;color:#0a1e3d;">${it.name}</div>
        <div style="font-size:12px;color:#666;margin-top:2px;">${it.dose} — ${it.via}</div>
        ${it.whatIs ? `<div style="font-size:12px;color:#444;margin-top:6px;">${it.whatIs}</div>` : ""}
      </td></tr>
    </table>`);
  }
  return blocks;
}

router.get("/ras-fichas-demo", async (req, res) => {
  const clientName = "MARIANA DEMONSTRACAO SILVA";
  const clientCpf = "000.000.000-00";

  try {
    const allSubstances = await db.select().from(substancesTable);
    const byName = new Map(allSubstances.map(s => [s.name.toUpperCase().trim(), s]));

    const substances = FICHAS_DEMO_SPECS.map(spec => {
      const db = byName.get(spec.dbName.toUpperCase().trim());
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

    const [yy, mm, dd] = [
      ras.serviceDate.slice(2, 4),
      ras.serviceDate.slice(5, 7),
      ras.serviceDate.slice(8, 10),
    ];

  let pdfBuffer: Buffer;
  const protocoloTitulo = titulo ?? "Protocolo de Longevidade Personalizado";
  const driveFileName = `${yy}.${mm}.${dd} RAS FAP ${client.name.toUpperCase()}.pdf`;

    const emailItems = FICHAS_DEMO_SPECS.map(spec => {
      const sub = byName.get(spec.dbName.toUpperCase().trim());
      return {
        name: sub?.name ?? spec.dbName,
        dose: spec.dose,
        via: spec.via,
        color: spec.color,
        stars: sub?.starRating ?? 5,
        whatIs: firstSentence(sub?.description),
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

// ─────────────────────────────────────────────────────────────────────────
// POST /ras-fap/entregar-protocolo
//
// Rota de producao (nao-demo): gera o RAS FAP real de um cliente a partir
// das substancias do protocolo, envia por e-mail e salva no Drive
// compartilhado. Apos a entrega confirmada por e-mail, despacha os
// cadernos juridicos (TCLE/termos) ainda pendentes para aquele paciente,
// de forma idempotente (nunca reenvia um caderno ja aceito/enviado).
// ─────────────────────────────────────────────────────────────────────────

function buildEntregaBlocks(
  substancias: Array<{ nome: string; dose: string; via: string; sessoes: number; frequenciaDias: number; inicio: string; cor?: string }>,
  clientName: string,
  protocoloTitulo: string,
  dataHojeBR: string,
  incluirCadernosJuridicos: boolean,
): string[] {
  const primeiroNome = clientName.split(" ")[0];
  const blocks: string[] = [];
  blocks.push(`<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a1a;">Ola, ${primeiroNome}. Seu protocolo "${protocoloTitulo}" foi emitido em ${dataHojeBR}. Segue em anexo o RAS FAP — documento de controle fisico das aplicacoes.</p>`);
  blocks.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">
    <tr style="background:#0a1e3d;">
      <td style="padding:10px 14px;color:#e8c766;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Substancia</td>
      <td style="padding:10px 14px;color:#e8c766;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Dose</td>
      <td style="padding:10px 14px;color:#e8c766;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Via</td>
      <td style="padding:10px 14px;color:#e8c766;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Sessoes</td>
    </tr>
    ${substancias.map((s, i) => `<tr style="background:${i % 2 === 0 ? "#f7f5f0" : "#ffffff"};">
      <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e8e4d8;">${s.nome}</td>
      <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e8e4d8;">${s.dose}</td>
      <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e8e4d8;">${s.via}</td>
      <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e8e4d8;">${s.sessoes}x / ${s.frequenciaDias}d</td>
    </tr>`).join("")}
  </table>`);
  if (incluirCadernosJuridicos) {
    blocks.push(`<p style="margin:16px 0 0;font-size:13px;color:#555;">Em breve voce recebera tambem os termos de consentimento (TCLE) referentes as substancias do seu protocolo, para assinatura digital.</p>`);
  }
  return blocks;
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

  const idadeAnos = (client as any).birthDate
    ? Math.floor((Date.now() - new Date((client as any).birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
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
        // Usa zapsignExternalId (formato "ras-fap-{clientId}-{codigo}") como
        // fonte de verdade. É determinístico, único por caderno e não depende do
        // templateId (que pode ser null quando templates ainda não seedados).
        // INNER JOIN perderia registros com templateId=null; tipoDoc da tabela
        // tem colisões (CEND e TCLE têm o mesmo tipo_doc="TCLE").
        const escopoEntrega = `RAS_FAP_ENTREGA:${clientId}`;
        const prefixoExtId = `ras-fap-${clientId}-`;
        const jaEnviados = await db
          .select({ extId: assinaturaSolicitacoesTable.zapsignExternalId })
          .from(assinaturaSolicitacoesTable)
          .where(
            and(
              eq(assinaturaSolicitacoesTable.pacienteId, clientId),
              eq(assinaturaSolicitacoesTable.escopo, escopoEntrega),
              inArray(assinaturaSolicitacoesTable.status as any, ["ENVIADO", "CONCLUIDO"] as any),
            ),
          );
        const codigosJaEnviados = new Set(
          jaEnviados
            .map((r) => (r.extId?.startsWith(prefixoExtId) ? r.extId.slice(prefixoExtId.length) : null))
            .filter((c): c is string => c !== null),
        );

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

  const mmDemo = String(agoraDemo.getMonth() + 1).padStart(2, "0");

  const ddDemo = String(agoraDemo.getDate()).padStart(2, "0");
