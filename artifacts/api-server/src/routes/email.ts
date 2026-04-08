import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  db,
  sessionsTable,
  clientsTable,
  substancesTable,
  substanceApplicationsTable,
  validationCodesTable,
  rasTable,
} from "@workspace/db";
import {
  sendPreSessionEmail,
  sendPostSessionEmail,
  isEmailConfigured,
  type PreSessionEmailData,
  type PostSessionEmailData,
} from "../lib/email-service";

const router: IRouter = Router();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function procedureTypeLabel(type: string): string {
  switch (type) {
    case "iv": return "Aplicacao Endovenosa";
    case "im": return "Aplicacao Intramuscular";
    case "implant": return "Implante";
    default: return "Procedimento";
  }
}

router.get("/email/status", async (_req, res): Promise<void> => {
  const configured = await isEmailConfigured();
  res.json({ configured });
});

router.post("/email/send-pre-session/:sessionId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  if (!(await isEmailConfigured())) {
    res.status(503).json({ error: "Gmail not connected via Replit integration." });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  if (!client || !client.email) {
    res.status(400).json({ error: "Client has no email address" });
    return;
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, sessionId));

  const dispApps = applications.filter(a => a.availability === "disp");
  if (dispApps.length === 0) {
    res.status(400).json({ error: "No substances scheduled for this session" });
    return;
  }

  const code = generateCode();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await db.insert(validationCodesTable).values({
    sessionId,
    clientId: session.clientId,
    code,
    expiresAt: expiresAt.toISOString(),
  });

  const substances: PreSessionEmailData["substances"] = [];
  for (const app of dispApps) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (substance) {
      substances.push({
        name: substance.name,
        dose: app.dose,
        color: substance.color,
        procedureType: substance.procedureType ?? "iv",
        sessionNumber: app.sessionNumber,
        totalSessions: app.totalSessions,
        description: substance.description ?? undefined,
        mainFunction: substance.mainFunction ?? undefined,
      });
    }
  }

  const primaryProcType = substances[0]?.procedureType ?? "iv";

  const result = await sendPreSessionEmail({
    clientName: client.name,
    clientEmail: client.email,
    validationCode: code,
    scheduledDate: session.scheduledDate,
    scheduledTime: session.scheduledTime,
    procedureLabel: procedureTypeLabel(primaryProcType),
    substances,
    unit: session.unit ?? "Clinica Padua",
  });

  if (result.success) {
    res.json({ success: true, code, message: "Pre-session email sent" });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

router.post("/email/send-post-session/:sessionId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  if (!(await isEmailConfigured())) {
    res.status(503).json({ error: "Gmail not connected via Replit integration." });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  if (!client || !client.email) {
    res.status(400).json({ error: "Client has no email address" });
    return;
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, sessionId));

  const substances: PostSessionEmailData["substances"] = [];
  for (const app of applications) {
    if (app.availability !== "disp") continue;
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (substance) {
      substances.push({
        name: substance.name,
        dose: app.dose,
        color: substance.color,
        status: app.status,
      });
    }
  }

  let rasPdfBuffer: Buffer | undefined;
  let rasId: number | undefined;

  try {
    const [ras] = await db.select().from(rasTable).where(eq(rasTable.sessionId, sessionId));
    if (ras) {
      rasId = ras.id;
      const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`;
      const pdfResp = await fetch(`${baseUrl}/api/ras/${ras.id}/pdf`);
      if (pdfResp.ok) {
        const arrayBuf = await pdfResp.arrayBuffer();
        rasPdfBuffer = Buffer.from(arrayBuf);
      }
    }
  } catch (e) {
    console.error("Could not attach RAS PDF:", e);
  }

  const result = await sendPostSessionEmail({
    clientName: client.name,
    clientEmail: client.email,
    scheduledDate: session.scheduledDate,
    substances,
    rasPdfBuffer,
    rasId,
  });

  if (result.success) {
    res.json({ success: true, message: "Post-session email sent" });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

router.post("/email/send-weekly-reminders", async (_req, res): Promise<void> => {
  if (!(await isEmailConfigured())) {
    res.status(503).json({ error: "Gmail not connected" });
    return;
  }

  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const todayStr = today.toISOString().split("T")[0];
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const sessions = await db.select().from(sessionsTable);
  const upcomingSessions = sessions.filter(
    s => s.scheduledDate >= todayStr && s.scheduledDate <= weekEndStr && s.status === "scheduled"
  );

  const results: Array<{ sessionId: number; clientName: string; success: boolean; error?: string }> = [];

  for (const session of upcomingSessions) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
    if (!client?.email) {
      results.push({ sessionId: session.id, clientName: client?.name ?? "", success: false, error: "No email" });
      continue;
    }

    const applications = await db.select().from(substanceApplicationsTable)
      .where(eq(substanceApplicationsTable.sessionId, session.id));
    const dispApps = applications.filter(a => a.availability === "disp");

    if (dispApps.length === 0) continue;

    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.insert(validationCodesTable).values({
      sessionId: session.id,
      clientId: session.clientId,
      code,
      expiresAt: expiresAt.toISOString(),
    });

    const substances: PreSessionEmailData["substances"] = [];
    for (const app of dispApps) {
      const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (substance) {
        substances.push({
          name: substance.name,
          dose: app.dose,
          color: substance.color,
          procedureType: substance.procedureType ?? "iv",
          sessionNumber: app.sessionNumber,
          totalSessions: app.totalSessions,
          description: substance.description ?? undefined,
          mainFunction: substance.mainFunction ?? undefined,
        });
      }
    }

    const primaryProcType = substances[0]?.procedureType ?? "iv";
    const emailResult = await sendPreSessionEmail({
      clientName: client.name,
      clientEmail: client.email,
      validationCode: code,
      scheduledDate: session.scheduledDate,
      scheduledTime: session.scheduledTime,
      procedureLabel: procedureTypeLabel(primaryProcType),
      substances,
      unit: session.unit ?? "Clinica Padua",
    });

    results.push({
      sessionId: session.id,
      clientName: client.name,
      success: emailResult.success,
      error: emailResult.error,
    });
  }

  res.json({
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results,
  });
});

export default router;
