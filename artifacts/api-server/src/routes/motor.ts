import { Router, type IRouter } from "express";
import { sql, eq, inArray } from "drizzle-orm";
import {
  db,
  catalogoExamesTable,
  catalogoBlocoExamesTable,
  catalogoBlocosTable,
  catalogoDoencasTable,
  anamneseQuestionarioTable,
  perguntaDoencaTable,
  itemDoencaTable,
} from "@workspace/db";
import {
  runTransmutacaoMotor,
  DEFAULT_EXAMES_URL,
  DEFAULT_MOTOR_URL,
  DEFAULT_ENDOVENOSOS_URL,
} from "../lib/transmutacao-motor";
import { computeMotor, gatilhoBate, type RespostaMotor } from "../lib/motor-anamnese";

const router: IRouter = Router();

// Ranking de profundidade da grade (a escada de importancia do CEO).
const GRADE_RANK: Record<string, number> = {
  "GRADE BASICA": 1,
  "GRADE INTERMEDIARIA": 2,
  "GRADE SOFISTICADA": 3,
  "GRADE AMPLIADA": 4,
  "SEM GRADE": 0,
};

function rankGrau(g: string | null): number {
  return g ? (GRADE_RANK[g] ?? 99) : 99;
}

// ---- Importador (chupa-cabra), protegido por token admin ----
router.post("/motor/transmutacao/import", async (req, res): Promise<void> => {
  const expected = process.env.ADMIN_IMPORT_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "Importador desabilitado: ADMIN_IMPORT_TOKEN nao configurado" });
    return;
  }
  const token = req.header("x-admin-token");
  if (!token || token !== expected) {
    res.status(401).json({ error: "Token de admin invalido" });
    return;
  }
  const body = (req.body ?? {}) as { examesUrl?: string; motorUrl?: string; endovenososUrl?: string };
  try {
    const report = await runTransmutacaoMotor({
      examesUrl: body.examesUrl || DEFAULT_EXAMES_URL,
      motorUrl: body.motorUrl || DEFAULT_MOTOR_URL,
      endovenososUrl: body.endovenososUrl || DEFAULT_ENDOVENOSOS_URL,
      log: req.log,
    });
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Falha na transmutacao motor");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
  }
});

// ---- Contagens por colecao (conferencia anti-ectoplasma) ----
router.get("/motor/stats", async (_req, res): Promise<void> => {
  const tables = [
    "catalogo_exames",
    "catalogo_analitos",
    "catalogo_blocos",
    "catalogo_bloco_exames",
    "direcao_favoravel_exame",
    "catalogo_endovenosos",
    "anamnese_questionario",
    "catalogo_doencas",
    "catalogo_sintomas",
    "catalogo_cid10",
    "motor_regras",
    "motor_decisao_clinica",
    "mapa_anamnese_motor",
  ];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(t)}`);
    out[t] = Number((r.rows?.[0] as any)?.n ?? 0);
  }
  res.json(out);
});

// ---- Fluxo A: exame -> em quais blocos/grades ele aparece ----
router.get("/motor/exame/:codigo/blocos", async (req, res): Promise<void> => {
  const [exame] = await db
    .select()
    .from(catalogoExamesTable)
    .where(sql`${catalogoExamesTable.codigoExame} = ${req.params.codigo}`)
    .limit(1);
  if (!exame) {
    res.status(404).json({ error: "Exame nao encontrado" });
    return;
  }
  const ligacoes = await db
    .select()
    .from(catalogoBlocoExamesTable)
    .where(sql`${catalogoBlocoExamesTable.nomeExame} = ${exame.nomeExame}`);
  ligacoes.sort((a, b) => rankGrau(a.grau) - rankGrau(b.grau));
  res.json({ exame: { codigoExame: exame.codigoExame, nomeExame: exame.nomeExame }, blocos: ligacoes });
});

// ---- Fluxo B: bloco -> exames ordenados por grade e ordem ----
router.get("/motor/bloco/:codigo/exames", async (req, res): Promise<void> => {
  const [bloco] = await db
    .select()
    .from(catalogoBlocosTable)
    .where(sql`${catalogoBlocosTable.codigoBloco} = ${req.params.codigo}`)
    .limit(1);
  const exames = await db
    .select()
    .from(catalogoBlocoExamesTable)
    .where(sql`${catalogoBlocoExamesTable.blocoId} = ${req.params.codigo}`);
  exames.sort((a, b) => {
    const dg = rankGrau(a.grau) - rankGrau(b.grau);
    if (dg !== 0) return dg;
    return (a.ordemNoBloco ?? 999) - (b.ordemNoBloco ?? 999);
  });
  res.json({ bloco: bloco ?? { codigoBloco: req.params.codigo }, exames });
});

// ---- Motor: doenca -> blocos acionados -> exames sugeridos por bloco ----
router.get("/motor/doenca/:idIhe/sugestao", async (req, res): Promise<void> => {
  const idIhe = Number(req.params.idIhe);
  if (!Number.isInteger(idIhe)) {
    res.status(400).json({ error: "idIhe invalido" });
    return;
  }
  const [doenca] = await db
    .select()
    .from(catalogoDoencasTable)
    .where(sql`${catalogoDoencasTable.idIhe} = ${idIhe}`)
    .limit(1);
  if (!doenca) {
    res.status(404).json({ error: "Doenca nao encontrada" });
    return;
  }
  // bloco_motor pode trazer varios codigos: "BLK006 / BLK015"
  const codigos = (doenca.blocosMotor || doenca.blocoMotor || "")
    .split("/")
    .map((x) => x.trim())
    .filter((x) => /^BLK\d+$/i.test(x));
  const blocos = [];
  for (const cod of codigos) {
    const [bloco] = await db
      .select()
      .from(catalogoBlocosTable)
      .where(sql`${catalogoBlocosTable.codigoBloco} = ${cod}`)
      .limit(1);
    const exames = await db
      .select()
      .from(catalogoBlocoExamesTable)
      .where(sql`${catalogoBlocoExamesTable.blocoId} = ${cod}`);
    exames.sort((a, b) => {
      const dg = rankGrau(a.grau) - rankGrau(b.grau);
      if (dg !== 0) return dg;
      return (a.ordemNoBloco ?? 999) - (b.ordemNoBloco ?? 999);
    });
    blocos.push({ bloco: bloco ?? { codigoBloco: cod }, exames });
  }
  res.json({
    doenca: { idIhe: doenca.idIhe, nomeDoenca: doenca.nomeDoenca, eixo: doenca.eixo, blocosMotor: doenca.blocosMotor || doenca.blocoMotor },
    blocosAcionados: blocos,
  });
});

// =============================================================================
// ONDA D — CRANIOTOMIA VIVA (a tela das sinapses)
// Visualiza o subgrafo CONECTADO do Cerebro em 3 colunas:
//   Dendritos (entradas: perguntas da anamnese que disparam ligacoes)
//   Corpo Celular (doencas acesas + escore)
//   Axonios (saidas: indicacoes de dieta/treino/formula/injetavel via item_doenca)
// =============================================================================

// Deriva um valor de resposta que SATISFAZ o gatilho de uma ligacao, para montar
// os perfis de teste do Modo Simular sem hardcode (gatilho ">=2" -> 2, "sim" -> "sim").
function valorQueDispara(gatilho: string | null): string | number {
  if (gatilho == null || gatilho === "") return "sim";
  if (gatilho.startsWith(">=")) return Number(gatilho.slice(2));
  if (gatilho.startsWith(">")) return Number(gatilho.slice(1)) + 1;
  return gatilho;
}

// ---- GET: grafo conectado + perfis de teste (Requisitos 1 e 2) ----
router.get("/motor/craniotomia", async (_req, res): Promise<void> => {
  const ligacoes = await db.select().from(perguntaDoencaTable);
  const axoniosRaw = await db.select().from(itemDoencaTable);

  // Conjunto de doencas e perguntas que de fato participam de alguma ligacao.
  const doeIds = new Set<number>();
  const pIds = new Set<string>();
  for (const l of ligacoes) {
    doeIds.add(l.doencaIdIhe);
    pIds.add(l.perguntaId);
  }
  for (const a of axoniosRaw) doeIds.add(a.doencaIdIhe);

  const perguntasAll = await db.select().from(anamneseQuestionarioTable);
  const dendritos = perguntasAll
    .filter((p) => p.perguntaId && pIds.has(p.perguntaId))
    .map((p) => ({
      perguntaId: p.perguntaId as string,
      pergunta: p.pergunta ?? p.perguntaId,
      bloco: p.bloco ?? null,
      sistema: p.sistema ?? null,
      eSinalAlarme: !!p.eSinalAlarme,
      opcoes: (p.opcoes as unknown) ?? null,
    }));

  const doencasAll = await db.select().from(catalogoDoencasTable);
  const corpoCelular = doencasAll
    .filter((d) => doeIds.has(d.idIhe))
    .map((d) => ({ idIhe: d.idIhe, nomeDoenca: d.nomeDoenca ?? `Doenca ${d.idIhe}`, grupo: d.grupo ?? null }));

  const axonios = axoniosRaw.map((a) => ({
    id: a.id,
    itemTipo: a.itemTipo,
    itemRef: a.itemRef,
    itemNome: a.itemNome ?? a.itemRef,
    doencaIdIhe: a.doencaIdIhe,
    peso: a.peso ?? 1,
  }));

  // Perfis de teste do Modo Simular: um por doenca conectada (responde as
  // perguntas que a acendem) + um perfil que dispara TODOS os dendritos.
  const ligacoesPorDoenca = new Map<number, typeof ligacoes>();
  for (const l of ligacoes) {
    const arr = ligacoesPorDoenca.get(l.doencaIdIhe) ?? [];
    arr.push(l);
    ligacoesPorDoenca.set(l.doencaIdIhe, arr);
  }
  const nomePorDoenca = new Map(corpoCelular.map((d) => [d.idIhe, d.nomeDoenca]));
  const perfis: { id: string; nome: string; respostas: RespostaMotor[] }[] = [];
  for (const [doeId, lks] of ligacoesPorDoenca) {
    perfis.push({
      id: `doenca-${doeId}`,
      nome: `ACENDE: ${nomePorDoenca.get(doeId) ?? `Doenca ${doeId}`}`,
      respostas: lks.map((l) => ({ perguntaId: l.perguntaId, valor: valorQueDispara(l.gatilhoValor) })),
    });
  }
  if (ligacoes.length) {
    perfis.unshift({
      id: "todos",
      nome: "TODOS OS DENDRITOS (acende tudo)",
      respostas: ligacoes.map((l) => ({ perguntaId: l.perguntaId, valor: valorQueDispara(l.gatilhoValor) })),
    });
  }

  res.json({
    dendritos,
    corpoCelular,
    axonios,
    ligacoes: ligacoes.map((l) => ({
      id: l.id,
      perguntaId: l.perguntaId,
      doencaIdIhe: l.doencaIdIhe,
      gatilhoValor: l.gatilhoValor,
      peso: l.peso ?? 1,
    })),
    perfis,
  });
});

// ---- POST: simular um perfil e devolver quais nos acendem (Requisito 3) ----
router.post("/motor/craniotomia/simular", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { respostas?: RespostaMotor[] };
  const respostas = Array.isArray(body.respostas) ? body.respostas : [];
  const mapResp = new Map<string, string | number>();
  for (const r of respostas) mapResp.set(r.perguntaId, r.valor);

  const ligacoes = await db.select().from(perguntaDoencaTable);
  const axoniosRaw = await db.select().from(itemDoencaTable);

  const doencasAcesas = new Set<number>();
  const dendritosAcionados = new Set<string>();
  for (const l of ligacoes) {
    if (!mapResp.has(l.perguntaId)) continue;
    if (gatilhoBate(l.gatilhoValor, mapResp.get(l.perguntaId)!)) {
      doencasAcesas.add(l.doencaIdIhe);
      dendritosAcionados.add(l.perguntaId);
    }
  }
  const axoniosAcionados = axoniosRaw
    .filter((a) => doencasAcesas.has(a.doencaIdIhe))
    .map((a) => a.id);

  const resultado = await computeMotor(respostas);
  res.json({
    escoreTotal: resultado.escoreTotal,
    gradeGlobal: resultado.gradeGlobal,
    redFlag: resultado.redFlag,
    dendritosAcionados: Array.from(dendritosAcionados),
    doencasAcesas: Array.from(doencasAcesas),
    axoniosAcionados,
  });
});

// ---- PATCH: editar o peso de um axonio (ligacao doenca->saida) in situ (Req 4) ----
router.patch("/motor/axonio/:id/peso", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const body = (req.body ?? {}) as { peso?: unknown };
  const peso = Number(body.peso);
  if (!Number.isInteger(peso) || peso < 0 || peso > 99) {
    res.status(400).json({ error: "peso deve ser inteiro entre 0 e 99" });
    return;
  }
  const [updated] = await db
    .update(itemDoencaTable)
    .set({ peso })
    .where(eq(itemDoencaTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "axonio nao encontrado" });
    return;
  }
  res.json({ id: updated.id, peso: updated.peso ?? peso });
});

export default router;
