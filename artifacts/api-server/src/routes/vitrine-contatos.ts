/**
 * PAXTER — Vitrine Contatos Router
 *
 * Espelho no Railway do formulário "Quero contratar" da homepage do site
 * institucional Parxis (padaxor.lovable.app). O Dr. Lovable envia para o
 * Supabase E para esta rota ao mesmo tempo (Opção B — duplo envio).
 *
 * Campos do formulário da homepage:
 *   nome, email, telefone (opcional), clinica, especialidade,
 *   volume_protocolos (opcional), necessidade
 *
 * Diferença do vitrine-leads: este formulário é de médicos/clínicas que
 * querem CONTRATAR — não de pacientes que querem ver a demo. É o lead
 * quente: a pessoa já leu o site e quer falar com o CEO.
 *
 * POST /vitrine-contatos  — público (mesma whitelist do basicAuth)
 * GET  /vitrine-contatos  — requireCollaborator (painel PADCOM)
 * PATCH /vitrine-contatos/:id/contato — requireCollaborator
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireCollaborator } from "./collaborator.js";

const router: IRouter = Router();

// ─── Init: criar tabela se não existir ───────────────────────────────────────

let tablesReady = false;
async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vitrine_contatos (
      id                SERIAL PRIMARY KEY,
      nome              TEXT NOT NULL,
      email             TEXT NOT NULL,
      telefone          TEXT,
      clinica           TEXT NOT NULL,
      especialidade     TEXT NOT NULL,
      volume_protocolos TEXT,
      necessidade       TEXT NOT NULL,
      user_agent        TEXT,
      utm               JSONB,
      source            TEXT,
      contatado         BOOLEAN NOT NULL DEFAULT false,
      contatado_em      TIMESTAMPTZ,
      observacao        TEXT,
      criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS vitrine_contatos_email_idx
      ON vitrine_contatos (email)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS vitrine_contatos_criado_em_idx
      ON vitrine_contatos (criado_em DESC)
  `);
  tablesReady = true;
}

// ─── Validação ────────────────────────────────────────────────────────────────

function strLimpo(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function emailValido(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
}

function nomeValido(n: string): boolean {
  return n.length >= 2 && n.length <= 120;
}

function clinicaValida(c: string): boolean {
  return c.length >= 2 && c.length <= 200;
}

function especialidadeValida(e: string): boolean {
  return e.length >= 2 && e.length <= 120;
}

function necessidadeValida(n: string): boolean {
  return n.length >= 5 && n.length <= 2000;
}

const UTM_CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
function utmSanitizado(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const k of UTM_CHAVES) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim().length > 0) out[k] = v.trim().slice(0, 200);
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ─── Rate limit simples em memória (por IP) ──────────────────────────────────

const rlHits = new Map<string, { count: number; resetAt: number }>();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 5; // menor que vitrine-leads — formulário mais longo, menos reenvios esperados

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = rlHits.get(ip);
  if (!h || now > h.resetAt) {
    rlHits.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    if (rlHits.size > 5000) {
      for (const [k, v] of rlHits) if (now > v.resetAt) rlHits.delete(k);
    }
    return false;
  }
  h.count += 1;
  return h.count > RL_MAX;
}

// ─── POST /vitrine-contatos — captação pública ────────────────────────────────

router.post("/vitrine-contatos", async (req: Request, res: Response): Promise<void> => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "desconhecido";
    if (rateLimited(ip)) {
      res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto e tente de novo." });
      return;
    }

    await ensureTables();

    const nome         = strLimpo(req.body?.nome, 120);
    const email        = strLimpo(req.body?.email, 200).toLowerCase();
    const telefone     = strLimpo(req.body?.telefone, 20) || null;
    const clinica      = strLimpo(req.body?.clinica, 200);
    const especialidade = strLimpo(req.body?.especialidade, 120);
    const volume       = strLimpo(req.body?.volume_protocolos, 100) || null;
    const necessidade  = strLimpo(req.body?.necessidade, 2000);
    const source       = strLimpo(req.body?.source, 200) || null;
    const utm          = utmSanitizado(req.body?.utm);
    const userAgent    = (req.get("user-agent") || "").slice(0, 300) || null;

    if (!nomeValido(nome)) {
      res.status(400).json({ error: "Preencha o nome completo (mínimo 2 caracteres)." });
      return;
    }
    if (!emailValido(email)) {
      res.status(400).json({ error: "E-mail inválido." });
      return;
    }
    if (!clinicaValida(clinica)) {
      res.status(400).json({ error: "Informe o nome da clínica." });
      return;
    }
    if (!especialidadeValida(especialidade)) {
      res.status(400).json({ error: "Informe a especialidade." });
      return;
    }
    if (!necessidadeValida(necessidade)) {
      res.status(400).json({ error: "Descreva a sua necessidade (mínimo 5 caracteres)." });
      return;
    }

    await db.execute(sql`
      INSERT INTO vitrine_contatos
        (nome, email, telefone, clinica, especialidade, volume_protocolos,
         necessidade, user_agent, utm, source)
      VALUES
        (${nome}, ${email}, ${telefone}, ${clinica}, ${especialidade}, ${volume},
         ${necessidade}, ${userAgent},
         ${utm ? JSON.stringify(utm) : null}::jsonb,
         ${source})
    `);

    req.log.info({ email, clinica, especialidade, source }, "vitrine_contato_captado");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "vitrine_contato_erro");
    res.status(500).json({ error: "Não foi possível registrar o contato. Tente de novo." });
  }
});

// ─── GET /vitrine-contatos — painel de verificação (colaborador) ──────────────

router.get("/vitrine-contatos", requireCollaborator, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const contatado = req.query.contatado === "true" ? true
      : req.query.contatado === "false" ? false
      : null;

    const rows = contatado !== null
      ? await db.execute(sql`
          SELECT * FROM vitrine_contatos
          WHERE contatado = ${contatado}
          ORDER BY criado_em DESC LIMIT 500
        `)
      : await db.execute(sql`
          SELECT * FROM vitrine_contatos
          ORDER BY criado_em DESC LIMIT 500
        `);

    res.json({ contatos: rows.rows });
  } catch (err) {
    logger.error({ err }, "vitrine_contatos_listar_erro");
    res.status(500).json({ error: "Falha ao listar contatos." });
  }
});

// ─── PATCH /vitrine-contatos/:id/contato — marcar contatado (colaborador) ────

router.patch(
  "/vitrine-contatos/:id/contato",
  requireCollaborator,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await ensureTables();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Identificador inválido." });
        return;
      }
      const contatado = req.body?.contatado !== false;
      const observacao = typeof req.body?.observacao === "string"
        ? req.body.observacao.slice(0, 1000)
        : null;

      const r = await db.execute(sql`
        UPDATE vitrine_contatos
        SET contatado    = ${contatado},
            contatado_em = CASE WHEN ${contatado} THEN NOW() ELSE NULL END,
            observacao   = COALESCE(${observacao}, observacao)
        WHERE id = ${id}
        RETURNING id
      `);

      if (r.rows.length === 0) {
        res.status(404).json({ error: "Contato não encontrado." });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "vitrine_contato_marcar_erro");
      res.status(500).json({ error: "Falha ao atualizar o contato." });
    }
  },
);

export default router;
