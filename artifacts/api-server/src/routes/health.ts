/**
 * /api/health — Saúde completa do sistema PAXTER
 *
 * GET /api/health  — status resumido (público, sem auth)
 * GET /api/healthz — compatibilidade legada (mantido)
 *
 * Verifica: banco, Google Drive, Gmail, Calendar, Twilio, Asaas, ZapSign, GitHub PAT
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

/**
 * Verifica se o GITHUB_PAT (Personal Access Token — chave pessoal do GitHub)
 * ainda é válido chamando GET https://api.github.com/user.
 *
 * Retorna também a data de expiração quando o header
 * `github-authentication-token-expiration` estiver presente na resposta.
 */
export interface GitHubPatStatus {
  status: StatusVal | "expirado_em_breve";
  /** Data de expiração em ISO-8601 (quando disponível na resposta do GitHub) */
  expiraEm: string | null;
  /** Login GitHub associado ao token (quando válido) */
  login: string | null;
}

async function checkGitHubPat(): Promise<GitHubPatStatus> {
  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return { status: "nao_configurado", expiraEm: null, login: null };
  }
  try {
    const r = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "paxter-health-check",
      },
    });

    if (!r.ok) {
      return { status: "erro", expiraEm: null, login: null };
    }

    // O GitHub retorna este header nos tokens com data de vencimento.
    // Formato: "2026-12-31 23:59:59 UTC"
    const expHeader = r.headers.get("github-authentication-token-expiration");
    let expiraEm: string | null = null;
    if (expHeader) {
      // Converte para ISO-8601 (aceito universalmente)
      const parsed = new Date(expHeader.replace(" UTC", "Z"));
      expiraEm = isNaN(parsed.getTime()) ? expHeader : parsed.toISOString();
    }

    const body = (await r.json()) as { login?: string };
    const login = body.login ?? null;

    // Alerta antecipado: se faltar menos de sete dias para expirar
    if (expiraEm) {
      const diasRestantes =
        (new Date(expiraEm).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (diasRestantes < 7) {
        return { status: "expirado_em_breve", expiraEm, login };
      }
    }

    return { status: "conectado", expiraEm, login };
  } catch {
    return { status: "erro", expiraEm: null, login: null };
  }
}

// ── GET /api/health ──────────────────────────────────────────────────────────

router.get("/health", async (_req, res) => {
  const inicio = Date.now();

  const [banco, drive, gmail, calendar, twilio, asaas, zapsign, githubPat] =
    await Promise.allSettled([
      checkDb(),
      checkDrive(),
      checkGmail(),
      checkCalendar(),
      checkTwilio(),
      checkAsaas(),
      checkZapSign(),
      checkGitHubPat(),
    ]).then((results) =>
      results.map((r) =>
        r.status === "fulfilled" ? r.value : ("erro" as StatusVal | GitHubPatStatus),
      ),
    );

  const githubPatResult = githubPat as GitHubPatStatus;
  const githubPatStatus = githubPatResult?.status ?? "erro";

  const integracoes = {
    drive,
    gmail,
    calendar,
    twilio,
    asaas,
    zapsign,
    github_pat: githubPatStatus,
  };

  // Considerar "expirado_em_breve" como degradado (não erro crítico)
  const integracoesVals = [
    ...(Object.values({ drive, gmail, calendar, twilio, asaas, zapsign }) as StatusVal[]),
    githubPatStatus as string,
  ];
  const temErro = integracoesVals.some((v) => v === "erro");
  const temFaltando = integracoesVals.some((v) => v === "nao_configurado");
  const temExpirandoEmBreve = githubPatStatus === "expirado_em_breve";

  const statusGeral =
    banco === "erro"
      ? "critico"
      : temErro
        ? "degradado"
        : temExpirandoEmBreve
          ? "degradado"
          : temFaltando
            ? "parcial"
            : "ok";

  res.status(statusGeral === "critico" ? 503 : 200).json({
    status: statusGeral,
    banco,
    integracoes,
    github_pat_detalhe: {
      status: githubPatStatus,
      expira_em: githubPatResult?.expiraEm ?? null,
      login: githubPatResult?.login ?? null,
    },
    latencia_ms: Date.now() - inicio,
    versao: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ── GET /api/healthz — legado, mantido ──────────────────────────────────────

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// ── GET /api/brt — diagnóstico público do fuso de Brasília ─────────────────
// Sem autenticação — serve para confirmar que o servidor está usando BRT certo.
import { brtDateStr, brtISODate, brtDisplayDate, brtDateTime } from "../lib/brt";

router.get("/brt", (_req, res) => {
  const utcNow = new Date();
  res.json({
    utc: utcNow.toISOString(),
    brt_arquivo: brtDateStr(),
    brt_banco: brtISODate(),
    brt_tela: brtDisplayDate(),
    brt_log: brtDateTime(),
    offset_horas: -3,
    fuso: "America/Sao_Paulo",
  });
});

export default router;
