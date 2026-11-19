import { Router, type NextFunction, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { moduleGuard } from "../middleware/moduleGuard";
import { acesso } from "./fornecedores";
import { montarMatrizCompleta } from "../lib/matriz-completa";
import { aplicarAgora, CATEGORIAS, ErroPrecificacao, salvarConfiguracao, validarConfiguracao, type Categoria } from "../lib/precificacao";
import { liberarReservaProtocolo, saldosPorSubstancia } from "../lib/estoque-reserva";
import { resolveEmpresaId } from "../middleware/tenantContext";

const router = Router();

async function estrutura(_req: Request, res: Response, next: NextFunction): Promise<void> {
  const { rows } = await pool.query(`SELECT to_regclass('precificacao_parametros') AS a, to_regclass('precificacao_categorias') AS b,
    to_regclass('preco_publicado') AS c, to_regclass('estoque_reservas') AS d, to_regclass('substance_ofertas') AS e`);
  if (!rows[0] || Object.values(rows[0]).some((v) => !v)) {
    res.status(503).json({ error: "Precificação e reservas ainda não estão instaladas neste ambiente." }); return;
  }
  next();
}

function tratar(res: Response, e: unknown): void {
  if (e instanceof ErroPrecificacao) { res.status(e.status).json({ error: e.message }); return; }
  throw e;
}

// Matriz completa: preços, precificação, preço publicado, vínculo com o Orçamento e estoque estático/dinâmico.
router.get("/matriz-fornecedores/completa", requireCollaborator, acesso, estrutura, async (req, res) => {
  res.json(await montarMatrizCompleta(pool, req.tenantContext.empresaId));
});

router.put("/precificacao", requireCollaborator, acesso, estrutura, async (req, res) => {
  try {
    const cfg = validarConfiguracao(req.body);
    const r = await salvarConfiguracao(pool, req.tenantContext.empresaId, req.tenantContext.professionalId ?? null, cfg);
    res.json({ ok: true, ...r });
  } catch (e) { tratar(res, e); }
});

router.post("/precificacao/aplicar", requireCollaborator, acesso, estrutura, async (req, res) => {
  try {
    const cats = (req.body as { categorias?: unknown })?.categorias;
    if (!Array.isArray(cats) || cats.length === 0 || cats.some((c) => !CATEGORIAS.includes(c as Categoria))) {
      throw new ErroPrecificacao(400, "Informe ao menos uma categoria válida.");
    }
    const r = await aplicarAgora(pool, req.tenantContext.empresaId, req.tenantContext.professionalId ?? null, cats as Categoria[]);
    res.json({ ok: true, ...r });
  } catch (e) { tratar(res, e); }
});

// Estoque: saldos estático x dinâmico por substância (qualquer colaborador autenticado da clínica).
router.get("/estoque/saldos", moduleGuard("estoque"), requireCollaborator, estrutura, async (req, res) => {
  res.json(await saldosPorSubstancia(db, resolveEmpresaId(req)));
});

router.get("/estoque/reservas", moduleGuard("estoque"), requireCollaborator, estrutura, async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  const status = typeof req.query.status === "string" && ["ativa", "concluida", "liberada"].includes(req.query.status) ? req.query.status : "ativa";
  const r = await pool.query(
    `SELECT r.id, r.protocol_id AS "protocolId", p.title AS protocolo, c.name AS cliente, s.name AS substancia,
            r.quantidade_reservada AS reservada, r.quantidade_consumida AS consumida, r.quantidade_liberada AS liberada,
            r.status, r.criado_em AS "criadoEm"
       FROM estoque_reservas r
       JOIN protocols p ON p.id=r.protocol_id
       LEFT JOIN clients c ON c.id=r.client_id
       JOIN substances s ON s.id=r.substance_id
      WHERE r.empresa_id=$1 AND r.status=$2 ORDER BY r.id DESC LIMIT 300`, [empresaId, status]);
  res.json(r.rows);
});

// Liberar o que sobrou da reserva (protocolo cancelado/encerrado). Ação humana, rastreada no livro de movimentos.
router.post("/estoque/reservas/protocolo/:id/liberar", moduleGuard("estoque"), requireCollaborator, estrutura, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Protocolo inválido." }); return; }
  const empresaId = resolveEmpresaId(req);
  const dono = await pool.query(`SELECT 1 FROM protocols WHERE id=$1 AND empresa_id=$2`, [id, empresaId]);
  if (!dono.rowCount) { res.status(404).json({ error: "Protocolo não encontrado nesta clínica." }); return; }
  const r = await db.transaction((tx) => liberarReservaProtocolo(tx, id, empresaId));
  res.json({ ok: true, ...r });
});

export default router;
