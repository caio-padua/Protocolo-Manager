/**
 * Ficha auditável e interruptores do atendimento automático. A clínica vem SEMPRE da sessão.
 * Reaproveitada pela Central de Conversas/Auditoria; não existe tela duplicada.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { requireCollaborator } from "./collaborator";
import { listarFichas, detalharFicha, acrescentarEvento, ESTADOS_FICHA } from "../lib/atendimento-ficha";
import { alterarControle, lerControles, ControleInvalido } from "../lib/atendimento-controle";
import { pool } from "@workspace/db";
import { listarRevisoes, ratificarRevisao, retificarRevisao, migrarCascata } from "../lib/atendimento-cascata-store";

const router: IRouter = Router();

const empresaDaSessao = (req: Request): number | null => {
  const c = req.tenantContext;
  return c?.authenticated && Number.isSafeInteger(c.empresaId) && c.empresaId > 0 ? c.empresaId : null;
};
const ehAdmin = (req: Request) =>
  Boolean(req.tenantContext?.authenticated && (req.tenantContext.isPlatformOwner || req.tenantContext.perfilPlataforma === "admin"));
function exige(req: Request, res: Response, admin: boolean): number | null {
  const e = empresaDaSessao(req);
  if (e === null) { res.status(401).json({ error: "Sessão sem clínica identificada." }); return null; }
  if (admin && !ehAdmin(req)) { res.status(403).json({ error: "Somente administrador da clínica." }); return null; }
  return e;
}
const usuarioDaSessao = (req: Request): number | null => {
  const id = req.tenantContext?.professionalId;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
};
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

router.get("/atendimento/fichas", requireCollaborator, async (req, res) => {
  const empresaId = exige(req, res, false); if (empresaId === null) return;
  const q = req.query;
  const estado = texto(q.estado);
  if (estado && !ESTADOS_FICHA.includes(estado as never)) { res.status(400).json({ error: "Estado inválido." }); return; }
  const canal = texto(q.canal);
  if (canal && !["whatsapp", "telegram"].includes(canal)) { res.status(400).json({ error: "Canal inválido." }); return; }
  res.json(await listarFichas({
    empresaId, de: texto(q.de), ate: texto(q.ate), canal, intencao: texto(q.intencao), estado,
    ia: q.ia === "true" ? true : q.ia === "false" ? false : undefined, contato: texto(q.contato),
    pagina: Number(q.pagina) || 1, porPagina: Number(q.porPagina) || 20,
  }));
});

router.get("/atendimento/fichas/:id", requireCollaborator, async (req, res) => {
  const empresaId = exige(req, res, false); if (empresaId === null) return;
  const d = await detalharFicha(empresaId, Number(req.params.id));
  if (!d) { res.status(404).json({ error: "Ficha não encontrada." }); return; }
  res.json(d);
});

router.post("/atendimento/fichas/:id/anotacoes", requireCollaborator, async (req, res) => {
  const empresaId = exige(req, res, true); if (empresaId === null) return;
  const motivo = texto(req.body?.texto);
  if (!motivo || motivo.length > 500) { res.status(400).json({ error: "Texto da anotação obrigatório (até 500 caracteres)." }); return; }
  const f = await pool.query(`SELECT canal,mensagem_ref FROM atendimento_ficha WHERE id=$1 AND empresa_id=$2`, [Number(req.params.id), empresaId]);
  if (!f.rows.length) { res.status(404).json({ error: "Ficha não encontrada." }); return; }
  const corrige = Number(req.body?.corrigeEventoId);
  const ok = await acrescentarEvento({
    empresaId, canal: f.rows[0].canal, mensagemRef: f.rows[0].mensagem_ref, tipo: Number.isSafeInteger(corrige) && corrige > 0 ? "correcao" : "anotacao",
    motivo, responsavel: usuarioDaSessao(req), corrigeEventoId: Number.isSafeInteger(corrige) && corrige > 0 ? corrige : null,
  });
  res.status(ok ? 201 : 500).json({ ok });
});

router.get("/atendimento/controle", requireCollaborator, async (req, res) => {
  const empresaId = exige(req, res, false); if (empresaId === null) return;
  res.json(await lerControles(empresaId));
});

router.put("/atendimento/controle", requireCollaborator, async (req, res) => {
  const empresaId = exige(req, res, true); if (empresaId === null) return;
  const b = req.body ?? {};
  try {
    const mudou = await alterarControle({
      empresaId, escopo: b.escopo, canal: b.canal ?? null, clienteId: b.clienteId ?? null,
      ligado: typeof b.ligado === "boolean" ? b.ligado : undefined, modo: b.modo,
      bloqueioEmergencial: typeof b.bloqueioEmergencial === "boolean" ? b.bloqueioEmergencial : undefined,
      motivo: String(b.motivo ?? ""), usuarioId: usuarioDaSessao(req),
    });
    res.json({ ok: true, alterados: mudou });
  } catch (e) {
    if (e instanceof ControleInvalido) { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: "Falha ao gravar o controle." });
  }
});


// Fila de revisão da cascata (desativada: só lista o que o modo "sombra" gravou). Ratificar/retificar exigem administrador.
let cascataPronta: Promise<void> | null = null;
const garantirCascata = () => (cascataPronta ??= migrarCascata(pool).catch((e) => { cascataPronta = null; throw e; }));
router.get("/atendimento/cascata/revisoes", requireCollaborator, async (req, res) => {
  const empresaId = exige(req, res, false); if (empresaId === null) return;
  await garantirCascata();
  const estado = texto(req.query.estado);
  if (estado && !["pendente", "ratificada", "retificada"].includes(estado)) { res.status(400).json({ error: "Estado inválido." }); return; }
  res.json({ itens: await listarRevisoes(pool, empresaId, estado, Number(req.query.pagina) || 1, Number(req.query.porPagina) || 20) });
});
router.post("/atendimento/cascata/revisoes/:id/ratificar", requireCollaborator, async (req, res) => {
  const empresaId = exige(req, res, true); if (empresaId === null) return;
  await garantirCascata();
  const r = await ratificarRevisao(pool, { empresaId, revisaoId: Number(req.params.id), usuarioId: usuarioDaSessao(req) ?? 0,
    confirmar: req.body?.confirmar === true, gatilho: String(req.body?.gatilho ?? ""), resposta: String(req.body?.resposta ?? ""), intencao: texto(req.body?.intencao) ?? null });
  if (!r.ok) { res.status(r.codigo).json({ error: r.erro, conflitoSinapseId: r.conflitoSinapseId }); return; }
  res.status(201).json({ sinapseId: r.sinapseId });
});
router.post("/atendimento/cascata/revisoes/:id/retificar", requireCollaborator, async (req, res) => {
  const empresaId = exige(req, res, true); if (empresaId === null) return;
  await garantirCascata();
  const r = await retificarRevisao(pool, { empresaId, revisaoId: Number(req.params.id), usuarioId: usuarioDaSessao(req) ?? 0,
    motivo: String(req.body?.motivo ?? ""), mensagemComplementar: texto(req.body?.mensagemComplementar) ?? null });
  if (!r.ok) { res.status(r.codigo).json({ error: r.erro }); return; }
  res.json({ sinapseDesativada: r.sinapseDesativada, observacao: "Nenhuma mensagem foi enviada; o rascunho fica na fila para envio humano." });
});

export default router;
