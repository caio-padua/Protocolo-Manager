/**
 * Política comercial por clínica, simulador (somente leitura), custo do catálogo e decisão humana de negociações.
 * Rotas escritas à mão (sem codegen). Clínica vem SEMPRE da sessão; permissão checada no servidor pela Governança.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { exigirComercial, FERRAMENTA_APROVAR_EXCECAO, FERRAMENTA_POLITICA_COMERCIAL } from "../lib/comercial-acesso";
import { alterarPoliticaNegociacao, lerPoliticaClinica, PoliticaInvalida, custosDosItens, orcamentoAprovadoDoCliente } from "../lib/comercial-politica";
import { avaliarNegociacao, custoTotalCents, montarCondicaoHumana, type FormaPagamentoExcecao } from "../lib/budget-negociacao";
import { decidirNegociacaoHumana, enviarAprovacaoHumana } from "../lib/negociacao-cadencia";
import { depsCadenciaReais } from "../lib/negociacao-store";

const router: IRouter = Router();

const vista = (p: Awaited<ReturnType<typeof lerPoliticaClinica>>) => ({
  descontoExcepcionalAvistaPct: p.descontoExcepcionalAvistaPct, descontoExcepcionalParceladoPct: p.descontoExcepcionalParceladoPct,
  entradaMinimaExcecaoPct: p.entradaMinimaExcecaoPct, margemLiquidaMinimaPct: p.margemLiquidaMinimaPct, tributosPct: p.tributosPct,
  negociacaoCadenciada30minAtiva: p.negociacaoCadenciadaAtiva, nomeGerenteFinanceiro: p.nomeGerenteFinanceiro,
});

router.get("/budget-politica", exigirComercial(), async (req, res): Promise<void> => {
  res.json(vista(await lerPoliticaClinica(pool, req.comercial!.empresaId)));
});

router.put("/budget-politica", exigirComercial(FERRAMENTA_POLITICA_COMERCIAL), async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    const p = await alterarPoliticaNegociacao(pool, req.comercial!.empresaId, {
      descontoExcepcionalAvistaPct: b.descontoExcepcionalAvistaPct, descontoExcepcionalParceladoPct: b.descontoExcepcionalParceladoPct,
      entradaMinimaExcecaoPct: b.entradaMinimaExcecaoPct, margemLiquidaMinimaPct: b.margemLiquidaMinimaPct, tributosPct: b.tributosPct,
      negociacaoCadenciadaAtiva: b.negociacaoCadenciada30minAtiva, nomeGerenteFinanceiro: b.nomeGerenteFinanceiro,
    });
    res.json(vista(p));
  } catch (e) {
    if (e instanceof PoliticaInvalida) { res.status(400).json({ error: e.message }); return; }
    throw e;
  }
});

/** Simulador: calcula na hora com a política da clínica e NÃO grava nada. */
router.post("/budget-politica/simular", exigirComercial(), async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const total = b.totalCents, custo = b.custoTotalCents;
  if (!Number.isInteger(total) || (total as number) <= 0 || !Number.isInteger(custo) || (custo as number) <= 0) {
    res.status(400).json({ error: "Informe totalCents e custoTotalCents em centavos inteiros positivos." }); return;
  }
  const forma = b.forma === "avista" || b.forma === "parcelado" ? (b.forma as FormaPagamentoExcecao) : null;
  const pedido = typeof b.descontoPedidoPct === "number" ? b.descontoPedidoPct : null;
  const pol = await lerPoliticaClinica(pool, req.comercial!.empresaId);
  res.json({ somenteVisualizacao: true, resultado: avaliarNegociacao(total as number, [{ include: true, sessions: 1, custoUnitCents: custo as number }], { forma, descontoPedidoPct: pedido }, pol) });
});

router.patch("/budget-catalog/:id/custo", exigirComercial(FERRAMENTA_POLITICA_COMERCIAL), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const c = (req.body as { custoUnitCents?: unknown } | undefined)?.custoUnitCents;
  if (!Number.isSafeInteger(id) || (c !== null && (!Number.isInteger(c) || (c as number) < 0))) {
    res.status(400).json({ error: "custoUnitCents deve ser inteiro em centavos (ou null)." }); return;
  }
  const r = await pool.query("UPDATE budget_catalog SET custo_unit_cents=$2, updated_at=now() WHERE id=$1 RETURNING id", [id, c === 0 ? null : c]);
  if (!r.rows[0]) { res.status(404).json({ error: "Item não encontrado." }); return; }
  res.json({ id, custoUnitCents: c === 0 ? null : c });
});

router.get("/negociacoes", exigirComercial(), async (req, res): Promise<void> => {
  const estado = typeof req.query.estado === "string" ? req.query.estado : null;
  const r = await pool.query(
    `SELECT n.id,n.cliente_id,c.name AS cliente_nome,n.budget_id,n.canal,n.estado,n.caminho,n.oferta,n.motivo,n.criado_em,n.decidido_em
       FROM negociacoes_comerciais n LEFT JOIN clients c ON c.id=n.cliente_id AND c.empresa_id=n.empresa_id
      WHERE n.empresa_id=$1 AND ($2::text IS NULL OR n.estado=$2) ORDER BY n.id DESC LIMIT 100`, [req.comercial!.empresaId, estado]);
  res.json(r.rows);
});

router.post("/negociacoes/:id/decidir", exigirComercial(FERRAMENTA_APROVAR_EXCECAO), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const b = (req.body ?? {}) as { aprovar?: unknown; forma?: unknown; descontoPct?: unknown };
  if (!Number.isSafeInteger(id) || typeof b.aprovar !== "boolean") { res.status(400).json({ error: "Informe aprovar (verdadeiro ou falso)." }); return; }
  const { empresaId, usuarioId } = req.comercial!;
  let condicoes;
  if (b.aprovar) {
    const n = await pool.query("SELECT budget_id, cliente_id, oferta FROM negociacoes_comerciais WHERE id=$1 AND empresa_id=$2", [id, empresaId]);
    if (!n.rows[0]) { res.status(404).json({ error: "Negociação não encontrada." }); return; }
    const existentes = (n.rows[0].oferta?.condicoes ?? []) as unknown[];
    if (!existentes.length || b.descontoPct !== undefined) {
      const forma = b.forma === "parcelado" ? "parcelado" : b.forma === "avista" ? "avista" : null;
      const pct = b.descontoPct;
      if (!forma || typeof pct !== "number" || !(pct > 0 && pct <= 60)) { res.status(400).json({ error: "Para aprovar informe forma (avista ou parcelado) e descontoPct entre 0 e 60." }); return; }
      const orc = await orcamentoAprovadoDoCliente(pool, empresaId, Number(n.rows[0].cliente_id));
      if (!orc || orc.id !== Number(n.rows[0].budget_id)) { res.status(409).json({ error: "O orçamento aceito mudou; reabra a negociação." }); return; }
      const pol = await lerPoliticaClinica(pool, empresaId);
      condicoes = [montarCondicaoHumana(orc.totalCents, forma, pct, pol, custoTotalCents(await custosDosItens(pool, orc.itens)))];
    }
  }
  const dec = await decidirNegociacaoHumana(pool, { empresaId, negociacaoId: id, usuarioId, aprovar: b.aprovar, condicoes });
  if (!dec.ok) { res.status(dec.erro === "negociacao_nao_encontrada" ? 404 : 409).json({ error: dec.erro }); return; }
  let enviada = false;
  if (b.aprovar) enviada = await enviarAprovacaoHumana(pool, dec.negociacao, depsCadenciaReais()).catch(() => false);
  res.json({ estado: dec.negociacao.estado, mensagemEnviada: enviada });
});

export default router;
