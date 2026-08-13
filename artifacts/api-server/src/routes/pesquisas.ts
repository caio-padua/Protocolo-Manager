import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  pesquisasTable,
  dietaCatalogoAlimentosTable,
  PESQUISA_TIPOS,
  type PesquisaTipo,
  type Pesquisa,
  type PesquisaPrecoInsumoParametros,
  type PesquisaPrecoInsumoResultado,
} from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import {
  apifyStartPrecoInsumoRun,
  apifyGetRunStatus,
  apifyGetDatasetItems,
  extractPrecoInsumoResultado,
  APIFY_RUN_STATUS_TERMINAL_OK,
  APIFY_RUN_STATUS_TERMINAL_ERRO,
} from "../lib/apify";

// ============================================================================
// CENTRAL DE PESQUISA (Apify) — Task 235.
//
// Rotas genericas por natureza: GET/POST /pesquisas (historico + trigger) nao
// mudam quando um novo `tipo` de pesquisa surgir no futuro (ex.: cliente
// potencial por bairro). O que muda por tipo fica isolado em duas tabelas de
// despacho (DISPATCHERS / EXTRACTORS) — somar um tipo novo = somar 1 entrada
// em cada uma, nunca reescrever as rotas.
//
// Sem requireCollaborator (mesmo padrao de dieta.ts/budget-catalog.ts — o SPA
// inteiro ja e protegido por sessao/menu). Gate por modulo "protocolos"
// (mesmo modulo que ja controla o grupo de menu "Orgaos de Prescricao").
// ============================================================================

const router: IRouter = Router();
router.use(moduleGuard("protocolos"));

// ---------------------------------------------------------------------------
// Despacho por tipo — disparar o robo certo no Apify a partir de uma linha
// `pesquisas` ja gravada. Retorna a linha atualizada (com apify_run_id/dataset
// preenchidos, OU status="erro" se o disparo falhar).
// ---------------------------------------------------------------------------
async function dispatchPesquisa(row: Pesquisa): Promise<Pesquisa> {
  try {
    if (row.tipo === "preco_insumo") {
      const p = row.parametros as PesquisaPrecoInsumoParametros;
      const { actorId, runId, datasetId } = await apifyStartPrecoInsumoRun(p.alimentoNome, p.cidade);
      const [updated] = await db
        .update(pesquisasTable)
        .set({ apifyActorId: actorId, apifyRunId: runId, apifyDatasetId: datasetId })
        .where(eq(pesquisasTable.id, row.id))
        .returning();
      return updated!;
    }
    // PESQUISA_TIPOS e fechado — chegar aqui significa um tipo novo sem
    // despachante ainda implementado. Falha explicita, nunca "em_andamento" eterno.
    const [failed] = await db
      .update(pesquisasTable)
      .set({ status: "erro", erro: `Tipo de pesquisa "${row.tipo}" ainda nao tem robo associado.` })
      .where(eq(pesquisasTable.id, row.id))
      .returning();
    return failed!;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao acionar o Apify";
    const [failed] = await db
      .update(pesquisasTable)
      .set({ status: "erro", erro: msg })
      .where(eq(pesquisasTable.id, row.id))
      .returning();
    return failed!;
  }
}

// Despacho por tipo — extrair o resultado resumido a partir do dataset bruto
// do Apify, uma vez que a execucao termina com sucesso. `null` = nenhum
// resultado valido encontrado (o chamador marca a pesquisa como erro).
const EXTRACTORS: Partial<Record<PesquisaTipo, (items: unknown[]) => PesquisaPrecoInsumoResultado | null>> = {
  preco_insumo: extractPrecoInsumoResultado,
};

// ---------------------------------------------------------------------------
// POST /pesquisas/preco-insumo — dispara uma pesquisa de preco de insumo.
// ---------------------------------------------------------------------------
const CriarPesquisaPrecoInsumoBody = z.object({
  alimentoId: z.number().int().positive(),
  cidade: z.string().min(1).max(200),
});

router.post("/pesquisas/preco-insumo", async (req, res): Promise<void> => {
  const parsed = CriarPesquisaPrecoInsumoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const { alimentoId, cidade } = parsed.data;

  const [alimento] = await db
    .select({ id: dietaCatalogoAlimentosTable.id, nome: dietaCatalogoAlimentosTable.nome })
    .from(dietaCatalogoAlimentosTable)
    .where(eq(dietaCatalogoAlimentosTable.id, alimentoId))
    .limit(1);
  if (!alimento) {
    res.status(404).json({ error: "Alimento nao encontrado no catalogo" });
    return;
  }

  const parametros: PesquisaPrecoInsumoParametros = {
    alimentoId: alimento.id,
    alimentoNome: alimento.nome,
    cidade: cidade.trim(),
  };

  const [row] = await db
    .insert(pesquisasTable)
    .values({ tipo: "preco_insumo", status: "em_andamento", parametros })
    .returning();

  const finalRow = await dispatchPesquisa(row!);
  res.status(201).json(finalRow);
});

// ---------------------------------------------------------------------------
// GET /pesquisas — historico (mais recente primeiro), filtro opcional por tipo.
// ---------------------------------------------------------------------------
router.get("/pesquisas", async (req, res): Promise<void> => {
  const tipoParam = typeof req.query.tipo === "string" ? req.query.tipo : undefined;
  const tipoFilter =
    tipoParam && (PESQUISA_TIPOS as readonly string[]).includes(tipoParam)
      ? (tipoParam as PesquisaTipo)
      : undefined;

  const rows = tipoFilter
    ? await db
        .select()
        .from(pesquisasTable)
        .where(eq(pesquisasTable.tipo, tipoFilter))
        .orderBy(desc(pesquisasTable.createdAt))
        .limit(200)
    : await db.select().from(pesquisasTable).orderBy(desc(pesquisasTable.createdAt)).limit(200);

  res.json(rows);
});

// ---------------------------------------------------------------------------
// GET /pesquisas/:id — detalhe. Se ainda "em_andamento", consulta o Apify
// (lazy poll: sem worker/cron separado — quem pergunta pelo status empurra
// a maquina de estados adiante).
// ---------------------------------------------------------------------------
router.get("/pesquisas/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }

  const [found] = await db.select().from(pesquisasTable).where(eq(pesquisasTable.id, id)).limit(1);
  if (!found) {
    res.status(404).json({ error: "Pesquisa nao encontrada" });
    return;
  }
  let row = found;

  if (row.status === "em_andamento" && row.apifyRunId) {
    try {
      const runStatus = await apifyGetRunStatus(row.apifyRunId);

      if (APIFY_RUN_STATUS_TERMINAL_OK.has(runStatus)) {
        if (!row.apifyDatasetId) throw new Error("Execucao concluida sem dataset associado.");
        const items = await apifyGetDatasetItems(row.apifyDatasetId);
        const extractor = EXTRACTORS[row.tipo];
        const resultadoResumo = extractor ? extractor(items) : null;

        const [updated] = await db
          .update(pesquisasTable)
          .set(
            resultadoResumo
              ? { status: "concluida", resultadoResumo, resultadoBruto: items }
              : {
                  status: "erro",
                  erro: "O robo terminou mas nao encontrou nenhum preco valido no resultado.",
                  resultadoBruto: items,
                },
          )
          .where(eq(pesquisasTable.id, id))
          .returning();
        row = updated!;
      } else if (APIFY_RUN_STATUS_TERMINAL_ERRO.has(runStatus)) {
        const [updated] = await db
          .update(pesquisasTable)
          .set({ status: "erro", erro: `Execucao no Apify terminou com status ${runStatus}.` })
          .where(eq(pesquisasTable.id, id))
          .returning();
        row = updated!;
      }
      // READY/RUNNING/ABORTING/TIMING-OUT: continua em_andamento, sem mudanca.
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao consultar o Apify";
      const [updated] = await db
        .update(pesquisasTable)
        .set({ status: "erro", erro: msg })
        .where(eq(pesquisasTable.id, id))
        .returning();
      row = updated!;
    }
  }

  res.json(row);
});

// ---------------------------------------------------------------------------
// POST /pesquisas/:id/aplicar — grava o preco medio encontrado no catalogo
// (mesmo campo `precoMedio` da Task 234).
// ---------------------------------------------------------------------------
router.post("/pesquisas/:id/aplicar", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }

  const [row] = await db.select().from(pesquisasTable).where(eq(pesquisasTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Pesquisa nao encontrada" });
    return;
  }
  if (row.status !== "concluida") {
    res.status(409).json({ error: "So e possivel aplicar uma pesquisa concluida." });
    return;
  }
  if (row.tipo !== "preco_insumo") {
    res.status(400).json({ error: `Tipo de pesquisa "${row.tipo}" nao sabe aplicar ao catalogo.` });
    return;
  }

  const resultado = row.resultadoResumo as PesquisaPrecoInsumoResultado | null;
  const parametros = row.parametros as PesquisaPrecoInsumoParametros;
  if (!resultado || typeof resultado.precoMedio !== "number") {
    res.status(400).json({ error: "Pesquisa sem preco medio valido para aplicar." });
    return;
  }

  const [alimento] = await db
    .update(dietaCatalogoAlimentosTable)
    .set({ precoMedio: resultado.precoMedio })
    .where(eq(dietaCatalogoAlimentosTable.id, parametros.alimentoId))
    .returning();
  if (!alimento) {
    res.status(404).json({ error: "Alimento do catalogo nao existe mais — nao foi possivel aplicar." });
    return;
  }

  const [updated] = await db
    .update(pesquisasTable)
    .set({ aplicadoEm: new Date() })
    .where(eq(pesquisasTable.id, id))
    .returning();

  res.json({ pesquisa: updated, alimento });
});

// ---------------------------------------------------------------------------
// POST /pesquisas/:id/refazer — refaz uma pesquisa com erro. NUNCA muta a
// linha antiga (Regra de Ouro — Nunca Destruir): cria uma linha nova com
// `origemPesquisaId` apontando para a original, e dispara de novo.
// ---------------------------------------------------------------------------
router.post("/pesquisas/:id/refazer", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }

  const [original] = await db.select().from(pesquisasTable).where(eq(pesquisasTable.id, id)).limit(1);
  if (!original) {
    res.status(404).json({ error: "Pesquisa nao encontrada" });
    return;
  }
  if (original.status !== "erro") {
    res.status(409).json({ error: "So e possivel refazer uma pesquisa com erro." });
    return;
  }

  const [novaRow] = await db
    .insert(pesquisasTable)
    .values({
      tipo: original.tipo,
      status: "em_andamento",
      parametros: original.parametros,
      origemPesquisaId: original.id,
    })
    .returning();

  const finalRow = await dispatchPesquisa(novaRow!);
  res.status(201).json(finalRow);
});

export default router;
