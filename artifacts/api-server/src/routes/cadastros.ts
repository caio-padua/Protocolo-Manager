import { Router, type IRouter } from "express";
import {
  db,
  catalogoExamesTable,
  catalogoBlocosTable,
  catalogoBlocoExamesTable,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

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

const createExameSchema = exameInputSchema.extend({
  codigoExame: z.string().trim().min(1, "Codigo do exame e obrigatorio").max(120),
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
  const data = nullify(parsed.data);

  const existing = await db
    .select({ id: catalogoExamesTable.id })
    .from(catalogoExamesTable)
    .where(eq(catalogoExamesTable.codigoExame, data.codigoExame))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: `Ja existe um exame com o codigo "${data.codigoExame}".` });
    return;
  }

  const [created] = await db
    .insert(catalogoExamesTable)
    .values({ ...data, ativo: true })
    .returning(EXAME_SELECT);
  req.log.info({ id: created.id, codigo: created.codigoExame }, "exame criado");
  res.status(201).json(created);
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
  exames: Array<{ nomeExame: string; codigoPadcom: string | null; ordem: number | null }>;
}
interface BlocoView {
  codigoBloco: string;
  nomeBloco: string | null;
  tipoMacro: string | null;
  totalExames: number;
  graus: BlocoGrau[];
}

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
