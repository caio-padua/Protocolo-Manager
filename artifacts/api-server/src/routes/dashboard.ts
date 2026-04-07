import { Router, type IRouter } from "express";
import { eq, gte, lte } from "drizzle-orm";
import { db, clientsTable, protocolsTable, sessionsTable, paymentsTable, stockItemsTable, substancesTable, protocolItemsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const monthStart = new Date();
  monthStart.setDate(1);

  const clients = await db.select().from(clientsTable);
  const protocols = await db.select().from(protocolsTable);
  const sessions = await db.select().from(sessionsTable);
  const payments = await db.select().from(paymentsTable);
  const stockItems = await db.select().from(stockItemsTable);

  const totalClients = clients.length;
  const activeProtocols = protocols.filter(p => p.status === "active" || p.status === "validated").length;

  const todaySessions = sessions.filter(s => s.scheduledDate === today);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = weekEnd.toISOString().split("T")[0];
  const weekSessions = sessions.filter(s => s.scheduledDate >= weekStartStr && s.scheduledDate <= weekEndStr);

  const pendingPayments = payments.filter(p => p.status === "pending" || p.status === "partial" || p.status === "overdue");
  const pendingPaymentsValue = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

  const stockAlerts = await Promise.all(stockItems.map(async item => {
    if (item.expirationDate && new Date(item.expirationDate) < new Date()) return true;
    if (item.quantity <= item.minimumStock) return true;
    return false;
  }));
  const stockAlertsCount = stockAlerts.filter(Boolean).length;

  const completedSessions = sessions.filter(s => s.status === "completed").length;
  const totalScheduled = sessions.filter(s => s.status !== "cancelled").length;
  const completionRate = totalScheduled > 0 ? (completedSessions / totalScheduled) * 100 : 0;

  const monthStartStr = monthStart.toISOString().split("T")[0];
  const monthPaidPayments = payments.filter(p => p.status === "paid" && p.paidAt && p.paidAt >= monthStartStr);
  const revenueThisMonth = monthPaidPayments.reduce((sum, p) => sum + p.amount, 0);

  const missedSessionsCount = sessions.filter(s => s.status === "missed").length;

  res.json({
    totalClients,
    activeProtocols,
    sessionsTodayCount: todaySessions.length,
    sessionsThisWeekCount: weekSessions.length,
    pendingPaymentsCount: pendingPayments.length,
    pendingPaymentsValue,
    stockAlertsCount,
    completionRate: Math.round(completionRate),
    revenueThisMonth,
    missedSessionsCount,
  });
});

router.get("/dashboard/upcoming-sessions", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];

  const sessions = await db.select().from(sessionsTable);
  const upcomingSessions = sessions.filter(s =>
    s.scheduledDate >= today &&
    s.scheduledDate <= nextWeekStr &&
    s.status !== "cancelled"
  ).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const { db: dbInstance, sessionsTable: st, substanceApplicationsTable, substancesTable, clientsTable, professionalsTable } = await import("@workspace/db");

  // Build full session responses
  const results = await Promise.all(upcomingSessions.map(async session => {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
    let professionalName: string | null = null;
    if (session.professionalId) {
      const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, session.professionalId));
      professionalName = prof?.name ?? null;
    }

    const applications = await db.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, session.id));
    const substanceMap: Record<number, typeof substancesTable.$inferSelect> = {};
    for (const app of applications) {
      if (!substanceMap[app.substanceId]) {
        const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
        if (s) substanceMap[app.substanceId] = s;
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
      professionalName,
      unit: session.unit ?? null,
      serviceType: session.serviceType,
      weekNumber: session.weekNumber,
      notes: session.notes ?? null,
      substanceApplications: applications.map(app => ({
        id: app.id,
        substanceId: app.substanceId,
        substanceName: substanceMap[app.substanceId]?.name ?? "",
        substanceColor: substanceMap[app.substanceId]?.color ?? "#888888",
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

  res.json(results);
});

router.get("/dashboard/alerts", async (_req, res): Promise<void> => {
  const alerts: Array<{ id: string; type: string; severity: string; title: string; message: string; entityId: number | null; entityType: string | null; createdAt: string }> = [];
  const now = new Date().toISOString();

  const stockItems = await db.select().from(stockItemsTable);
  for (const item of stockItems) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, item.substanceId));
    if (item.expirationDate && new Date(item.expirationDate) < new Date()) {
      alerts.push({
        id: `stock-expired-${item.id}`,
        type: "stock_low",
        severity: "critical",
        title: "Substância Vencida",
        message: `${substance?.name ?? "Substância"} venceu em ${item.expirationDate}. Lote: ${item.lot ?? "N/A"}`,
        entityId: item.id,
        entityType: "stock",
        createdAt: now,
      });
    } else if (item.quantity <= item.minimumStock) {
      const severity = item.quantity <= 0 ? "critical" : "warning";
      alerts.push({
        id: `stock-low-${item.id}`,
        type: "stock_low",
        severity,
        title: severity === "critical" ? "Estoque Zerado" : "Estoque Baixo",
        message: `${substance?.name ?? "Substância"}: ${item.quantity} ${item.unit} restantes (mínimo: ${item.minimumStock} ${item.unit})`,
        entityId: item.id,
        entityType: "stock",
        createdAt: now,
      });
    }
  }

  const sessions = await db.select().from(sessionsTable);
  const missedSessions = sessions.filter(s => s.status === "missed");
  for (const session of missedSessions.slice(0, 5)) {
    alerts.push({
      id: `missed-${session.id}`,
      type: "missed_session",
      severity: "warning",
      title: "Sessão Perdida",
      message: `Sessão do dia ${session.scheduledDate} não foi realizada. Semana ${session.weekNumber}.`,
      entityId: session.id,
      entityType: "session",
      createdAt: now,
    });
  }

  const payments = await db.select().from(paymentsTable);
  const today = new Date().toISOString().split("T")[0];
  const overduePayments = payments.filter(p => p.status === "pending" && p.dueDate && p.dueDate < today);
  for (const payment of overduePayments.slice(0, 5)) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, payment.clientId));
    alerts.push({
      id: `overdue-${payment.id}`,
      type: "pending_payment",
      severity: "warning",
      title: "Pagamento em Atraso",
      message: `${client?.name ?? "Cliente"} — R$ ${payment.amount.toFixed(2)} vencido em ${payment.dueDate}`,
      entityId: payment.id,
      entityType: "payment",
      createdAt: now,
    });
  }

  res.json(alerts);
});

router.get("/dashboard/protocol-stats", async (_req, res): Promise<void> => {
  const protocols = await db.select().from(protocolsTable);

  const statusMap: Record<string, { count: number; value: number }> = {};
  for (const p of protocols) {
    if (!statusMap[p.status]) statusMap[p.status] = { count: 0, value: 0 };
    statusMap[p.status].count++;
    statusMap[p.status].value += p.totalValue;
  }
  const byStatus = Object.entries(statusMap).map(([status, data]) => ({ status, ...data }));

  const typeMap: Record<string, number> = {};
  for (const p of protocols) {
    typeMap[p.serviceType] = (typeMap[p.serviceType] || 0) + 1;
  }
  const byServiceType = Object.entries(typeMap).map(([serviceType, count]) => ({ serviceType, count }));

  const items = await db.select().from(protocolItemsTable);
  const substanceCountMap: Record<number, number> = {};
  for (const item of items) {
    substanceCountMap[item.substanceId] = (substanceCountMap[item.substanceId] || 0) + 1;
  }

  const topSubstanceEntries = Object.entries(substanceCountMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topSubstances = await Promise.all(topSubstanceEntries.map(async ([sid, count]) => {
    const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, parseInt(sid)));
    return {
      substanceName: s?.name ?? "Desconhecida",
      substanceColor: s?.color ?? "#888888",
      count,
    };
  }));

  const payments = await db.select().from(paymentsTable);
  const paidPayments = payments.filter(p => p.status === "paid" && p.paidAt);
  const monthMap: Record<string, number> = {};
  for (const payment of paidPayments) {
    const month = payment.paidAt!.substring(0, 7);
    monthMap[month] = (monthMap[month] || 0) + payment.amount;
  }
  const revenueByMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, revenue]) => ({ month, revenue }));

  res.json({ byStatus, byServiceType, topSubstances, revenueByMonth });
});

export default router;
