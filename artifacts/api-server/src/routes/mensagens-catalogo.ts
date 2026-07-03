// ROTA da MENSAGERIA OPUS (Carta de Encantamento) — catálogo editável.
//
// Conteúdo é JSONB livre por categoria; por isso NÃO usa OpenAPI/Orval (decisão
// consciente, espelha o IHE). Toda escrita invalida o cache do montador.
import { Router, type IRouter } from "express";
import { db, mensagensCatalogoTable, type MensagemCatalogo } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { invalidarCacheCatalogo } from "../lib/mensageria-opus";

const router: IRouter = Router();

interface BlocoDTO {
  id: number;
  categoria: string;
  chave: string;
  ordem: number;
  conteudo: Record<string, unknown>;
  ativo: boolean;
}

function toDTO(row: MensagemCatalogo): BlocoDTO {
  return {
    id: row.id,
    categoria: row.categoria,
    chave: row.chave,
    ordem: row.ordem,
    conteudo: (row.conteudo ?? {}) as Record<string, unknown>,
    ativo: row.ativo,
  };
}

// GET agrupado por categoria (só blocos ativos, ordenados por `ordem`).
router.get("/mensagens-catalogo", async (_req, res) => {
  const rows = await db
    .select()
    .from(mensagensCatalogoTable)
    .where(eq(mensagensCatalogoTable.ativo, true))
    .orderBy(asc(mensagensCatalogoTable.categoria), asc(mensagensCatalogoTable.ordem));

  const agrupado: Record<string, BlocoDTO[]> = {};
  for (const row of rows) {
    const dto = toDTO(row);
    (agrupado[dto.categoria] ??= []).push(dto);
  }
  res.json(agrupado);
});

// PUT /:id → atualiza o `conteudo` de um bloco (edição inline na tela).
router.put("/mensagens-catalogo/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }
  const conteudo = req.body?.conteudo;
  if (typeof conteudo !== "object" || conteudo === null || Array.isArray(conteudo)) {
    return res.status(400).json({ error: "conteudo deve ser um objeto" });
  }

  const [row] = await db
    .update(mensagensCatalogoTable)
    .set({ conteudo, atualizadoEm: new Date() })
    .where(eq(mensagensCatalogoTable.id, id))
    .returning();

  if (!row) return res.status(404).json({ error: "bloco não encontrado" });
  invalidarCacheCatalogo();
  res.json(toDTO(row));
});

// POST → upsert por (categoria, chave). Cria bloco novo ou substitui o conteúdo.
router.post("/mensagens-catalogo", async (req, res) => {
  const { categoria, chave, ordem, conteudo } = req.body ?? {};
  if (typeof categoria !== "string" || !categoria.trim()) {
    return res.status(400).json({ error: "categoria obrigatória" });
  }
  if (typeof chave !== "string" || !chave.trim()) {
    return res.status(400).json({ error: "chave obrigatória" });
  }
  if (typeof conteudo !== "object" || conteudo === null || Array.isArray(conteudo)) {
    return res.status(400).json({ error: "conteudo deve ser um objeto" });
  }
  const ordemNum = Number.isInteger(ordem) ? (ordem as number) : 0;

  const [row] = await db
    .insert(mensagensCatalogoTable)
    .values({ categoria, chave, ordem: ordemNum, conteudo, ativo: true })
    .onConflictDoUpdate({
      target: [mensagensCatalogoTable.categoria, mensagensCatalogoTable.chave],
      set: { conteudo, ordem: ordemNum, ativo: true, atualizadoEm: new Date() },
    })
    .returning();

  invalidarCacheCatalogo();
  res.status(201).json(toDTO(row));
});

// DELETE /:id → desativa (soft delete). Preserva histórico e não quebra o motor.
router.delete("/mensagens-catalogo/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }
  const [row] = await db
    .update(mensagensCatalogoTable)
    .set({ ativo: false, atualizadoEm: new Date() })
    .where(and(eq(mensagensCatalogoTable.id, id), eq(mensagensCatalogoTable.ativo, true)))
    .returning();

  if (!row) return res.status(404).json({ error: "bloco não encontrado" });
  invalidarCacheCatalogo();
  res.json({ ok: true, id });
});

export default router;
