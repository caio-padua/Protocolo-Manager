/**
 * /api/onboarding — Envio do Guia Digital ao paciente.
 *
 * POST /api/onboarding/enviar-guia
 *   Body: { clientId: number, canais: ("WHATSAPP"|"TELEGRAM")[], guiaUrl: string }
 *   Sends the guide link via the requested channels.
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

// ── Boot migration — tabela de eventos e coluna area_url nas empresas ────────
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
  } catch (e) {
    // não bloqueia o boot
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

const bodySchema = z.object({
  clientId: z.number().int().positive(),
  canais:   z.array(z.enum(["WHATSAPP", "TELEGRAM"])).min(1),
  guiaUrl:  z.string().url(),
});

onboardingRouter.post("/enviar-guia", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Parâmetros inválidos", details: parsed.error.flatten() });
  }

  const { clientId, canais, guiaUrl } = parsed.data;

  // ── Rate limit por (clienteId, canal) ────────────────────────────────────
  const agora = Date.now();
  const canalBloqueado = canais.find((canal) => {
    const key = `${clientId}:${canal}`;
    return agora - (sendCooldowns.get(key) ?? 0) < COOLDOWN_MS;
  });
  if (canalBloqueado) {
    return res.status(429).json({ ok: false, error: "Aguarde 60 segundos antes de reenviar." });
  }

  // Registrar timestamp ANTES de enviar (evita retry race condition)
  for (const canal of canais) {
    sendCooldowns.set(`${clientId}:${canal}`, agora);
  }

  // Busca o cliente
  const [cliente] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone, telegramChatId: clientsTable.telegramChatId })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!cliente) {
    return res.status(404).json({ ok: false, error: "Paciente não encontrado" });
  }

  const primeiroNome = cliente.name.split(" ")[0];

  // Mensagem do guia
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
        // Versão texto simples para Telegram (sem markdown *bold*)
        const msgTelegram = mensagem.replace(/\*/g, "");
        await sendTelegram(chatId, msgTelegram);
        resultados.push({ canal: "TELEGRAM", ok: true, mensagem: "Mensagem enviada com sucesso." });
      } catch (err: unknown) {
        resultados.push({ canal: "TELEGRAM", ok: false, mensagem: String(err instanceof Error ? err.message : err) });
      }
    }
  }

  const algumOk = resultados.some((r) => r.ok);
  res.json({ ok: algumOk, resultados });
});

// ── POST /api/onboarding/evento ───────────────────────────────────────────────
// Rota PÚBLICA — registrada em onboardingPublicRouter (antes do collaboratorGuard).
// Chamada pelo browser do paciente sem autenticação.
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
    // falha silenciosa — não impedir o paciente
    res.json({ ok: false });
  }
});

// ── GET /api/onboarding/config ───────────────────────────────────────────────
// Rota PÚBLICA — sem auth. Retorna config de UI por slug de empresa.
// Registrada em onboardingPublicRouter.
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
// Rota PROTEGIDA — CEO usa para saber o slug da própria empresa ao gerar links.
// Registrada em onboardingRouter (antes do driveWatcherRouter).
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
// Agrega os últimos 30 dias por device e por seção.
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
