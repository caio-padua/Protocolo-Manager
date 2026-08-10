/**
 * /api/onboarding — Envio do Guia Digital ao paciente.
 *
 * POST /api/onboarding/enviar-guia
 *   Body: { clientId: number, canais: ("WHATSAPP"|"TELEGRAM")[], guiaUrl: string }
 *   Sends the guide link via the requested channels.
 */

import { Router } from "express";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendWhatsapp } from "../lib/whatsapp.js";
import { sendTelegram } from "../lib/telegram.js";
import { z } from "zod";

export const onboardingRouter = Router();

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
