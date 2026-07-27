/**
 * PAXTER — Vitrine Leads Router
 *
 * Captação de futuros clientes nas vitrines públicas de demonstração:
 *   - Paciente (vitrine /vitrine-demo/):    CPF + data de nascimento + telefone
 *   - Dono de clínica (/vitrine-demo/clinica): CNPJ + CPF do interessado +
 *     data de nascimento + telefone
 *
 * O "login" da vitrine É a captação: os dados liberam a tela e viram lead
 * para contato comercial posterior. Tabela via raw SQL (CREATE TABLE IF NOT
 * EXISTS), padrão PADTEAM. POST é público (whitelist no basicAuth); leitura
 * e alteração exigem requireCollaborator (padrão /api/asaas).
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
    CREATE TABLE IF NOT EXISTS vitrine_leads (
      id              SERIAL PRIMARY KEY,
      tipo            TEXT NOT NULL CHECK (tipo IN ('paciente','clinica')),
      cpf             TEXT NOT NULL,
      cnpj            TEXT,
      data_nascimento TEXT NOT NULL,
      telefone        TEXT NOT NULL,
      rota_origem     TEXT,
      user_agent      TEXT,
      acessos         INTEGER NOT NULL DEFAULT 1,
      ultimo_acesso   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      contatado       BOOLEAN NOT NULL DEFAULT false,
      contatado_em    TIMESTAMPTZ,
      observacao      TEXT,
      criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vitrine_leads_tipo_cpf_uq
      ON vitrine_leads (tipo, cpf)
  `);
  tablesReady = true;
}

// ─── Validação (sem dependência externa) ─────────────────────────────────────

function soDigitos(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D+/g, "") : "";
}

/** Valida CPF com dígitos verificadores (rejeita sequências repetidas). */
function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, fator: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (fator - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

/** Valida CNPJ com dígitos verificadores. */
function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i]!;
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

/** Data de nascimento AAAA-MM-DD, plausível (idade entre 14 e 110 anos).
 *  Rejeita datas impossíveis (ex.: 31/02) comparando o round-trip UTC. */
function nascimentoValido(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return false;
  const agora = new Date().getFullYear();
  return agora - ano >= 14 && agora - ano <= 110;
}

// ─── Rate limit simples em memória (por IP) para o POST público ─────────────

const rlHits = new Map<string, { count: number; resetAt: number }>();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 10;
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

function telefoneValido(tel: string): boolean {
  return /^\d{10,11}$/.test(tel);
}

// ─── POST /vitrine-leads — captação pública (o "login" da vitrine) ──────────

router.post("/vitrine-leads", async (req: Request, res: Response): Promise<void> => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "desconhecido";
    if (rateLimited(ip)) {
      res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto e tente de novo." });
      return;
    }
    await ensureTables();
    const tipo = req.body?.tipo === "clinica" ? "clinica" : req.body?.tipo === "paciente" ? "paciente" : null;
    if (!tipo) {
      res.status(400).json({ error: "Tipo inválido. Use 'paciente' ou 'clinica'." });
      return;
    }
    const cpf = soDigitos(req.body?.cpf);
    const cnpj = soDigitos(req.body?.cnpj);
    const dataNascimento = typeof req.body?.dataNascimento === "string" ? req.body.dataNascimento : "";
    const telefone = soDigitos(req.body?.telefone);

    if (!cpfValido(cpf)) {
      res.status(400).json({ error: "CPF inválido. Confira os 11 dígitos." });
      return;
    }
    if (tipo === "clinica" && !cnpjValido(cnpj)) {
      res.status(400).json({ error: "CNPJ inválido. Confira os 14 dígitos." });
      return;
    }
    if (!nascimentoValido(dataNascimento)) {
      res.status(400).json({ error: "Data de nascimento inválida." });
      return;
    }
    if (!telefoneValido(telefone)) {
      res.status(400).json({ error: "Telefone inválido. Use DDD + número." });
      return;
    }

    const rotaOrigem = typeof req.body?.rotaOrigem === "string" ? req.body.rotaOrigem.slice(0, 200) : null;
    const userAgent = (req.get("user-agent") || "").slice(0, 300) || null;

    // UPSERT: reentrada do mesmo CPF no mesmo tipo conta acesso, não duplica.
    await db.execute(sql`
      INSERT INTO vitrine_leads (tipo, cpf, cnpj, data_nascimento, telefone, rota_origem, user_agent)
      VALUES (${tipo}, ${cpf}, ${tipo === "clinica" ? cnpj : null}, ${dataNascimento}, ${telefone}, ${rotaOrigem}, ${userAgent})
      ON CONFLICT (tipo, cpf) DO UPDATE SET
        telefone = EXCLUDED.telefone,
        data_nascimento = EXCLUDED.data_nascimento,
        cnpj = COALESCE(EXCLUDED.cnpj, vitrine_leads.cnpj),
        acessos = vitrine_leads.acessos + 1,
        ultimo_acesso = NOW()
    `);

    req.log.info({ tipo, rotaOrigem }, "vitrine_lead_captado");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "vitrine_lead_erro");
    res.status(500).json({ error: "Não foi possível registrar o acesso. Tente de novo." });
  }
});

// ─── GET /vitrine-leads — painel de verificação (colaborador) ────────────────

router.get("/vitrine-leads", requireCollaborator, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const tipo = req.query.tipo === "paciente" || req.query.tipo === "clinica" ? String(req.query.tipo) : null;
    const rows = tipo
      ? await db.execute(sql`SELECT * FROM vitrine_leads WHERE tipo = ${tipo} ORDER BY ultimo_acesso DESC LIMIT 500`)
      : await db.execute(sql`SELECT * FROM vitrine_leads ORDER BY ultimo_acesso DESC LIMIT 500`);
    res.json({ leads: rows.rows });
  } catch (err) {
    logger.error({ err }, "vitrine_leads_listar_erro");
    res.status(500).json({ error: "Falha ao listar leads." });
  }
});

// ─── PATCH /vitrine-leads/:id/contato — marcar contatado (colaborador) ──────

router.patch("/vitrine-leads/:id/contato", requireCollaborator, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTables();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador inválido." });
      return;
    }
    const contatado = req.body?.contatado !== false;
    const observacao = typeof req.body?.observacao === "string" ? req.body.observacao.slice(0, 1000) : null;
    const r = await db.execute(sql`
      UPDATE vitrine_leads
      SET contatado = ${contatado},
          contatado_em = CASE WHEN ${contatado} THEN NOW() ELSE NULL END,
          observacao = COALESCE(${observacao}, observacao)
      WHERE id = ${id}
      RETURNING id
    `);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Lead não encontrado." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "vitrine_lead_contato_erro");
    res.status(500).json({ error: "Falha ao atualizar o lead." });
  }
});

export default router;
