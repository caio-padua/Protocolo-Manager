import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import multer from "multer";

// =============================================================================
// ATRIBUTOS ADICIONAIS DO EXAME + OPCOES (natureza, metodo, eixo, regiao,
// material, gatilho). ADITIVO: tabelas proprias, nenhuma coluna de
// catalogo_exames e alterada, nenhum codigo e regenerado. "Excluir" = desativar.
// Nada aqui altera o cerebro clinico (blocos/graus/gatilhos de anamnese).
// =============================================================================
const router: IRouter = Router();

const TIPOS = ["natureza", "metodo", "eixo", "regiao", "material", "gatilho", "diretriz"] as const;
const tipoSchema = z.enum(TIPOS);

const NATUREZAS = ["LABORATORIAL", "IMAGEM", "COMPOSICAO CORPORAL", "METODOS GRAFICOS", "ENDOSCOPICOS"];
const DIRETRIZES = ["SBC", "SBCP", "FEBRASGO", "CBR", "SBM", "ABRASSO", "INCA/MS", "USPSTF", "ACC/AHA", "ACG"];
const MATERIAIS_BIO = ["SORO", "SANGUE TOTAL", "PLASMA", "URINA ISOLADA", "URINA 24H", "FEZES", "SALIVA", "SWAB/SECRECAO", "LIQUOR"];
const MATERIAIS_NAO_BIO = ["CARDIO", "IMAGEM", "FUNCIONAL", "IMAGEM / PROCEDIMENTO"];
const METODOS = ["ULTRASSONOGRAFIA", "TOMOGRAFIA", "RESSONANCIA MAGNETICA", "RADIOGRAFIA", "MAMOGRAFIA", "DENSITOMETRIA", "ELETROCARDIOGRAMA", "ECOCARDIOGRAMA", "TESTE ERGOMETRICO", "HOLTER", "MAPA", "ENDOSCOPIA DIGESTIVA ALTA", "COLONOSCOPIA", "BIOIMPEDANCIA", "ANALISE LABORATORIAL"];
const REGIOES = [
  "CRANIO", "ENCEFALO", "SELA TURCICA", "SEIOS DA FACE", "OLHOS / ORBITAS", "OUVIDOS", "PESCOCO", "TIREOIDE", "PARATIREOIDES", "CAROTIDAS",
  "COLUNA CERVICAL", "COLUNA TORACICA", "COLUNA LOMBAR", "SACRO / COCCIX", "TORAX", "PULMOES", "MAMAS", "CORACAO", "AORTA", "ABDOME TOTAL",
  "ABDOME SUPERIOR", "FIGADO / VIAS BILIARES", "PANCREAS", "BACO", "RINS / VIAS URINARIAS", "BEXIGA", "ADRENAIS", "ESOFAGO", "ESTOMAGO", "INTESTINO DELGADO",
  "COLON", "RETO / ANUS", "PELVE", "UTERO / OVARIOS", "PROSTATA", "TESTICULOS / BOLSA ESCROTAL", "OMBRO", "BRACO", "COTOVELO", "ANTEBRACO",
  "PUNHO", "MAO", "QUADRIL", "COXA", "JOELHO", "PERNA", "TORNOZELO", "PE", "ARTERIAS DOS MEMBROS INFERIORES", "VEIAS DOS MEMBROS INFERIORES",
  "ARTERIAS DOS MEMBROS SUPERIORES", "CORPO INTEIRO", "ARTICULACAO TEMPOROMANDIBULAR", "TECIDOS MOLES", "PELE", "LINFONODOS",
];

const EIXOS = ["Metabólico & Glicêmico", "Tireoide", "Adrenal & Estresse", "Hormonal / Gonadal", "Cardiovascular", "Gastro & Hepático", "Autoimune & Inflamatório", "Osteoarticular & Coluna", "Neurológico & Sono", "Respiratório", "Urológico / Renal", "Nutricional & Base Integrativa", "Genética & Longevidade"];
const GATILHOS = ["fadiga_matinal", "queda_de_cabelo", "ganho_de_peso", "dificuldade_emagrecer", "compulsao_doce", "insonia", "esgotamento", "ansiedade_noturna", "baixa_libido", "perda_massa_muscular", "distensao_pos_prandial", "refluxo", "tosse_pos_prandial", "palpitacao", "pressao_alta", "dor_lombar", "dor_cervical", "dores_articulares", "checkup_rotina", "uso_glp1", "uso_ibp"];
const REGIOES_V2 = ["Crânio & Encéfalo", "Pescoço & Tireoide", "Tórax & Pulmão", "Coração & Grandes Vasos", "Mamas & Axilas", "Abdome Total", "Abdome Superior (Fígado/Vias)", "Parede Abdominal & Inguinal", "Trato Digestivo (Endoscópico)", "Pelve Feminina", "Pelve Masculina / Próstata", "Rins & Vias Urinárias", "Coluna Cervical", "Coluna Torácica", "Coluna Lombossacra", "Ombro", "Cotovelo/Punho/Mão", "Quadril", "Joelho", "Tornozelo/Pé", "Corpo Inteiro / Ósseo", "Vascular Cervical (Carótidas)", "Vascular Membros Inferiores", "Aorta Abdominal"];

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
      await db.execute(sql`ALTER TABLE catalogo_exame_opcoes DROP CONSTRAINT IF EXISTS catalogo_exame_opcoes_tipo_check`);
      await db.execute(sql`ALTER TABLE catalogo_exame_opcoes ADD CONSTRAINT catalogo_exame_opcoes_tipo_check CHECK (tipo IN ('natureza','metodo','eixo','regiao','material','gatilho','diretriz'))`);
      for (const c of [
        "periodizacao_modo TEXT", "publico_alvo TEXT", "idade_minima INTEGER", "idade_maxima INTEGER",
        "repetir_meses INTEGER", "regra_antecipacao TEXT", "diretrizes TEXT[] NOT NULL DEFAULT '{}'",
        "artigos JSONB NOT NULL DEFAULT '[]'::jsonb",
      ]) await db.execute(sql`ALTER TABLE catalogo_exame_atributos ADD COLUMN IF NOT EXISTS ${sql.raw(c)}`);
      const seeds: Array<[string, string[]]> = [["natureza", NATUREZAS], ["metodo", METODOS], ["regiao", REGIOES], ["diretriz", DIRETRIZES]];
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
      // Material biologico = so amostras fisicas. Aplicado UMA vez (marcador: opcao SWAB/SECRECAO ainda nao existe).
      const jaSeparado = await db.execute(sql`SELECT 1 FROM catalogo_exame_opcoes WHERE tipo='material' AND nome_norm='SWAB/SECRECAO'`);
      if (jaSeparado.rows.length === 0) {
        for (const nome of MATERIAIS_BIO) {
          await db.execute(sql`INSERT INTO catalogo_exame_opcoes (tipo, nome, nome_norm) VALUES ('material', ${nome}, ${nome}) ON CONFLICT DO NOTHING`);
        }
        for (const nome of MATERIAIS_NAO_BIO) {
          await db.execute(sql`UPDATE catalogo_exame_opcoes SET ativo = FALSE WHERE tipo='material' AND nome_norm = ${nome}`);
        }
      }
      await db.execute(sql`CREATE TABLE IF NOT EXISTS catalogo_exame_migracoes (chave TEXT PRIMARY KEY, feito_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      const nova = async (chave: string) => (await db.execute(sql`INSERT INTO catalogo_exame_migracoes (chave) VALUES (${chave}) ON CONFLICT DO NOTHING RETURNING chave`)).rows.length > 0;
      // Pre-popular listas vazias (aditivo; ON CONFLICT nao sobrescreve nada).
      if (await nova("seed-eixos-gatilhos-regioes-v1")) {
        for (const [tipo, lista] of [["eixo", EIXOS], ["gatilho", GATILHOS], ["regiao", REGIOES_V2]] as Array<[string, string[]]>) {
          for (const nome of lista) {
            await db.execute(sql`INSERT INTO catalogo_exame_opcoes (tipo, nome, nome_norm) VALUES (${tipo}, ${nome}, ${nome}) ON CONFLICT DO NOTHING`);
          }
        }
      }
      // SANGUE = SANGUE TOTAL (mesma amostra). Migra o valor nos exames/atributos e desativa a opcao duplicada.
      if (await nova("unificar-sangue-v1")) {
        await db.execute(sql`INSERT INTO catalogo_exame_opcoes (tipo, nome, nome_norm) VALUES ('material','SANGUE TOTAL','SANGUE TOTAL') ON CONFLICT DO NOTHING`);
        await db.execute(sql`UPDATE catalogo_exames SET material_ou_setor = 'SANGUE TOTAL' WHERE upper(trim(material_ou_setor)) = 'SANGUE'`);
        await db.execute(sql`UPDATE catalogo_exame_atributos SET material = 'SANGUE TOTAL' WHERE upper(trim(material)) = 'SANGUE'`);
        await db.execute(sql`UPDATE catalogo_exame_opcoes SET ativo = FALSE WHERE tipo='material' AND nome_norm = 'SANGUE'`);
      }
      // CARDIO e CARDIO / IMAGEM saem da lista de Modalidades (so desativa; exames mantem o valor).
      if (await nova("desativar-modalidades-cardio-v1")) {
        await db.execute(sql`UPDATE catalogo_exame_classificacoes SET ativo = FALSE WHERE campo = 'modalidade' AND upper(nome_norm) IN ('CARDIO','CARDIO / IMAGEM')`);
      }
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
  const arr = { eixo: "eixos", gatilho: "gatilhos", diretriz: "diretrizes" } as Record<string, string>;
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
      const c = sql.raw(a.tipo === "eixo" ? "eixos" : a.tipo === "gatilho" ? "gatilhos" : "diretrizes");
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
  periodizacaoModo: z.enum(["SOB DEMANDA", "PERIODICO", "POR RISCO"]).nullish(),
  publicoAlvo: z.enum(["AMBOS", "MASCULINO", "FEMININO"]).nullish(),
  idadeMinima: z.number().int().min(0).max(130).nullish(),
  idadeMaxima: z.number().int().min(0).max(130).nullish(),
  repetirMeses: z.number().int().min(1).max(600).nullish(),
  regraAntecipacao: z.string().trim().max(1000).nullish(),
  diretrizes: lista,
  artigos: z.array(z.object({
    autores: z.string().trim().max(500).default(""),
    titulo: z.string().trim().max(500).default(""),
    revista: z.string().trim().max(300).default(""),
    ano: z.string().trim().max(10).default(""),
    link: z.string().trim().max(500).default(""),
  })).max(30).default([]),
}).refine((d) => (d.natureza ?? "").toUpperCase() !== "IMAGEM" || (d.regiao && d.lateralidade && d.contraste), {
  message: "Para IMAGEM, regiao anatomica, lateralidade e contraste sao obrigatorios",
}).refine((d) => d.idadeMinima == null || d.idadeMaxima == null || d.idadeMinima <= d.idadeMaxima, {
  message: "Idade minima nao pode ser maior que a maxima",
});

router.get("/cadastros/exames-atributos", async (_req, res): Promise<void> => {
  await garantir();
  const r = await db.execute(sql`
    SELECT exame_id AS "exameId", natureza, metodo, regiao, material, lateralidade, contraste,
           tipo_resultado AS "tipoResultado", prioridade, eixos, sinonimos, gatilhos,
           periodizacao_modo AS "periodizacaoModo", publico_alvo AS "publicoAlvo", idade_minima AS "idadeMinima", idade_maxima AS "idadeMaxima",
           repetir_meses AS "repetirMeses", regra_antecipacao AS "regraAntecipacao", diretrizes, artigos FROM catalogo_exame_atributos`);
  res.json(r.rows);
});

router.put("/cadastros/exames/:id/atributos", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const p = atributosSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !p.success) {
    res.status(400).json({ error: p.success ? "Dados invalidos" : (p.error.issues[0]?.message ?? "Dados invalidos") });
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
    INSERT INTO catalogo_exame_atributos (exame_id, natureza, metodo, regiao, material, lateralidade, contraste, tipo_resultado, prioridade, eixos, sinonimos, gatilhos, periodizacao_modo, publico_alvo, idade_minima, idade_maxima, repetir_meses, regra_antecipacao, diretrizes, artigos, updated_at)
    VALUES (${id}, ${d.natureza ?? null}, ${d.metodo ?? null}, ${d.regiao ?? null}, ${d.material ?? null}, ${d.lateralidade ?? null}, ${d.contraste ?? null},
            ${d.tipoResultado ?? null}, ${d.prioridade ?? null}, ${arr(d.eixos)}, ${arr(d.sinonimos)}, ${arr(d.gatilhos)}, ${d.periodizacaoModo ?? null}, ${d.publicoAlvo ?? null}, ${d.idadeMinima ?? null}, ${d.idadeMaxima ?? null}, ${d.repetirMeses ?? null}, ${d.regraAntecipacao ?? null}, ${arr(d.diretrizes)}, ${JSON.stringify(d.artigos)}::jsonb, NOW())
    ON CONFLICT (exame_id) DO UPDATE SET natureza = EXCLUDED.natureza, metodo = EXCLUDED.metodo, regiao = EXCLUDED.regiao, material = EXCLUDED.material,
      lateralidade = EXCLUDED.lateralidade, contraste = EXCLUDED.contraste, tipo_resultado = EXCLUDED.tipo_resultado, prioridade = EXCLUDED.prioridade,
      eixos = EXCLUDED.eixos, sinonimos = EXCLUDED.sinonimos, gatilhos = EXCLUDED.gatilhos,
      periodizacao_modo = EXCLUDED.periodizacao_modo, publico_alvo = EXCLUDED.publico_alvo, idade_minima = EXCLUDED.idade_minima, idade_maxima = EXCLUDED.idade_maxima,
      repetir_meses = EXCLUDED.repetir_meses, regra_antecipacao = EXCLUDED.regra_antecipacao, diretrizes = EXCLUDED.diretrizes, artigos = EXCLUDED.artigos, updated_at = NOW()`);
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


// ---- Manual/organograma PDF do modulo de exames (documentacao viva) ----------
const MANUAL_MAX = 20 * 1024 * 1024;
const uploadManual = multer({ storage: multer.memoryStorage(), limits: { fileSize: MANUAL_MAX, files: 1 } });
let manualPronta: Promise<void> | null = null;
function garantirManual(): Promise<void> {
  if (!manualPronta) {
    manualPronta = db
      .execute(sql`CREATE TABLE IF NOT EXISTS catalogo_exames_manuais (
        id SERIAL PRIMARY KEY, nome TEXT NOT NULL, tamanho INTEGER NOT NULL, conteudo BYTEA NOT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
      .then(() => undefined)
      .catch((e) => { manualPronta = null; throw e; });
  }
  return manualPronta;
}

router.post("/cadastros/exames/manual", (req, res, next) => {
  uploadManual.single("arquivo")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? "Arquivo maior que 20 MB" : "Falha ao receber o arquivo" });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  const f = req.file;
  if (!f) { res.status(400).json({ error: "Envie um arquivo PDF" }); return; }
  if (f.size === 0) { res.status(400).json({ error: "Arquivo vazio" }); return; }
  if (f.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") { res.status(400).json({ error: "O arquivo nao e um PDF valido" }); return; }
  await garantirManual();
  // novo envio NAO apaga os anteriores (historico preservado)
  const r = await db.execute(sql`INSERT INTO catalogo_exames_manuais (nome, tamanho, conteudo) VALUES (${f.originalname.slice(0, 200)}, ${f.size}, ${f.buffer}) RETURNING id, nome, tamanho, criado_em AS "criadoEm"`);
  req.log.info({ id: (r.rows[0] as { id: number }).id, tamanho: f.size }, "manual de exames enviado");
  res.status(201).json(r.rows[0]);
});

router.get("/cadastros/exames/manual", async (_req, res): Promise<void> => {
  await garantirManual();
  const r = await db.execute(sql`SELECT id, nome, tamanho, criado_em AS "criadoEm" FROM catalogo_exames_manuais ORDER BY id DESC LIMIT 1`);
  res.json(r.rows[0] ?? null);
});

router.get("/cadastros/exames/manual/arquivo", async (_req, res): Promise<void> => {
  await garantirManual();
  const r = await db.execute(sql`SELECT nome, conteudo FROM catalogo_exames_manuais ORDER BY id DESC LIMIT 1`);
  const row = r.rows[0] as { nome: string; conteudo: Buffer } | undefined;
  if (!row) { res.status(404).json({ error: "Nenhum manual enviado" }); return; }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="manual-exames.pdf"`);
  res.send(row.conteudo);
});

export default router;
