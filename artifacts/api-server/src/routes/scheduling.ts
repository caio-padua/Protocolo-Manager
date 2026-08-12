import { Router, type IRouter, type Request } from "express";
import { randomInt } from "node:crypto";
import {
  db,
  professionalsTable,
  agendaResourcesTable,
  schedulingRequestsTable,
  professionalAreasTable,
  professionalSpecialtiesTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  createSchedulingToken,
  verifySchedulingToken,
  verifyBookingStatusToken,
} from "../lib/portal-token.js";
import {
  CreateConciergeChargeBody,
  CreateSchedulingRequestBody,
  UpdateSchedulingRequestBody,
} from "@workspace/api-zod";
import { computeResourceSlots } from "../lib/agenda-booking.js";
import { sendWhatsapp, isWhatsappConfigured } from "../lib/whatsapp.js";
import {
  asaasCreateCustomer,
  asaasCreateCharge,
  asaasGetCharge,
  asaasGetPixQrCode,
} from "../lib/asaas.js";
import { computeConciergeOffer } from "../lib/agenda-concierge.js";
import { getSetting } from "../lib/secure-settings.js";
import { finalizeConciergeBooking } from "../lib/concierge-finalize.js";
import { getPenalidade, registrarFalha } from "../lib/concierge-penalidade.js";
import { checkDeviceThrottle, deriveFingerprint, isDeviceVerified } from "../lib/concierge-device-throttle.js";

const router: IRouter = Router();

// Valor padrao do sinal Concierge (R$). Configuravel por pay.conciergeValue.
const CONCIERGE_AMOUNT_DEFAULT = 150;

// ── Device OTP: criação lazy das tabelas ──────────────────────────────────────
// device_verification_codes — armazena o código gerado (TTL 10 min)
// device_verified_sessions — marca o dispositivo como verificado (TTL 30 dias)
// Ambas criadas em raw SQL para não depender de Drizzle push em produção.
let _verifyTablesReady: Promise<void> | null = null;

async function ensureVerifyTables(): Promise<void> {
  if (_verifyTablesReady) return _verifyTablesReady;
  _verifyTablesReady = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS device_verification_codes (
        id SERIAL PRIMARY KEY,
        device_fingerprint TEXT NOT NULL,
        cpf TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        failed_attempts INTEGER NOT NULL DEFAULT 0
      )
    `);
    // Retrocompatível: adiciona a coluna em tabelas criadas antes desta versão.
    await db.execute(sql`
      ALTER TABLE device_verification_codes
        ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS device_verified_sessions (
        id SERIAL PRIMARY KEY,
        device_fingerprint TEXT NOT NULL,
        cpf TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
  })().catch((err: unknown) => {
    _verifyTablesReady = null;
    throw err;
  });
  return _verifyTablesReady;
}

// Mapeia o status cru da cobranca Asaas para o nosso vocabulario interno.
function mapAsaasPaymentStatus(
  raw: string,
): "aguardando" | "pago" | "expirado" | "cancelado" {
  const up = (raw || "").toUpperCase();
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(up)) return "pago";
  if (up === "OVERDUE") return "expirado";
  if (
    [
      "REFUNDED",
      "REFUND_REQUESTED",
      "CHARGEBACK_REQUESTED",
      "CHARGEBACK_DISPUTE",
      "AWAITING_CHARGEBACK_REVERSAL",
      "DELETED",
    ].includes(up)
  ) {
    return "cancelado";
  }
  return "aguardando";
}

// Resolve o valor do sinal Concierge: config (pay.conciergeValue) -> padrao.
// Nunca abaixo do minimo do Asaas (R$ 5,00).
async function resolveConciergeAmount(): Promise<number> {
  const raw = await getSetting("pay.conciergeValue");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 5 ? n : CONCIERGE_AMOUNT_DEFAULT;
}

// Confere o "crachá" de agendamento: lê o token do header (x-scheduling-token)
// ou do corpo (accessToken) e confirma que ele pertence a ESTA solicitação. O
// crachá é emitido na criação da solicitação. Sem crachá válido, as rotas
// públicas de cobrança/status/confirmação negam (403) — assim ninguém manipula
// a solicitação de outra pessoa apenas adivinhando o número (IDOR/enumeração).
function schedulingTokenMatches(req: Request, id: number): boolean {
  const fromHeader = (req.header("x-scheduling-token") || "").trim();
  const fromBody = String(
    (req.body && (req.body as { accessToken?: unknown }).accessToken) || "",
  ).trim();
  const raw = fromHeader || fromBody;
  if (!raw) return false;
  return verifySchedulingToken(raw) === id;
}

// Monta a mensagem de lembrete a partir da solicitacao. So texto; nao envia.
function buildReminderMessage(
  o: typeof schedulingRequestsTable.$inferSelect,
  professionalName: string | null,
): string {
  const nome = o.patientName?.trim() || "Cliente";
  const linhas: string[] = [`Olá, ${nome}! Lembrete do seu atendimento no Instituto Pádua.`];
  const dataBr = (iso: string): string => {
    const [y, m, d] = iso.split("-");
    return d && m && y ? `${d}/${m}/${y}` : iso;
  };
  if (o.chosenDate) {
    linhas.push(`Data: ${dataBr(o.chosenDate)}${o.chosenTime ? ` às ${o.chosenTime}` : ""}.`);
  } else if (o.earliestDate) {
    linhas.push(`Data desejada: ${dataBr(o.earliestDate)}.`);
  }
  if (professionalName) linhas.push(`Profissional: ${professionalName}.`);
  linhas.push("Qualquer dúvida, é só responder esta mensagem.");
  return linhas.join("\n");
}

const ENTRADAS = ["estetico", "dr_caio", "assistente"] as const;
type Entrada = (typeof ENTRADAS)[number];

function formatRequest(o: typeof schedulingRequestsTable.$inferSelect) {
  return {
    ...o,
    path: o.path ?? null,
    patientCpf: o.patientCpf ?? null,
    patientEmail: o.patientEmail ?? null,
    desire: o.desire ?? null,
    preferredWeekday: o.preferredWeekday ?? null,
    preferredPeriod: o.preferredPeriod ?? null,
    earliestDate: o.earliestDate ?? null,
    professionalId: o.professionalId ?? null,
    resourceId: o.resourceId ?? null,
    chosenDate: o.chosenDate ?? null,
    chosenTime: o.chosenTime ?? null,
    paymentArm: o.paymentArm ?? null,
    notes: o.notes ?? null,
    createdAt: o.createdAt.toISOString(),
  };
}

// Entrada 4: lista os medicos assistentes (categoria medico, ativos, NAO
// principais) ja com o resourceId do motor de agenda (se existir um recurso
// ligado ao medico). O medico principal (Dr. Caio) e separado por flag
// canonica isPrimaryDoctor, nunca por nome. Sem resourceId => a tela mostra
// "sem horarios" (caso extremo da spec).
router.get("/scheduling/doctors", async (_req, res): Promise<void> => {
  const docs = await db
    .select()
    .from(professionalsTable)
    .where(
      and(
        eq(professionalsTable.active, true),
        eq(professionalsTable.category, "medico"),
        eq(professionalsTable.isPrimaryDoctor, false),
      ),
    )
    .orderBy(asc(professionalsTable.name));

  const resources = await db
    .select({
      id: agendaResourcesTable.id,
      professionalId: agendaResourcesTable.professionalId,
    })
    .from(agendaResourcesTable)
    .where(eq(agendaResourcesTable.active, true));

  const resByProf = new Map<number, number>();
  for (const r of resources) {
    if (r.professionalId != null && !resByProf.has(r.professionalId)) {
      resByProf.set(r.professionalId, r.id);
    }
  }

  const out = docs.map((d) => ({
    id: d.id,
    name: d.name,
    specialty: d.specialty ?? null,
    crm: d.crm ?? null,
    resourceId: resByProf.get(d.id) ?? null,
  }));

  res.json(out);
});

// Profissionais AGENDAVEIS (Entrada 4 / "Corpo Clinico"): ativos, NAO principais
// (Dr. Caio fica fora — ele e a Entrada 3 exclusiva) e que tenham recurso de
// agenda ativo. Inclui medico E nao-medico (enfermagem, psicologia, nutricao).
// Retorna o primeiro recurso ativo do profissional como resourceId.
async function loadBookableProfessionals(): Promise<
  Array<{
    prof: typeof professionalsTable.$inferSelect;
    resourceId: number;
  }>
> {
  const profs = await db
    .select()
    .from(professionalsTable)
    .where(and(eq(professionalsTable.active, true), eq(professionalsTable.isPrimaryDoctor, false)))
    .orderBy(asc(professionalsTable.name));

  const resources = await db
    .select({ id: agendaResourcesTable.id, professionalId: agendaResourcesTable.professionalId })
    .from(agendaResourcesTable)
    .where(eq(agendaResourcesTable.active, true));

  const resByProf = new Map<number, number>();
  for (const r of resources) {
    if (r.professionalId != null && !resByProf.has(r.professionalId)) {
      resByProf.set(r.professionalId, r.id);
    }
  }

  const out: Array<{ prof: typeof professionalsTable.$inferSelect; resourceId: number }> = [];
  for (const p of profs) {
    const resourceId = resByProf.get(p.id);
    if (resourceId != null) out.push({ prof: p, resourceId });
  }
  return out;
}

// GET /scheduling/areas — areas com pelo menos um profissional agendavel, com as
// especializacoes que tem profissional agendavel aninhadas. Alimenta o passo 1
// (area) e passo 2 (especializacao) do fluxo do paciente, sem misturar entradas.
router.get("/scheduling/areas", async (_req, res): Promise<void> => {
  const [bookable, areas, specialties] = await Promise.all([
    loadBookableProfessionals(),
    db.select().from(professionalAreasTable),
    db.select().from(professionalSpecialtiesTable),
  ]);

  // Catálogo inativo não aparece para o paciente (Spec 2 — só ativos).
  const areaById = new Map(areas.filter((a) => a.active).map((a) => [a.id, a]));
  const specById = new Map(specialties.filter((s) => s.active).map((s) => [s.id, s]));

  // areaId -> set de specialtyIds com profissional agendavel.
  const specsByArea = new Map<number, Set<number>>();
  const areaIdsWithBookable = new Set<number>();
  for (const { prof } of bookable) {
    if (prof.areaId == null) continue;
    areaIdsWithBookable.add(prof.areaId);
    if (prof.specialtyId != null) {
      if (!specsByArea.has(prof.areaId)) specsByArea.set(prof.areaId, new Set());
      specsByArea.get(prof.areaId)!.add(prof.specialtyId);
    }
  }

  const out = Array.from(areaIdsWithBookable)
    .map((areaId) => {
      const area = areaById.get(areaId);
      if (!area) return null;
      const specIds = Array.from(specsByArea.get(areaId) ?? []);
      const specs = specIds
        .map((sid) => specById.get(sid))
        .filter((s): s is typeof professionalSpecialtiesTable.$inferSelect => !!s)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((s) => ({ id: s.id, name: s.name }));
      return {
        id: area.id,
        name: area.name,
        professionalType: area.professionalType,
        defaultPaymentArm: area.defaultPaymentArm ?? null,
        specialties: specs,
      };
    })
    .filter((a): a is NonNullable<typeof a> => !!a)
    .sort((a, b) => {
      const oa = areaById.get(a.id)?.sortOrder ?? 0;
      const ob = areaById.get(b.id)?.sortOrder ?? 0;
      return oa - ob || a.name.localeCompare(b.name);
    });

  res.json(out);
});

// GET /scheduling/professionals?areaId&specialtyId — profissionais agendaveis,
// opcionalmente filtrados por area/especializacao, ja com resourceId do motor.
router.get("/scheduling/professionals", async (req, res): Promise<void> => {
  const areaId =
    typeof req.query.areaId === "string" && req.query.areaId ? parseInt(req.query.areaId) : undefined;
  const specialtyId =
    typeof req.query.specialtyId === "string" && req.query.specialtyId
      ? parseInt(req.query.specialtyId)
      : undefined;

  const [bookable, areas, specialties] = await Promise.all([
    loadBookableProfessionals(),
    db.select({ id: professionalAreasTable.id, name: professionalAreasTable.name }).from(professionalAreasTable),
    db
      .select({ id: professionalSpecialtiesTable.id, name: professionalSpecialtiesTable.name })
      .from(professionalSpecialtiesTable),
  ]);
  const areaNames = new Map(areas.map((a) => [a.id, a.name]));
  const specNames = new Map(specialties.map((s) => [s.id, s.name]));

  const out = bookable
    .filter(({ prof }) => {
      if (areaId !== undefined && !Number.isNaN(areaId) && prof.areaId !== areaId) return false;
      if (specialtyId !== undefined && !Number.isNaN(specialtyId) && prof.specialtyId !== specialtyId) return false;
      return true;
    })
    .map(({ prof, resourceId }) => ({
      id: prof.id,
      name: prof.name,
      professionalType: prof.professionalType ?? null,
      areaId: prof.areaId ?? null,
      specialtyId: prof.specialtyId ?? null,
      areaName: prof.areaId != null ? (areaNames.get(prof.areaId) ?? null) : null,
      specialtyName: prof.specialtyId != null ? (specNames.get(prof.specialtyId) ?? null) : null,
      registrationCouncil: prof.registrationCouncil ?? null,
      registrationNumber: prof.registrationNumber ?? null,
      resourceId,
    }));

  res.json(out);
});

// Lista solicitacoes (admin). Filtros opcionais entrada/status.
router.get("/scheduling/requests", async (req, res): Promise<void> => {
  const entrada =
    typeof req.query.entrada === "string" && req.query.entrada
      ? req.query.entrada
      : undefined;
  const status =
    typeof req.query.status === "string" && req.query.status
      ? req.query.status
      : undefined;

  const conds = [];
  if (entrada) conds.push(eq(schedulingRequestsTable.entrada, entrada));
  if (status) conds.push(eq(schedulingRequestsTable.status, status));

  const rows = conds.length
    ? await db
        .select()
        .from(schedulingRequestsTable)
        .where(and(...conds))
        .orderBy(desc(schedulingRequestsTable.createdAt))
    : await db
        .select()
        .from(schedulingRequestsTable)
        .orderBy(desc(schedulingRequestsTable.createdAt));

  res.json(rows.map(formatRequest));
});

// Cria uma solicitacao a partir de uma entrada do paciente (2, 3 ou 4).
router.post("/scheduling/requests", async (req, res): Promise<void> => {
  const parsed = CreateSchedulingRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const entrada = String(data.entrada) as Entrada;
  if (!ENTRADAS.includes(entrada)) {
    res.status(400).json({ error: "entrada inválida" });
    return;
  }
  const patientName = data.patientName.trim();
  const patientPhone = data.patientPhone.trim();
  if (!patientName || !patientPhone) {
    res
      .status(400)
      .json({ error: "Nome e telefone do paciente são obrigatórios" });
    return;
  }

  // Regra de Ouro (Entrada 3): caminho obrigatorio + data desejada valida.
  // A "janela natural" (3 meses) e o prazo da FILA. O Concierge existe justamente
  // para ANTECIPAR esse prazo (pagando a prioridade), entao a data desejada do
  // paciente e SEMPRE livre — o piso de 3 meses se aplica so a data REALMENTE
  // marcada na fila (chosenDate), nunca a data desejada (earliestDate).
  if (entrada === "dr_caio") {
    const path = data.path ?? "";
    if (path !== "concierge" && path !== "fila") {
      res
        .status(400)
        .json({ error: "Escolha o caminho: concierge ou fila" });
      return;
    }
    if (!data.earliestDate) {
      res.status(400).json({ error: "Informe a data desejada" });
      return;
    }
    const desired = new Date(`${data.earliestDate}T00:00:00`);
    if (Number.isNaN(desired.getTime())) {
      res.status(400).json({ error: "Data desejada inválida" });
      return;
    }
    if (path === "fila") {
      // A fila e a janela natural: a vaga marcada e obrigatoria no servidor
      // (nao confiar no cliente) e tem de cair a partir de 3 meses.
      if (!data.chosenDate || !data.chosenTime) {
        res.status(400).json({
          error: "Escolha uma data e um horário da fila (janela natural).",
        });
        return;
      }
      const min = new Date();
      min.setMonth(min.getMonth() + 3);
      min.setHours(0, 0, 0, 0);
      const booked = new Date(`${data.chosenDate}T00:00:00`);
      if (Number.isNaN(booked.getTime()) || booked < min) {
        res.status(400).json({
          error:
            "A vaga da fila do Dr. Caio respeita a janela natural (a partir de 3 meses).",
        });
        return;
      }
    }
  }

  // Recurso de agenda validado no servidor para a Entrada 4 (assistente).
  let assistantResourceId: number | null = null;
  // Braco de pagamento herdado da AREA do profissional (estrutura; sem cobranca).
  let assistantPaymentArm: string | null = null;

  // Entrada 4 (assistente): exige medico + slot real escolhido. Validamos no
  // servidor (nao confiar no cliente): o profissional precisa existir, estar
  // ativo, ser medico e NAO ser o principal (Dr. Caio nunca entra como
  // assistente). O medico TEM de ter recurso de agenda ativo e o horario
  // escolhido tem de estar realmente livre no motor; o resourceId gravado vem
  // sempre do servidor, nunca do cliente.
  if (entrada === "assistente") {
    if (!data.professionalId || !data.chosenDate || !data.chosenTime) {
      res.status(400).json({
        error: "Selecione o médico e um horário disponível",
      });
      return;
    }

    const [prof] = await db
      .select()
      .from(professionalsTable)
      .where(eq(professionalsTable.id, data.professionalId))
      .limit(1);

    // Entrada 4 = "Corpo Clinico": aceita QUALQUER profissional ativo e NAO
    // principal (medico assistente OU nao-medico: enfermagem/psicologia/nutricao).
    // Dr. Caio (principal) nunca entra aqui — ele e a Entrada 3 exclusiva.
    if (!prof || !prof.active || prof.isPrimaryDoctor) {
      res.status(400).json({
        error: "Profissional inválido ou indisponível",
      });
      return;
    }

    // Se o medico tem recurso de agenda, confirmamos que o horario escolhido
    // esta realmente livre (anti-corrida com a recepcao).
    const [resource] = await db
      .select({ id: agendaResourcesTable.id })
      .from(agendaResourcesTable)
      .where(
        and(
          eq(agendaResourcesTable.professionalId, prof.id),
          eq(agendaResourcesTable.active, true),
        ),
      )
      .limit(1);

    if (!resource) {
      res.status(400).json({
        error: "Médico assistente sem agenda disponível",
      });
      return;
    }

    const computed = await computeResourceSlots(
      resource.id,
      data.chosenDate,
      null,
    );
    const slot = computed?.result.slots.find(
      (s) => s.time === data.chosenTime,
    );
    if (!slot || slot.state !== "livre") {
      res.status(409).json({
        error: "Horário não está mais disponível. Escolha outro.",
      });
      return;
    }

    // Fixa o recurso validado no servidor; nunca confiar no resourceId do cliente.
    assistantResourceId = resource.id;

    // Braco de pagamento herdado da AREA do profissional (sem cobranca real).
    if (prof.areaId != null) {
      const [area] = await db
        .select({ defaultPaymentArm: professionalAreasTable.defaultPaymentArm })
        .from(professionalAreasTable)
        .where(eq(professionalAreasTable.id, prof.areaId))
        .limit(1);
      assistantPaymentArm = area?.defaultPaymentArm ?? null;
    }
  }

  // Guard #159 — bloquear no BACKEND quando paciente está suspenso do Concierge.
  // O frontend já exibe a tela de bloqueio, mas qualquer chamada direta à API
  // (bypassando o frontend) seria aceita sem este guard. Fail-closed: se não há
  // CPF informado, passa — a penalidade não pode ser atribuída a identidade
  // não verificada (conforme revisão Dr. Claude 12/08/2026).
  if (
    entrada === "dr_caio" &&
    data.path === "concierge" &&
    data.patientCpf
  ) {
    const pen = await getPenalidade(data.patientCpf);
    if (pen.bloqueado_permanente) {
      res.status(403).json({
        error:
          "Este CPF está suspenso do canal Concierge. Utilize a via comum para agendar.",
        code: "CONCIERGE_BLOCKED",
      });
      return;
    }
  }

  // Braco de pagamento default por entrada (estrutura; sem cobranca real).
  const paymentArm =
    data.paymentArm ??
    (entrada === "dr_caio" && data.path === "concierge"
      ? "concierge"
      : entrada === "assistente"
        ? (assistantPaymentArm ?? "sinal25")
        : entrada === "estetico"
          ? "estetico_pos"
          : null);

  // Defesa em profundidade contra "misturar as 4 entradas": cada campo so e
  // gravado quando pertence a entrada atual; os demais ficam null.
  const isCaio = entrada === "dr_caio";
  const isAssist = entrada === "assistente";

  const [row] = await db
    .insert(schedulingRequestsTable)
    .values({
      entrada,
      path: isCaio ? (data.path ?? null) : null,
      patientName,
      patientPhone,
      patientCpf: data.patientCpf ?? null,
      patientEmail: data.patientEmail ?? null,
      desire: data.desire ?? null,
      preferredWeekday: isCaio ? (data.preferredWeekday ?? null) : null,
      preferredPeriod: isCaio ? (data.preferredPeriod ?? null) : null,
      earliestDate: isCaio ? (data.earliestDate ?? null) : null,
      professionalId: isAssist ? (data.professionalId ?? null) : null,
      resourceId: assistantResourceId,
      chosenDate: isAssist ? (data.chosenDate ?? null) : null,
      chosenTime: isAssist ? (data.chosenTime ?? null) : null,
      paymentArm,
      paymentStatus: "nao_aplicavel",
      status: "novo",
    })
    .returning();

  // Emite o crachá amarrado a esta solicitação. O frontend o guarda e o envia
  // nas rotas de cobrança/status/confirmação. Só é devolvido aqui, na criação.
  res.status(201).json({
    ...formatRequest(row),
    accessToken: createSchedulingToken(row.id),
  });
});

// Gera (ou reusa) a cobranca REAL Concierge no Asaas, amarrada a solicitacao.
// Publico (o fluxo /agendar e publico). Idempotente: devolve a cobranca existente.
// Pagina hospedada (PIX/cartao/boleto). Nunca marca pago aqui.
router.post(
  "/scheduling/requests/:id/concierge-charge",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    // Crachá obrigatório: prova que quem pede a cobrança é o dono da solicitação.
    if (!schedulingTokenMatches(req, id)) {
      res.status(403).json({ error: "Acesso negado a esta solicitação." });
      return;
    }
    const [row] = await db
      .select()
      .from(schedulingRequestsTable)
      .where(eq(schedulingRequestsTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Solicitação não encontrada" });
      return;
    }
    if (row.entrada !== "dr_caio" || row.path !== "concierge") {
      res.status(400).json({
        error: "Cobrança Concierge só vale para o caminho concierge do Dr. Caio.",
      });
      return;
    }
    const cpf = String(req.body?.patientCpf || row.patientCpf || "").replace(
      /\D/g,
      "",
    );
    if (cpf.length < 11) {
      res
        .status(400)
        .json({ error: "CPF é obrigatório para gerar a cobrança Concierge." });
      return;
    }
    // Meio de pagamento (spec cartão): "pix" (padrão — QR embutido no Paxter) ou
    // "card" (fatura hospedada do Asaas com cartão/parcelamento, sem NUNCA
    // coletar o número do cartão na nossa tela). billingType "UNDEFINED" abre a
    // página hospedada onde o cliente escolhe/parcela; "PIX" mantém o QR inline.
    // Validação por Zod (R-A4): todos os campos são opcionais, então quem já
    // chamava sem `method` continua válido; um `method` fora do enum é rejeitado
    // com 400 em vez de cair silenciosamente no default.
    const parsedBody = CreateConciergeChargeBody.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({ error: "Corpo inválido para gerar a cobrança." });
      return;
    }
    const method: "pix" | "card" = parsedBody.data.method === "card" ? "card" : "pix";
    const billingType: "PIX" | "UNDEFINED" =
      method === "card" ? "UNDEFINED" : "PIX";
    try {
      // Trava anti-cobrança-dupla: a transação serializa, POR SOLICITAÇÃO, as
      // chamadas concorrentes (dois cliques/duas abas). pg_advisory_xact_lock é
      // liberado automaticamente ao fim da transação (commit/rollback/queda de
      // conexão) — sem risco de trava presa. A leitura "fresca" e a checagem de
      // idempotência acontecem DENTRO da trava: o segundo a entrar enxerga a
      // cobrança que o primeiro acabou de criar e devolve a mesma, em vez de
      // criar uma segunda cobrança no Asaas.
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);

        const [fresh] = await tx
          .select()
          .from(schedulingRequestsTable)
          .where(eq(schedulingRequestsTable.id, id))
          .limit(1);

        // #87 — Fix da reativação: três estados, não dois.
        // Lista de exclusão ("expirado"|"cancelado") falhou porque "estornado",
        // "recusado", "chargeback" e qualquer status novo passavam como vivo.
        // Lista de permissão invertida é pior: "pago" cairia no ramo de criação
        // e geraria segunda cobrança para quem já pagou (erro de dinheiro).
        // Três estados fecham todos os casos.
        // Regra que fecha: status desconhecido nunca cria cobrança.
        const TERMINAL_FALHA = new Set([
          "expirado", "cancelado", "estornado", "recusado", "chargeback",
        ]);
        const TERMINAL_SUCESSO = new Set(["pago", "confirmado", "recebido"]);
        const statusAtual = fresh.paymentStatus ?? "";

        // Estado 1: já pago — devolve a existente. NUNCA cria outra.
        // Criar para quem já pagou = cobrar duas vezes (erro de dinheiro).
        if (fresh.asaasChargeId && TERMINAL_SUCESSO.has(statusAtual)) {
          return {
            created: false,
            jaPago: true,
            requestId: fresh.id,
            chargeId: fresh.asaasChargeId,
            invoiceUrl: fresh.asaasInvoiceUrl,
            amount: fresh.paymentAmount ?? (await resolveConciergeAmount()),
            status: fresh.paymentStatus,
          };
        }

        // Estado 2: falha terminal — cai para criação de nova cobrança (segue abaixo).
        // Estado 3: status desconhecido ou aguardando — devolve a existente. NUNCA cria.
        // "Status desconhecido nunca cria cobrança" (comentário §6.4, ARQUITETURA.md).
        // A condição anterior exigia asaasInvoiceUrl, mas um charge pode existir sem
        // invoiceUrl (bug de Asaas / corrida). Sem esse guard, a rota criaria uma segunda
        // cobrança para um cartão que já tem uma charge pendente → erro de dinheiro.
        if (!TERMINAL_FALHA.has(statusAtual) && fresh.asaasChargeId) {
          return {
            created: false,
            requestId: fresh.id,
            chargeId: fresh.asaasChargeId,
            invoiceUrl: fresh.asaasInvoiceUrl ?? null,
            amount: fresh.paymentAmount ?? (await resolveConciergeAmount()),
            status: fresh.paymentStatus,
          };
        }

        let customerId = fresh.asaasCustomerId;
        if (!customerId) {
          const customer = await asaasCreateCustomer({
            name: fresh.patientName,
            cpfCnpj: cpf,
            email: fresh.patientEmail,
            phone: fresh.patientPhone,
          });
          customerId = customer.id;
        }
        const amount = await resolveConciergeAmount();
        const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const charge = await asaasCreateCharge({
          customerId,
          value: amount,
          dueDate: due,
          description: `Concierge — prioridade Dr. Caio — ${fresh.patientName}`,
          billingType,
        });
        const [updated] = await tx
          .update(schedulingRequestsTable)
          .set({
            asaasCustomerId: customerId,
            asaasChargeId: charge.id,
            asaasInvoiceUrl: charge.invoiceUrl,
            paymentAmount: amount,
            patientCpf: cpf,
            paymentStatus: "aguardando",
          })
          .where(eq(schedulingRequestsTable.id, id))
          .returning();
        return {
          created: true,
          requestId: updated.id,
          chargeId: charge.id,
          invoiceUrl: charge.invoiceUrl,
          amount,
          status: "aguardando",
        };
      });

      // QR PIX embutido (pago DENTRO do Paxter). Busca best-effort FORA da trava
      // para nao segurar o advisory lock durante a chamada de rede. Se o Asaas
      // nao devolver o QR (ex.: ambiente/permissao), caimos no invoiceUrl —
      // resposta honesta, sem fingir QR.
      let pixQrImage: string | null = null;
      let pixPayload: string | null = null;
      let pixExpiration: string | null = null;
      // QR PIX só existe para cobrança PIX. No cartão (billingType UNDEFINED) a
      // fatura hospedada resolve o pagamento — não buscamos QR e devolvemos só o
      // invoiceUrl, sem fingir QR.
      if (method === "pix") {
        try {
          const qr = await asaasGetPixQrCode(result.chargeId);
          if (qr.encodedImage && qr.payload) {
            pixQrImage = qr.encodedImage;
            pixPayload = qr.payload;
            pixExpiration = qr.expirationDate;
          }
        } catch (qrErr) {
          req.log.warn(
            { err: String(qrErr) },
            "QR PIX indisponível na cobrança Concierge (usando invoiceUrl)",
          );
        }
      }

      res.status(result.created ? 201 : 200).json({
        requestId: result.requestId,
        chargeId: result.chargeId,
        invoiceUrl: result.invoiceUrl,
        amount: result.amount,
        status: result.status,
        pixQrImage,
        pixPayload,
        pixExpiration,
      });
    } catch (err) {
      req.log.error(
        { err: String(err) },
        "Erro ao gerar cobrança Concierge no Asaas",
      );
      res.status(502).json({
        error:
          err instanceof Error ? err.message : "Erro ao falar com o Asaas.",
      });
    }
  },
);

// Confirmacao automatica por consulta (polling): le o status real da cobranca no
// Asaas em tempo real, persiste se mudou e devolve o status mapeado. Publico.
// Se o Asaas estiver indisponivel, devolve o ultimo status conhecido (nao quebra).
router.get(
  "/scheduling/requests/:id/payment-status",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    // Crachá obrigatório (enviado pelo header x-scheduling-token no polling).
    if (!schedulingTokenMatches(req, id)) {
      res.status(403).json({ error: "Acesso negado a esta solicitação." });
      return;
    }
    const [row] = await db
      .select()
      .from(schedulingRequestsTable)
      .where(eq(schedulingRequestsTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Solicitação não encontrada" });
      return;
    }
    if (!row.asaasChargeId) {
      res.json({
        status: row.paymentStatus,
        invoiceUrl: row.asaasInvoiceUrl ?? null,
        asaasStatus: null,
      });
      return;
    }
    try {
      const charge = await asaasGetCharge(row.asaasChargeId);
      const mapped = mapAsaasPaymentStatus(charge.status);
      if (mapped !== row.paymentStatus) {
        await db
          .update(schedulingRequestsTable)
          .set({
            paymentStatus: mapped,
            paidAt:
              mapped === "pago"
                ? (row.paidAt ?? new Date().toISOString().slice(0, 10))
                : row.paidAt,
          })
          .where(eq(schedulingRequestsTable.id, id));
        // Transicionou para "pago": dispara a finalizacao (cadastro + acesso +
        // e-mail de chegada). Fire-and-forget: nao segura a resposta do polling;
        // e idempotente (advisory lock + finalizedAt) contra o webhook concorrente.
        if (mapped === "pago") {
          finalizeConciergeBooking(id).catch((err) =>
            req.log.error({ err: String(err), id }, "finalizeConciergeBooking (polling) falhou"),
          );
        }
        // Trava de escassez: registra falha quando concierge nao foi pago.
        // eventId inclui row.updated_at para que um pedido que expira, reabre
        // e expira de novo gere ids distintos — a segunda expiracao e real.
        if (
          (mapped === "expirado" || mapped === "cancelado") &&
          row.path === "concierge" &&
          row.entrada === "dr_caio"
        ) {
          // Caso 9B — eventId compartilhado (shared:) em polling E webhook.
          // Formato: shared:{sreqId}:{asaasChargeId}:{desfecho}
          // payment.id no webhook == asaasChargeId no polling (mesmo charge Asaas).
          // ON CONFLICT (event_id) DO NOTHING no CTE deduplica atomicamente
          // qualquer ordem de chegada — polling-primeiro OU webhook-primeiro.
          // asaasChargeId muda na reativação: segundo vencimento real gera novo id.
          const sharedEventId = `shared:${row.id}:${row.asaasChargeId ?? "nocharge"}:${mapped}`;
          // Caso 9B — dedup atômica via CTE + PRIMARY KEY (event_id).
          // Guard do polling (Caso 9A) REMOVIDO em 12/08/2026:
          // polling e webhook geram o mesmo eventId → PK já deduplica qualquer ordem.
          // Guard adicional introduzia corrida fora do CTE e bloqueava desfechos legítimos
          // quando sreq já tinha um evento de tipo diferente (ex.: OVERDUE antes de CHARGEBACK).
          registrarFalha(row.patientCpf, sharedEventId, row.id)
            .catch((err) =>
              req.log.error({ err: String(err), id, sharedEventId }, "registrarFalha concierge (polling) falhou"),
            );
        }
      }
      res.json({
        status: mapped,
        invoiceUrl: row.asaasInvoiceUrl ?? charge.invoiceUrl,
        asaasStatus: charge.status,
      });
    } catch (err) {
      req.log.error(
        { err: String(err) },
        "Erro ao consultar status da cobrança Asaas",
      );
      res.json({
        status: row.paymentStatus,
        invoiceUrl: row.asaasInvoiceUrl ?? null,
        asaasStatus: null,
        error: "asaas_indisponivel",
      });
    }
  },
);

// Status de chegada por token (Bloco C, R9): pagina publica que o paciente abre
// pelo link do e-mail de chegada, SEM login. Token STATELESS (HMAC do id, escopo
// bstatus) verificado aqui — nao aceita id sem token valido (anti-enumeracao).
// Reaproveita o mesmo mapAsaasPaymentStatus e nunca diz "confirmado" antes da baixa.
router.get(
  "/scheduling/:id/arrival-status",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const token = typeof req.query.t === "string" ? req.query.t : "";
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Solicitação inválida." });
      return;
    }
    // O token amarra o id: so abre se o HMAC bater E for do MESMO agendamento.
    const tokenId = token ? verifyBookingStatusToken(token) : null;
    if (tokenId === null || tokenId !== id) {
      res.status(401).json({ error: "Link inválido ou expirado." });
      return;
    }

    const [row] = await db
      .select()
      .from(schedulingRequestsTable)
      .where(eq(schedulingRequestsTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Solicitação não encontrada." });
      return;
    }

    // Consulta a fonte quando houver cobranca; senao mostra o status gravado.
    let status = row.paymentStatus;
    if (row.asaasChargeId) {
      try {
        const charge = await asaasGetCharge(row.asaasChargeId);
        const mapped = mapAsaasPaymentStatus(charge.status);
        if (mapped !== row.paymentStatus) {
          await db
            .update(schedulingRequestsTable)
            .set({
              paymentStatus: mapped,
              paidAt:
                mapped === "pago"
                  ? (row.paidAt ?? new Date().toISOString().slice(0, 10))
                  : row.paidAt,
            })
            .where(eq(schedulingRequestsTable.id, id));
          if (mapped === "pago") {
            finalizeConciergeBooking(id).catch((err) =>
              req.log.error(
                { err: String(err), id },
                "finalizeConciergeBooking (arrival-status) falhou",
              ),
            );
          }
        }
        status = mapped;
      } catch (err) {
        req.log.error({ err: String(err), id }, "arrival-status: Asaas indisponível");
      }
    }

    // Nome do paciente vem do cadastro vinculado (nao expoe outros dados/PII).
    let patientName: string | null = row.patientName ?? null;
    if (row.clientId) {
      const [client] = await db
        .select({ name: clientsTable.name })
        .from(clientsTable)
        .where(eq(clientsTable.id, row.clientId))
        .limit(1);
      if (client?.name) patientName = client.name;
    }

    res.json({
      status, // "pago" | "aguardando" | "expirado" | "cancelado" | "gerar" | "nao_aplicavel"
      chosenDate: row.chosenDate ?? null,
      chosenTime: row.chosenTime ?? null,
      patientName,
      finalized: Boolean(row.finalizedAt),
    });
  },
);

// Oferta de horarios REAL do concierge (Dr. Caio): confronta a agenda de verdade
// ANTES do pagamento. Publico (o funil /agendar e publico). Stateless — nao cria
// nada, so calcula. Query: weekday (1..6), period (manha|tarde), earliest (YYYY-MM-DD),
// cpf (digits only — consulta penalidade sem criar nada).
// Trava por dispositivo (ARQUITETURA.md §6.2-6.3):
//   Fingerprint extraído SERVER-SIDE de User-Agent + IP mascarado /24.
//   Estado "verified" via isDeviceVerified() server-side (task #79/#180).
//   Nenhum desses parâmetros é aceito do cliente via query string.
router.get("/scheduling/concierge-offer", async (req, res): Promise<void> => {
  const rawWeekday = req.query.weekday;
  const weekday =
    typeof rawWeekday === "string" && /^[1-6]$/.test(rawWeekday) ? Number(rawWeekday) : null;
  const rawPeriod = req.query.period;
  const period = rawPeriod === "manha" || rawPeriod === "tarde" ? rawPeriod : null;
  const rawEarliest = req.query.earliest;
  const earliest =
    typeof rawEarliest === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawEarliest) ? rawEarliest : null;
  const rawCpf = req.query.cpf;
  const cpf = typeof rawCpf === "string" ? rawCpf : null;

  // Fingerprint derivado SERVER-SIDE de User-Agent + IP mascarado (§6.2).
  // verified via isDeviceVerified() server-side — nunca do cliente.
  const fingerprint = deriveFingerprint(req);
  const verified = await isDeviceVerified(fingerprint);

  try {
    // ── Trava por dispositivo: verifica throttle ANTES de qualquer cálculo ──
    // Nunca grava penalidade no CPF (ARQUITETURA.md §6.2 regra 6).
    const deviceCheck = await checkDeviceThrottle(fingerprint, verified);
    if (deviceCheck.throttled) {
      // Teto antiautomação atingido (≥ 50 ofertas/dia).
      res.json({
        throttled: true,
        requiresVerification: false,
        message: deviceCheck.message,
      });
      return;
    }
    // Se requiresVerification=true, a fricção não bloqueia:
    // a oferta é calculada normalmente e o flag é devolvido para o frontend.

    // ── Trava de escassez: verifica penalidade do CPF ANTES de calcular a oferta ──
    const pen = await getPenalidade(cpf);
    if (pen.bloqueado) {
      // 4ª+ tentativa: concierge indisponível — redireciona para via normal.
      res.json({
        blocked: true,
        motivo: "concierge_bloqueado",
        tentativas: pen.tentativas,
        mensagem:
          "Após múltiplas tentativas não concluídas, o acesso ao Concierge foi suspenso. " +
          "Por favor, utilize a Via Comum para agendar.",
      });
      return;
    }

    // Aplica offset de penalidade ao piso de datas (torna datas mais distantes).
    let effectiveEarliest = earliest;
    if (pen.penalidade_dias > 0) {
      const base = earliest ?? new Date().toISOString().slice(0, 10);
      const d = new Date(`${base}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + pen.penalidade_dias);
      effectiveEarliest = d.toISOString().slice(0, 10);
    }

    const offer = await computeConciergeOffer({
      preferredWeekday: weekday,
      preferredPeriod: period,
      earliestDate: effectiveEarliest,
    });
    if (!offer) {
      res.status(404).json({ error: "Agenda do Dr. Caio indisponível no momento." });
      return;
    }
    // Devolve a oferta enriquecida com informação de penalidade (UI usa para aviso)
    // e com os flags de trava por dispositivo (throttled / requiresVerification).
    res.json({
      ...offer,
      penalidade_dias: pen.penalidade_dias,
      tentativas: pen.tentativas,
      throttled: deviceCheck.throttled,
      requiresVerification: deviceCheck.requiresVerification,
      ...(deviceCheck.message ? { deviceMessage: deviceCheck.message } : {}),
    });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao calcular a oferta Concierge");
    res.status(500).json({ error: "Falha ao calcular a oferta de horários." });
  }
});

// Atualiza status/notas/pagamento de uma solicitacao (admin).
router.patch("/scheduling/requests/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  // Crachá obrigatório: só o dono da solicitação (fluxo /agendar) pode alterá-la.
  if (!schedulingTokenMatches(req, id)) {
    res.status(403).json({ error: "Acesso negado a esta solicitação." });
    return;
  }
  const parsed = UpdateSchedulingRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [target] = await db
    .select({ id: schedulingRequestsTable.id })
    .from(schedulingRequestsTable)
    .where(eq(schedulingRequestsTable.id, id))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }
  // Endpoint publico (o fluxo /agendar e publico). O estado de pagamento e
  // SERVER-ONLY: so muda via concierge-charge, polling (payment-status) e webhook.
  // Aqui aceitamos apenas campos seguros — nunca paymentStatus/paidAt/asaas*.
  const { status, notes, chosenDate, chosenTime } = parsed.data;
  const changes: Record<string, unknown> = {};
  if (status !== undefined) changes.status = status;
  if (notes !== undefined) changes.notes = notes;
  if (chosenDate !== undefined) changes.chosenDate = chosenDate;
  if (chosenTime !== undefined) changes.chosenTime = chosenTime;
  const [row] = await db
    .update(schedulingRequestsTable)
    .set(changes)
    .where(eq(schedulingRequestsTable.id, id))
    .returning();
  res.json(formatRequest(row));
});

// POST /scheduling/send-verification-code — gera um OTP de 6 dígitos e envia
// via WhatsApp para o telefone do paciente identificado pelo CPF. Público (funil
// /agendar).
//
// SEGURANÇA: rate limit autoritativo totalmente dentro de uma única transação
// com pg_advisory_xact_lock por (fingerprint, CPF). O lock serializa requisições
// concorrentes do mesmo dispositivo+CPF, garantindo que o cooldown e o teto
// diário não possam ser ultrapassados por corridas. A geração do código e a
// confirmação de envio também ocorrem dentro da seção crítica.
router.post("/scheduling/send-verification-code", async (req, res): Promise<void> => {
  const rawCpf = String(req.body?.cpf ?? "").replace(/\D/g, "");
  if (rawCpf.length < 11) {
    res.status(400).json({ error: "CPF inválido." });
    return;
  }

  const fingerprint = deriveFingerprint(req);
  if (!fingerprint) {
    res.status(400).json({ error: "Não foi possível identificar o dispositivo." });
    return;
  }

  try {
    await ensureVerifyTables();

    // Busca o telefone ANTES da transação (leitura read-only, não precisa de lock).
    const clients = await db
      .select({ phone: clientsTable.phone })
      .from(clientsTable)
      .where(
        sql`regexp_replace(coalesce(${clientsTable.cpf}, ''), '\D', '', 'g') = ${rawCpf}`,
      )
      .limit(1);

    if (clients.length === 0 || !clients[0]?.phone) {
      res.status(404).json({ error: "Paciente não encontrado ou sem telefone cadastrado." });
      return;
    }

    const phone = clients[0].phone;

    // ── Transação atômica com lock exclusivo por (fingerprint, CPF) ──────────
    // pg_advisory_xact_lock serializa todas as requisições para o mesmo par —
    // impossibilitando que duas requisições paralelas ultrapassem os limites.
    type SendResult =
      | { blocked: "cooldown" | "daily" }
      | { blocked: null; code: string };

    const lockKey = `otp:${fingerprint}:${rawCpf}`;
    const txResult = await db.transaction(async (tx): Promise<SendResult> => {
      // Lock exclusivo liberado automaticamente ao fim da transação.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // 1. Cooldown de 60s: bloqueia se existe código criado há menos de 60s
      //    (expires_at = created_at + 10min → se sobram >9min, foi criado <1min atrás).
      const cooldownRows = await tx.execute<{ id: number }>(sql`
        SELECT id FROM device_verification_codes
         WHERE device_fingerprint = ${fingerprint}
           AND cpf = ${rawCpf}
           AND expires_at > NOW() + INTERVAL '9 minutes'
         LIMIT 1
      `);
      if (((cooldownRows.rows ?? cooldownRows) as { id: number }[]).length > 0) {
        return { blocked: "cooldown" };
      }

      // 2. Limite diário de 5 envios por dispositivo+CPF
      //    (expires_at > NOW() - 23h50min ≡ criado nas últimas 24h).
      const dailyRows = await tx.execute<{ cnt: string }>(sql`
        SELECT COUNT(*) AS cnt FROM device_verification_codes
         WHERE device_fingerprint = ${fingerprint}
           AND cpf = ${rawCpf}
           AND expires_at > NOW() - INTERVAL '23 hours 50 minutes'
      `);
      const dailyCount = Number(
        ((dailyRows.rows ?? dailyRows) as { cnt: string }[])[0]?.cnt ?? 0,
      );
      if (dailyCount >= 5) {
        return { blocked: "daily" };
      }

      // Gera código de 6 dígitos com entropia criptográfica (nunca Math.random).
      const code = String(randomInt(100000, 1000000));

      // Insere novo código com validade de 10 minutos.
      await tx.execute(sql`
        INSERT INTO device_verification_codes (device_fingerprint, cpf, code, expires_at)
        VALUES (${fingerprint}, ${rawCpf}, ${code}, NOW() + INTERVAL '10 minutes')
      `);

      return { blocked: null, code };
    });
    // ─────────────────────────────────────────────────────────────────────────

    if (txResult.blocked === "cooldown") {
      res.status(429).json({ error: "Aguarde 60 segundos antes de solicitar um novo código." });
      return;
    }
    if (txResult.blocked === "daily") {
      res.status(429).json({ error: "Limite diário de envios atingido. Tente novamente amanhã." });
      return;
    }

    // After the two `blocked` guards above, txResult is narrowed to
    // { blocked: null; code: string } — explicit cast for TS narrowing.
    const code = (txResult as { blocked: null; code: string }).code;

    // Envia via WhatsApp FORA da transação (I/O lento não deve segurar o lock).
    // NUNCA incluir o código numa URL/link de fallback — exporia o OTP a
    // qualquer chamador que conheça o CPF (ataque de SMS pumping).
    const message =
      `Seu código de verificação PAXTER: *${code}*\n\nVálido por 10 minutos. Não compartilhe este código com ninguém.`;
    const result = await sendWhatsapp(phone, message, { contexto: "device_verification" });

    // Mascara o telefone para exibição: (***) *****-XXXX
    const digits = phone.replace(/\D/g, "");
    const maskedPhone = `(***) *****-${digits.slice(-4)}`;

    if (!result.sent) {
      // Fail-closed: sem link de fallback (link wa.me conteria o OTP em texto).
      res.status(503).json({
        sent: false,
        maskedPhone,
        error:
          "Não foi possível enviar o código pelo WhatsApp. " +
          "Verifique se o número cadastrado está correto ou entre em contato com a clínica.",
      });
      return;
    }

    res.json({ sent: true, maskedPhone });
  } catch (err: unknown) {
    req.log.error({ err: String(err) }, "Erro ao enviar código de verificação de dispositivo");
    res.status(500).json({ error: "Falha ao enviar o código. Tente novamente." });
  }
});

// POST /scheduling/verify-device — valida o OTP e insere sessão verificada.
// Após sucesso, isDeviceVerified() retorna true e a fricção é removida.
//
// SEGURANÇA: toda a lógica (leitura, checagem e incremento de tentativas,
// marcação de uso e criação de sessão) ocorre dentro de uma única transação
// com pg_advisory_xact_lock. Isso previne corridas de brute-force paralelas
// que ultrapassariam o teto de 5 tentativas antes do lockout ser observado.
router.post("/scheduling/verify-device", async (req, res): Promise<void> => {
  const rawCode = String(req.body?.code ?? "").replace(/\D/g, "");
  const rawCpf = String(req.body?.cpf ?? "").replace(/\D/g, "");

  if (rawCode.length < 4 || rawCpf.length < 11) {
    res.status(400).json({ message: "Dados inválidos." });
    return;
  }

  const fingerprint = deriveFingerprint(req);
  if (!fingerprint) {
    res.status(400).json({ message: "Não foi possível identificar o dispositivo." });
    return;
  }

  const MAX_ATTEMPTS = 5;

  try {
    await ensureVerifyTables();

    type VerifyResult =
      | { status: "no_code" }
      | { status: "locked" }
      | { status: "wrong"; remaining: number }
      | { status: "ok" };

    const lockKey = `otp:${fingerprint}:${rawCpf}`;
    const result = await db.transaction(async (tx): Promise<VerifyResult> => {
      // Lock exclusivo: serializa todas as tentativas de verificação para o
      // mesmo dispositivo+CPF. Libera automaticamente ao fim da transação.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // Busca o código mais recente válido (não expirado e não utilizado).
      const rows = await tx.execute<{
        id: number;
        code: string;
        failed_attempts: number;
      }>(sql`
        SELECT id, code, failed_attempts
          FROM device_verification_codes
         WHERE device_fingerprint = ${fingerprint}
           AND cpf = ${rawCpf}
           AND expires_at > NOW()
           AND used_at IS NULL
         ORDER BY id DESC
         LIMIT 1
      `);

      const row = (
        (rows.rows ?? rows) as { id: number; code: string; failed_attempts: number }[]
      )[0];

      if (!row) return { status: "no_code" };
      if (row.failed_attempts >= MAX_ATTEMPTS) return { status: "locked" };

      if (row.code !== rawCode) {
        // Incremento dentro da mesma transação: serializado pelo advisory lock,
        // impossível ultrapassar MAX_ATTEMPTS com requisições paralelas.
        await tx.execute(sql`
          UPDATE device_verification_codes
             SET failed_attempts = failed_attempts + 1
           WHERE id = ${row.id}
        `);
        const remaining = MAX_ATTEMPTS - (row.failed_attempts + 1);
        return { status: "wrong", remaining };
      }

      // Código correto: marca como usado (evita replay) e cria sessão verificada.
      await tx.execute(sql`
        UPDATE device_verification_codes SET used_at = NOW() WHERE id = ${row.id}
      `);
      await tx.execute(sql`
        INSERT INTO device_verified_sessions (device_fingerprint, cpf, expires_at)
        VALUES (${fingerprint}, ${rawCpf}, NOW() + INTERVAL '30 days')
      `);

      return { status: "ok" };
    });

    if (result.status === "no_code") {
      res.status(422).json({ message: "Nenhum código válido encontrado. Solicite um novo código." });
      return;
    }
    if (result.status === "locked") {
      res.status(429).json({ message: "Limite de tentativas atingido. Solicite um novo código." });
      return;
    }
    if (result.status === "wrong") {
      res.status(422).json({
        message:
          result.remaining > 0
            ? `Código inválido. ${result.remaining} tentativa${result.remaining === 1 ? "" : "s"} restante${result.remaining === 1 ? "" : "s"}.`
            : "Código inválido. Limite de tentativas atingido — solicite um novo código.",
      });
      return;
    }

    // status === "ok"
    res.json({ ok: true });
  } catch (err: unknown) {
    req.log.error({ err: String(err) }, "Erro ao verificar código de dispositivo");
    res.status(500).json({ message: "Falha ao verificar. Tente novamente." });
  }
});

// POST /scheduling/requests/:id/send-reminder — monta o lembrete e envia por
// WhatsApp/Twilio SE houver credenciais. Sem credenciais: responde sent:false
// com o texto pronto (preview) e o link wa.me manual. Nunca cobra, nunca quebra.
router.post(
  "/scheduling/requests/:id/send-reminder",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const [reqRow] = await db
      .select()
      .from(schedulingRequestsTable)
      .where(eq(schedulingRequestsTable.id, id))
      .limit(1);
    if (!reqRow) {
      res.status(404).json({ error: "Solicitação não encontrada" });
      return;
    }
    let professionalName: string | null = null;
    if (reqRow.professionalId != null) {
      const [prof] = await db
        .select({ name: professionalsTable.name })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, reqRow.professionalId))
        .limit(1);
      professionalName = prof?.name ?? null;
    }
    const message = buildReminderMessage(reqRow, professionalName);
    const result = await sendWhatsapp(reqRow.patientPhone, message);
    const whatsappConfigured = await isWhatsappConfigured();
    res.json({
      sent: result.sent,
      via: result.via,
      configured: whatsappConfigured,
      reason: result.sent ? undefined : "twilio_nao_configurado",
      link: result.link,
      preview: message,
      error: result.error,
    });
  },
);

export default router;
