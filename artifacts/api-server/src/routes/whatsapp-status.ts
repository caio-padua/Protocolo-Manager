// Endpoints de LEITURA do console de WhatsApp (single-tenant, livres) + rota
// manual de disparo do motor de lembrete por período. O telefone é SEMPRE
// mascarado na API (o valor cru fica só no banco). Nunca expõe token.
import { Router, type IRouter } from "express";
import {
  db,
  whatsappMensagensLogTable,
  lembreteEnviosTable,
  lembretesPrescricaoTable,
  clientsTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { executarLembretesPeriodo } from "../lib/lembrete-periodo";

const router: IRouter = Router();

// Mascara o telefone deixando só os 2 últimos dígitos visíveis do final e o DDI/DDD.
// Ex.: +5511999998877 → "+55 11 9****-**77". Tolera formatos incompletos.
export function mascararTelefone(bruto: string | null | undefined): string {
  if (!bruto) return "—";
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 4) return "••••";
  const fim = digitos.slice(-2);
  // Reconhece +55 DD 9XXXX-XXXX (13 díg) ou DD 9XXXX-XXXX (11 díg).
  let ddi = "";
  let resto = digitos;
  if (digitos.length >= 12) {
    ddi = `+${digitos.slice(0, digitos.length - 11)} `;
    resto = digitos.slice(digitos.length - 11);
  }
  const ddd = resto.length >= 10 ? resto.slice(0, 2) + " " : "";
  const nono = resto.length === 11 ? "9" : "";
  return `${ddi}${ddd}${nono}****-**${fim}`.trim();
}

// GET /api/whatsapp/messages?limit= — log recente (telefone mascarado).
router.get("/whatsapp/messages", async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const rows = await db
    .select({
      id: whatsappMensagensLogTable.id,
      telefone: whatsappMensagensLogTable.telefone,
      corpo: whatsappMensagensLogTable.corpo,
      status: whatsappMensagensLogTable.status,
      errorCode: whatsappMensagensLogTable.errorCode,
      contexto: whatsappMensagensLogTable.contexto,
      criadoEm: whatsappMensagensLogTable.criadoEm,
      atualizadoEm: whatsappMensagensLogTable.atualizadoEm,
      clienteNome: clientsTable.name,
    })
    .from(whatsappMensagensLogTable)
    .leftJoin(clientsTable, eq(clientsTable.id, whatsappMensagensLogTable.clienteId))
    .orderBy(desc(whatsappMensagensLogTable.criadoEm))
    .limit(limit);

  res.json({
    messages: rows.map((r) => ({
      id: r.id,
      telefone: mascararTelefone(r.telefone),
      resumo: r.corpo.length > 90 ? r.corpo.slice(0, 90) + "…" : r.corpo,
      status: r.status,
      errorCode: r.errorCode,
      contexto: r.contexto,
      clienteNome: r.clienteNome,
      criadoEm: r.criadoEm,
      atualizadoEm: r.atualizadoEm,
    })),
  });
});

// GET /api/whatsapp/stats — contagem por status (para os KPIs da tela).
router.get("/whatsapp/stats", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ status: whatsappMensagensLogTable.status, total: sql<number>`count(*)::int` })
    .from(whatsappMensagensLogTable)
    .groupBy(whatsappMensagensLogTable.status);

  const porStatus: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    porStatus[r.status] = r.total;
    total += r.total;
  }
  const soma = (...chaves: string[]) => chaves.reduce((acc, k) => acc + (porStatus[k] ?? 0), 0);
  res.json({
    total,
    porStatus,
    enviados: soma("sent", "delivered", "read"),
    entregues: soma("delivered", "read"),
    falhas: soma("failed", "undelivered"),
    semTwilio: soma("link"),
  });
});

// GET /api/lembretes/failures — envios de lembrete que FALHARAM (com cliente).
router.get("/lembretes/failures", async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const rows = await db
    .select({
      id: lembreteEnviosTable.id,
      janela: lembreteEnviosTable.janela,
      erro: lembreteEnviosTable.erro,
      criadoEm: lembreteEnviosTable.createdAt,
      clienteNome: clientsTable.name,
      clienteTelefone: clientsTable.phone,
    })
    .from(lembreteEnviosTable)
    .leftJoin(clientsTable, eq(clientsTable.id, lembreteEnviosTable.clienteId))
    .where(eq(lembreteEnviosTable.status, "FALHOU"))
    .orderBy(desc(lembreteEnviosTable.createdAt))
    .limit(limit);

  res.json({
    failures: rows.map((r) => ({
      id: r.id,
      janela: r.janela,
      erro: r.erro,
      clienteNome: r.clienteNome,
      telefone: mascararTelefone(r.clienteTelefone),
      criadoEm: r.criadoEm,
    })),
  });
});

// GET /api/lembretes/prescricoes — lembretes ativos (para conferência/tela).
router.get("/lembretes/prescricoes", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: lembretesPrescricaoTable.id,
      ativo: lembretesPrescricaoTable.ativo,
      periodos: lembretesPrescricaoTable.periodos,
      horariosEnvio: lembretesPrescricaoTable.horariosEnvio,
      clienteNome: clientsTable.name,
    })
    .from(lembretesPrescricaoTable)
    .leftJoin(clientsTable, eq(clientsTable.id, lembretesPrescricaoTable.clienteId))
    .orderBy(desc(lembretesPrescricaoTable.updatedAt))
    .limit(100);
  res.json({ prescricoes: rows });
});

// POST /api/lembretes/processar — dispara o motor manualmente (worker/teste).
router.post("/lembretes/processar", async (_req, res): Promise<void> => {
  const resultado = await executarLembretesPeriodo();
  res.json(resultado);
});

export default router;
