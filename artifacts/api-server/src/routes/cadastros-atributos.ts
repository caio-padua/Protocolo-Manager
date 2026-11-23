import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

// =============================================================================
// ATRIBUTOS ADICIONAIS DO EXAME + OPCOES (natureza, metodo, eixo, regiao,
// material, gatilho). ADITIVO: tabelas proprias, nenhuma coluna de
// catalogo_exames e alterada, nenhum codigo e regenerado. "Excluir" = desativar.
// Nada aqui altera o cerebro clinico (blocos/graus/gatilhos de anamnese).
// =============================================================================
const router: IRouter = Router();

const TIPOS = ["natureza", "metodo", "eixo", "regiao", "material", "gatilho"] as const;
const tipoSchema = z.enum(TIPOS);

const NATUREZAS = ["LABORATORIAL", "IMAGEM", "COMPOSICAO CORPORAL", "METODOS GRAFICOS", "ENDOSCOPICOS"];
const METODOS = ["ULTRASSONOGRAFIA", "TOMOGRAFIA", "RESSONANCIA MAGNETICA", "RADIOGRAFIA", "MAMOGRAFIA", "DENSITOMETRIA", "ELETROCARDIOGRAMA", "ECOCARDIOGRAMA", "TESTE ERGOMETRICO", "HOLTER", "MAPA", "ENDOSCOPIA DIGESTIVA ALTA", "COLONOSCOPIA", "BIOIMPEDANCIA", "ANALISE LABORATORIAL"];
const REGIOES = [
  "CRANIO", "ENCEFALO", "SELA TURCICA", "SEIOS DA FACE", "OLHOS / ORBITAS", "OUVIDOS", "PESCOCO", "TIREOIDE", "PARATIREOIDES", "CAROTIDAS",
  "COLUNA CERVICAL", "COLUNA TORACICA", "COLUNA LOMBAR", "SACRO / COCCIX", "TORAX", "PULMOES", "MAMAS", "CORACAO", "AORTA", "ABDOME TOTAL",
  "ABDOME SUPERIOR", "FIGADO / VIAS BILIARES", "PANCREAS", "BACO", "RINS / VIAS URINARIAS", "BEXIGA", "ADRENAIS", "ESOFAGO", "ESTOMAGO", "INTESTINO DELGADO",
  "COLON", "RETO / ANUS", "PELVE", "UTERO / OVARIOS", "PROSTATA", "TESTICULOS / BOLSA ESCROTAL", "OMBRO", "BRACO", "COTOVELO", "ANTEBRACO",
  "PUNHO", "MAO", "QUADRIL", "COXA", "JOELHO", "PERNA", "TORNOZELO", "PE", "ARTERIAS DOS MEMBROS INFERIORES", "VEIAS DOS MEMBROS INFERIORES",
  "ARTERIAS DOS MEMBROS SUPERIORES", "CORPO INTEIRO", "ARTICULACAO TEMPOROMANDIBULAR", "TECIDOS MOLES", "PELE", "LINFONODOS",
];

let pronta: Promise<void> | null = null;
function garantir(): Promise<void> {
  if (!pronta) {
    pronta = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS catalogo_exame_opcoes (
          id SERIAL PRIMARY KEY,
          tipo TEXT NOT NULL CHECK (tipo IN ('natureza','metodo','eixo','regiao','material','gatilho')),
          nome TEXT NOT NULL,
          nome_norm TEXT NOT NULL,
          ativo BOOLEAN NOT NULL DEFAULT TRUE,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT catalogo_exame_opcoes_uk UNIQUE (tipo, nome_norm)
        )`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS catalogo_exame_atributos (
          exame_id INTEGER PRIMARY KEY,
          natureza TEXT, metodo TEXT, regiao TEXT, material TEXT,
          lateralidade TEXT, contraste TEXT, tipo_resultado TEXT, prioridade TEXT,
          eixos TEXT[] NOT NULL DEFAULT '{}', sinonimos TEXT[] NOT NULL DEFAULT '{}', gatilhos TEXT[] NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      const seeds: Array<[string, string[]]> = [["natureza", NATUREZAS], ["metodo", METODOS], ["regiao", REGIOES]];
      for (const [tipo, lista] of seeds) {
        for (const nome of lista) {
          await db.execute(sql`INSERT INTO catalogo_exame_opcoes (tipo, nome, nome_norm) VALUES (${tipo}, ${nome}, ${nome}) ON CONFLICT DO NOTHING`);
        }
      }
      // materiais: copia dos valores ja usados (nao altera exames)
      await db.execute(sql`
        INSERT INTO catalogo_exame_opcoes (tipo, nome, nome_norm)
        SELECT 'material', v, upper(v) FROM (SELECT DISTINCT trim(material_ou_setor) v FROM catalogo_exames WHERE material_ou_setor IS NOT NULL AND trim(material_ou_setor) <> '') x
        ON CONFLICT DO NOTHING`);
    })().catch((e) => {
      pronta = null;
      throw e;
    });
  }
  return pronta;
}

router.get("/cadastros/opcoes-exame", async (req, res): Promise<void> => {
  const tipo = tipoSchema.safeParse(req.query.tipo);
  if (!tipo.success) {
    res.status(400).json({ error: `tipo deve ser: ${TIPOS.join(", ")}` });
    return;
  }
  await garantir();
  const col = { natureza: "natureza", metodo: "metodo", regiao: "regiao", material: "material" } as Record<string, string>;
  const arr = { eixo: "eixos", gatilho: "gatilhos" } as Record<string, string>;
  const uso = col[tipo.data]
    ? sql`(SELECT count(*)::int FROM catalogo_exame_atributos a WHERE upper(a.${sql.raw(col[tipo.data])}) = o.nome_norm)`
    : sql`(SELECT count(*)::int FROM catalogo_exame_atributos a WHERE o.nome_norm = ANY (SELECT upper(x) FROM unnest(a.${sql.raw(arr[tipo.data])}) x))`;
  const r = await db.execute(sql`SELECT o.id, o.nome, o.ativo, ${uso} AS total FROM catalogo_exame_opcoes o WHERE o.tipo = ${tipo.data} ORDER BY o.nome_norm`);
  res.json(r.rows);
});

router.post("/cadastros/opcoes-exame", async (req, res): Promise<void> => {
  const p = z.object({ tipo: tipoSchema, nome: z.string().trim().min(1).max(200) }).safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "tipo e nome sao obrigatorios" });
    return;
  }
  await garantir();
  const nome = p.data.nome.replace(/\s+/g, " ").toUpperCase();
  const ins = await db.execute(sql`INSERT INTO catalogo_exame_opcoes (tipo, nome, nome_norm) VALUES (${p.data.tipo}, ${nome}, ${nome}) ON CONFLICT DO NOTHING RETURNING id, nome, ativo`);
  if (ins.rows.length === 0) {
    res.status(409).json({ error: `Ja existe "${nome}" neste cadastro.` });
    return;
  }
  res.status(201).json({ ...ins.rows[0], total: 0 });
});

// Renomear propaga para os atributos que usam o nome antigo (mesma transacao).
router.patch("/cadastros/opcoes-exame/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const p = z.object({ nome: z.string().trim().min(1).max(200) }).safeParse(req.body);
  if (!Number.isInteger(id) || !p.success) {
    res.status(400).json({ error: "id e nome validos sao obrigatorios" });
    return;
  }
  await garantir();
  const novo = p.data.nome.replace(/\s+/g, " ").toUpperCase();
  const out = await db.transaction(async (tx) => {
    const a = (await tx.execute(sql`SELECT tipo, nome FROM catalogo_exame_opcoes WHERE id = ${id} FOR UPDATE`)).rows[0] as { tipo: string; nome: string } | undefined;
    if (!a) return 404;
    if (a.nome === novo) return 200;
    const dup = await tx.execute(sql`SELECT 1 FROM catalogo_exame_opcoes WHERE tipo = ${a.tipo} AND nome_norm = ${novo}`);
    if (dup.rows.length > 0) return 409;
    if (["natureza", "metodo", "regiao", "material"].includes(a.tipo)) {
      await tx.execute(sql`UPDATE catalogo_exame_atributos SET ${sql.raw(a.tipo)} = ${novo} WHERE upper(${sql.raw(a.tipo)}) = ${a.nome.toUpperCase()}`);
    } else {
      const c = sql.raw(a.tipo === "eixo" ? "eixos" : "gatilhos");
      await tx.execute(sql`UPDATE catalogo_exame_atributos SET ${c} = array_replace(${c}, ${a.nome}, ${novo}) WHERE ${a.nome} = ANY(${c})`);
    }
    await tx.execute(sql`UPDATE catalogo_exame_opcoes SET nome = ${novo}, nome_norm = ${novo} WHERE id = ${id}`);
    return 200;
  });
  if (out !== 200) {
    res.status(out).json({ error: out === 404 ? "Opcao nao encontrada" : `Ja existe "${novo}" neste cadastro.` });
    return;
  }
  res.json({ id, nome: novo });
});

router.patch("/cadastros/opcoes-exame/:id/ativo", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const ativo = z.boolean().safeParse(req.body?.ativo);
  if (!Number.isInteger(id) || !ativo.success) {
    res.status(400).json({ error: "id e 'ativo' sao obrigatorios" });
    return;
  }
  await garantir();
  const u = await db.execute(sql`UPDATE catalogo_exame_opcoes SET ativo = ${ativo.data} WHERE id = ${id} RETURNING id, nome, ativo`);
  if (u.rows.length === 0) {
    res.status(404).json({ error: "Opcao nao encontrada" });
    return;
  }
  res.json(u.rows[0]);
});

const lista = z.array(z.string().trim().min(1).max(200)).max(60).default([]);
const atributosSchema = z.object({
  natureza: z.string().trim().max(120).nullish(),
  metodo: z.string().trim().max(120).nullish(),
  regiao: z.string().trim().max(120).nullish(),
  material: z.string().trim().max(120).nullish(),
  lateralidade: z.enum(["DIREITA", "ESQUERDA", "BILATERAL", "NAO SE APLICA"]).nullish(),
  contraste: z.enum(["COM CONTRASTE", "SEM CONTRASTE", "COM E SEM CONTRASTE", "NAO SE APLICA"]).nullish(),
  tipoResultado: z.string().trim().max(120).nullish(),
  prioridade: z.enum(["ROTINA", "PRIORITARIO", "URGENTE"]).nullish(),
  eixos: lista,
  sinonimos: lista,
  gatilhos: lista,
});

router.get("/cadastros/exames-atributos", async (_req, res): Promise<void> => {
  await garantir();
  const r = await db.execute(sql`
    SELECT exame_id AS "exameId", natureza, metodo, regiao, material, lateralidade, contraste,
           tipo_resultado AS "tipoResultado", prioridade, eixos, sinonimos, gatilhos FROM catalogo_exame_atributos`);
  res.json(r.rows);
});

router.put("/cadastros/exames/:id/atributos", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const p = atributosSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !p.success) {
    res.status(400).json({ error: "Dados invalidos" });
    return;
  }
  await garantir();
  const ex = await db.execute(sql`SELECT 1 FROM catalogo_exames WHERE id = ${id}`);
  if (ex.rows.length === 0) {
    res.status(404).json({ error: "Exame nao encontrado" });
    return;
  }
  const d = p.data;
  const pg = (a: string[]) => sql`ARRAY[${sql.join(a.map((x) => sql`${x}`), sql`, `)}]::text[]`;
  const arr = (a: string[]) => (a.length ? pg(a) : sql`'{}'::text[]`);
  await db.execute(sql`
    INSERT INTO catalogo_exame_atributos (exame_id, natureza, metodo, regiao, material, lateralidade, contraste, tipo_resultado, prioridade, eixos, sinonimos, gatilhos, updated_at)
    VALUES (${id}, ${d.natureza ?? null}, ${d.metodo ?? null}, ${d.regiao ?? null}, ${d.material ?? null}, ${d.lateralidade ?? null}, ${d.contraste ?? null},
            ${d.tipoResultado ?? null}, ${d.prioridade ?? null}, ${arr(d.eixos)}, ${arr(d.sinonimos)}, ${arr(d.gatilhos)}, NOW())
    ON CONFLICT (exame_id) DO UPDATE SET natureza = EXCLUDED.natureza, metodo = EXCLUDED.metodo, regiao = EXCLUDED.regiao, material = EXCLUDED.material,
      lateralidade = EXCLUDED.lateralidade, contraste = EXCLUDED.contraste, tipo_resultado = EXCLUDED.tipo_resultado, prioridade = EXCLUDED.prioridade,
      eixos = EXCLUDED.eixos, sinonimos = EXCLUDED.sinonimos, gatilhos = EXCLUDED.gatilhos, updated_at = NOW()`);
  req.log.info({ id }, "atributos do exame salvos");
  res.json({ exameId: id, ...d });
});

// Previa de impacto: quantas linhas da grade (e blocos) usam este exame pelo nome.
router.get("/cadastros/exames/:id/impacto", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const r = await db.execute(sql`
    SELECT b.bloco_id AS "blocoId", b.nome_bloco AS "nomeBloco", b.grau, b.ativo
    FROM catalogo_bloco_exames b JOIN catalogo_exames e ON upper(trim(e.nome_exame)) = upper(trim(b.nome_exame))
    WHERE e.id = ${id} ORDER BY b.nome_bloco, b.grau`);
  res.json({ vinculos: r.rows });
});

export default router;
