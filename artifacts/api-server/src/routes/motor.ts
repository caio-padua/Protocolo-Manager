import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import {
  db,
  catalogoExamesTable,
  catalogoBlocoExamesTable,
  catalogoBlocosTable,
  catalogoDoencasTable,
} from "@workspace/db";
import {
  runTransmutacaoMotor,
  DEFAULT_EXAMES_URL,
  DEFAULT_MOTOR_URL,
  DEFAULT_ENDOVENOSOS_URL,
} from "../lib/transmutacao-motor";

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

export default router;
