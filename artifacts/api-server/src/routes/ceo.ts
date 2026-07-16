/**
 * CEO Command Center — Rota multi-tenant (Carta 07)
 *
 * GET /api/ceo/resumo  — snapshot de todas as clínicas (plataforma dona)
 * GET /api/ceo/stream  — SSE tempo real (push a cada 30s)
 *
 * Acesso: requirePlatformOwner (isPlatformOwner = true)
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { empresasTable, clientsTable, sessionsTable, paymentsTable, stockItemsTable } from "@workspace/db/schema";
import { eq, and, gte, lt, count, sum, sql, asc, ne } from "drizzle-orm";
import { requirePlatformOwner } from "../middleware/tenantContext";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function hojeInicio(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function hojesFim(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

interface EmpresaResumo {
  id: number;
  nome: string;
  nick: string | null;
  status: string;
  tipoRelacionamento: string;
  podeSublicenciar: boolean;
  consultasHoje: number;
  clientesAtivos: number;
  caixaHoje: string;
  pagamentosPendentes: number;
  estoqueCritico: number;
  alertas: string[];
  atualizadoEm: string;
}

async function buildResumo(empresaId: number, empresa: typeof empresasTable.$inferSelect): Promise<EmpresaResumo> {
  const inicio = hojeInicio();
  const fim = hojesFim();

  const [
    consultasHoje,
    clientesAtivos,
    caixaHoje,
    pagPendentes,
    estoqueCritico,
  ] = await Promise.all([
    // consultas de hoje (scheduledDate é texto "YYYY-MM-DD")
    db
      .select({ n: count() })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.empresaId, empresaId),
          eq(sessionsTable.scheduledDate, inicio.toISOString().slice(0, 10)),
        ),
      )
      .then((r) => Number(r[0]?.n ?? 0)),

    // clientes ativos
    db
      .select({ n: count() })
      .from(clientsTable)
      .where(eq(clientsTable.empresaId, empresaId))
      .then((r) => Number(r[0]?.n ?? 0)),

    // caixa do dia (pagamentos confirmados hoje)
    db
      .select({ total: sum(paymentsTable.amount) })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.empresaId, empresaId),
          eq(paymentsTable.status, "paid"),
          gte(paymentsTable.createdAt, inicio),
          lt(paymentsTable.createdAt, fim),
        ),
      )
      .then((r) => r[0]?.total ?? "0.00"),

    // pagamentos pendentes (total histórico)
    db
      .select({ n: count() })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.empresaId, empresaId),
          eq(paymentsTable.status, "pending"),
        ),
      )
      .then((r) => Number(r[0]?.n ?? 0)),

    // itens críticos de estoque
    db
      .select({ n: count() })
      .from(stockItemsTable)
      .where(
        and(
          eq(stockItemsTable.empresaId, empresaId),
          sql`${stockItemsTable.quantity} <= ${stockItemsTable.minimumStock}`,
        ),
      )
      .then((r) => Number(r[0]?.n ?? 0)),
  ]);

  const alertas: string[] = [];
  if (estoqueCritico > 0) alertas.push(`${estoqueCritico} item(s) crítico(s) no estoque`);
  if (pagPendentes > 5) alertas.push(`${pagPendentes} pagamentos pendentes`);
  if (empresa.status !== "ATIVO") alertas.push(`Clínica ${empresa.status}`);

  return {
    id: empresa.id,
    nome: empresa.nome,
    nick: empresa.nick ?? null,
    status: empresa.status,
    tipoRelacionamento: empresa.tipoRelacionamento ?? "licenciada_direta",
    podeSublicenciar: empresa.podeSublicenciar ?? false,
    consultasHoje,
    clientesAtivos,
    caixaHoje: String(caixaHoje),
    pagamentosPendentes: pagPendentes,
    estoqueCritico,
    alertas,
    atualizadoEm: new Date().toISOString(),
  };
}

// ── GET /api/ceo/resumo ──────────────────────────────────────────────────────

router.get("/ceo/resumo", requirePlatformOwner, async (_req: Request, res: Response): Promise<void> => {
  try {
    // isPlatformOwner=true = a própria PAXTER (sistema) — nunca aparece como clínica
    const empresas = await db
      .select()
      .from(empresasTable)
      .where(
        and(
          eq(empresasTable.ativa, true),
          ne(empresasTable.isPlatformOwner, true),
        ),
      )
      .orderBy(
        // Instituto Pádua (id=5) fixo em primeiro — clínica-âncora do CEO
        sql`CASE WHEN ${empresasTable.id} = 5 THEN 0 ELSE 1 END`,
        asc(empresasTable.nome),
      );

    const resumos = await Promise.all(
      empresas.map((e) => buildResumo(e.id, e)),
    );

    res.json({ ok: true, data: resumos, total: resumos.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Erro interno" });
  }
});

// ── GET /api/ceo/stream (SSE — Server-Sent Events) ──────────────────────────

router.get("/ceo/stream", requirePlatformOwner, async (_req: Request, res: Response): Promise<void> => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const push = async () => {
    try {
      const empresas = await db
        .select()
        .from(empresasTable)
        .where(
          and(
            eq(empresasTable.ativa, true),
            ne(empresasTable.isPlatformOwner, true),
          ),
        )
        .orderBy(
          sql`CASE WHEN ${empresasTable.id} = 5 THEN 0 ELSE 1 END`,
          asc(empresasTable.nome),
        );

      const resumos = await Promise.all(
        empresas.map((e) => buildResumo(e.id, e)),
      );

      res.write(`data: ${JSON.stringify({ ok: true, data: resumos, ts: Date.now() })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Erro" })}\n\n`);
    }
  };

  await push();
  const interval = setInterval(push, 30_000);

  res.on("close", () => {
    clearInterval(interval);
  });
});

export default router;
