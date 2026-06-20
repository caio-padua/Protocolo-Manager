import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sessionsTable, clientsTable } from "@workspace/db";
import { buildVCalendar } from "../lib/ics";
import { buildEventsForSessions } from "../lib/session-ics";
import { createFeedToken, verifyFeedToken } from "../lib/portal-token";

const router: IRouter = Router();

// SUB-04 item 7: gera a URL do feed iCal assinado para um cliente (uso admin).
// O cliente assina esta URL no Google/Apple Calendar e passa a receber TODAS as
// sessões dele, sempre atualizadas (UID estável por sessão).
router.get("/ical/feed-url/:clientId", async (req, res): Promise<void> => {
  const clientId = parseInt(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client id" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const token = createFeedToken(clientId);
  const base = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "";
  const path = `/api/ical/feed/${token}.ics`;
  res.json({
    token,
    path,
    url: `${base}${path}`,
    webcalUrl: base ? `webcal://${process.env.REPLIT_DEV_DOMAIN}${path}` : undefined,
  });
});

// Feed iCal público assinado por HMAC. Token sem expiração (assinatura permanente).
// Aceita sufixo .ics no token (Google/Apple anexam a extensão à URL).
router.get("/ical/feed/:token", async (req, res): Promise<void> => {
  const raw = req.params.token.replace(/\.ics$/i, "");
  const clientId = verifyFeedToken(raw);
  // 401 genérico (spec SUB-04 caso extremo 5): sem distinguir token inválido de
  // cliente inexistente, para não permitir enumeração.
  if (clientId == null || isNaN(clientId)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const allSessions = await db.select().from(sessionsTable).where(eq(sessionsTable.clientId, clientId));
  // SUB-04 item 7: o feed assinado leva apenas as sessões FUTURAS (de hoje em diante),
  // para a agenda do cliente refletir só o que ainda vai acontecer.
  const today = new Date().toISOString().slice(0, 10);
  const sessions = allSessions.filter(s => s.scheduledDate >= today);
  sessions.sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime),
  );

  const events = await buildEventsForSessions(sessions, client.name);
  const icsContent = buildVCalendar(events, { calName: `PADCOM — ${client.name}` });

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="padcom-${clientId}.ics"`);
  res.send(icsContent);
});

export default router;
