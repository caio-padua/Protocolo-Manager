import { Router, type IRouter } from "express";
import { sql, eq, and, isNull, asc } from "drizzle-orm";
import {
  db,
  anamneseQuestionarioTable,
  catalogoSintomasTable,
  catalogoDoencasTable,
  catalogoBlocoExamesTable,
  perguntaSintomaTable,
  perguntaDoencaTable,
} from "@workspace/db";

const router: IRouter = Router();

// Grade global a partir do escore total (escada de gravidade do CEO).
function gradeDoEscore(escore: number): string {
  if (escore >= 25) return "GRADE AMPLIADA";
  if (escore >= 15) return "GRADE SOFISTICADA";
  if (escore >= 7) return "GRADE INTERMEDIARIA";
  if (escore >= 1) return "GRADE BASICA";
  return "SEM GRADE";
}

type Opcao = { label: string; valor: string | number; peso: number };

// Avalia se o valor respondido dispara o gatilho da amarracao.
// Gatilhos suportados: "sim", ">=N", valor textual exato.
function gatilhoBate(gatilho: string | null, valor: string | number): boolean {
  if (gatilho == null || gatilho === "") return true;
  const v = String(valor).toLowerCase();
  if (gatilho.startsWith(">=")) {
    const n = Number(gatilho.slice(2));
    return Number(valor) >= n;
  }
  if (gatilho.startsWith(">")) {
    const n = Number(gatilho.slice(1));
    return Number(valor) > n;
  }
  return v === gatilho.toLowerCase();
}

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
  const mapResp = new Map<string, string | number>();
  for (const r of respostas) mapResp.set(r.perguntaId, r.valor);

  // Carrega perguntas envolvidas
  const perguntas = await db.select().from(anamneseQuestionarioTable);
  const porPerguntaId = new Map<string, typeof perguntas[number]>();
  for (const p of perguntas) if (p.perguntaId) porPerguntaId.set(p.perguntaId, p);

  // Escore por bloco
  const escoreBloco = new Map<string, number>();
  const alarmes: { perguntaId: string; pergunta: string }[] = [];
  for (const [perguntaId, valor] of mapResp) {
    const p = porPerguntaId.get(perguntaId);
    if (!p || !p.bloco) continue;
    let pontos = 0;
    // peso da opcao escolhida
    const opcoes = (p.opcoes as Opcao[] | null) ?? null;
    if (opcoes && opcoes.length) {
      const op = opcoes.find((o) => String(o.valor) === String(valor));
      if (op) pontos += op.peso;
    } else if (typeof valor === "number") {
      pontos += valor;
    }
    // peso de gravidade da pergunta soma quando ha qualquer pontuacao
    if (pontos > 0) pontos += p.pesoGravidade ?? 0;
    escoreBloco.set(p.bloco, (escoreBloco.get(p.bloco) ?? 0) + pontos);
    // sinal de alarme
    if (p.eSinalAlarme && pontos > 0) alarmes.push({ perguntaId, pergunta: p.pergunta ?? perguntaId });
  }

  const blocos = Array.from(escoreBloco.entries())
    .map(([bloco, escore]) => ({ bloco, escore, grade: gradeDoEscore(escore) }))
    .sort((a, b2) => b2.escore - a.escore);
  const escoreTotal = blocos.reduce((s, x) => s + x.escore, 0);

  // Sintomas acesos pelas amarracoes
  const amarSint = await db.select().from(perguntaSintomaTable);
  const sintCodigos = new Set<string>();
  for (const a of amarSint) {
    if (!mapResp.has(a.perguntaId)) continue;
    if (gatilhoBate(a.gatilhoValor, mapResp.get(a.perguntaId)!)) sintCodigos.add(a.sintomaCodigo);
  }
  const sintNomes: string[] = [];
  if (sintCodigos.size) {
    const rows = await db.select().from(catalogoSintomasTable);
    for (const r of rows) if (sintCodigos.has(r.codigoSemantico) && r.nomeSintoma) sintNomes.push(r.nomeSintoma);
  }

  // Doencas acesas
  const amarDoe = await db.select().from(perguntaDoencaTable);
  const doeIds = new Set<number>();
  for (const a of amarDoe) {
    if (!mapResp.has(a.perguntaId)) continue;
    if (gatilhoBate(a.gatilhoValor, mapResp.get(a.perguntaId)!)) doeIds.add(a.doencaIdIhe);
  }
  const doeNomes: string[] = [];
  const blocosMotor = new Set<string>();
  if (doeIds.size) {
    const rows = await db.select().from(catalogoDoencasTable);
    for (const r of rows) {
      if (!doeIds.has(r.idIhe)) continue;
      if (r.nomeDoenca) doeNomes.push(r.nomeDoenca);
      // bloco_motor pode trazer varios codigos "BLK003 / BLK005"
      const bm = (r.blocoMotor as string | null) ?? "";
      bm.split("/").map((s) => s.trim()).filter(Boolean).forEach((c) => blocosMotor.add(c));
    }
  }

  // Exames derivados dos blocos motor das doencas acesas
  const exames = new Set<string>();
  if (blocosMotor.size) {
    const rows = await db.select().from(catalogoBlocoExamesTable);
    for (const r of rows) {
      const cod = (r.blocoId as unknown as string | null) ?? null;
      const nome = (r as unknown as { nomeExame?: string | null }).nomeExame ?? null;
      if (cod && blocosMotor.has(String(cod)) && nome) exames.add(nome);
    }
  }

  res.json({
    escoreTotal,
    gradeGlobal: gradeDoEscore(escoreTotal),
    blocos,
    sintomas: sintNomes,
    doencas: doeNomes,
    exames: Array.from(exames).slice(0, 40),
    alarmes,
  });
});

export default router;
