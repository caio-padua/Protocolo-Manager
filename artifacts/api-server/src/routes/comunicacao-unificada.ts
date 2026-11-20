/**
 * Conversa unificada, resumo da auditoria e backups de mensagens (WWP/TG).
 * A clinica vem SEMPRE da sessao (tenantContext), nunca do corpo ou da consulta.
 * Backup: somente administrador da clinica ou dono da plataforma.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import {
  PERIODOS, inicioDoPeriodo, listarConversas, resumirConversas,
  type CanalConversa, type Periodo,
} from "../lib/comunicacao-unificada";
import { ErroBackup, gerarBackup, nomeDeArquivoSeguroNoHeader } from "../lib/comunicacao-backup";
import type { CanalBackup } from "../lib/backup-mensagens-nome";

const router = Router();

function empresaDaSessao(req: Request): number | null {
  const c = req.tenantContext;
  return c?.authenticated && Number.isSafeInteger(c.empresaId) && c.empresaId > 0 ? c.empresaId : null;
}
const podeBackup = (req: Request) =>
  Boolean(req.tenantContext?.authenticated && (req.tenantContext.isPlatformOwner || req.tenantContext.perfilPlataforma === "admin"));

function periodoDe(v: unknown): Periodo {
  return (PERIODOS as readonly string[]).includes(String(v)) ? (v as Periodo) : "7d";
}
function canalDe(v: unknown): CanalConversa | null {
  const s = String(v ?? "").toLowerCase();
  return s === "tg" || s === "wwp" ? s : null;
}
const inteiroOuNulo = (v: unknown): number | null => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function nomeDoOperador(req: Request): Promise<{ id: number | null; nome: string }> {
  const id = req.tenantContext?.professionalId ?? null;
  if (!id) return { id: null, nome: "Operador" };
  const r = await pool.query(`SELECT name FROM professionals WHERE id = $1`, [id]);
  return { id, nome: String(r.rows[0]?.name ?? `Profissional ${id}`) };
}

router.use("/comunicacao", requireCollaborator);

router.get("/comunicacao/permissoes", (req: Request, res: Response) => {
  if (!empresaDaSessao(req)) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  res.json({ backup: podeBackup(req) });
});

router.get("/comunicacao/conversas", async (req: Request, res: Response) => {
  const empresaId = empresaDaSessao(req);
  if (!empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  try {
    const periodo = periodoDe(req.query.periodo);
    const pagina = await listarConversas(
      { empresaId, canal: canalDe(req.query.canal), clienteId: inteiroOuNulo(req.query.clienteId), de: inicioDoPeriodo(periodo) },
      { limite: Number(req.query.limite) || 50, cursor: typeof req.query.cursor === "string" ? req.query.cursor : null },
    );
    res.json({ periodo, ...pagina });
  } catch (e) {
    if (e instanceof RangeError) { res.status(400).json({ error: "Cursor inválido." }); return; }
    throw e;
  }
});

router.get("/comunicacao/resumo", async (req: Request, res: Response) => {
  const empresaId = empresaDaSessao(req);
  if (!empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  const periodo = periodoDe(req.query.periodo);
  res.json({ periodo, ...(await resumirConversas({ empresaId, canal: canalDe(req.query.canal), de: inicioDoPeriodo(periodo) })) });
});

// ── Backups ──────────────────────────────────────────────────────────────────
function exigirBackup(req: Request, res: Response): number | null {
  const empresaId = empresaDaSessao(req);
  if (!empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return null; }
  if (!podeBackup(req)) { res.status(403).json({ error: "Somente o administrador da clínica acessa os backups." }); return null; }
  return empresaId;
}

router.get("/comunicacao/backups", async (req: Request, res: Response) => {
  const empresaId = exigirBackup(req, res);
  if (!empresaId) return;
  const r = await pool.query(
    `SELECT id, lote, canal, escopo, cliente_id, periodo_inicio, periodo_fim, formato, nome_arquivo, tamanho_bytes, sha256,
            total_mensagens, gerado_por_nome, criado_em
       FROM comunicacao_backups WHERE empresa_id = $1 ORDER BY id DESC LIMIT 200`,
    [empresaId],
  );
  res.json({ arquivos: r.rows });
});

router.get("/comunicacao/backups/downloads", async (req: Request, res: Response) => {
  const empresaId = exigirBackup(req, res);
  if (!empresaId) return;
  const r = await pool.query(
    `SELECT d.id, d.baixado_por_nome, d.baixado_em, b.nome_arquivo, b.formato
       FROM comunicacao_backup_downloads d JOIN comunicacao_backups b ON b.id = d.backup_id
      WHERE d.empresa_id = $1 ORDER BY d.id DESC LIMIT 200`,
    [empresaId],
  );
  res.json({ downloads: r.rows });
});

router.post("/comunicacao/backups", async (req: Request, res: Response) => {
  const empresaId = exigirBackup(req, res);
  if (!empresaId) return;
  const corpo = (req.body ?? {}) as Record<string, unknown>;
  const canalBruto = String(corpo.canal ?? "").toUpperCase();
  const canais: CanalBackup[] = canalBruto === "AMBOS" ? ["TG", "WWP"] : canalBruto === "TG" || canalBruto === "WWP" ? [canalBruto] : [];
  const escopo = corpo.escopo === "cliente" ? "cliente" : "geral";
  try {
    const out = await gerarBackup({
      empresaId, canais, escopo, clienteId: inteiroOuNulo(corpo.clienteId), periodo: periodoDe(corpo.periodo),
      por: await nomeDoOperador(req),
    });
    res.status(201).json(out);
  } catch (e) {
    if (e instanceof ErroBackup) { res.status(e.status).json({ error: e.message }); return; }
    throw e;
  }
});

router.get("/comunicacao/backups/:id/download", async (req: Request, res: Response) => {
  const empresaId = exigirBackup(req, res);
  if (!empresaId) return;
  const id = inteiroOuNulo(req.params.id);
  if (!id) { res.status(400).json({ error: "Arquivo inválido." }); return; }
  const r = await pool.query(
    `SELECT id, nome_arquivo, mime, conteudo, sha256 FROM comunicacao_backups WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId],
  );
  const b = r.rows[0];
  if (!b) { res.status(404).json({ error: "Arquivo não encontrado." }); return; }
  const op = await nomeDoOperador(req);
  await pool.query(
    `INSERT INTO comunicacao_backup_downloads (backup_id, empresa_id, baixado_por, baixado_por_nome) VALUES ($1,$2,$3,$4)`,
    [b.id, empresaId, op.id, op.nome],
  );
  const n = nomeDeArquivoSeguroNoHeader(String(b.nome_arquivo));
  res.setHeader("Content-Type", String(b.mime));
  res.setHeader("Content-Disposition", `attachment; filename="${n.ascii}"; filename*=UTF-8''${n.utf8}`);
  res.setHeader("X-Content-SHA256", String(b.sha256));
  res.setHeader("Cache-Control", "no-store");
  res.send(b.conteudo);
});

export default router;
