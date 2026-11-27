/**
 * PAXMED — pedidos de convite (licenciados e pretendentes), recebidos pela vitrine paxmed.com.br.
 *
 * POST  /vitrine-convites          — público: grava a solicitação e devolve o protocolo PXM-XXXX-XXXX
 * POST  /vitrine-convites/status   — público: protocolo + e-mail JUNTOS devolvem só o status
 * GET   /vitrine-convites          — titular da plataforma (CEO)
 * PATCH /vitrine-convites/:id/status — titular da plataforma (CEO)
 *
 * Aprovar muda somente o status: não cria login, não cobra e não envia mensagem.
 * O CRM tem só o formato conferido (3 a 8 dígitos + UF); não há consulta ao conselho.
 */
import { randomInt } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { isPlatformOwner } from "../lib/clinical-access";
import { requireCollaborator } from "./collaborator.js";

const router: IRouter = Router();

export const STATUS_CONVITE = ["recebida", "em_analise", "aprovada", "lista_espera", "recusada"] as const;
type StatusConvite = (typeof STATUS_CONVITE)[number];

let tabelaPronta = false;
export async function garantirTabelaConvites(): Promise<void> {
  if (tabelaPronta) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vitrine_convites (
      id            SERIAL PRIMARY KEY,
      protocolo     TEXT NOT NULL UNIQUE,
      nome          TEXT NOT NULL,
      email         TEXT NOT NULL,
      crm           TEXT NOT NULL,
      uf            TEXT NOT NULL,
      especialidade TEXT NOT NULL,
      clinica       TEXT,
      cidade        TEXT NOT NULL,
      mensagem      TEXT,
      status        TEXT NOT NULL DEFAULT 'recebida',
      user_agent    TEXT,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decidido_por  INTEGER
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS vitrine_convites_email_idx ON vitrine_convites (email)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS vitrine_convites_status_idx ON vitrine_convites (status, criado_em DESC)`);
  tabelaPronta = true;
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function novoProtocolo(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return `PXM-${s.slice(0, 4)}-${s.slice(4)}`;
}
const PROTOCOLO_RE = /^PXM-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 255;

// Limites em memória por IP (envio) e por IP+protocolo (consulta), contra uso em massa e adivinhação.
const janelas = new Map<string, { n: number; fim: number }>();
function estourou(chave: string, max: number, ms: number): boolean {
  const agora = Date.now();
  const h = janelas.get(chave);
  if (!h || agora > h.fim) {
    janelas.set(chave, { n: 1, fim: agora + ms });
    if (janelas.size > 5000) for (const [k, v] of janelas) if (agora > v.fim) janelas.delete(k);
    return false;
  }
  h.n += 1;
  return h.n > max;
}
/** Só para testes: zera as janelas de limite. */
export function zerarLimitesConvites(): void { janelas.clear(); }
const ipDe = (req: Request) => req.ip || req.socket.remoteAddress || "desconhecido";

router.post("/vitrine-convites", async (req: Request, res: Response): Promise<void> => {
  try {
    if (estourou(`env:${ipDe(req)}`, 5, 60_000)) {
      res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto e tente de novo." });
      return;
    }
    const b = req.body ?? {};
    const nome = str(b.nome, 120);
    const email = str(b.email, 255).toLowerCase();
    const crm = str(b.crm, 8);
    const uf = str(b.uf, 2).toUpperCase();
    const especialidade = str(b.especialidade, 120);
    const clinica = str(b.clinica, 160) || null;
    const cidade = str(b.cidade, 120);
    const mensagem = str(b.mensagem, 1000) || null;
    if (b.consentimento !== true) { res.status(400).json({ error: "Confirme o consentimento para continuar." }); return; }
    if (nome.length < 3) { res.status(400).json({ error: "Informe seu nome completo." }); return; }
    if (!emailValido(email)) { res.status(400).json({ error: "E-mail inválido." }); return; }
    if (!/^\d{3,8}$/.test(crm)) { res.status(400).json({ error: "CRM deve ter só números (3 a 8 dígitos)." }); return; }
    if (!/^[A-Z]{2}$/.test(uf)) { res.status(400).json({ error: "UF deve ter 2 letras." }); return; }
    if (especialidade.length < 2) { res.status(400).json({ error: "Informe a especialidade." }); return; }
    if (cidade.length < 2) { res.status(400).json({ error: "Informe a cidade." }); return; }

    await garantirTabelaConvites();
    const userAgent = (req.get("user-agent") || "").slice(0, 300) || null;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const protocolo = novoProtocolo();
      const r = await db.execute(sql`
        INSERT INTO vitrine_convites (protocolo, nome, email, crm, uf, especialidade, clinica, cidade, mensagem, user_agent)
        VALUES (${protocolo}, ${nome}, ${email}, ${crm}, ${uf}, ${especialidade}, ${clinica}, ${cidade}, ${mensagem}, ${userAgent})
        ON CONFLICT (protocolo) DO NOTHING
        RETURNING id
      `);
      if (r.rows.length > 0) {
        req.log?.info({ protocolo }, "vitrine_convite_recebido");
        res.status(201).json({ ok: true, protocolo });
        return;
      }
    }
    res.status(500).json({ error: "Não foi possível gerar o protocolo. Tente de novo." });
  } catch (err) {
    logger.error({ err }, "vitrine_convite_erro");
    res.status(500).json({ error: "Não foi possível enviar agora. Tente novamente." });
  }
});

router.post("/vitrine-convites/status", async (req: Request, res: Response): Promise<void> => {
  try {
    // Falhas e acertos contam igual: impede varrer protocolos ou e-mails por tentativa.
    if (estourou(`con:${ipDe(req)}`, 10, 10 * 60_000)) {
      res.status(429).json({ error: "Muitas consultas. Aguarde alguns minutos." });
      return;
    }
    const protocolo = str(req.body?.protocolo, 20).toUpperCase();
    const email = str(req.body?.email, 255).toLowerCase();
    if (!PROTOCOLO_RE.test(protocolo) || !emailValido(email)) {
      res.status(400).json({ error: "Confira o protocolo e o e-mail." });
      return;
    }
    await garantirTabelaConvites();
    const r = await db.execute(sql`
      SELECT status, criado_em, atualizado_em FROM vitrine_convites
      WHERE protocolo = ${protocolo} AND email = ${email} LIMIT 1
    `);
    const linha = r.rows[0] as { status: string; criado_em: string; atualizado_em: string } | undefined;
    if (!linha) { res.json({ found: false }); return; }
    res.json({ found: true, status: linha.status, criadoEm: linha.criado_em, atualizadoEm: linha.atualizado_em });
  } catch (err) {
    logger.error({ err }, "vitrine_convite_status_erro");
    res.status(500).json({ error: "Não foi possível consultar agora." });
  }
});

async function titular(req: Request, res: Response): Promise<number | null> {
  const id = Number(req.collaborator?.professionalId);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(401).json({ error: "Faça login de colaborador." }); return null; }
  if (!(await isPlatformOwner(id))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return null; }
  return id;
}

router.get("/vitrine-convites", requireCollaborator, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await titular(req, res))) return;
    await garantirTabelaConvites();
    const filtro = typeof req.query.status === "string" ? req.query.status : "";
    if (filtro && !STATUS_CONVITE.includes(filtro as StatusConvite)) { res.status(400).json({ error: "Status inválido." }); return; }
    const rows = filtro
      ? await db.execute(sql`SELECT id, protocolo, nome, email, crm, uf, especialidade, clinica, cidade, mensagem, status, criado_em, atualizado_em FROM vitrine_convites WHERE status = ${filtro} ORDER BY criado_em DESC LIMIT 500`)
      : await db.execute(sql`SELECT id, protocolo, nome, email, crm, uf, especialidade, clinica, cidade, mensagem, status, criado_em, atualizado_em FROM vitrine_convites ORDER BY criado_em DESC LIMIT 500`);
    res.json({ convites: rows.rows });
  } catch (err) {
    logger.error({ err }, "vitrine_convites_listar_erro");
    res.status(500).json({ error: "Falha ao listar os pedidos de convite." });
  }
});

router.patch("/vitrine-convites/:id/status", requireCollaborator, async (req: Request, res: Response): Promise<void> => {
  try {
    const ator = await titular(req, res);
    if (!ator) return;
    const id = Number(req.params.id);
    const status = str(req.body?.status, 20);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Identificador inválido." }); return; }
    if (!STATUS_CONVITE.includes(status as StatusConvite)) { res.status(400).json({ error: "Status inválido." }); return; }
    await garantirTabelaConvites();
    const r = await db.execute(sql`
      UPDATE vitrine_convites SET status = ${status}, atualizado_em = NOW(), decidido_por = ${ator}
      WHERE id = ${id} RETURNING id
    `);
    if (r.rows.length === 0) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "vitrine_convite_mudar_status_erro");
    res.status(500).json({ error: "Falha ao atualizar o status." });
  }
});

export default router;
