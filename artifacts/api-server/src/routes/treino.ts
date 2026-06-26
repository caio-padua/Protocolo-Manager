import { Router, type IRouter } from "express";
import {
  db,
  treinoCatalogoExerciciosTable,
  treinoProtocolosTable,
  treinoPrescricaoTable,
  treinoPrescricaoItemTable,
  treinoIndicacaoTable,
  clientsTable,
  professionalsTable,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  calcularItemVolume,
  calcularResumoTreino,
  metDoExercicio,
} from "../lib/treino-calc";
import { computeMotor, type RespostaMotor } from "../lib/motor-anamnese";

// ============================================================================
// ORGAO TREINO (nativo) — ONDA C do Master Loop Paxter.
// Espelha o Orgao Dieta. Contrato Comum: Catalogo + Fila de Indicacao +
// Prescricao (fatia do Cockpit).
// ============================================================================

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// 1) CATALOGO — a sala de exercicios.
// ---------------------------------------------------------------------------
router.get("/treino/catalogo/exercicios", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(treinoCatalogoExerciciosTable)
    .where(eq(treinoCatalogoExerciciosTable.ativo, true))
    .orderBy(asc(treinoCatalogoExerciciosTable.grupoMuscular), asc(treinoCatalogoExerciciosTable.nome));
  res.json(rows);
});

const ExercicioSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(1),
  grupoMuscular: z.string().optional().nullable(),
  padraoMovimento: z.string().optional().nullable(),
  equipamento: z.string().optional().nullable(),
  nivel: z.string().optional().nullable(),
  met: z.number().optional().nullable(),
  seriesPadrao: z.number().int().optional().nullable(),
  repeticoesPadrao: z.string().optional().nullable(),
  descansoPadraoSeg: z.number().int().optional().nullable(),
  descricao: z.string().optional().nullable(),
  instrucoes: z.string().optional().nullable(),
  contraindicacoes: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

router.post("/treino/catalogo/exercicios", async (req, res): Promise<void> => {
  const parsed = ExercicioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db
    .insert(treinoCatalogoExerciciosTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(row);
});

// ---------------------------------------------------------------------------
// 4) PROTOCOLOS — modelos reutilizaveis de treino.
// ---------------------------------------------------------------------------
router.get("/treino/protocolos", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(treinoProtocolosTable)
    .where(eq(treinoProtocolosTable.ativo, true))
    .orderBy(asc(treinoProtocolosTable.nome));
  res.json(rows);
});

const ProtocoloSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(1),
  objetivo: z.string().optional().nullable(),
  divisao: z.string().optional().nullable(),
  frequenciaSemanal: z.number().int().optional().nullable(),
  nivel: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
});

router.post("/treino/protocolos", async (req, res): Promise<void> => {
  const parsed = ProtocoloSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.insert(treinoProtocolosTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// ---------------------------------------------------------------------------
// 2) FILA DE INDICACAO — o Cerebro (motor) escreve aqui; aguarda validacao.
// ---------------------------------------------------------------------------
router.get("/treino/indicacoes", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "pendente";
  const rows = await db
    .select({
      id: treinoIndicacaoTable.id,
      clientId: treinoIndicacaoTable.clientId,
      clientName: clientsTable.name,
      origem: treinoIndicacaoTable.origem,
      protocoloId: treinoIndicacaoTable.protocoloId,
      objetivoSugerido: treinoIndicacaoTable.objetivoSugerido,
      divisaoSugerida: treinoIndicacaoTable.divisaoSugerida,
      justificativa: treinoIndicacaoTable.justificativa,
      bloco: treinoIndicacaoTable.bloco,
      escore: treinoIndicacaoTable.escore,
      status: treinoIndicacaoTable.status,
      prescricaoId: treinoIndicacaoTable.prescricaoId,
      createdAt: treinoIndicacaoTable.createdAt,
    })
    .from(treinoIndicacaoTable)
    .leftJoin(clientsTable, eq(clientsTable.id, treinoIndicacaoTable.clientId))
    .where(eq(treinoIndicacaoTable.status, status))
    .orderBy(desc(treinoIndicacaoTable.createdAt));
  res.json(rows);
});

const IndicacaoSchema = z.object({
  clientId: z.number().int().positive(),
  anamneseSessionId: z.number().int().positive().optional().nullable(),
  origem: z.enum(["motor", "manual"]).optional().default("manual"),
  protocoloId: z.number().int().positive().optional().nullable(),
  objetivoSugerido: z.string().optional().nullable(),
  divisaoSugerida: z.string().optional().nullable(),
  justificativa: z.string().optional().nullable(),
  bloco: z.string().optional().nullable(),
  escore: z.number().int().optional().nullable(),
});

router.post("/treino/indicacoes", async (req, res): Promise<void> => {
  const parsed = IndicacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.insert(treinoIndicacaoTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// Cerebro -> Fila de Treino (ONDA C, Requisito 3): roda o motor da anamnese sobre
// as respostas e, se houver regra de treino amarrada as doencas acesas, grava uma
// indicacao (origem 'motor') na fila. Idempotente por cliente: nao duplica
// indicacao pendente do mesmo cliente vinda do motor.
const FromMotorSchema = z.object({
  clientId: z.number().int().positive(),
  anamneseSessionId: z.number().int().positive().optional().nullable(),
  respostas: z
    .array(
      z.object({
        perguntaId: z.string().min(1),
        valor: z.union([z.string(), z.number()]),
      }),
    )
    .min(1),
});

router.post("/treino/indicacoes/from-motor", async (req, res): Promise<void> => {
  const parsed = FromMotorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const { clientId, anamneseSessionId, respostas } = parsed.data;

  const [cliente] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  if (!cliente) {
    res.status(400).json({ error: "Cliente inexistente", clientId });
    return;
  }

  const resultado = await computeMotor(respostas as RespostaMotor[]);
  if (!resultado.sugestaoTreino) {
    res.status(200).json({
      criada: false,
      motivo: "Motor nao indicou treino (nenhuma regra de treino amarrada as doencas acesas).",
      gradeGlobal: resultado.gradeGlobal,
      redFlag: resultado.redFlag,
    });
    return;
  }

  const s = resultado.sugestaoTreino;
  // Idempotencia: o indice unico parcial (client_id) WHERE origem='motor' AND
  // status='pendente' garante no banco no maximo 1 pendente por cliente. Tentamos
  // inserir e, se colidir (23505), buscamos e devolvemos a indicacao ja existente.
  try {
    const [row] = await db
      .insert(treinoIndicacaoTable)
      .values({
        clientId,
        anamneseSessionId: anamneseSessionId ?? null,
        origem: "motor",
        objetivoSugerido: s.objetivoSugerido,
        divisaoSugerida: s.divisaoSugerida,
        justificativa: s.justificativa,
        bloco: s.bloco,
        escore: s.escore,
        status: "pendente",
      })
      .returning();
    res.status(201).json({ criada: true, indicacao: row, resultado });
  } catch (err) {
    // O drizzle embrulha o erro do Postgres; o codigo (23505 = unique_violation)
    // pode estar no proprio erro ou na sua `cause`.
    const pgCode =
      (err as { code?: string }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      const [existente] = await db
        .select()
        .from(treinoIndicacaoTable)
        .where(
          and(
            eq(treinoIndicacaoTable.clientId, clientId),
            eq(treinoIndicacaoTable.origem, "motor"),
            eq(treinoIndicacaoTable.status, "pendente"),
          ),
        );
      res.status(200).json({ criada: false, motivo: "Ja existe indicacao pendente do motor", indicacao: existente, resultado });
      return;
    }
    throw err;
  }
});

router.post("/treino/indicacoes/:id/descartar", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const [row] = await db
    .update(treinoIndicacaoTable)
    .set({ status: "descartada" })
    .where(eq(treinoIndicacaoTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Indicacao nao encontrada" });
    return;
  }
  res.json(row);
});

// ---------------------------------------------------------------------------
// 3) PRESCRICAO — a ficha de treino real (fatia do Cockpit). Calcula volume,
//    tonelagem, duracao e gasto calorico estimado a partir dos itens.
// ---------------------------------------------------------------------------
const ItemSchema = z.object({
  diaTreino: z.string().min(1),
  ordem: z.number().int().optional().nullable(),
  exercicioId: z.number().int().positive().optional().nullable(),
  exercicioNome: z.string().optional().nullable(),
  series: z.number().int().optional().nullable(),
  repeticoes: z.string().optional().nullable(),
  repeticoesNum: z.number().int().optional().nullable(),
  cargaKg: z.number().optional().nullable(),
  descansoSeg: z.number().int().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

const PrescricaoSchema = z.object({
  clientId: z.number().int().positive(),
  protocoloId: z.number().int().positive().optional().nullable(),
  professionalId: z.number().int().positive().optional().nullable(),
  indicacaoId: z.number().int().positive().optional().nullable(),
  objetivo: z.string().optional().nullable(),
  divisao: z.string().optional().nullable(),
  frequenciaSemanal: z.number().int().optional().nullable(),
  pesoKg: z.number().optional().nullable(),
  alturaCm: z.number().optional().nullable(),
  idade: z.number().int().optional().nullable(),
  sexo: z.string().optional().nullable(),
  nivelExperiencia: z.string().optional().nullable(),
  status: z.enum(["rascunho", "ativa", "encerrada"]).optional().default("rascunho"),
  observacao: z.string().optional().nullable(),
  itens: z.array(ItemSchema).optional().default([]),
});

router.post("/treino/prescricoes", async (req, res): Promise<void> => {
  const parsed = PrescricaoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, body.clientId));
  if (!client) {
    res.status(404).json({ error: "Cliente nao encontrado" });
    return;
  }

  // Resolver os exercicios do catalogo (quando exercicioId vier) para o calculo.
  const exercicioIds = body.itens
    .map((it) => it.exercicioId)
    .filter((v): v is number => typeof v === "number");
  const exercicios = exercicioIds.length
    ? await db.select().from(treinoCatalogoExerciciosTable)
    : [];
  const exercicioById = new Map(exercicios.map((e) => [e.id, e]));

  // Pre-validar todas as chaves estrangeiras ANTES de persistir, para nunca
  // deixar dado parcial e responder 4xx claro em vez de 500 do banco.
  const exerciciosInexistentes = [...new Set(exercicioIds)].filter((id) => !exercicioById.has(id));
  if (exerciciosInexistentes.length > 0) {
    res.status(400).json({
      error: "Exercicio(s) inexistente(s) no catalogo",
      exercicioIds: exerciciosInexistentes,
    });
    return;
  }
  if (body.protocoloId != null) {
    const [p] = await db
      .select({ id: treinoProtocolosTable.id })
      .from(treinoProtocolosTable)
      .where(eq(treinoProtocolosTable.id, body.protocoloId));
    if (!p) {
      res.status(400).json({ error: "Protocolo de treino inexistente", protocoloId: body.protocoloId });
      return;
    }
  }
  if (body.professionalId != null) {
    const [p] = await db
      .select({ id: professionalsTable.id })
      .from(professionalsTable)
      .where(eq(professionalsTable.id, body.professionalId));
    if (!p) {
      res.status(400).json({ error: "Profissional inexistente", professionalId: body.professionalId });
      return;
    }
  }
  if (body.indicacaoId != null) {
    const [ind] = await db
      .select({ id: treinoIndicacaoTable.id })
      .from(treinoIndicacaoTable)
      .where(eq(treinoIndicacaoTable.id, body.indicacaoId));
    if (!ind) {
      res.status(400).json({ error: "Indicacao inexistente", indicacaoId: body.indicacaoId });
      return;
    }
  }

  // Conta o resumo da ficha (volume, tonelagem, duracao, gasto) a partir dos itens.
  const itensParaResumo = body.itens.map((it) => {
    const ex = it.exercicioId ? exercicioById.get(it.exercicioId) : undefined;
    return {
      series: it.series,
      repeticoesNum: it.repeticoesNum,
      cargaKg: it.cargaKg,
      descansoSeg: it.descansoSeg,
      met: ex?.met ?? null,
      grupoMuscular: ex?.grupoMuscular ?? null,
    };
  });
  const resumo = calcularResumoTreino(itensParaResumo, body.pesoKg);

  try {
    const resultado = await db.transaction(async (tx) => {
      const [prescricao] = await tx
        .insert(treinoPrescricaoTable)
        .values({
          clientId: body.clientId,
          protocoloId: body.protocoloId ?? null,
          professionalId: body.professionalId ?? null,
          objetivo: body.objetivo ?? null,
          divisao: body.divisao ?? null,
          frequenciaSemanal: body.frequenciaSemanal ?? null,
          pesoKg: body.pesoKg ?? null,
          alturaCm: body.alturaCm ?? null,
          idade: body.idade ?? null,
          sexo: body.sexo ?? null,
          nivelExperiencia: body.nivelExperiencia ?? null,
          volumeTotalSeries: resumo.volumeTotalSeries,
          tonelagemKg: resumo.tonelagemKg,
          duracaoEstimadaMin: resumo.duracaoEstimadaMin,
          gastoCaloricoKcal: resumo.gastoCaloricoKcal,
          status: body.status,
          observacao: body.observacao ?? null,
        })
        .returning();

      if (body.itens.length > 0) {
        const itemRows = body.itens.map((it) => {
          const vol = calcularItemVolume({
            series: it.series,
            repeticoesNum: it.repeticoesNum,
            cargaKg: it.cargaKg,
            descansoSeg: it.descansoSeg,
          });
          const ex = it.exercicioId ? exercicioById.get(it.exercicioId) : undefined;
          return {
            prescricaoId: prescricao.id,
            diaTreino: it.diaTreino,
            ordem: it.ordem ?? null,
            exercicioId: it.exercicioId ?? null,
            exercicioNome: it.exercicioNome ?? ex?.nome ?? null,
            series: it.series ?? null,
            repeticoes: it.repeticoes ?? null,
            repeticoesNum: it.repeticoesNum ?? null,
            cargaKg: it.cargaKg ?? null,
            descansoSeg: it.descansoSeg ?? null,
            tonelagemKg: vol.tonelagemKg,
            observacao: it.observacao ?? null,
          };
        });
        await tx.insert(treinoPrescricaoItemTable).values(itemRows);
      }

      // Se veio de uma indicacao, marca a fila como prescrita (mesma transacao).
      if (body.indicacaoId) {
        await tx
          .update(treinoIndicacaoTable)
          .set({ status: "prescrita", prescricaoId: prescricao.id })
          .where(eq(treinoIndicacaoTable.id, body.indicacaoId));
      }

      const itens = await tx
        .select()
        .from(treinoPrescricaoItemTable)
        .where(eq(treinoPrescricaoItemTable.prescricaoId, prescricao.id))
        .orderBy(asc(treinoPrescricaoItemTable.ordem));

      return { ...prescricao, itens };
    });

    res.status(201).json(resultado);
  } catch (err) {
    // Mapear violacoes do Postgres para 4xx claro (a transacao ja desfez tudo).
    const code = (err as { code?: string })?.code;
    if (code === "23503") {
      res.status(400).json({ error: "Referencia invalida (chave estrangeira)" });
      return;
    }
    if (code === "23505") {
      res.status(409).json({ error: "Registro duplicado (chave unica)" });
      return;
    }
    req.log.error({ err }, "Falha ao criar prescricao de treino");
    res.status(500).json({ error: "Falha ao criar prescricao" });
  }
});

router.get("/treino/prescricoes", async (req, res): Promise<void> => {
  const clientId = Number(req.query.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "clientId obrigatorio" });
    return;
  }
  const rows = await db
    .select()
    .from(treinoPrescricaoTable)
    .where(eq(treinoPrescricaoTable.clientId, clientId))
    .orderBy(desc(treinoPrescricaoTable.createdAt));
  res.json(rows);
});

router.get("/treino/prescricoes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const [prescricao] = await db
    .select()
    .from(treinoPrescricaoTable)
    .where(eq(treinoPrescricaoTable.id, id));
  if (!prescricao) {
    res.status(404).json({ error: "Prescricao nao encontrada" });
    return;
  }
  const itens = await db
    .select()
    .from(treinoPrescricaoItemTable)
    .where(eq(treinoPrescricaoItemTable.prescricaoId, id))
    .orderBy(asc(treinoPrescricaoItemTable.ordem));
  res.json({ ...prescricao, itens });
});

router.patch("/treino/prescricoes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const StatusSchema = z.object({ status: z.enum(["rascunho", "ativa", "encerrada"]) });
  const parsed = StatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db
    .update(treinoPrescricaoTable)
    .set({ status: parsed.data.status })
    .where(eq(treinoPrescricaoTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Prescricao nao encontrada" });
    return;
  }
  res.json(row);
});

export default router;
