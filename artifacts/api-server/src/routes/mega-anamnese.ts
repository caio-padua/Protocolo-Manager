import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
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
import { ObjectStorageService } from "../lib/objectStorage.js";
import { gerarFalaMp3 } from "../lib/anamnese-tts.js";

const router: IRouter = Router();
router.use(moduleGuard("anamnese"));
const objectStorage = new ObjectStorageService();

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
  const stringFields = [
    "bloco",
    "pergunta",
    "tipoResposta",
    "sistema",
    "escalaValidada",
    "exemplo",
    "observacao",
    "videoUrl",
    "voiceId",
    "voiceLabel",
  ];
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
  // Mexeu no texto da pergunta ou na voz escolhida -> o audio existente fica
  // desatualizado (audioStale=true) ate o admin regerar a voz.
  if (b.pergunta !== undefined || b.voiceId !== undefined) {
    set.audioStale = true;
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

// ---- Criar pergunta ----
// idIhe e NOT NULL UNIQUE: para perguntas nativas (criadas aqui) geramos um
// id sequencial = maior idIhe + 1, garantindo unicidade sem colidir com a
// origem IHE. ordem default = maior ordem do bloco + 1.
router.post("/mega-anamnese/perguntas", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const bloco = typeof b.bloco === "string" ? b.bloco.trim() : "";
  const pergunta = typeof b.pergunta === "string" ? b.pergunta.trim() : "";
  if (!bloco || !pergunta) {
    res.status(400).json({ error: "bloco e pergunta sao obrigatorios" });
    return;
  }
  const tipoResposta =
    typeof b.tipoResposta === "string" && b.tipoResposta ? b.tipoResposta : "texto";
  const perguntaId =
    typeof b.perguntaId === "string" && b.perguntaId.trim() ? b.perguntaId.trim() : null;
  const sistema = typeof b.sistema === "string" && b.sistema ? b.sistema : null;
  const observacao = typeof b.observacao === "string" && b.observacao ? b.observacao : null;
  const exemplo = typeof b.exemplo === "string" && b.exemplo ? b.exemplo : null;
  const videoUrl = typeof b.videoUrl === "string" && b.videoUrl ? b.videoUrl : null;
  const eSinalAlarme = typeof b.eSinalAlarme === "boolean" ? b.eSinalAlarme : false;
  const pesoGravidade =
    b.pesoGravidade != null && Number.isFinite(Number(b.pesoGravidade))
      ? Number(b.pesoGravidade)
      : 1;
  const opcoes = Array.isArray(b.opcoes) ? b.opcoes : null;

  const [{ maxIhe } = { maxIhe: 0 }] = await db
    .select({ maxIhe: sql<number>`coalesce(max(${anamneseQuestionarioTable.idIhe}), 0)::int` })
    .from(anamneseQuestionarioTable);
  const [{ maxOrdem } = { maxOrdem: 0 }] = await db
    .select({ maxOrdem: sql<number>`coalesce(max(${anamneseQuestionarioTable.ordem}), 0)::int` })
    .from(anamneseQuestionarioTable)
    .where(eq(anamneseQuestionarioTable.bloco, bloco));

  const r = await db
    .insert(anamneseQuestionarioTable)
    .values({
      idIhe: (maxIhe ?? 0) + 1,
      bloco,
      perguntaId,
      pergunta,
      tipoResposta,
      sistema,
      observacao,
      exemplo,
      videoUrl,
      eSinalAlarme,
      pesoGravidade,
      opcoes,
      ordem: (maxOrdem ?? 0) + 1,
      audioStale: true,
    })
    .returning();
  res.status(201).json(r[0]);
});

// ---- Apagar pergunta ----
router.delete("/mega-anamnese/perguntas/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  // Guarda de dependencia (caso extremo da spec): nao apagar uma pergunta da
  // qual outra depende, para nao corromper o skip-logic. `depende_de` e jsonb de
  // forma livre, entao checamos por id numerico OU perguntaId (texto) dentro dele.
  const alvo = await db
    .select({ id: anamneseQuestionarioTable.id, perguntaId: anamneseQuestionarioTable.perguntaId })
    .from(anamneseQuestionarioTable)
    .where(eq(anamneseQuestionarioTable.id, id))
    .limit(1);
  if (alvo.length === 0) {
    res.status(404).json({ error: "pergunta nao encontrada" });
    return;
  }
  const todas = await db
    .select({
      id: anamneseQuestionarioTable.id,
      perguntaId: anamneseQuestionarioTable.perguntaId,
      dependeDe: anamneseQuestionarioTable.dependeDe,
    })
    .from(anamneseQuestionarioTable);
  const refs: string[] = [];
  for (const p of todas) {
    // Pular APENAS o proprio registro por `id` (perguntaId pode repetir, ex.: Q030).
    if (p.id === id) continue;
    if (p.dependeDe == null) continue;
    const blob = JSON.stringify(p.dependeDe);
    const bateId = new RegExp(`(^|[^0-9])${id}([^0-9]|$)`).test(blob);
    const batePerguntaId =
      alvo[0].perguntaId != null && blob.includes(`"${alvo[0].perguntaId}"`);
    if (bateId || batePerguntaId) refs.push(p.perguntaId ?? "(sem id)");
  }
  if (refs.length > 0) {
    res.status(409).json({
      error: "pergunta em uso por dependencia",
      message: `Nao foi possivel apagar: outras perguntas dependem desta (${refs.join(", ")}). Remova as dependencias antes.`,
      dependentes: refs,
    });
    return;
  }

  const r = await db
    .delete(anamneseQuestionarioTable)
    .where(eq(anamneseQuestionarioTable.id, id))
    .returning({ id: anamneseQuestionarioTable.id });
  if (r.length === 0) {
    res.status(404).json({ error: "pergunta nao encontrada" });
    return;
  }
  res.json({ ok: true });
});

// ---- Gerar voz (Text-To-Speech) de uma pergunta ----
// Le a pergunta com a voz escolhida (gpt-audio), salva o mp3 no object storage
// e grava audioUrl + audioStale=false. Idempotente por sobrescrita do arquivo.
router.post("/mega-anamnese/perguntas/:id/audio", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const b = (req.body ?? {}) as { voiceId?: unknown; voiceLabel?: unknown };
  const [row] = await db
    .select()
    .from(anamneseQuestionarioTable)
    .where(eq(anamneseQuestionarioTable.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "pergunta nao encontrada" });
    return;
  }
  const texto = (row.pergunta ?? "").trim();
  if (!texto) {
    res.status(400).json({ error: "pergunta sem texto para narrar" });
    return;
  }
  const voiceId =
    typeof b.voiceId === "string" && b.voiceId
      ? b.voiceId
      : row.voiceId ?? "shimmer";
  const voiceLabel =
    typeof b.voiceLabel === "string" && b.voiceLabel ? b.voiceLabel : row.voiceLabel ?? null;

  try {
    const mp3 = await gerarFalaMp3(texto, voiceId);
    const relativePath = `uploads/anamnese-audio/${id}-${Date.now()}.mp3`;
    await objectStorage.saveUploadObject(relativePath, mp3, "audio/mpeg");
    const audioUrl = `/api/storage/objects/${relativePath}`;
    const r = await db
      .update(anamneseQuestionarioTable)
      .set({ audioUrl, voiceId, voiceLabel, audioStale: false })
      .where(eq(anamneseQuestionarioTable.id, id))
      .returning();
    res.json(r[0]);
  } catch (err) {
    req.log.error({ err }, "Falha ao gerar voz da pergunta");
    res.status(502).json({ error: "Falha ao gerar a voz. Tente novamente." });
  }
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
