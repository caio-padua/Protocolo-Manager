import { Router, type IRouter } from "express";
import {
  db,
  dietaCatalogoAlimentosTable,
  dietaProtocolosTable,
  dietaPrescricaoTable,
  dietaPrescricaoItemTable,
  dietaIndicacaoTable,
  dietaReceitasTable,
  dietaReceitaIngredientesTable,
  dietaReceitaProtocolosTable,
  UNIDADES_COMPRA,
  CATEGORIAS_COMPRA,
  clientsTable,
  professionalsTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  calcularTdee,
  calcularMacrosPorcao,
  dentroDaJanela,
} from "../lib/dieta-calc";
import { computeMotor, type RespostaMotor } from "../lib/motor-anamnese";
import { enviarMensagemPaxter, absoluteBaseUrl } from "../lib/messaging";
import { sendWhatsapp } from "../lib/whatsapp";
import { requireCollaborator } from "./collaborator";
import { resolveEmpresaId } from "../middleware/tenantContext";

// ============================================================================
// ORGAO DIETA (nativo) — ONDA A do Master Loop Paxter.
// Contrato Comum: Catalogo + Fila de Indicacao + Prescricao (fatia do Cockpit).
// ============================================================================

const router: IRouter = Router();

// Unidades de compra consideradas "discretas" (nao se compra fracao na pratica)
// — a lista de compras arredonda ESSAS para cima; as demais (kg, g, l, ml,
// continuas) mantem 2 casas decimais.
const UNIDADES_DISCRETAS = new Set<string>(["dz", "un", "maco", "pacote"]);

// Gera um slug ASCII estavel a partir do nome (ex.: "Low Carb" -> "low_carb").
// A tela NUNCA pede pro CEO digitar `codigo` — ele so existe para permitir
// seeds idempotentes; aqui garantimos que a criacao manual tambem funcione.
function slugify(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "item";
}

// Deriva um `codigo` unico a partir do nome, tentando sufixos _2, _3... se
// colidir. `existsFn` consulta a tabela certa (protocolos ou receitas).
async function generateUniqueCodigo(
  nome: string,
  existsFn: (codigo: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(nome);
  let candidato = base;
  for (let tentativa = 2; tentativa <= 50; tentativa++) {
    if (!(await existsFn(candidato))) return candidato;
    candidato = `${base}_${tentativa}`;
  }
  return `${base}_${Date.now()}`;
}

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
  // ---- Lista de compras (Task 234) ----
  precoMedio: z.number().min(0).optional().nullable(),
  unidadeCompra: z.enum(UNIDADES_COMPRA).optional().nullable(),
  unidadeCompraEquivalenteG: z.number().min(0).optional().nullable(),
  categoriaCompra: z.enum(CATEGORIAS_COMPRA).optional().nullable(),
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

// Edicao — cobre o "editavel a qualquer momento pela tela" do preco/unidade,
// mas serve para qualquer campo do catalogo (todos opcionais no PATCH-like PUT).
const AlimentoUpdateSchema = AlimentoSchema.partial();

router.put("/dieta/catalogo/alimentos/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const parsed = AlimentoUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db
    .update(dietaCatalogoAlimentosTable)
    .set(parsed.data)
    .where(eq(dietaCatalogoAlimentosTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Alimento nao encontrado" });
    return;
  }
  res.json(row);
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
  // codigo e opcional: a tela de "Tipos de Dieta" nunca pede pro CEO digitar
  // um slug tecnico — quando ausente, o servidor gera um a partir do nome.
  codigo: z.string().min(1).optional(),
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
  const codigo =
    parsed.data.codigo ??
    (await generateUniqueCodigo(parsed.data.nome, async (c) => {
      const [existente] = await db
        .select({ id: dietaProtocolosTable.id })
        .from(dietaProtocolosTable)
        .where(eq(dietaProtocolosTable.codigo, c));
      return !!existente;
    }));
  const [row] = await db
    .insert(dietaProtocolosTable)
    .values({ ...parsed.data, codigo })
    .returning();
  res.status(201).json(row);
});

const ProtocoloUpdateSchema = ProtocoloSchema.partial();

router.put("/dieta/protocolos/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const parsed = ProtocoloUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const [row] = await db
    .update(dietaProtocolosTable)
    .set(parsed.data)
    .where(eq(dietaProtocolosTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Tipo de dieta nao encontrado" });
    return;
  }
  res.json(row);
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

// ---------------------------------------------------------------------------
// 5) RECEITAS — combinacao pronta de alimentos do catalogo que serve a um ou
//    mais tipos de dieta (protocolos). Reusa calcularMacrosPorcao para os
//    totais nutricionais. Nao mexe na emissao de PDF (dieta-pdf.ts).
// ---------------------------------------------------------------------------
interface ReceitaIngredienteRow {
  id: number;
  receitaId: number;
  alimentoId: number;
  quantidadeG: number;
  ordem: number | null;
  observacao: string | null;
  alimentoNome: string | null;
  kcal100g: number | null;
  proteinaG100g: number | null;
  carboidratoG100g: number | null;
  gorduraG100g: number | null;
}

// Monta o payload "cheio" (ingredientes + tipos de dieta + totais nutricionais)
// para um conjunto de receitas ja carregadas. Reaproveitado por GET lista,
// GET por id, POST e PUT — todos devolvem exatamente este formato.
async function montarReceitasResponse(
  receitas: Array<typeof dietaReceitasTable.$inferSelect>,
): Promise<Array<Record<string, unknown>>> {
  if (receitas.length === 0) return [];
  const ids = receitas.map((r) => r.id);

  const ingredientesRows: ReceitaIngredienteRow[] = await db
    .select({
      id: dietaReceitaIngredientesTable.id,
      receitaId: dietaReceitaIngredientesTable.receitaId,
      alimentoId: dietaReceitaIngredientesTable.alimentoId,
      quantidadeG: dietaReceitaIngredientesTable.quantidadeG,
      ordem: dietaReceitaIngredientesTable.ordem,
      observacao: dietaReceitaIngredientesTable.observacao,
      alimentoNome: dietaCatalogoAlimentosTable.nome,
      kcal100g: dietaCatalogoAlimentosTable.kcal100g,
      proteinaG100g: dietaCatalogoAlimentosTable.proteinaG100g,
      carboidratoG100g: dietaCatalogoAlimentosTable.carboidratoG100g,
      gorduraG100g: dietaCatalogoAlimentosTable.gorduraG100g,
    })
    .from(dietaReceitaIngredientesTable)
    .leftJoin(
      dietaCatalogoAlimentosTable,
      eq(dietaReceitaIngredientesTable.alimentoId, dietaCatalogoAlimentosTable.id),
    )
    .where(inArray(dietaReceitaIngredientesTable.receitaId, ids))
    .orderBy(asc(dietaReceitaIngredientesTable.ordem));

  const tiposRows = await db
    .select({
      receitaId: dietaReceitaProtocolosTable.receitaId,
      protocoloId: dietaProtocolosTable.id,
      codigo: dietaProtocolosTable.codigo,
      nome: dietaProtocolosTable.nome,
    })
    .from(dietaReceitaProtocolosTable)
    .innerJoin(
      dietaProtocolosTable,
      eq(dietaReceitaProtocolosTable.protocoloId, dietaProtocolosTable.id),
    )
    .where(inArray(dietaReceitaProtocolosTable.receitaId, ids));

  return receitas.map((r) => {
    const ingredientes = ingredientesRows.filter((i) => i.receitaId === r.id);
    const tipos = tiposRows
      .filter((t) => t.receitaId === r.id)
      .map((t) => ({ protocoloId: t.protocoloId, codigo: t.codigo, nome: t.nome }));
    const totaisBrutos = ingredientes.reduce(
      (acc, ing) => {
        const m = calcularMacrosPorcao(
          {
            kcal100g: ing.kcal100g,
            proteinaG100g: ing.proteinaG100g,
            carboidratoG100g: ing.carboidratoG100g,
            gorduraG100g: ing.gorduraG100g,
          },
          ing.quantidadeG,
        );
        return {
          kcal: acc.kcal + (m.kcal ?? 0),
          proteinaG: acc.proteinaG + (m.proteinaG ?? 0),
          carboidratoG: acc.carboidratoG + (m.carboidratoG ?? 0),
          gorduraG: acc.gorduraG + (m.gorduraG ?? 0),
        };
      },
      { kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0 },
    );
    return {
      ...r,
      ingredientes: ingredientes.map((i) => ({
        id: i.id,
        alimentoId: i.alimentoId,
        alimentoNome: i.alimentoNome,
        quantidadeG: i.quantidadeG,
        ordem: i.ordem,
        observacao: i.observacao,
      })),
      tipos,
      totais: {
        kcal: Math.round(totaisBrutos.kcal),
        proteinaG: Math.round(totaisBrutos.proteinaG * 10) / 10,
        carboidratoG: Math.round(totaisBrutos.carboidratoG * 10) / 10,
        gorduraG: Math.round(totaisBrutos.gorduraG * 10) / 10,
      },
    };
  });
}

router.get("/dieta/receitas", async (req, res): Promise<void> => {
  const protocoloIdRaw = req.query.protocoloId;
  const ativoOnly = eq(dietaReceitasTable.ativo, true);
  let receitas: Array<typeof dietaReceitasTable.$inferSelect>;

  if (protocoloIdRaw != null && protocoloIdRaw !== "") {
    const protocoloId = Number(protocoloIdRaw);
    if (!Number.isInteger(protocoloId) || protocoloId <= 0) {
      res.status(400).json({ error: "protocoloId invalido" });
      return;
    }
    const links = await db
      .select({ receitaId: dietaReceitaProtocolosTable.receitaId })
      .from(dietaReceitaProtocolosTable)
      .where(eq(dietaReceitaProtocolosTable.protocoloId, protocoloId));
    const receitaIds = links.map((l) => l.receitaId);
    receitas = receitaIds.length
      ? await db
          .select()
          .from(dietaReceitasTable)
          .where(and(ativoOnly, inArray(dietaReceitasTable.id, receitaIds)))
          .orderBy(asc(dietaReceitasTable.nome))
      : [];
  } else {
    receitas = await db.select().from(dietaReceitasTable).where(ativoOnly).orderBy(asc(dietaReceitasTable.nome));
  }

  res.json(await montarReceitasResponse(receitas));
});

router.get("/dieta/receitas/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const [receita] = await db.select().from(dietaReceitasTable).where(eq(dietaReceitasTable.id, id));
  if (!receita) {
    res.status(404).json({ error: "Receita nao encontrada" });
    return;
  }
  const [full] = await montarReceitasResponse([receita]);
  res.json(full);
});

const ReceitaIngredienteSchema = z.object({
  alimentoId: z.number().int().positive(),
  quantidadeG: z.number().min(0),
  ordem: z.number().int().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

const ReceitaSchema = z.object({
  // codigo e opcional: a tela de Receitas nunca pede um slug tecnico.
  codigo: z.string().min(1).optional(),
  nome: z.string().min(1),
  modoPreparo: z.string().optional().nullable(),
  // porcoes e NOT NULL no banco (default 1) — nunca nullable, so ausente/numero.
  porcoes: z.number().int().positive().optional(),
  tempoPreparoMin: z.number().int().positive().optional().nullable(),
  observacao: z.string().optional().nullable(),
  ingredientes: z.array(ReceitaIngredienteSchema).min(1),
  protocoloIds: z.array(z.number().int().positive()).min(1),
});

async function validarFksReceita(
  ingredientes: Array<{ alimentoId: number }>,
  protocoloIds: number[],
): Promise<{ alimentosInexistentes: number[]; protocolosInexistentes: number[] }> {
  const alimentoIds = [...new Set(ingredientes.map((i) => i.alimentoId))];
  const alimentosExistentes = alimentoIds.length
    ? await db
        .select({ id: dietaCatalogoAlimentosTable.id })
        .from(dietaCatalogoAlimentosTable)
        .where(inArray(dietaCatalogoAlimentosTable.id, alimentoIds))
    : [];
  const alimentosSet = new Set(alimentosExistentes.map((a) => a.id));
  const alimentosInexistentes = alimentoIds.filter((aid) => !alimentosSet.has(aid));

  const protocoloIdsUnicos = [...new Set(protocoloIds)];
  const protocolosExistentes = protocoloIdsUnicos.length
    ? await db
        .select({ id: dietaProtocolosTable.id })
        .from(dietaProtocolosTable)
        .where(inArray(dietaProtocolosTable.id, protocoloIdsUnicos))
    : [];
  const protocolosSet = new Set(protocolosExistentes.map((p) => p.id));
  const protocolosInexistentes = protocoloIdsUnicos.filter((pid) => !protocolosSet.has(pid));

  return { alimentosInexistentes, protocolosInexistentes };
}

router.post("/dieta/receitas", async (req, res): Promise<void> => {
  const parsed = ReceitaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const { alimentosInexistentes, protocolosInexistentes } = await validarFksReceita(
    body.ingredientes,
    body.protocoloIds,
  );
  if (alimentosInexistentes.length > 0) {
    res.status(400).json({ error: "Alimento(s) inexistente(s) no catalogo", alimentoIds: alimentosInexistentes });
    return;
  }
  if (protocolosInexistentes.length > 0) {
    res.status(400).json({ error: "Tipo(s) de dieta inexistente(s)", protocoloIds: protocolosInexistentes });
    return;
  }

  try {
    const receita = await db.transaction(async (tx) => {
      const codigo =
        body.codigo ??
        (await generateUniqueCodigo(body.nome, async (c) => {
          const [existente] = await tx
            .select({ id: dietaReceitasTable.id })
            .from(dietaReceitasTable)
            .where(eq(dietaReceitasTable.codigo, c));
          return !!existente;
        }));

      const [novaReceita] = await tx
        .insert(dietaReceitasTable)
        .values({
          codigo,
          nome: body.nome,
          modoPreparo: body.modoPreparo ?? null,
          porcoes: body.porcoes ?? 1,
          tempoPreparoMin: body.tempoPreparoMin ?? null,
          observacao: body.observacao ?? null,
        })
        .returning();

      await tx.insert(dietaReceitaIngredientesTable).values(
        body.ingredientes.map((ing, idx) => ({
          receitaId: novaReceita.id,
          alimentoId: ing.alimentoId,
          quantidadeG: ing.quantidadeG,
          ordem: ing.ordem ?? idx + 1,
          observacao: ing.observacao ?? null,
        })),
      );

      await tx.insert(dietaReceitaProtocolosTable).values(
        [...new Set(body.protocoloIds)].map((protocoloId) => ({ receitaId: novaReceita.id, protocoloId })),
      );

      return novaReceita;
    });

    const [full] = await montarReceitasResponse([receita]);
    res.status(201).json(full);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23503") {
      res.status(400).json({ error: "Referencia invalida (chave estrangeira)" });
      return;
    }
    if (code === "23505") {
      res.status(409).json({ error: "Registro duplicado (chave unica)" });
      return;
    }
    req.log.error({ err }, "Falha ao criar receita de dieta");
    res.status(500).json({ error: "Falha ao criar receita" });
  }
});

const ReceitaUpdateSchema = z.object({
  nome: z.string().min(1).optional(),
  modoPreparo: z.string().optional().nullable(),
  // porcoes e NOT NULL no banco (default 1) — nunca nullable, so ausente/numero.
  porcoes: z.number().int().positive().optional(),
  tempoPreparoMin: z.number().int().positive().optional().nullable(),
  observacao: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
  ingredientes: z.array(ReceitaIngredienteSchema).min(1).optional(),
  protocoloIds: z.array(z.number().int().positive()).min(1).optional(),
});

router.put("/dieta/receitas/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const parsed = ReceitaUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const [existente] = await db
    .select({ id: dietaReceitasTable.id })
    .from(dietaReceitasTable)
    .where(eq(dietaReceitasTable.id, id));
  if (!existente) {
    res.status(404).json({ error: "Receita nao encontrada" });
    return;
  }

  const { alimentosInexistentes, protocolosInexistentes } = await validarFksReceita(
    body.ingredientes ?? [],
    body.protocoloIds ?? [],
  );
  if (body.ingredientes && alimentosInexistentes.length > 0) {
    res.status(400).json({ error: "Alimento(s) inexistente(s) no catalogo", alimentoIds: alimentosInexistentes });
    return;
  }
  if (body.protocoloIds && protocolosInexistentes.length > 0) {
    res.status(400).json({ error: "Tipo(s) de dieta inexistente(s)", protocoloIds: protocolosInexistentes });
    return;
  }

  try {
    const receita = await db.transaction(async (tx) => {
      const { ingredientes, protocoloIds, ...scalarFields } = body;
      if (Object.keys(scalarFields).length > 0) {
        await tx.update(dietaReceitasTable).set(scalarFields).where(eq(dietaReceitasTable.id, id));
      }
      if (ingredientes) {
        await tx.delete(dietaReceitaIngredientesTable).where(eq(dietaReceitaIngredientesTable.receitaId, id));
        await tx.insert(dietaReceitaIngredientesTable).values(
          ingredientes.map((ing, idx) => ({
            receitaId: id,
            alimentoId: ing.alimentoId,
            quantidadeG: ing.quantidadeG,
            ordem: ing.ordem ?? idx + 1,
            observacao: ing.observacao ?? null,
          })),
        );
      }
      if (protocoloIds) {
        await tx.delete(dietaReceitaProtocolosTable).where(eq(dietaReceitaProtocolosTable.receitaId, id));
        await tx.insert(dietaReceitaProtocolosTable).values(
          [...new Set(protocoloIds)].map((protocoloId) => ({ receitaId: id, protocoloId })),
        );
      }
      const [row] = await tx.select().from(dietaReceitasTable).where(eq(dietaReceitasTable.id, id));
      return row;
    });

    const [full] = await montarReceitasResponse([receita]);
    res.json(full);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23503") {
      res.status(400).json({ error: "Referencia invalida (chave estrangeira)" });
      return;
    }
    if (code === "23505") {
      res.status(409).json({ error: "Registro duplicado (chave unica)" });
      return;
    }
    req.log.error({ err }, "Falha ao atualizar receita de dieta");
    res.status(500).json({ error: "Falha ao atualizar receita" });
  }
});

// ---------------------------------------------------------------------------
// 6) LISTA DE COMPRAS — projeta o cardapio diario de uma prescricao sobre um
//    periodo (7 ou 30 dias) e estima o custo usando o catalogo. So LE dados
//    (prescricao + catalogo); nunca escreve. Nao mexe na emissao de PDF.
// ---------------------------------------------------------------------------
router.get("/dieta/prescricoes/:id/lista-compras", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }
  const diasRaw = String(req.query.dias ?? "7");
  if (diasRaw !== "7" && diasRaw !== "30") {
    res.status(400).json({ error: "dias deve ser 7 ou 30" });
    return;
  }
  const dias = Number(diasRaw);

  // Isolamento multi-tenant: o cliente DEVE pertencer ao tenant do chamador.
  // Se a prescrição existir mas seu cliente for de outro tenant, o lookup
  // retorna null e a rota responde 404 — prevenindo IDOR cross-tenant.
  const empresaId = resolveEmpresaId(req as any);

  const [prescricao] = await db.select().from(dietaPrescricaoTable).where(eq(dietaPrescricaoTable.id, id));
  if (!prescricao) {
    res.status(404).json({ error: "Prescricao nao encontrada" });
    return;
  }
  const [client] = await db
    .select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, prescricao.clientId), eq(clientsTable.empresaId, empresaId)));
  // Client not found in this tenant → cross-tenant attempt or stale data
  if (!client) {
    res.status(404).json({ error: "Prescricao nao encontrada" });
    return;
  }

  const itensCardapio = await db
    .select()
    .from(dietaPrescricaoItemTable)
    .where(eq(dietaPrescricaoItemTable.prescricaoId, id));

  // Agrupar por alimentoId (catalogado) somando a quantidade diaria x dias;
  // itens sem alimentoId (texto livre) vao num balde separado, por nome.
  const totalGPorAlimento = new Map<number, number>();
  const totalGSemCatalogo = new Map<string, number>();
  for (const item of itensCardapio) {
    const qtdDia = item.quantidadeG ?? 0;
    if (qtdDia <= 0) continue;
    if (item.alimentoId != null) {
      totalGPorAlimento.set(item.alimentoId, (totalGPorAlimento.get(item.alimentoId) ?? 0) + qtdDia * dias);
    } else if (item.alimentoNome) {
      totalGSemCatalogo.set(item.alimentoNome, (totalGSemCatalogo.get(item.alimentoNome) ?? 0) + qtdDia * dias);
    }
  }

  const alimentoIds = [...totalGPorAlimento.keys()];
  const alimentos = alimentoIds.length
    ? await db.select().from(dietaCatalogoAlimentosTable).where(inArray(dietaCatalogoAlimentosTable.id, alimentoIds))
    : [];
  const alimentoById = new Map(alimentos.map((a) => [a.id, a]));

  const itens: Array<Record<string, unknown>> = [];
  const itensSemPreco: Array<Record<string, unknown>> = [];

  for (const [alimentoId, totalG] of totalGPorAlimento) {
    const alimento = alimentoById.get(alimentoId);
    const nome = alimento?.nome ?? `Alimento #${alimentoId}`;
    if (
      !alimento ||
      alimento.precoMedio == null ||
      !alimento.unidadeCompra ||
      alimento.unidadeCompraEquivalenteG == null ||
      alimento.unidadeCompraEquivalenteG <= 0
    ) {
      itensSemPreco.push({
        alimentoId,
        nome,
        quantidadeTotalG: Math.round(totalG),
        motivo: "Sem preco/unidade de compra cadastrados no catalogo",
      });
      continue;
    }
    const rawUnidades = totalG / alimento.unidadeCompraEquivalenteG;
    const unidadesComprar = UNIDADES_DISCRETAS.has(alimento.unidadeCompra)
      ? Math.ceil(rawUnidades)
      : Math.round(rawUnidades * 100) / 100;
    const custoItem = Math.round(unidadesComprar * alimento.precoMedio * 100) / 100;
    itens.push({
      alimentoId,
      nome,
      categoriaCompra: alimento.categoriaCompra,
      quantidadeTotalG: Math.round(totalG),
      unidadeCompra: alimento.unidadeCompra,
      unidadesComprar,
      precoUnitario: alimento.precoMedio,
      custoItem,
    });
  }

  const itensSemCatalogo = [...totalGSemCatalogo.entries()].map(([alimentoNome, totalG]) => ({
    alimentoNome,
    quantidadeTotalG: Math.round(totalG),
    motivo: "Item sem vinculo no catalogo (texto livre) — cadastre o alimento para ter preco",
  }));

  itens.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  itensSemPreco.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));

  const custoTotalEstimado =
    Math.round(itens.reduce((acc, it) => acc + (it.custoItem as number), 0) * 100) / 100;

  res.json({
    prescricaoId: id,
    clientId: prescricao.clientId,
    clientName: client?.name ?? null,
    dias,
    itens,
    itensSemPreco,
    itensSemCatalogo,
    custoTotalEstimado,
  });
});

// ---------------------------------------------------------------------------
// 7) ENVIAR LISTA DE COMPRAS — despacha a lista gerada acima ao paciente via
//    WhatsApp e/ou e-mail, reutilizando o motor Hermes Paxter. Nao persiste
//    nenhum dado — apenas envia e devolve o resultado ao CEO.
// ---------------------------------------------------------------------------
const EnviarListaSchema = z.object({
  dias: z.union([z.literal(7), z.literal(30)]).default(7),
  canais: z
    .array(z.enum(["WHATSAPP", "EMAIL"]))
    .min(1, "Selecione ao menos um canal"),
});

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

router.post("/dieta/prescricoes/:id/enviar-lista-compras", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id invalido" });
    return;
  }

  const parsed = EnviarListaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
    return;
  }
  const { dias, canais } = parsed.data;

  // Isolamento multi-tenant: o cliente DEVE pertencer ao tenant do chamador.
  // Se a prescrição existir mas seu cliente for de outro tenant, o lookup
  // retorna null e a rota responde 404 — prevenindo IDOR cross-tenant.
  const empresaId = resolveEmpresaId(req as any);

  // — Carregar prescricao e cliente —
  const [prescricao] = await db.select().from(dietaPrescricaoTable).where(eq(dietaPrescricaoTable.id, id));
  if (!prescricao) {
    res.status(404).json({ error: "Prescricao nao encontrada" });
    return;
  }
  const [client] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email, phone: clientsTable.phone })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, prescricao.clientId), eq(clientsTable.empresaId, empresaId)));
  if (!client) {
    res.status(404).json({ error: "Cliente nao encontrado" });
    return;
  }

  // — Validar canais x contatos disponíveis —
  if (canais.includes("WHATSAPP") && !client.phone) {
    res.status(422).json({ error: "Paciente sem telefone cadastrado para WhatsApp" });
    return;
  }
  if (canais.includes("EMAIL") && !client.email) {
    res.status(422).json({ error: "Paciente sem e-mail cadastrado" });
    return;
  }

  // — Calcular lista (mesma logica do GET) —
  const itensCardapio = await db
    .select()
    .from(dietaPrescricaoItemTable)
    .where(eq(dietaPrescricaoItemTable.prescricaoId, id));

  const totalGPorAlimento = new Map<number, number>();
  const totalGSemCatalogo = new Map<string, number>();
  for (const item of itensCardapio) {
    const qtdDia = item.quantidadeG ?? 0;
    if (qtdDia <= 0) continue;
    if (item.alimentoId != null) {
      totalGPorAlimento.set(item.alimentoId, (totalGPorAlimento.get(item.alimentoId) ?? 0) + qtdDia * dias);
    } else if (item.alimentoNome) {
      totalGSemCatalogo.set(item.alimentoNome, (totalGSemCatalogo.get(item.alimentoNome) ?? 0) + qtdDia * dias);
    }
  }

  const alimentoIds = [...totalGPorAlimento.keys()];
  const alimentos = alimentoIds.length
    ? await db.select().from(dietaCatalogoAlimentosTable).where(inArray(dietaCatalogoAlimentosTable.id, alimentoIds))
    : [];
  const alimentoById = new Map(alimentos.map((a) => [a.id, a]));

  // Helper para escapar HTML em conteudo dinamico
  function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  interface ItemCalculado {
    nome: string;
    unidadesComprar: number;
    unidadeCompra: string;
    custoItem: number;
    temPreco: true;
  }
  interface ItemSemPreco {
    nome: string;
    totalG: number;
    temPreco: false;
  }
  const itensCalculados: ItemCalculado[] = [];
  const itensSemPrecoEnvio: ItemSemPreco[] = [];
  let custoTotal = 0;

  for (const [alimentoId, totalG] of totalGPorAlimento) {
    const alimento = alimentoById.get(alimentoId);
    const nome = alimento?.nome ?? `Alimento #${alimentoId}`;
    if (!alimento || alimento.precoMedio == null || !alimento.unidadeCompra || !alimento.unidadeCompraEquivalenteG || alimento.unidadeCompraEquivalenteG <= 0) {
      // Incluir com quantidade mas sem preco, igual ao que o CEO ve na tela
      itensSemPrecoEnvio.push({ nome, totalG: Math.round(totalG), temPreco: false });
      continue;
    }
    const rawUnidades = totalG / alimento.unidadeCompraEquivalenteG;
    const unidadesComprar = UNIDADES_DISCRETAS.has(alimento.unidadeCompra)
      ? Math.ceil(rawUnidades)
      : Math.round(rawUnidades * 100) / 100;
    const custoItem = Math.round(unidadesComprar * alimento.precoMedio * 100) / 100;
    custoTotal += custoItem;
    itensCalculados.push({ nome, unidadesComprar, unidadeCompra: alimento.unidadeCompra, custoItem, temPreco: true });
  }
  itensCalculados.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  itensSemPrecoEnvio.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  custoTotal = Math.round(custoTotal * 100) / 100;

  // Itens de texto livre (sem vinculo no catalogo) — mostrar com quantidade em gramas
  const itensSemCatalogoEnvio = [...totalGSemCatalogo.entries()].map(([nome, totalG]) => ({
    nome,
    totalG: Math.round(totalG),
  }));
  itensSemCatalogoEnvio.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const totalItens = itensCalculados.length + itensSemPrecoEnvio.length + itensSemCatalogoEnvio.length;
  if (totalItens === 0) {
    res.status(422).json({ error: "Nenhum item na lista de compras para enviar" });
    return;
  }

  // — Montar linhas de texto completas (sem truncamento) —
  const linhasWa: string[] = [];
  for (const it of itensCalculados) {
    linhasWa.push(`• ${it.nome}: ${it.unidadesComprar} ${it.unidadeCompra} — ${formatBRL(it.custoItem)}`);
  }
  // Itens catalogados sem preco — mostrar quantidade em gramas
  for (const it of itensSemPrecoEnvio) {
    linhasWa.push(`• ${it.nome}: ${it.totalG.toLocaleString("pt-BR")} g (preço indisponível)`);
  }
  // Itens texto livre — mostrar quantidade em gramas
  for (const it of itensSemCatalogoEnvio) {
    linhasWa.push(`• ${it.nome}: ${it.totalG.toLocaleString("pt-BR")} g (preço indisponível)`);
  }

  // — Dividir linhas em chunks de ~1400 chars em limites de linha.
  //   Linhas individuais mais longas que o limite sao partidas no limite exato
  //   para nao perder conteudo. Cada chunk vai numa mensagem plain (sem banner).
  const WA_CHUNK_SIZE = 1400;
  function chunkLinhas(linhas: string[]): string[] {
    const chunks: string[] = [];
    let cur = "";
    for (const linhaOriginal of linhas) {
      // Partir linhas gigantes individualmente
      const sublinha = linhaOriginal.length > WA_CHUNK_SIZE
        ? linhaOriginal.match(new RegExp(`.{1,${WA_CHUNK_SIZE}}`, "g")) ?? [linhaOriginal]
        : [linhaOriginal];
      for (const linha of sublinha) {
        const candidato = cur ? cur + "\n" + linha : linha;
        if (candidato.length > WA_CHUNK_SIZE && cur) {
          chunks.push(cur);
          cur = linha;
        } else {
          cur = candidato;
        }
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  // — Montar tabela HTML para e-mail (com escaping de conteudo dinamico) —
  const linhasHtml = itensCalculados
    .map(
      (it) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #2a3655;">${escHtml(it.nome)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #2a3655;text-align:right;">${it.unidadesComprar} ${escHtml(it.unidadeCompra)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #2a3655;text-align:right;font-weight:bold;color:#C5A038;">${formatBRL(it.custoItem)}</td></tr>`,
    )
    .join("");

  // Itens catalogados sem preco — exibir quantidade em gramas, custo como indisponivel
  const linhasHtmlSemPreco = itensSemPrecoEnvio
    .map(
      (it) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #2a3655;color:#8a9ab8;">${escHtml(it.nome)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #2a3655;text-align:right;color:#8a9ab8;">${it.totalG.toLocaleString("pt-BR")} g</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #2a3655;color:#8a9ab8;text-align:right;">preço indisponível</td></tr>`,
    )
    .join("");

  // Itens texto livre — mesmo tratamento que sem preco
  const linhasHtmlSemCatalogo = itensSemCatalogoEnvio
    .map(
      (it) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #2a3655;color:#8a9ab8;">${escHtml(it.nome)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #2a3655;text-align:right;color:#8a9ab8;">${it.totalG.toLocaleString("pt-BR")} g</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #2a3655;color:#8a9ab8;text-align:right;">preço indisponível</td></tr>`,
    )
    .join("");

  const tabelaHtml = `
<table style="width:100%;border-collapse:collapse;font-size:14px;color:#e8eaf6;">
  <thead>
    <tr style="background:#1a2540;">
      <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#8a9ab8;">Alimento</th>
      <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#8a9ab8;">Qtd. a comprar</th>
      <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#8a9ab8;">Custo est.</th>
    </tr>
  </thead>
  <tbody>
    ${linhasHtml}${linhasHtmlSemPreco}${linhasHtmlSemCatalogo}
    <tr style="background:#1a2540;">
      <td colspan="2" style="padding:10px 12px;font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8a9ab8;">Total estimado${(itensSemPrecoEnvio.length + itensSemCatalogoEnvio.length) > 0 ? " (parcial)" : ""}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:900;font-size:16px;color:#C5A038;">${custoTotal > 0 ? formatBRL(custoTotal) : "—"}</td>
    </tr>
  </tbody>
</table>`;

  // — PaxterDoc para E-mail (tabela como blocosHtml) —
  const nomePaciente = client.name ?? "Paciente";
  const totalLabel = custoTotal > 0
    ? `Custo estimado dos itens com preço: ${formatBRL(custoTotal)}${(itensSemPrecoEnvio.length + itensSemCatalogoEnvio.length) > 0 ? " (alguns itens sem preço cadastrado — confira na tabela)" : ""}`
    : "Ainda não há preços cadastrados para estes itens — confira a tabela para as quantidades.";

  const doc = {
    eyebrow: `Lista de compras — ${dias} dias`,
    titulo: `Sua lista de compras, ${nomePaciente.split(" ")[0]}`,
    paragrafos: [
      `Preparamos sua lista de compras com base no seu cardápio para os próximos ${dias} dias.`,
      `Confira os itens e quantidades na tabela abaixo.`,
      totalLabel,
    ],
    notaRodape: "Os preços são estimativas com base no catálogo. Valores reais podem variar.",
    assunto: `Lista de compras — ${dias} dias — ${nomePaciente}`,
    blocosHtml: [tabelaHtml],
  };

  const baseUrl = absoluteBaseUrl(req);
  const destino = { email: client.email, telefone: client.phone, nome: client.name };
  const ctx = { baseUrl, clienteId: client.id, contexto: "lista_compras_dieta" };

  const resultados: { canal: string; sent: boolean; mock?: boolean; error?: string }[] = [];

  // — WhatsApp: mensagem brandada (intro, sem itens) + chunks de itens como plain.
  //   O Hermes adiciona ~200-400 chars de envelope (eyebrow/titulo/footer/assinatura),
  //   por isso os itens NUNCA entram na mensagem Hermes para nao ultrapassar o limite
  //   do Twilio. Qualquer falha em qualquer mensagem = canal marcado como erro.
  if (canais.includes("WHATSAPP") && client.phone) {
    const chunks = chunkLinhas(linhasWa);
    const totalLabel = custoTotal > 0
      ? `💰 Total estimado: ${formatBRL(custoTotal)}`
      : "⚠️ Alguns itens ainda não têm preço cadastrado — confira com a clínica.";

    // Mensagem 1: intro brandada via Hermes (SEM itens — garante tamanho seguro)
    const docWaIntro = {
      eyebrow: `Lista de compras — ${dias} dias`,
      titulo: `Sua lista de compras, ${nomePaciente.split(" ")[0]}`,
      paragrafos: [
        `Preparei sua lista de compras para os próximos ${dias} dias.`,
        `Os itens chegam nas próximas mensagens.`,
        totalLabel,
      ],
      notaRodape: "Os preços são estimativas com base no catálogo.",
      assunto: `Lista de compras — ${dias} dias — ${nomePaciente}`,
    };
    const r0 = await enviarMensagemPaxter(docWaIntro, destino, ["WHATSAPP"], ctx);
    let waAllSent = r0.resultados.every((rr) => rr.sent);
    let waError: string | undefined = r0.resultados.find((rr) => !rr.sent)?.error;

    // Mensagens 2..N: chunks de itens, sem envelope Hermes (sem banner repetido)
    for (let i = 0; i < chunks.length && waAllSent; i++) {
      const prefix = chunks.length > 1 ? `_(parte ${i + 1}/${chunks.length})_\n\n` : "";
      const chunkResult = await sendWhatsapp(client.phone, prefix + chunks[i], {
        clienteId: client.id,
        contexto: "lista_compras_dieta_itens",
      });
      if (!chunkResult.sent) {
        waAllSent = false;
        waError = chunkResult.error ?? `Falha ao enviar parte ${i + 1} de ${chunks.length}`;
      }
    }

    resultados.push({ canal: "WHATSAPP", sent: waAllSent, error: waError });
  }

  // — E-mail: PaxterDoc com tabela HTML completa —
  if (canais.includes("EMAIL")) {
    const r = await enviarMensagemPaxter(doc, destino, ["EMAIL"], ctx);
    resultados.push(...r.resultados.map((rr) => ({ canal: rr.canal, sent: rr.sent, mock: rr.mock, error: rr.error })));
  }

  const algumEnviado = resultados.some((r) => r.sent);
  res.json({ ok: algumEnviado, resultados });
});

export default router;
