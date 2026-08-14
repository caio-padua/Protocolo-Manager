/**
 * /api/onboarding — Envio do Guia Digital ao paciente.
 *
 * POST /api/onboarding/enviar-guia
 *   Body: { clientId: number, canais: ("WHATSAPP"|"TELEGRAM")[], guiaUrl: string }
 *   Sends the guide link via the requested channels.
 *
 * Quota diária (dia calendário BRT): máximo QUOTA_DIARIA envios por (clientId, canal).
 * Implementada com tabela onboarding_quota (contador atômico via UPSERT condicional),
 * que é genuinamente concorrente-safe: INSERT ... ON CONFLICT DO UPDATE SET enviados+1
 * WHERE enviados < QUOTA é avaliado atomicamente pelo Postgres — sem race condition.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db, clientsTable } from "@workspace/db";
import { eq, sql as sqlRaw } from "drizzle-orm";
import { sendWhatsapp } from "../lib/whatsapp.js";
import { sendTelegram } from "../lib/telegram.js";
import { z } from "zod";

export const onboardingRouter = Router();

// Router público — POST /evento pode ser chamado pelo browser do paciente sem auth
export const onboardingPublicRouter = Router();

// ── Boot migration ────────────────────────────────────────────────────────────
(async () => {
  try {
    await db.execute(sqlRaw`
      CREATE TABLE IF NOT EXISTS onboarding_eventos (
        id         SERIAL PRIMARY KEY,
        empresa_id INT,
        device     TEXT,
        secao      TEXT,
        ts         TIMESTAMPTZ DEFAULT now()
      )
    `);
    // area_url: URL pública da Área do Paciente por empresa
    await db.execute(sqlRaw`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS area_url TEXT`);
    // Índice único parcial: NULL e "" não colidem — slug opcional permanece livre
    await db.execute(sqlRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS empresas_slug_unique
      ON empresas (slug)
      WHERE slug IS NOT NULL AND slug <> ''
    `);
    // onboarding_quota: contador diário de envios do Guia por (client_id, canal, dia_brt).
    // PK = (client_id, canal, dia_brt) garante 1 linha por combinação/dia.
    // UPSERT condicional faz check+increment atomicamente → sem race condition.
    await db.execute(sqlRaw`
      CREATE TABLE IF NOT EXISTS onboarding_quota (
        client_id  INT  NOT NULL,
        canal      TEXT NOT NULL,
        dia_brt    DATE NOT NULL,
        enviados   INT  NOT NULL DEFAULT 0,
        PRIMARY KEY (client_id, canal, dia_brt)
      )
    `);
    // Mantém onboarding_envios para histórico detalhado (rollback de falhas)
    await db.execute(sqlRaw`
      CREATE TABLE IF NOT EXISTS onboarding_envios (
        id          SERIAL PRIMARY KEY,
        client_id   INT  NOT NULL,
        canal       TEXT NOT NULL,
        enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sqlRaw`
      CREATE INDEX IF NOT EXISTS idx_onboarding_envios_client_canal
        ON onboarding_envios (client_id, canal, enviado_em)
    `);
  } catch (e) {
    console.warn("[onboarding] migration warning:", e);
  }
})();

// ── Seções canônicas ──────────────────────────────────────────────────────────
const SECOES_VALIDAS = ["iphone", "android", "computador", "login", "telegram"] as const;
type SecaoCanonica = typeof SECOES_VALIDAS[number];

// ── Rate limit em memória ─────────────────────────────────────────────────────
// Chave: `${clienteId}:${canal}` | Valor: timestamp (ms) do último envio bem-sucedido
const COOLDOWN_MS = 60_000; // 60 segundos
const sendCooldowns = new Map<string, number>();

// Quota diária (fixo no código; configurável por painel está fora do escopo)
const QUOTA_DIARIA = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Tenta reservar 1 slot do dia BRT para (clientId, canal).
 *
 * Retorna { ok: true, diaBrt } quando a reserva foi feita (quota disponível).
 * Retorna { ok: false, diaBrt: null } quando a quota diária já foi atingida.
 *
 * O `diaBrt` retornado é o dia exato gravado na linha — deve ser passado
 * para liberarReservaQuota() para garantir que o rollback decrementa o mesmo
 * dia, mesmo que o envio falhe após a virada da meia-noite BRT.
 *
 * O UPSERT condicional é avaliado atomicamente pelo Postgres:
 *   • INSERT novo: enviados=1 (first send of the day)
 *   • UPDATE se enviados < QUOTA: increment → RETURNING retorna a linha
 *   • Faz nada se enviados >= QUOTA: RETURNING vazio → { ok: false }
 * Sem race condition entre contagem e inserção.
 */
async function tentarReservarQuota(
  clientId: number,
  canal: string,
): Promise<{ ok: true; diaBrt: string } | { ok: false; diaBrt: null }> {
  const result = await db.execute(sqlRaw`
    INSERT INTO onboarding_quota (client_id, canal, dia_brt, enviados)
    VALUES (
      ${clientId},
      ${canal},
      (NOW() AT TIME ZONE 'America/Sao_Paulo')::date,
      1
    )
    ON CONFLICT (client_id, canal, dia_brt)
    DO UPDATE SET enviados = onboarding_quota.enviados + 1
    WHERE onboarding_quota.enviados < ${QUOTA_DIARIA}
    RETURNING dia_brt::text AS dia_brt
  `);
  if (!Array.isArray(result.rows) || result.rows.length === 0) {
    return { ok: false, diaBrt: null };
  }
  const diaBrt = (result.rows[0] as { dia_brt: string }).dia_brt;
  return { ok: true, diaBrt };
}

/**
 * Decrementa o contador do dia exato em que a reserva foi feita.
 *
 * IMPORTANTE: recebe `diaBrt` do caller (não recalcula NOW()) para que
 * rollbacks após a virada de meia-noite BRT não decrementem o dia errado.
 */
async function liberarReservaQuota(clientId: number, canal: string, diaBrt: string): Promise<void> {
  try {
    await db.execute(sqlRaw`
      UPDATE onboarding_quota
         SET enviados = GREATEST(0, enviados - 1)
       WHERE client_id = ${clientId}
         AND canal     = ${canal}
         AND dia_brt   = ${diaBrt}::date
    `);
  } catch (e) {
    console.warn("[onboarding] falha ao liberar reserva de quota:", canal, e);
  }
}

// ── POST /api/onboarding/enviar-guia ─────────────────────────────────────────
const bodySchema = z.object({
  clientId: z.number().int().positive(),
  canais:   z.array(z.enum(["WHATSAPP", "TELEGRAM"])).min(1),
  guiaUrl:  z.string().url(),
});

onboardingRouter.post("/enviar-guia", async (req: Request, res: Response): Promise<void> => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Parâmetros inválidos", details: parsed.error.flatten() });
    return;
  }

  const { clientId, guiaUrl } = parsed.data;
  // Deduplica canais para impedir bypass com canal repetido no payload
  const canais = [...new Set(parsed.data.canais)];

  // ── Rate limit por (clientId, canal) — cooldown de 60s ───────────────────
  const agora = Date.now();
  const canalBloqueado = canais.find((canal) => {
    const key = `${clientId}:${canal}`;
    return agora - (sendCooldowns.get(key) ?? 0) < COOLDOWN_MS;
  });
  if (canalBloqueado) {
    res.status(429).json({
      ok: false,
      error: "Aguarde 60 segundos antes de reenviar.",
      motivo: "cooldown",
      canal: canalBloqueado,
    });
    return;
  }

  // ── Valida o cliente ANTES de qualquer reserva de quota ──────────────────
  // Garante que clientId inválido nunca gera linhas em onboarding_quota.
  const [cliente] = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      phone: clientsTable.phone,
      telegramChatId: clientsTable.telegramChatId,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!cliente) {
    res.status(404).json({ ok: false, error: "Paciente não encontrado" });
    return;
  }

  // ── Quota diária: reserva atômica por canal ───────────────────────────────
  // tentarReservarQuota usa UPSERT condicional — check+increment em 1 instrução.
  // Retorna o dia_brt exato gravado na reserva; passamos esse valor para
  // liberarReservaQuota para que rollbacks após meia-noite não decrementem o dia errado.
  const canaisReservados: { canal: string; diaBrt: string }[] = [];
  for (const canal of canais) {
    const reserva = await tentarReservarQuota(clientId, canal);
    if (!reserva.ok) {
      // Quota esgotada — reverte reservas dos canais já reservados neste request
      for (const r of canaisReservados) {
        await liberarReservaQuota(clientId, r.canal, r.diaBrt);
      }
      res.status(429).json({
        ok: false,
        error: "Limite diário atingido para este canal.",
        motivo: "limite_diario",
        canal,
      });
      return;
    }
    canaisReservados.push({ canal, diaBrt: reserva.diaBrt });
  }

  // Registrar cooldown após reservas confirmadas
  for (const canal of canais) {
    sendCooldowns.set(`${clientId}:${canal}`, agora);
  }

  const primeiroNome = cliente.name.split(" ")[0];
  const mensagem = `🏥 *Instituto Pádua — Seu Guia Digital*

Olá, ${primeiroNome}! 👋

Preparamos um passo a passo especial para você instalar o aplicativo no celular e aprender a usar o Telegram.

É bem simples! Clique no link abaixo e siga as instruções na tela:

👉 ${guiaUrl}

Qualquer dúvida, estamos à disposição! 😊`;

  const resultados: { canal: string; ok: boolean; mensagem: string }[] = [];

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (canais.includes("WHATSAPP")) {
    if (!cliente.phone) {
      resultados.push({ canal: "WHATSAPP", ok: false, mensagem: "Paciente sem telefone cadastrado." });
    } else {
      try {
        const r = await sendWhatsapp(cliente.phone, mensagem);
        resultados.push({
          canal: "WHATSAPP",
          ok: r.sent,
          mensagem: r.sent ? "Mensagem enviada com sucesso." : (r.error ?? "Erro ao enviar."),
        });
      } catch (err: unknown) {
        resultados.push({ canal: "WHATSAPP", ok: false, mensagem: String(err instanceof Error ? err.message : err) });
      }
    }
  }

  // ── Telegram ──────────────────────────────────────────────────────────────
  if (canais.includes("TELEGRAM")) {
    const chatId = (cliente as { telegramChatId?: string | null }).telegramChatId;
    if (!chatId) {
      resultados.push({ canal: "TELEGRAM", ok: false, mensagem: "Paciente não tem Telegram vinculado. Use WhatsApp primeiro." });
    } else {
      try {
        const msgTelegram = mensagem.replace(/\*/g, "");
        const r = await sendTelegram(chatId, msgTelegram);
        resultados.push({
          canal: "TELEGRAM",
          ok: r.sent,
          mensagem: r.sent ? "Mensagem enviada com sucesso." : (r.error ?? "Erro ao enviar."),
        });
      } catch (err: unknown) {
        resultados.push({ canal: "TELEGRAM", ok: false, mensagem: String(err instanceof Error ? err.message : err) });
      }
    }
  }

  // ── Libera quota de canais que falharam na entrega ───────────────────────
  // Falhas de API não devem consumir quota permanente do paciente.
  // Usa o diaBrt gravado na reserva (não recalcula NOW()) para evitar
  // decrementar o dia errado se a falha ocorrer após a virada de meia-noite BRT.
  for (const r of resultados) {
    if (!r.ok) {
      const reserva = canaisReservados.find((c) => c.canal === r.canal);
      if (reserva) {
        await liberarReservaQuota(clientId, r.canal, reserva.diaBrt);
      }
    }
  }

  const algumOk = resultados.some((r) => r.ok);
  res.json({ ok: algumOk, resultados });
});

// ── POST /api/onboarding/evento ───────────────────────────────────────────────
const eventoSchema = z.object({
  empresa_id: z.number().int().positive().default(5),
  device:     z.string().max(50),
  secao:      z.enum(SECOES_VALIDAS),
});

onboardingPublicRouter.post("/evento", async (req: Request, res: Response): Promise<void> => {
  const parsed = eventoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Payload inválido" });
    return;
  }
  const { empresa_id, device, secao } = parsed.data;
  try {
    await db.execute(
      sqlRaw`INSERT INTO onboarding_eventos (empresa_id, device, secao) VALUES (${empresa_id}, ${device}, ${secao})`
    );
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// ── GET /api/onboarding/config ───────────────────────────────────────────────
// Rota PÚBLICA — sem auth. Retorna config de UI por slug de empresa.
onboardingPublicRouter.get("/config", async (req: Request, res: Response): Promise<void> => {
  const tenant = String(req.query.tenant ?? "").trim().toLowerCase();
  if (!tenant) {
    res.status(400).json({ error: "tenant obrigatório" });
    return;
  }
  try {
    const result = await db.execute(
      sqlRaw`SELECT nome, telegram_bot_username, area_url FROM empresas WHERE slug = ${tenant} LIMIT 1`
    );
    const row = result.rows[0] as
      | { nome: string; telegram_bot_username: string | null; area_url: string | null }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "tenant não encontrado" });
      return;
    }
    res.json({
      clinicaNome: row.nome,
      botHandle:   row.telegram_bot_username ?? null,
      areaUrl:     row.area_url ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/onboarding/minha-config ─────────────────────────────────────────
onboardingRouter.get("/minha-config", async (req: Request, res: Response): Promise<void> => {
  const empresaId = req.tenantContext?.empresaId ?? 5;
  try {
    const result = await db.execute(
      sqlRaw`SELECT nome, slug, telegram_bot_username, area_url FROM empresas WHERE id = ${empresaId} LIMIT 1`
    );
    const row = result.rows[0] as
      | { nome: string; slug: string | null; telegram_bot_username: string | null; area_url: string | null }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
    res.json({
      clinicaNome: row.nome,
      slug:        row.slug ?? null,
      botHandle:   row.telegram_bot_username ?? null,
      areaUrl:     row.area_url ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/onboarding/stats ─────────────────────────────────────────────────
onboardingRouter.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [totalRow, porDevice, porSecao] = await Promise.all([
      db.execute(
        sqlRaw`SELECT COUNT(*)::int AS total FROM onboarding_eventos WHERE ts > NOW() - INTERVAL '30 days'`
      ),
      db.execute(
        sqlRaw`SELECT device, COUNT(*)::int AS total FROM onboarding_eventos WHERE ts > NOW() - INTERVAL '30 days' GROUP BY device ORDER BY total DESC`
      ),
      db.execute(
        sqlRaw`SELECT secao, COUNT(*)::int AS total FROM onboarding_eventos WHERE ts > NOW() - INTERVAL '30 days' GROUP BY secao ORDER BY total DESC`
      ),
    ]);

    const total = (totalRow.rows?.[0] as { total: number } | undefined)?.total ?? 0;

    res.json({
      ok: true,
      total,
      porDevice: (porDevice.rows ?? []) as { device: string; total: number }[],
      porSecao:  (porSecao.rows  ?? []) as { secao:  string; total: number }[],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});
