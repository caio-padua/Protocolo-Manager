import { Router, type IRouter } from "express";
import { sql, eq, and, isNull, asc } from "drizzle-orm";
import {
  db,
  anamneseQuestionarioTable,
  catalogoSintomasTable,
  catalogoDoencasTable,
  perguntaSintomaTable,
  perguntaDoencaTable,
} from "@workspace/db";
import { computeMotor } from "../lib/motor-anamnese";

const router: IRouter = Router();

// ---- Blocos com contagem ----
router.get("/mega-anamnese/blocos", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      bloco: anamneseQuestionarioTable.bloco,
      total: sql<number>`count(*)::int`,
      comAlarme: sql<number>`sum(case when ${anamneseQuestionarioTable.eSinalAlarme} then 1 else 0 end)::int`,
      comEscala: sql<number>`sum(case when ${anamneseQuestionarioTable.escalaValidada} is not null then 1 else 0 end)::int`,
    })
    .from(anamneseQuestionarioTable)
    .groupBy(anamneseQuestionarioTable.bloco)
    .orderBy(asc(anamneseQuestionarioTable.bloco));
  res.json(rows);
});

// ---- Perguntas (filtro opcional por bloco) ----
router.get("/mega-anamnese/perguntas", async (req, res): Promise<void> => {
  const bloco = typeof req.query.bloco === "string" ? req.query.bloco : null;
  const base = db.select().from(anamneseQuestionarioTable);
  const rows = bloco
    ? await base.where(eq(anamneseQuestionarioTable.bloco, bloco)).orderBy(asc(anamneseQuestionarioTable.ordem))
    : await base.orderBy(asc(anamneseQuestionarioTable.bloco), asc(anamneseQuestionarioTable.ordem));
  res.json(rows);
});

// ---- Editar pergunta ----
router.patch("/mega-anamnese/perguntas/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const set: Record<string, unknown> = {};
  const stringFields = ["bloco", "pergunta", "tipoResposta", "sistema", "escalaValidada"];
  const numberFields = ["pesoGravidade", "ordem"];
  for (const k of stringFields) {
    if (b[k] !== undefined) {
      if (b[k] !== null && typeof b[k] !== "string") {
        res.status(400).json({ error: `campo ${k} deve ser texto` });
        return;
      }
      set[k] = b[k];
    }
  }
  for (const k of numberFields) {
    if (b[k] !== undefined) {
      if (b[k] !== null && !Number.isFinite(Number(b[k]))) {
        res.status(400).json({ error: `campo ${k} deve ser numero` });
        return;
      }
      set[k] = b[k] === null ? null : Number(b[k]);
    }
  }
  if (b.eSinalAlarme !== undefined) {
    if (typeof b.eSinalAlarme !== "boolean") {
      res.status(400).json({ error: "campo eSinalAlarme deve ser booleano" });
      return;
    }
    set.eSinalAlarme = b.eSinalAlarme;
  }
  if (b.opcoes !== undefined) {
    if (b.opcoes !== null && !Array.isArray(b.opcoes)) {
      res.status(400).json({ error: "campo opcoes deve ser lista" });
      return;
    }
    set.opcoes = b.opcoes;
  }
  if (Object.keys(set).length === 0) {
    res.status(400).json({ error: "nenhum campo para atualizar" });
    return;
  }
  const r = await db
    .update(anamneseQuestionarioTable)
    .set(set)
    .where(eq(anamneseQuestionarioTable.id, id))
    .returning();
  if (r.length === 0) {
    res.status(404).json({ error: "pergunta nao encontrada" });
    return;
  }
  res.json(r[0]);
});

// ---- Sintomas ----
router.get("/mega-anamnese/sintomas", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ codigoSemantico: catalogoSintomasTable.codigoSemantico, nomeSintoma: catalogoSintomasTable.nomeSintoma })
    .from(catalogoSintomasTable)
    .orderBy(asc(catalogoSintomasTable.nomeSintoma));
  res.json(rows);
});

// ---- Amarracoes de uma pergunta ----
router.get("/mega-anamnese/perguntas/:perguntaId/amarracoes", async (req, res): Promise<void> => {
  const perguntaId = req.params.perguntaId;
  const sintomas = await db
    .select({
      id: perguntaSintomaTable.id,
      perguntaId: perguntaSintomaTable.perguntaId,
      sintomaCodigo: perguntaSintomaTable.sintomaCodigo,
      nomeSintoma: catalogoSintomasTable.nomeSintoma,
      gatilhoValor: perguntaSintomaTable.gatilhoValor,
      peso: perguntaSintomaTable.peso,
    })
    .from(perguntaSintomaTable)
    .leftJoin(catalogoSintomasTable, eq(catalogoSintomasTable.codigoSemantico, perguntaSintomaTable.sintomaCodigo))
    .where(eq(perguntaSintomaTable.perguntaId, perguntaId));
  const doencas = await db
    .select({
      id: perguntaDoencaTable.id,
      perguntaId: perguntaDoencaTable.perguntaId,
      doencaIdIhe: perguntaDoencaTable.doencaIdIhe,
      nomeDoenca: catalogoDoencasTable.nomeDoenca,
      gatilhoValor: perguntaDoencaTable.gatilhoValor,
      peso: perguntaDoencaTable.peso,
    })
    .from(perguntaDoencaTable)
    .leftJoin(catalogoDoencasTable, eq(catalogoDoencasTable.idIhe, perguntaDoencaTable.doencaIdIhe))
    .where(eq(perguntaDoencaTable.perguntaId, perguntaId));
  res.json({ sintomas, doencas });
});

// ---- Add amarracao pergunta->sintoma ----
router.post("/mega-anamnese/amarracoes/sintoma", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as { perguntaId?: string; sintomaCodigo?: string; gatilhoValor?: string; peso?: number };
  if (typeof b.perguntaId !== "string" || !b.perguntaId || typeof b.sintomaCodigo !== "string" || !b.sintomaCodigo) {
    res.status(400).json({ error: "perguntaId e sintomaCodigo obrigatorios" });
    return;
  }
  const gatilhoValor = typeof b.gatilhoValor === "string" && b.gatilhoValor !== "" ? b.gatilhoValor : null;
  const peso = b.peso != null && Number.isFinite(Number(b.peso)) ? Number(b.peso) : 1;
  // Guarda de idempotencia: o indice unico inclui gatilho_valor nullable e no
  // PostgreSQL NULL nao colide em UNIQUE, entao checamos a existencia manualmente.
  const existing = await db
    .select({ id: perguntaSintomaTable.id })
    .from(perguntaSintomaTable)
    .where(
      and(
        eq(perguntaSintomaTable.perguntaId, b.perguntaId),
        eq(perguntaSintomaTable.sintomaCodigo, b.sintomaCodigo),
        gatilhoValor === null
          ? isNull(perguntaSintomaTable.gatilhoValor)
          : eq(perguntaSintomaTable.gatilhoValor, gatilhoValor),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "amarracao ja existe" });
    return;
  }
  const r = await db
    .insert(perguntaSintomaTable)
    .values({ perguntaId: b.perguntaId, sintomaCodigo: b.sintomaCodigo, gatilhoValor, peso })
    .returning();
  res.status(201).json(r[0]);
});

// ---- Remove amarracao pergunta->sintoma ----
router.delete("/mega-anamnese/amarracoes/sintoma/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  await db.delete(perguntaSintomaTable).where(eq(perguntaSintomaTable.id, id));
  res.json({ ok: true });
});

// ---- SIMULADOR DO MOTOR ----
// Recebe respostas -> calcula escore por bloco -> grade -> acende sintomas/doencas
// -> deriva exames pelos blocos_motor das doencas. Tudo DB-driven.
router.post("/mega-anamnese/simular", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as { respostas?: { perguntaId: string; valor: string | number }[] };
  const respostas = Array.isArray(b.respostas) ? b.respostas : [];
  const resultado = await computeMotor(respostas);
  res.json(resultado);
});

export default router;
