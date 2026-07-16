/**
 * /api/health — Saúde completa do sistema PAXTER
 *
 * GET /api/health  — status resumido (público, sem auth)
 * GET /api/healthz — compatibilidade legada (mantido)
 *
 * Verifica: banco, Google Drive, Gmail, Calendar, Twilio, Asaas, ZapSign
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isDriveConnected } from "../lib/google-drive";
import { isGmailConnected } from "../lib/google-gmail";
import { verifyClinicAccount } from "../lib/google-calendar";
import { getSecret } from "../lib/secure-settings";

const router: IRouter = Router();

type StatusVal = "conectado" | "erro" | "nao_configurado";

async function checkDb(): Promise<StatusVal> {
  try {
    await db.execute(sql`SELECT 1`);
    return "conectado";
  } catch {
    return "erro";
  }
}

async function checkDrive(): Promise<StatusVal> {
  try {
    const ok = await isDriveConnected();
    return ok ? "conectado" : "nao_configurado";
  } catch {
    return "erro";
  }
}

async function checkGmail(): Promise<StatusVal> {
  try {
    const ok = await isGmailConnected();
    return ok ? "conectado" : "nao_configurado";
  } catch {
    return "erro";
  }
}

async function checkCalendar(): Promise<StatusVal> {
  try {
    const r = await verifyClinicAccount();
    return r.ok ? "conectado" : "nao_configurado";
  } catch {
    return "erro";
  }
}

async function checkTwilio(): Promise<StatusVal> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return "nao_configurado";
  try {
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
      { headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") } },
    );
    return r.ok ? "conectado" : "erro";
  } catch {
    return "erro";
  }
}

async function checkAsaas(): Promise<StatusVal> {
  try {
    const key = await getSecret("asaas.apiKey");
    if (!key) return "nao_configurado";
    const r = await fetch("https://api.asaas.com/v3/finance/balance", {
      headers: { access_token: key },
    });
    return r.ok ? "conectado" : "erro";
  } catch {
    return "erro";
  }
}

async function checkZapSign(): Promise<StatusVal> {
  try {
    const token = await getSecret("zapsign.apiToken");
    if (!token) return "nao_configurado";
    return "conectado";
  } catch {
    return "nao_configurado";
  }
}

// ── GET /api/health ──────────────────────────────────────────────────────────

router.get("/health", async (_req, res) => {
  const inicio = Date.now();

  const [banco, drive, gmail, calendar, twilio, asaas, zapsign] =
    await Promise.allSettled([
      checkDb(),
      checkDrive(),
      checkGmail(),
      checkCalendar(),
      checkTwilio(),
      checkAsaas(),
      checkZapSign(),
    ]).then((results) =>
      results.map((r) =>
        r.status === "fulfilled" ? r.value : ("erro" as StatusVal),
      ),
    );

  const integracoes = { drive, gmail, calendar, twilio, asaas, zapsign };
  const temErro = Object.values(integracoes).some((v) => v === "erro");
  const temFaltando = Object.values(integracoes).some(
    (v) => v === "nao_configurado",
  );

  const statusGeral =
    banco === "erro"
      ? "critico"
      : temErro
        ? "degradado"
        : temFaltando
          ? "parcial"
          : "ok";

  res.status(statusGeral === "critico" ? 503 : 200).json({
    status: statusGeral,
    banco,
    integracoes,
    latencia_ms: Date.now() - inicio,
    versao: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ── GET /api/healthz — legado, mantido ──────────────────────────────────────

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
