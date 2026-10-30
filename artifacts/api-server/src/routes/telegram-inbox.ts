/**
 * routes/telegram-inbox.ts
 *
 * Rotas de inbox Telegram do cockpit, extraídas de cockpit.ts para
 * permitir testes de integração com escopo mínimo de dependências.
 *
 * Montado em cockpit.ts via `router.use(inboxRouter)`.
 *
 * Rotas:
 *   GET  /telegram-inbox/badge
 *   GET  /cockpit/:clientId/telegram-inbox
 *   POST /cockpit/:clientId/telegram-inbox/marcar-lidas
 *
 * Cada rota delega a lógica a uma função pura de lib/telegram-inbox-flow.ts,
 * passando deps Drizzle como argumento. Isso permite:
 *   - Testes unitários contra a lib (deps em memória)
 *   - Testes de integração HTTP contra esta rota (deps reais mockadas na camada
 *     da lib pelo vi.mock, sem necessidade de banco real nos testes)
 */

import { Router } from "express";
import {
  db,
  clientsTable,
  telegramInboxTable,
} from "@workspace/db";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { requireCollaborator } from "./collaborator";
import { requireMessageClinic } from "../middleware/messageClinic";
import {
  obterBadge,
  listarInbox,
  marcarLidas,
  type MensagemInbox,
} from "../lib/telegram-inbox-flow";

export const inboxRouter = Router();

// Boot migration — adiciona coluna direcao se ainda não existir.
// "entrada" = paciente → bot; "saida" = CEO → paciente. Default entrada.
(async () => {
  try {
    await db.execute(
      sql`ALTER TABLE telegram_inbox_messages ADD COLUMN IF NOT EXISTS direcao TEXT NOT NULL DEFAULT 'entrada'`,
    );
  } catch {
    // coluna já existe ou banco indisponível no boot — ignora silenciosamente
  }
})();

// ── 1) GET /telegram-inbox/badge ─────────────────────────────────────────────
// Conta não-lidas do tenant autorizado. Requer token de colaborador.
// empresaId vem de req.tenantContext — isolamento por tenant da sessão.
inboxRouter.get("/telegram-inbox/badge", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const empresaId = req.messageEmpresaId!;

  const result = await obterBadge({ empresaId }, {
    contarNaoLidas: async (eid) => {
      // Filtra direcao='entrada': mensagens de saída (CEO→paciente) são
      // inseridas com lida_em=NOW() e nunca devem inflar o badge.
      const [row] = await db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(telegramInboxTable)
        .where(and(
          isNull(telegramInboxTable.lidaEm),
          eq(telegramInboxTable.empresaId, eid),
          sql`${telegramInboxTable.direcao} = 'entrada'`,
        ));
      return row?.total ?? 0;
    },
  });

  res.json({ naoLidas: result.naoLidas });
});

// ── 2) GET /cockpit/:clientId/telegram-inbox ──────────────────────────────────
// Lista mensagens Telegram do paciente. Requer token de colaborador.
// Tenant derivado de req.tenantContext — nunca do clientId do chamador.
inboxRouter.get("/cockpit/:clientId/telegram-inbox", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isFinite(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }

  const empresaId = req.messageEmpresaId!;

  const tamanhoParam = req.query["quantidade"] ?? "20";
  const direcao = req.query["direcao"] ?? "todas";
  if (typeof tamanhoParam !== "string" || !["20", "50", "100"].includes(tamanhoParam)
    || typeof direcao !== "string" || !["todas", "entrada", "saida"].includes(direcao)) {
    res.status(400).json({ error: "Use quantidade 20, 50 ou 100 e direção todas, entrada ou saida." });
    return;
  }
  const tamanhoPagina = Number(tamanhoParam);

  const paginaParam = req.query["pagina"];
  const paginaRaw = typeof paginaParam === "string" && /^\d+$/.test(paginaParam)
    ? Number(paginaParam) : 1;
  // PostgreSQL OFFSET recebe inteiro de 64 bits; impedir valores inseguros
  // também limita consultas acidentalmente excessivas.
  const pagina = Number.isSafeInteger(paginaRaw) && paginaRaw >= 1
    && paginaRaw <= Math.floor(Number.MAX_SAFE_INTEGER / tamanhoPagina) ? paginaRaw : 1;

  const result = await listarInbox(
    { clienteId, empresaId, marcarLidas: req.query["marcar_lidas"] === "1", pagina, tamanhoPagina },
    {
      findClienteNoTenant: async (cid, eid) => {
        const [row] = await db
          .select({ id: clientsTable.id })
          .from(clientsTable)
          .where(and(eq(clientsTable.id, cid), eq(clientsTable.empresaId, eid)))
          .limit(1);
        return row ?? null;
      },
      listMensagens: async (cid, eid, limit, offset): Promise<MensagemInbox[]> => {
        return db
          .select()
          .from(telegramInboxTable)
          .where(and(
            eq(telegramInboxTable.clienteId, cid),
            eq(telegramInboxTable.empresaId, eid),
            direcao === "todas" ? undefined : eq(telegramInboxTable.direcao, direcao),
          ))
          .orderBy(desc(telegramInboxTable.recebidaEm), desc(telegramInboxTable.id))
          .limit(limit)
          .offset(offset);
      },
      marcarComoLidas: async (cid, eid) => {
        await db
          .update(telegramInboxTable)
          .set({ lidaEm: new Date() })
          .where(and(
            eq(telegramInboxTable.clienteId, cid),
            eq(telegramInboxTable.empresaId, eid),
            isNull(telegramInboxTable.lidaEm),
          ));
      },
    },
  );

  if (result.kind === "nao_encontrado") {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  // Retira o campo `kind` — o cliente recebe apenas { mensagens, naoLidas }
  const { kind: _kind, ...payload } = result;
  res.json(payload);
});

// ── 3) POST /cockpit/:clientId/telegram-inbox/marcar-lidas ───────────────────
// Marca não-lidas do paciente como lidas. Requer token de colaborador.
// UPDATE é tenant-scoped: empresaId da sessão, nunca do payload.
inboxRouter.post("/cockpit/:clientId/telegram-inbox/marcar-lidas", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isFinite(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }

  const empresaId = req.messageEmpresaId!;

  const result = await marcarLidas(
    { clienteId, empresaId },
    {
      findClienteNoTenant: async (cid, eid) => {
        const [row] = await db
          .select({ id: clientsTable.id })
          .from(clientsTable)
          .where(and(eq(clientsTable.id, cid), eq(clientsTable.empresaId, eid)))
          .limit(1);
        return row ?? null;
      },
      updateLidas: async (cid, eid) => {
        const resultado = await db
          .update(telegramInboxTable)
          .set({ lidaEm: new Date() })
          .where(and(
            eq(telegramInboxTable.clienteId, cid),
            eq(telegramInboxTable.empresaId, eid),
            isNull(telegramInboxTable.lidaEm),
          ));
        return (resultado as unknown as { rowCount: number }).rowCount ?? 0;
      },
    },
  );

  if (result.kind === "nao_encontrado") {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  res.json({ ok: true, marcadas: result.marcadas });
});
