import { Router, type IRouter } from "express";
import {
  db,
  dietaCatalogoAlimentosTable,
  dietaProtocolosTable,
  dietaPrescricaoTable,
  dietaPrescricaoItemTable,
  dietaIndicacaoTable,
  clientsTable,
  professionalsTable,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  calcularTdee,
  calcularMacrosPorcao,
  dentroDaJanela,
} from "../lib/dieta-calc";
import { computeMotor, type RespostaMotor } from "../lib/motor-anamnese";

// ============================================================================
// ORGAO DIETA (nativo) — ONDA A do Master Loop Paxter.
// Contrato Comum: Catalogo + Fila de Indicacao + Prescricao (fatia do Cockpit).
// ============================================================================

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// 1) CATALOGO — a despensa de alimentos.
// ---------------------------------------------------------------------------
router.get("/dieta/catalogo/alimentos", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(dietaCatalogoAlimentosTable)
    .where(eq(dietaCatalogoAlimentosTable.ativo, true))
    .orderBy(asc(dietaCatalogoAlimentosTable.grupo), asc(dietaCatalogoAlimentosTable.nome));
  res.json(rows);
});

const AlimentoSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(1),
  grupo: z.string().optional().nullable(),
  subgrupo: z.string().optional().nullable(),
  porcaoPadraoG: z.number().optional().nullable(),
  kcal100g: z.number().optional().nullable(),
  proteinaG100g: z.number().optional().nullable(),
  carboidratoG100g: z.number().optional().nullable(),
  gorduraG100g: z.number().optional().nullable(),
  fibraG100g: z.number().optional().nullable(),
  indiceGlicemico: z.number().int().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

router.post("/dieta/catalogo/alimentos", async (req, res): Promise<void> => {
  const parsed = AlimentoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db
    .insert(dietaCatalogoAlimentosTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(row);
});

// ---------------------------------------------------------------------------
// 4) PROTOCOLOS — modelos reutilizaveis de dieta.
// ---------------------------------------------------------------------------
router.get("/dieta/protocolos", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(dietaProtocolosTable)
    .where(eq(dietaProtocolosTable.ativo, true))
    .orderBy(asc(dietaProtocolosTable.nome));
  res.json(rows);
});

const ProtocoloSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(1),
  objetivo: z.string().optional().nullable(),
  estiloAlimentar: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  jejumIntermitente: z.boolean().optional().default(false),
  jejumJanelaInicio: z.string().optional().nullable(),
  jejumJanelaFim: z.string().optional().nullable(),
  fatorAjusteObjetivo: z.number().optional().nullable(),
});

router.post("/dieta/protocolos", async (req, res): Promise<void> => {
  const parsed = ProtocoloSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.insert(dietaProtocolosTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// ---------------------------------------------------------------------------
// 2) FILA DE INDICACAO — o Cerebro (motor) escreve aqui; aguarda validacao.
// ---------------------------------------------------------------------------
router.get("/dieta/indicacoes", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "pendente";
  const rows = await db
    .select({
      id: dietaIndicacaoTable.id,
      clientId: dietaIndicacaoTable.clientId,
      clientName: clientsTable.name,
      origem: dietaIndicacaoTable.origem,
      protocoloId: dietaIndicacaoTable.protocoloId,
      objetivoSugerido: dietaIndicacaoTable.objetivoSugerido,
      estiloSugerido: dietaIndicacaoTable.estiloSugerido,
      justificativa: dietaIndicacaoTable.justificativa,
      bloco: dietaIndicacaoTable.bloco,
      escore: dietaIndicacaoTable.escore,
      status: dietaIndicacaoTable.status,
      prescricaoId: dietaIndicacaoTable.prescricaoId,
      createdAt: dietaIndicacaoTable.createdAt,
    })
    .from(dietaIndicacaoTable)
    .leftJoin(clientsTable, eq(clientsTable.id, dietaIndicacaoTable.clientId))
    .where(eq(dietaIndicacaoTable.status, status))
    .orderBy(desc(dietaIndicacaoTable.createdAt));
  res.json(rows);
});

const IndicacaoSchema = z.object({
  clientId: z.number().int().positive(),
  anamneseSessionId: z.number().int().positive().optional().nullable(),
  origem: z.enum(["motor", "manual"]).optional().default("manual"),
  protocoloId: z.number().int().positive().optional().nullable(),
  objetivoSugerido: z.string().optional().nullable(),
  estiloSugerido: z.string().optional().nullable(),
  justificativa: z.string().optional().nullable(),
  bloco: z.string().optional().nullable(),
  escore: z.number().int().optional().nullable(),
});

router.post("/dieta/indicacoes", async (req, res): Promise<void> => {
  const parsed = IndicacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.insert(dietaIndicacaoTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// Cerebro -> Fila de Dieta (ONDA B, Requisito 4): roda o motor da anamnese sobre
// as respostas e, se houver regra de dieta amarrada as doencas acesas, grava uma
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

router.post("/dieta/indicacoes/from-motor", async (req, res): Promise<void> => {
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
  if (!resultado.sugestaoDieta) {
    res.status(200).json({
      criada: false,
      motivo: "Motor nao indicou dieta (nenhuma regra de dieta amarrada as doencas acesas).",
      gradeGlobal: resultado.gradeGlobal,
      redFlag: resultado.redFlag,
    });
    return;
  }

  const s = resultado.sugestaoDieta;
  // Idempotencia: o indice unico parcial (client_id) WHERE origem='motor' AND
  // status='pendente' garante no banco no maximo 1 pendente por cliente. Tentamos
  // inserir e, se colidir (23505), buscamos e devolvemos a indicacao ja existente.
  try {
    const [row] = await db
      .insert(dietaIndicacaoTable)
      .values({
        clientId,
        anamneseSessionId: anamneseSessionId ?? null,
        origem: "motor",
        objetivoSugerido: s.objetivoSugerido,
        estiloSugerido: s.estiloSugerido,
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
        .from(dietaIndicacaoTable)
        .where(
          and(
            eq(dietaIndicacaoTable.clientId, clientId),
            eq(dietaIndicacaoTable.origem, "motor"),
            eq(dietaIndicacaoTable.status, "pendente"),
          ),
        );
      res.status(200).json({ criada: false, motivo: "Ja existe indicacao pendente do motor", indicacao: existente, resultado });
      return;
    }
    throw err;
  }
});

router.post("/dieta/indicacoes/:id/descartar", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const [row] = await db
    .update(dietaIndicacaoTable)
    .set({ status: "descartada" })
    .where(eq(dietaIndicacaoTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Indicacao nao encontrada" });
    return;
  }
  res.json(row);
});

// ---------------------------------------------------------------------------
// 3) PRESCRICAO — o cardapio real (fatia do Cockpit). Calcula TDEE e macros e
//    valida a janela de jejum intermitente.
// ---------------------------------------------------------------------------
const ItemSchema = z.object({
  refeicao: z.string().min(1),
  horario: z.string().optional().nullable(),
  ordem: z.number().int().optional().nullable(),
  alimentoId: z.number().int().positive().optional().nullable(),
  alimentoNome: z.string().optional().nullable(),
  quantidadeG: z.number().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

const PrescricaoSchema = z.object({
  clientId: z.number().int().positive(),
  protocoloId: z.number().int().positive().optional().nullable(),
  professionalId: z.number().int().positive().optional().nullable(),
  indicacaoId: z.number().int().positive().optional().nullable(),
  objetivo: z.string().optional().nullable(),
  estiloAlimentar: z.string().optional().nullable(),
  pesoKg: z.number().optional().nullable(),
  alturaCm: z.number().optional().nullable(),
  idade: z.number().int().optional().nullable(),
  sexo: z.string().optional().nullable(),
  nivelAtividade: z.string().optional().nullable(),
  jejumIntermitente: z.boolean().optional().default(false),
  jejumJanelaInicio: z.string().optional().nullable(),
  jejumJanelaFim: z.string().optional().nullable(),
  fatorAjusteObjetivo: z.number().optional().nullable(),
  status: z.enum(["rascunho", "ativa", "encerrada"]).optional().default("rascunho"),
  observacao: z.string().optional().nullable(),
  itens: z.array(ItemSchema).optional().default([]),
});

router.post("/dieta/prescricoes", async (req, res): Promise<void> => {
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

  // Jejum intermitente: bloquear refeicoes fora da janela de alimentacao.
  if (body.jejumIntermitente) {
    const fora = body.itens.filter(
      (it) => it.horario && !dentroDaJanela(it.horario, body.jejumJanelaInicio, body.jejumJanelaFim),
    );
    if (fora.length > 0) {
      res.status(409).json({
        error: "Refeicoes fora da janela de jejum intermitente",
        janela: { inicio: body.jejumJanelaInicio, fim: body.jejumJanelaFim },
        itensForaDaJanela: fora.map((it) => ({ refeicao: it.refeicao, horario: it.horario })),
      });
      return;
    }
  }

  const conta = calcularTdee({
    pesoKg: body.pesoKg,
    alturaCm: body.alturaCm,
    idade: body.idade,
    sexo: body.sexo,
    nivelAtividade: body.nivelAtividade,
    objetivo: body.objetivo,
    fatorAjusteObjetivo: body.fatorAjusteObjetivo,
  });

  // Resolver macros de cada item a partir do catalogo (quando alimentoId vier).
  const alimentoIds = body.itens
    .map((it) => it.alimentoId)
    .filter((v): v is number => typeof v === "number");
  const alimentos = alimentoIds.length
    ? await db.select().from(dietaCatalogoAlimentosTable)
    : [];
  const alimentoById = new Map(alimentos.map((a) => [a.id, a]));

  // Pre-validar todas as chaves estrangeiras ANTES de persistir, para nunca
  // deixar dado parcial e responder 4xx claro em vez de 500 do banco.
  const alimentosInexistentes = [...new Set(alimentoIds)].filter((id) => !alimentoById.has(id));
  if (alimentosInexistentes.length > 0) {
    res.status(400).json({
      error: "Alimento(s) inexistente(s) no catalogo",
      alimentoIds: alimentosInexistentes,
    });
    return;
  }
  if (body.protocoloId != null) {
    const [p] = await db
      .select({ id: dietaProtocolosTable.id })
      .from(dietaProtocolosTable)
      .where(eq(dietaProtocolosTable.id, body.protocoloId));
    if (!p) {
      res.status(400).json({ error: "Protocolo de dieta inexistente", protocoloId: body.protocoloId });
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
      .select({ id: dietaIndicacaoTable.id })
      .from(dietaIndicacaoTable)
      .where(eq(dietaIndicacaoTable.id, body.indicacaoId));
    if (!ind) {
      res.status(400).json({ error: "Indicacao inexistente", indicacaoId: body.indicacaoId });
      return;
    }
  }

  try {
    const resultado = await db.transaction(async (tx) => {
      const [prescricao] = await tx
        .insert(dietaPrescricaoTable)
        .values({
          clientId: body.clientId,
          protocoloId: body.protocoloId ?? null,
          professionalId: body.professionalId ?? null,
          objetivo: body.objetivo ?? null,
          estiloAlimentar: body.estiloAlimentar ?? null,
          pesoKg: body.pesoKg ?? null,
          alturaCm: body.alturaCm ?? null,
          idade: body.idade ?? null,
          sexo: body.sexo ?? null,
          nivelAtividade: body.nivelAtividade ?? null,
          jejumIntermitente: body.jejumIntermitente,
          jejumJanelaInicio: body.jejumJanelaInicio ?? null,
          jejumJanelaFim: body.jejumJanelaFim ?? null,
          tmb: conta.tmb,
          tdee: conta.tdee,
          caloriasAlvo: conta.caloriasAlvo,
          status: body.status,
          observacao: body.observacao ?? null,
        })
        .returning();

      if (body.itens.length > 0) {
        const itemRows = body.itens.map((it) => {
          const alimento = it.alimentoId ? alimentoById.get(it.alimentoId) : undefined;
          const macros = alimento
            ? calcularMacrosPorcao(alimento, it.quantidadeG)
            : { kcal: null, proteinaG: null, carboidratoG: null, gorduraG: null };
          return {
            prescricaoId: prescricao.id,
            refeicao: it.refeicao,
            horario: it.horario ?? null,
            ordem: it.ordem ?? null,
            alimentoId: it.alimentoId ?? null,
            alimentoNome: it.alimentoNome ?? alimento?.nome ?? null,
            quantidadeG: it.quantidadeG ?? null,
            kcal: macros.kcal,
            proteinaG: macros.proteinaG,
            carboidratoG: macros.carboidratoG,
            gorduraG: macros.gorduraG,
            observacao: it.observacao ?? null,
          };
        });
        await tx.insert(dietaPrescricaoItemTable).values(itemRows);
      }

      // Se veio de uma indicacao, marca a fila como prescrita (mesma transacao).
      if (body.indicacaoId) {
        await tx
          .update(dietaIndicacaoTable)
          .set({ status: "prescrita", prescricaoId: prescricao.id })
          .where(eq(dietaIndicacaoTable.id, body.indicacaoId));
      }

      const itens = await tx
        .select()
        .from(dietaPrescricaoItemTable)
        .where(eq(dietaPrescricaoItemTable.prescricaoId, prescricao.id))
        .orderBy(asc(dietaPrescricaoItemTable.ordem));

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
    req.log.error({ err }, "Falha ao criar prescricao de dieta");
    res.status(500).json({ error: "Falha ao criar prescricao" });
  }
});

router.get("/dieta/prescricoes", async (req, res): Promise<void> => {
  const clientId = Number(req.query.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "clientId obrigatorio" });
    return;
  }
  const rows = await db
    .select()
    .from(dietaPrescricaoTable)
    .where(eq(dietaPrescricaoTable.clientId, clientId))
    .orderBy(desc(dietaPrescricaoTable.createdAt));
  res.json(rows);
});

router.get("/dieta/prescricoes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const [prescricao] = await db
    .select()
    .from(dietaPrescricaoTable)
    .where(eq(dietaPrescricaoTable.id, id));
  if (!prescricao) {
    res.status(404).json({ error: "Prescricao nao encontrada" });
    return;
  }
  const itens = await db
    .select()
    .from(dietaPrescricaoItemTable)
    .where(eq(dietaPrescricaoItemTable.prescricaoId, id))
    .orderBy(asc(dietaPrescricaoItemTable.ordem));
  res.json({ ...prescricao, itens });
});

router.patch("/dieta/prescricoes/:id", async (req, res): Promise<void> => {
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
    .update(dietaPrescricaoTable)
    .set({ status: parsed.data.status })
    .where(eq(dietaPrescricaoTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Prescricao nao encontrada" });
    return;
  }
  res.json(row);
});

export default router;
