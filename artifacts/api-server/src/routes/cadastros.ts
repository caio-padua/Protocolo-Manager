import { Router, type IRouter } from "express";
import {
  db,
  catalogoExamesTable,
  catalogoBlocosTable,
  catalogoBlocoExamesTable,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { GRADES_EXAME, montarCodigoExame, nickUnico } from "../lib/codigo-semantico-exame";

const router: IRouter = Router();

class ConflitoCadastro extends Error {}

// =============================================================================
// CADASTROS — escrita (CRUD) sobre o catalogo. Base = PRODUCAO REAL:
//  - SEM hard delete: "excluir" = desligar (ativo=false).
//  - Categorias (grupo_principal) NAO sao normalizadas aqui (decisao do CEO).
//  - Blocos vem duplicados em pares no catalogo_blocos; a lista limpa e
//    derivada da GRADE (catalogo_bloco_exames).
// =============================================================================

const EXAME_SELECT = {
  id: catalogoExamesTable.id,
  codigoExame: catalogoExamesTable.codigoExame,
  nomeExame: catalogoExamesTable.nomeExame,
  grupoPrincipal: catalogoExamesTable.grupoPrincipal,
  subgrupo: catalogoExamesTable.subgrupo,
  modalidade: catalogoExamesTable.modalidade,
  materialOuSetor: catalogoExamesTable.materialOuSetor,
  finalidadePrincipal: catalogoExamesTable.finalidadePrincipal,
  preparo: catalogoExamesTable.preparo,
  blocoOficial: catalogoExamesTable.blocoOficial,
  sexoAplicavel: catalogoExamesTable.sexoAplicavel,
  exameDeRastreio: catalogoExamesTable.exameDeRastreio,
  ativo: catalogoExamesTable.ativo,
};

const exameInputSchema = z.object({
  nomeExame: z.string().trim().min(1, "Nome do exame e obrigatorio").max(300),
  grupoPrincipal: z.string().trim().max(200).optional().nullable(),
  subgrupo: z.string().trim().max(200).optional().nullable(),
  modalidade: z.string().trim().max(120).optional().nullable(),
  materialOuSetor: z.string().trim().max(200).optional().nullable(),
  finalidadePrincipal: z.string().trim().max(500).optional().nullable(),
  preparo: z.string().trim().max(2000).optional().nullable(),
  sexoAplicavel: z.string().trim().max(40).optional().nullable(),
  exameDeRastreio: z.string().trim().max(40).optional().nullable(),
});

// Codigo: ou o legado digitado (codigoExame) ou gerado pelo sistema (areaCodigo + gradeCodigo).
const createExameSchema = exameInputSchema
  .extend({
    codigoExame: z.string().trim().min(1).max(120).optional().nullable(),
    areaCodigo: z.string().trim().length(4).optional().nullable(),
    gradeCodigo: z.string().trim().length(4).optional().nullable(),
    nickCodigo: z.string().trim().length(4).optional().nullable(),
  })
  .refine((d) => d.codigoExame || (d.areaCodigo && d.gradeCodigo), {
    message: "Informe a area e a grade do codigo (o sistema gera o codigo)",
  });

const previaCodigoSchema = z.object({
  nomeExame: z.string().trim().min(1).max(300),
  areaCodigo: z.string().trim().length(4),
  gradeCodigo: z.string().trim().length(4),
  nickCodigo: z.string().trim().length(4).optional().nullable(),
});

// Calcula o codigo semantico (sem gravar). Deve ser chamado dentro da transacao que grava.
async function calcularCodigoExame(
  exec: Pick<typeof db, "execute">,
  d: { nomeExame: string; areaCodigo: string; gradeCodigo: string; nickCodigo?: string | null },
) {
  const usados = await exec.execute(sql`SELECT b4 FROM catalogo_exames WHERE b4 IS NOT NULL`);
  const nicks = new Set(usados.rows.map((r) => String((r as { b4: string }).b4).toUpperCase()));
  const nick = d.nickCodigo ? d.nickCodigo.toUpperCase() : nickUnico(d.nomeExame, nicks);
  if (d.nickCodigo && nicks.has(nick)) {
    const dono = await exec.execute(sql`SELECT nome_exame FROM catalogo_exames WHERE upper(b4) = ${nick} LIMIT 1`);
    const nomeDono = String((dono.rows[0] as { nome_exame?: string } | undefined)?.nome_exame ?? "");
    if (nomeDono.toUpperCase() !== d.nomeExame.toUpperCase()) {
      throw new Error(`O nick ${nick} ja pertence a outro exame (${nomeDono}).`);
    }
  }
  const codigo = montarCodigoExame(d.areaCodigo, d.gradeCodigo, nick);
  const dup = await exec.execute(sql`
    SELECT 1 FROM catalogo_exames WHERE upper(codigo_semantico) = ${codigo.semantico} OR upper(codigo_exame) = ${codigo.compacto} LIMIT 1`);
  if (dup.rows.length > 0) throw new Error(`Ja existe um exame com o codigo ${codigo.semantico}.`);
  return codigo;
}

// ---- Opcoes do gerador de codigo (areas = blocos existentes; grades fixas) ----
router.get("/cadastros/exames/codigo/opcoes", async (_req, res): Promise<void> => {
  const areas = await db.execute(sql`
    SELECT b2 AS codigo, min(coalesce(bloco_oficial, grupo_principal)) AS rotulo, count(*)::int AS total
    FROM catalogo_exames WHERE b2 IS NOT NULL AND b2 <> '' GROUP BY b2 ORDER BY b2`);
  res.json({ areas: areas.rows, grades: GRADES_EXAME });
});

// ---- Previa do codigo (nao grava) ----
router.post("/cadastros/exames/codigo/previa", async (req, res): Promise<void> => {
  const parsed = previaCodigoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  try {
    res.json(await calcularCodigoExame(db, parsed.data));
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : "Codigo invalido" });
  }
});

function nullify<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of Object.keys(out)) {
    if (out[k] === "" || out[k] === undefined) out[k] = null;
  }
  return out as T;
}

// ---- LISTAR exames (para a tela de cadastro) --------------------------------
router.get("/cadastros/exames", async (_req, res): Promise<void> => {
  const rows = await db
    .select(EXAME_SELECT)
    .from(catalogoExamesTable)
    .orderBy(asc(catalogoExamesTable.grupoPrincipal), asc(catalogoExamesTable.nomeExame));
  res.json(rows);
});

// ---- CRIAR exame ------------------------------------------------------------
router.post("/cadastros/exames", async (req, res): Promise<void> => {
  const parsed = createExameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  const { areaCodigo, gradeCodigo, nickCodigo, codigoExame: codigoManual, ...resto } = parsed.data;
  const data = nullify(resto);

  try {
    const created = await db.transaction(async (tx) => {
      // trava global curta: dois cadastros simultaneos nunca geram o mesmo codigo
      await tx.execute(sql`SELECT pg_advisory_xact_lock(19872027)`);
      let valores: Record<string, unknown>;
      if (codigoManual) {
        const existing = await tx
          .select({ id: catalogoExamesTable.id })
          .from(catalogoExamesTable)
          .where(eq(catalogoExamesTable.codigoExame, codigoManual))
          .limit(1);
        if (existing.length > 0) throw new ConflitoCadastro(`Ja existe um exame com o codigo "${codigoManual}".`);
        valores = { ...data, codigoExame: codigoManual };
      } else {
        const cod = await calcularCodigoExame(tx, {
          nomeExame: data.nomeExame,
          areaCodigo: areaCodigo as string,
          gradeCodigo: gradeCodigo as string,
          nickCodigo,
        });
        valores = {
          ...data,
          codigoExame: cod.compacto,
          codigoSemantico: cod.semantico,
          b1: cod.b1,
          b2: cod.b2,
          b3: cod.b3,
          b4: cod.b4,
          seq: cod.seq,
          grauDoBloco: cod.b3,
        };
      }
      const [row] = await tx
        .insert(catalogoExamesTable)
        .values({ ...valores, ativo: true } as typeof catalogoExamesTable.$inferInsert)
        .returning(EXAME_SELECT);
      return row;
    });
    req.log.info({ id: created.id, codigo: created.codigoExame }, "exame criado");
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof ConflitoCadastro || (err instanceof Error && /Ja existe|ja pertence|Nao ha nick|invalida|deve ter/.test(err.message))) {
      res.status(409).json({ error: (err as Error).message });
      return;
    }
    throw err;
  }
});

// ---- EDITAR exame -----------------------------------------------------------
router.put("/cadastros/exames/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const parsed = exameInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  const data = nullify(parsed.data);

  const [updated] = await db
    .update(catalogoExamesTable)
    .set(data)
    .where(eq(catalogoExamesTable.id, id))
    .returning(EXAME_SELECT);
  if (!updated) {
    res.status(404).json({ error: "Exame nao encontrado" });
    return;
  }
  req.log.info({ id }, "exame editado");
  res.json(updated);
});

// ---- LIGAR/DESLIGAR exame (soft delete) -------------------------------------
router.patch("/cadastros/exames/:id/ativo", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const ativo = z.boolean().safeParse(req.body?.ativo);
  if (!ativo.success) {
    res.status(400).json({ error: "Campo 'ativo' (booleano) e obrigatorio" });
    return;
  }
  const [updated] = await db
    .update(catalogoExamesTable)
    .set({ ativo: ativo.data })
    .where(eq(catalogoExamesTable.id, id))
    .returning(EXAME_SELECT);
  if (!updated) {
    res.status(404).json({ error: "Exame nao encontrado" });
    return;
  }
  res.json(updated);
});

// =============================================================================
// CLASSIFICACOES do catalogo (dropdowns do cadastro de exames).
// Uma unica tabela serve os 4 campos de classificacao; nao altera nenhum exame.
// Valores ja usados pelos exames sao semeados (preservados) sem renomear nada.
// "Excluir" = desativar (Regra de Ouro).
// =============================================================================
const CAMPOS_CLASSIFICACAO = {
  categoria: catalogoExamesTable.grupoPrincipal,
  subgrupo: catalogoExamesTable.subgrupo,
  modalidade: catalogoExamesTable.modalidade,
  material_setor: catalogoExamesTable.materialOuSetor,
} as const;
type CampoClassificacao = keyof typeof CAMPOS_CLASSIFICACAO;
const campoSchema = z.enum(["categoria", "subgrupo", "modalidade", "material_setor"]);

const COLUNA_SQL: Record<CampoClassificacao, string> = {
  categoria: "e.grupo_principal",
  subgrupo: "e.subgrupo",
  modalidade: "e.modalidade",
  material_setor: "e.material_ou_setor",
};

let classificacoesPronta: Promise<void> | null = null;
function garantirClassificacoes(): Promise<void> {
  if (!classificacoesPronta) {
    classificacoesPronta = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS catalogo_exame_classificacoes (
          id          SERIAL PRIMARY KEY,
          campo       TEXT NOT NULL CHECK (campo IN ('categoria','subgrupo','modalidade','material_setor')),
          nome        TEXT NOT NULL,
          nome_norm   TEXT NOT NULL,
          ativo       BOOLEAN NOT NULL DEFAULT TRUE,
          criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          criado_por  INTEGER,
          CONSTRAINT catalogo_exame_classificacoes_uk UNIQUE (campo, nome_norm)
        )`);
      for (const [campo, col] of Object.entries(CAMPOS_CLASSIFICACAO)) {
        await db.execute(sql`
          INSERT INTO catalogo_exame_classificacoes (campo, nome, nome_norm)
          SELECT ${campo}, v, upper(trim(v)) FROM (
            SELECT DISTINCT ON (upper(trim(${col}))) trim(${col}) AS v
            FROM catalogo_exames
            WHERE ${col} IS NOT NULL AND trim(${col}) <> ''
            ORDER BY upper(trim(${col})), trim(${col})
          ) x
          ON CONFLICT (campo, nome_norm) DO NOTHING`);
      }
    })().catch((err) => {
      classificacoesPronta = null;
      throw err;
    });
  }
  return classificacoesPronta;
}

router.get("/cadastros/classificacoes", async (req, res): Promise<void> => {
  const campo = campoSchema.safeParse(req.query.campo);
  if (!campo.success) {
    res.status(400).json({ error: "Informe campo: categoria, subgrupo, modalidade ou material_setor" });
    return;
  }
  await garantirClassificacoes();
  const col = sql.raw(COLUNA_SQL[campo.data as CampoClassificacao]);
  const rows = await db.execute(sql`
    SELECT c.id, c.nome, c.ativo,
           (SELECT count(*)::int FROM catalogo_exames e WHERE upper(trim(${col})) = c.nome_norm) AS total
    FROM catalogo_exame_classificacoes c
    WHERE c.campo = ${campo.data}
    ORDER BY c.nome_norm`);
  res.json(rows.rows);
});

router.post("/cadastros/classificacoes", async (req, res): Promise<void> => {
  const parsed = z
    .object({ campo: campoSchema, nome: z.string().trim().min(1, "Nome obrigatorio").max(200) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  await garantirClassificacoes();
  const nome = parsed.data.nome.replace(/\s+/g, " ").toUpperCase();
  const inserted = await db.execute(sql`
    INSERT INTO catalogo_exame_classificacoes (campo, nome, nome_norm, criado_por)
    VALUES (${parsed.data.campo}, ${nome}, ${nome}, ${req.collaborator?.professionalId ?? null})
    ON CONFLICT (campo, nome_norm) DO NOTHING
    RETURNING id, nome, ativo`);
  if (inserted.rows.length === 0) {
    res.status(409).json({ error: `Ja existe "${nome}" neste cadastro.` });
    return;
  }
  req.log.info({ campo: parsed.data.campo, nome }, "classificacao de exame criada");
  res.status(201).json({ ...inserted.rows[0], total: 0 });
});

// Renomear: atualiza o cadastro e os exames que usam o nome antigo, na mesma transacao.
// Nome ja existente => 409 (fusao de duplicadas nao e feita aqui).
router.patch("/cadastros/classificacoes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ nome: z.string().trim().min(1, "Nome obrigatorio").max(200) }).safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "id e nome validos sao obrigatorios" });
    return;
  }
  await garantirClassificacoes();
  const novo = parsed.data.nome.replace(/\s+/g, " ").toUpperCase();
  try {
    const out = await db.transaction(async (tx) => {
      const atual = (await tx.execute(sql`
        SELECT id, campo, nome, nome_norm FROM catalogo_exame_classificacoes WHERE id = ${id} FOR UPDATE`)).rows[0] as
        | { id: number; campo: CampoClassificacao; nome: string; nome_norm: string }
        | undefined;
      if (!atual) return { status: 404 as const };
      if (atual.nome_norm === novo) return { status: 200 as const, atualizados: 0, nome: atual.nome };
      const dup = await tx.execute(sql`
        SELECT 1 FROM catalogo_exame_classificacoes WHERE campo = ${atual.campo} AND nome_norm = ${novo}`);
      if (dup.rows.length > 0) return { status: 409 as const };
      const colunaExame = sql.raw(COLUNA_SQL[atual.campo].replace("e.", ""));
      const upd = await tx.execute(sql`
        UPDATE catalogo_exames SET ${colunaExame} = ${novo}
        WHERE upper(trim(${colunaExame})) = ${atual.nome_norm}`);
      await tx.execute(sql`
        UPDATE catalogo_exame_classificacoes SET nome = ${novo}, nome_norm = ${novo} WHERE id = ${id}`);
      return { status: 200 as const, atualizados: upd.rowCount ?? 0, nome: novo };
    });
    if (out.status === 404) {
      res.status(404).json({ error: "Classificacao nao encontrada" });
      return;
    }
    if (out.status === 409) {
      res.status(409).json({ error: `Ja existe "${novo}" neste cadastro.` });
      return;
    }
    req.log.info({ id, atualizados: out.atualizados }, "classificacao de exame renomeada");
    res.json({ id, nome: out.nome, exames_atualizados: out.atualizados });
  } catch (err) {
    req.log.error({ err }, "falha ao renomear classificacao");
    res.status(500).json({ error: "Falha ao renomear" });
  }
});

router.patch("/cadastros/classificacoes/:id/ativo", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const ativo = z.boolean().safeParse(req.body?.ativo);
  if (!Number.isInteger(id) || !ativo.success) {
    res.status(400).json({ error: "id e 'ativo' (booleano) sao obrigatorios" });
    return;
  }
  await garantirClassificacoes();
  const upd = await db.execute(sql`
    UPDATE catalogo_exame_classificacoes SET ativo = ${ativo.data}
    WHERE id = ${id} RETURNING id, nome, ativo`);
  if (upd.rows.length === 0) {
    res.status(404).json({ error: "Classificacao nao encontrada" });
    return;
  }
  res.json(upd.rows[0]);
});

// Excluir de verdade: SO se nenhum exame usa o nome (cadastro criado por engano).
// Com exames vinculados => 409 e orienta desativar (Regra de Ouro).
router.delete("/cadastros/classificacoes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  await garantirClassificacoes();
  const out = await db.transaction(async (tx) => {
    const atual = (await tx.execute(sql`
      SELECT campo, nome, nome_norm FROM catalogo_exame_classificacoes WHERE id = ${id} FOR UPDATE`)).rows[0] as
      | { campo: CampoClassificacao; nome: string; nome_norm: string }
      | undefined;
    if (!atual) return { status: 404 as const };
    const col = sql.raw(COLUNA_SQL[atual.campo].replace("e.", ""));
    const uso = (await tx.execute(sql`
      SELECT count(*)::int AS n FROM catalogo_exames WHERE upper(trim(${col})) = ${atual.nome_norm}`)).rows[0] as { n: number };
    if (uso.n > 0) return { status: 409 as const, n: uso.n, nome: atual.nome };
    await tx.execute(sql`DELETE FROM catalogo_exame_classificacoes WHERE id = ${id}`);
    return { status: 200 as const, nome: atual.nome };
  });
  if (out.status === 404) {
    res.status(404).json({ error: "Classificacao nao encontrada" });
    return;
  }
  if (out.status === 409) {
    res.status(409).json({ error: `"${out.nome}" e usado por ${out.n} exame(s). Desative em vez de excluir.` });
    return;
  }
  req.log.info({ id, nome: out.nome }, "classificacao sem uso excluida");
  res.json({ id, excluido: true });
});

// ---- CATEGORIAS (grupo_principal distinto + contagem) -----------------------
router.get("/cadastros/categorias", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      nome: catalogoExamesTable.grupoPrincipal,
      total: sql<number>`count(*)::int`,
    })
    .from(catalogoExamesTable)
    .groupBy(catalogoExamesTable.grupoPrincipal)
    .orderBy(asc(catalogoExamesTable.grupoPrincipal));
  res.json(rows.filter((r) => r.nome && r.nome.trim().length > 0));
});

// ---- BLOCOS (subdivisoes) com a GRADE agrupada por grau ---------------------
interface BlocoGrau {
  grau: string;
  exames: Array<{ id: number; nomeExame: string; codigoPadcom: string | null; ordem: number | null }>;
}
interface BlocoView {
  codigoBloco: string;
  nomeBloco: string | null;
  tipoMacro: string | null;
  totalExames: number;
  graus: BlocoGrau[];
}

// =============================================================================
// EDICAO DOS BLOCOS: mover exame entre blocos/graus, tirar do bloco, incluir.
// A grade (catalogo_bloco_exames) e a fonte que o cerebro clinico le para sugerir
// blocos na anamnese. Nada e apagado: "tirar do bloco" = ativo=false (o cerebro
// ignora linhas inativas). O codigo semantico do exame NUNCA muda ao mover.
// =============================================================================
const GRAUS_BLOCO = ["GRADE BASICA", "GRADE INTERMEDIARIA", "GRADE SOFISTICADA", "GRADE AMPLIADA", "SEM GRADE"] as const;
const grauSchema = z.enum(GRAUS_BLOCO);

async function dadosDoBloco(tx: Pick<typeof db, "execute">, blocoId: string) {
  const r = await tx.execute(sql`
    SELECT nome_bloco, bool_or(usa_grade) AS usa_grade FROM catalogo_bloco_exames
    WHERE bloco_id = ${blocoId} GROUP BY nome_bloco LIMIT 1`);
  return r.rows[0] as { nome_bloco: string | null; usa_grade: boolean | null } | undefined;
}
async function proximaOrdem(tx: Pick<typeof db, "execute">, blocoId: string, grau: string) {
  const r = await tx.execute(sql`
    SELECT coalesce(max(ordem_no_bloco), 0) + 1 AS n FROM catalogo_bloco_exames WHERE bloco_id = ${blocoId} AND grau = ${grau}`);
  return Number((r.rows[0] as { n: number }).n);
}

router.get("/cadastros/blocos/opcoes", async (_req, res): Promise<void> => {
  const r = await db.execute(sql`
    SELECT bloco_id AS "codigoBloco", min(nome_bloco) AS "nomeBloco" FROM catalogo_bloco_exames
    GROUP BY bloco_id ORDER BY min(nome_bloco)`);
  res.json({ blocos: r.rows, graus: GRAUS_BLOCO });
});

router.patch("/cadastros/blocos/exames/:id/mover", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ blocoId: z.string().trim().min(1), grau: grauSchema }).safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "id, bloco e grau validos sao obrigatorios" });
    return;
  }
  const { blocoId, grau } = parsed.data;
  const out = await db.transaction(async (tx) => {
    const atual = (await tx.execute(sql`
      SELECT id, bloco_id, grau, nome_exame FROM catalogo_bloco_exames WHERE id = ${id} FOR UPDATE`)).rows[0] as
      | { id: number; bloco_id: string; grau: string; nome_exame: string }
      | undefined;
    if (!atual) return { status: 404 as const };
    if (atual.bloco_id === blocoId && atual.grau === grau) return { status: 200 as const, mudou: false };
    const destino = await dadosDoBloco(tx, blocoId);
    if (!destino) return { status: 400 as const, erro: "Bloco de destino nao existe" };
    const dup = await tx.execute(sql`
      SELECT id, ativo FROM catalogo_bloco_exames WHERE bloco_id = ${blocoId} AND nome_exame = ${atual.nome_exame} AND grau = ${grau}`);
    if (dup.rows.length > 0) {
      return { status: 409 as const, erro: `"${atual.nome_exame}" ja esta nesse bloco e grau.` };
    }
    const ordem = await proximaOrdem(tx, blocoId, grau);
    await tx.execute(sql`
      UPDATE catalogo_bloco_exames
      SET bloco_id = ${blocoId}, nome_bloco = ${destino.nome_bloco}, grau = ${grau},
          usa_grade = ${grau !== "SEM GRADE"}, ordem_no_bloco = ${ordem}, ativo = TRUE, updated_at = NOW()
      WHERE id = ${id}`);
    return { status: 200 as const, mudou: true, de: atual };
  });
  if (out.status !== 200) {
    res.status(out.status).json({ error: "erro" in out ? out.erro : "Linha da grade nao encontrada" });
    return;
  }
  req.log.info({ id, blocoId, grau, de: "de" in out ? out.de : null }, "exame movido de bloco");
  res.json({ id, blocoId, grau, mudou: out.mudou });
});

router.patch("/cadastros/blocos/exames/:id/ativo", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const ativo = z.boolean().safeParse(req.body?.ativo);
  if (!Number.isInteger(id) || !ativo.success) {
    res.status(400).json({ error: "id e 'ativo' (booleano) sao obrigatorios" });
    return;
  }
  const upd = await db.execute(sql`
    UPDATE catalogo_bloco_exames SET ativo = ${ativo.data}, updated_at = NOW() WHERE id = ${id} RETURNING id, ativo`);
  if (upd.rows.length === 0) {
    res.status(404).json({ error: "Linha da grade nao encontrada" });
    return;
  }
  req.log.info({ id, ativo: ativo.data }, "exame tirado/devolvido ao bloco");
  res.json(upd.rows[0]);
});

router.post("/cadastros/blocos/exames", async (req, res): Promise<void> => {
  const parsed = z
    .object({ blocoId: z.string().trim().min(1), grau: grauSchema, exameId: z.number().int() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bloco, grau e exame sao obrigatorios" });
    return;
  }
  const { blocoId, grau, exameId } = parsed.data;
  const out = await db.transaction(async (tx) => {
    const ex = (await tx.execute(sql`SELECT nome_exame, codigo_semantico FROM catalogo_exames WHERE id = ${exameId}`)).rows[0] as
      | { nome_exame: string | null; codigo_semantico: string | null }
      | undefined;
    if (!ex?.nome_exame) return { status: 404 as const, erro: "Exame nao encontrado" };
    const destino = await dadosDoBloco(tx, blocoId);
    if (!destino) return { status: 400 as const, erro: "Bloco de destino nao existe" };
    const dup = (await tx.execute(sql`
      SELECT id, ativo FROM catalogo_bloco_exames WHERE bloco_id = ${blocoId} AND nome_exame = ${ex.nome_exame} AND grau = ${grau} FOR UPDATE`)).rows[0] as
      | { id: number; ativo: boolean | null }
      | undefined;
    if (dup) {
      if (dup.ativo !== false) return { status: 409 as const, erro: `"${ex.nome_exame}" ja esta nesse bloco e grau.` };
      await tx.execute(sql`UPDATE catalogo_bloco_exames SET ativo = TRUE, updated_at = NOW() WHERE id = ${dup.id}`);
      return { status: 201 as const, id: dup.id };
    }
    const ordem = await proximaOrdem(tx, blocoId, grau);
    const ins = await tx.execute(sql`
      INSERT INTO catalogo_bloco_exames (bloco_id, nome_bloco, usa_grade, grau, ordem_no_bloco, nome_exame, codigo_padcom, ativo)
      VALUES (${blocoId}, ${destino.nome_bloco}, ${grau !== "SEM GRADE"}, ${grau}, ${ordem}, ${ex.nome_exame}, ${ex.codigo_semantico}, TRUE)
      RETURNING id`);
    return { status: 201 as const, id: Number((ins.rows[0] as { id: number }).id) };
  });
  if (out.status !== 201) {
    res.status(out.status).json({ error: out.erro });
    return;
  }
  req.log.info({ id: out.id, blocoId, grau, exameId }, "exame incluido no bloco");
  res.status(201).json({ id: out.id });
});

router.get("/cadastros/blocos", async (_req, res): Promise<void> => {
  // Meta dos blocos (dedup por codigo_bloco — a grade usa a forma curta) ------
  const blocosMeta = await db
    .select({
      codigoBloco: catalogoBlocosTable.codigoBloco,
      nomeBloco: catalogoBlocosTable.nomeBloco,
      tipoMacro: catalogoBlocosTable.tipoMacro,
    })
    .from(catalogoBlocosTable);
  const metaByCodigo = new Map<string, { nomeBloco: string | null; tipoMacro: string | null }>();
  for (const m of blocosMeta) {
    if (!metaByCodigo.has(m.codigoBloco)) {
      metaByCodigo.set(m.codigoBloco, { nomeBloco: m.nomeBloco, tipoMacro: m.tipoMacro });
    }
  }

  // A grade real (fonte limpa dos blocos) ------------------------------------
  const grade = await db
    .select({
      id: catalogoBlocoExamesTable.id,
      blocoId: catalogoBlocoExamesTable.blocoId,
      nomeBloco: catalogoBlocoExamesTable.nomeBloco,
      grau: catalogoBlocoExamesTable.grau,
      ordem: catalogoBlocoExamesTable.ordemNoBloco,
      nomeExame: catalogoBlocoExamesTable.nomeExame,
      codigoPadcom: catalogoBlocoExamesTable.codigoPadcom,
      ativo: catalogoBlocoExamesTable.ativo,
    })
    .from(catalogoBlocoExamesTable)
    .orderBy(
      asc(catalogoBlocoExamesTable.nomeBloco),
      asc(catalogoBlocoExamesTable.grau),
      asc(catalogoBlocoExamesTable.ordemNoBloco),
    );

  const blocos = new Map<string, BlocoView>();
  for (const row of grade) {
    if (row.ativo === false) continue;
    let bloco = blocos.get(row.blocoId);
    if (!bloco) {
      const meta = metaByCodigo.get(row.blocoId);
      bloco = {
        codigoBloco: row.blocoId,
        nomeBloco: meta?.nomeBloco ?? row.nomeBloco ?? row.blocoId,
        tipoMacro: meta?.tipoMacro ?? null,
        totalExames: 0,
        graus: [],
      };
      blocos.set(row.blocoId, bloco);
    }
    let grau = bloco.graus.find((g) => g.grau === row.grau);
    if (!grau) {
      grau = { grau: row.grau, exames: [] };
      bloco.graus.push(grau);
    }
    grau.exames.push({
      id: row.id,
      nomeExame: row.nomeExame,
      codigoPadcom: row.codigoPadcom,
      ordem: row.ordem,
    });
    bloco.totalExames += 1;
  }

  // Ordena os graus por ranking clinico explicito (Basica < Intermediaria <
  // Sofisticada < Ampliada), nao por ordem lexicografica.
  const grauRank = (g: string): number => {
    const u = g.toUpperCase();
    if (u.includes("BASIC")) return 1;
    if (u.includes("INTERMEDIAR")) return 2;
    if (u.includes("SOFISTICAD")) return 3;
    if (u.includes("AMPLIAD")) return 4;
    return 9;
  };
  for (const bloco of blocos.values()) {
    bloco.graus.sort((a, b) => grauRank(a.grau) - grauRank(b.grau) || a.grau.localeCompare(b.grau, "pt-BR"));
  }

  const out = Array.from(blocos.values()).sort((a, b) =>
    (a.nomeBloco ?? "").localeCompare(b.nomeBloco ?? "", "pt-BR"),
  );
  res.json(out);
});

export default router;
