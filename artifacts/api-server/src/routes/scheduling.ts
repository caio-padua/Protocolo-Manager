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
import { notifyConciergeBlocked } from "../lib/concierge-block-alert.js";
import { checkDeviceThrottle, deriveFingerprint, isDeviceVerified } from "../lib/concierge-device-throttle.js";
import { getOrCreateChallenge, verifyDeviceCode } from "../lib/device-throttle.js";

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

  const out = docs.map((prof) => ({
    id: prof.id,
    name: prof.name,
    professionalType: prof.professionalType ?? null,
    areaId: prof.areaId ?? null,
    specialtyId: prof.specialtyId ?? null,
    registrationCouncil: prof.registrationCouncil ?? null,
    registrationNumber: prof.registrationNumber ?? null,
    resourceId: resByProf.get(prof.id) ?? null,
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
    db.select({ id: professionalAreasTable.id, name: professionalAreasTable.name, active: professionalAreasTable.active }).from(professionalAreasTable),
    db
      .select({ id: professionalSpecialtiesTable.id, name: professionalSpecialtiesTable.name, active: professionalSpecialtiesTable.active })
      .from(professionalSpecialtiesTable),
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

  // Retorna áreas com pelo menos um profissional agendável, incluindo
  // as especializações disponíveis em cada área.
  const out = [...areaIdsWithBookable]
    .map((aid) => {
      const area = areaById.get(aid);
      if (!area) return null;
      const specs = [...(specsByArea.get(aid) ?? [])]
        .map((sid) => specById.get(sid))
        .filter(Boolean);
      return { id: area.id, name: area.name, specialties: specs };
    })
    .filter(Boolean);

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
  const entrada = String(req.query.entrada ?? "") as Entrada;
  const status = String(req.query.status ?? "");

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
  const patientName = data.patientName?.trim() ?? null;
  const patientPhone = (data.patientPhone ?? "").trim();
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
        .select({
          name: professionalsTable.name,
          active: professionalsTable.active,
          isPrimaryDoctor: professionalsTable.isPrimaryDoctor,
          id: professionalsTable.id,
          areaId: professionalsTable.areaId,
        })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, data.professionalId!))
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
    if (!slot || slot.state !== "aberto") {
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
    const pen = await getPenalidade(data.patientCpf!);
    if (pen.bloqueado) {
      void notifyConciergeBlocked(data.patientCpf, pen.tentativas, "POST /scheduling/requests");
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
      patientName: patientName ?? "",
      patientPhone,
      patientCpf: data.patientCpf ?? null,
      professionalId: data.professionalId ?? null,
      notes: (req.body as Record<string, unknown>)?.notes as string | null ?? null,
      earliestDate: data.earliestDate ?? null,
      chosenDate: data.chosenDate ?? null,
      chosenTime: data.chosenTime ?? null,
      path: data.path ?? null,
      paymentArm: paymentArm ?? null,
      resourceId: isCaio ? null : (isAssist ? assistantResourceId : null),
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
    if (row.entrada !== "dr_caio" || row.path !== "concierge") {
      res.status(400).json({
        error: "Cobrança Concierge só vale para o caminho concierge do Dr. Caio.",
      });
      return;
    }
    const cpf = String(row.patientCpf ?? "").replace(/\D/g, "");
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
    const rawMethod = (req.body as Record<string, unknown> | null)?.method;
    if (rawMethod !== undefined && rawMethod !== "pix" && rawMethod !== "card") {
      res.status(400).json({ error: "Corpo inválido para gerar a cobrança." });
      return;
    }
    const method: "pix" | "card" = rawMethod === "card" ? "card" : "pix";
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
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"concierge:" + String(id)}))`);

        const [fresh] = await tx
          .select()
          .from(schedulingRequestsTable)
          .where(eq(schedulingRequestsTable.id, id))
          .limit(1);

        if (fresh?.asaasChargeId) {
          let asaasStatus = "PENDING";
          let invoiceUrl = fresh.asaasInvoiceUrl ?? null;
          let chargeValue = CONCIERGE_AMOUNT_DEFAULT;
          try {
            const existing = await asaasGetCharge(fresh.asaasChargeId);
            asaasStatus = existing.status;
            invoiceUrl = existing.invoiceUrl ?? invoiceUrl;
            chargeValue = existing.value;
          } catch { /* best-effort */ }
          return {
            created: false as const,
            requestId: id,
            chargeId: fresh.asaasChargeId,
            invoiceUrl,
            amount: chargeValue,
            status: mapAsaasPaymentStatus(asaasStatus),
          };
        }

        const amount = await resolveConciergeAmount();
        const customer = await asaasCreateCustomer({
          name: row.patientName ?? "Paciente",
          cpfCnpj: cpf,
          phone: row.patientPhone ?? null,
        });
        const due = new Date();
        due.setDate(due.getDate() + 1);
        const charge = await asaasCreateCharge({
          customerId: customer.id,
          billingType,
          value: amount,
          dueDate: due.toISOString().slice(0, 10),
          description: "Sinal de prioridade — Concierge Dr. Caio",
        });
        await tx
          .update(schedulingRequestsTable)
          .set({
            asaasChargeId: charge.id,
            asaasInvoiceUrl: charge.invoiceUrl ?? null,
            asaasCustomerId: customer.id,
            paymentStatus: "aguardando",
          })
          .where(eq(schedulingRequestsTable.id, id));

        return {
          created: true as const,
          requestId: id,
          chargeId: charge.id,
          invoiceUrl: charge.invoiceUrl ?? null,
          amount,
          status: "aguardando" as const,
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
  async (req, res): Promise<void> => {
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
  const rawCpf = String(req.query.cpf ?? "").replace(/\D/g, "");
  const cpf = rawCpf.length >= 11 ? rawCpf : null;

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
      void notifyConciergeBlocked(cpf ?? "", pen.tentativas, "GET /scheduling/concierge-offer");
      // 4ª+ tentativa: concierge indisponível — redireciona para via normal.
      res.status(403).json({
        code: "CONCIERGE_BLOCKED",
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

    // ── Fricção de dispositivo: gera e envia código OTP quando exigido ──────
    // Se requiresVerification=true e o CPF foi informado, geramos (ou reutilizamos)
    // um desafio OTP via getOrCreateChallenge() e enviamos o código por WhatsApp.
    // Falhas aqui são não-fatais: a oferta segue retornada; o frontend deve
    // tratar codeSent=false e orientar o paciente a usar "reenviar código".
    // ── OTP: gera/reutiliza desafio e envia código quando exigido ─────────────
    const rawCpfDigits = rawCpf;
    let challengeId: number | undefined;
    let maskedPhone: string | undefined;
    let codeSent = false;

    if (deviceCheck.requiresVerification && rawCpfDigits.length >= 11) {
      try {
        const { challengeId: cid, isNew } = await getOrCreateChallenge({ cpf: rawCpfDigits, fingerprint });
        challengeId = cid;

        // Só entrega quando o desafio acabou de ser criado (isNew=true).
        // Desafios reutilizados não disparam novo envio — use a rota
        // /scheduling/send-verification-code (com cooldown 60s) para reenvio.
        if (!isNew) {
          // Desafio ativo existente: retornamos o challengeId sem reenviar.
          // O paciente usa a rota /send-verification-code (cooldown 60s) para reenvio manual.
        } else {
          const codeRow = await db.execute<{ code: string }>(sql`
            SELECT code FROM device_contact_verifications WHERE id = ${cid} LIMIT 1
          `);
          const codeVal = (codeRow.rows[0] as { code: string } | undefined)?.code;

          if (codeVal) {
            const [patient] = await db
              .select({ phone: clientsTable.phone, telegramChatId: clientsTable.telegramChatId })
              .from(clientsTable)
              .where(sql`regexp_replace(coalesce(${clientsTable.cpf}, ''), '\D', '', 'g') = ${rawCpfDigits}`)
              .limit(1);

            const digits = (patient?.phone ?? "").replace(/\D/g, "");
            if (digits) maskedPhone = `(***) *****-${digits.slice(-4)}`;

            const otpMessage =
              `Seu código de verificação PAXTER: ${codeVal}\n\nVálido por 10 minutos. Não compartilhe.`;

            // Caminho 1: WhatsApp (se o paciente tem telefone).
            if (patient?.phone) {
              const waSend = await sendWhatsapp(patient.phone, otpMessage, { contexto: "device_verification" });
              codeSent = waSend.sent;
            }

            // Caminho 2: Telegram — fallback de WhatsApp OU único canal disponível.
            if (!codeSent && patient?.telegramChatId) {
              try {
                const { sendTelegram } = await import("../lib/telegram.js");
                const tg = await sendTelegram(patient.telegramChatId, otpMessage);
                codeSent = tg.sent;
              } catch { /* best-effort */ }
            }
          }
        }
      } catch (otpErr: unknown) {
        req.log.warn({ err: String(otpErr) }, "[concierge-offer] OTP não-fatal");
      }
    }

    res.json({
      ...offer,
      throttled: false,
      requiresVerification: deviceCheck.requiresVerification,
      ...(challengeId !== undefined ? { challengeId } : {}),
      ...(maskedPhone !== undefined ? { maskedPhone } : {}),
      codeSent,
    });
  } catch (err: unknown) {
    req.log.error({ err: String(err) }, "Erro ao calcular oferta do concierge");
    res.status(500).json({ error: "Falha ao calcular oferta." });
  }
});

router.patch("/scheduling/requests/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
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
  const { status, notes } = parsed.data;
  const rawBody = req.body as Record<string, unknown>;
  const chosenDate = rawBody.chosenDate as string | undefined;
  const chosenTime = rawBody.chosenTime as string | undefined;
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
    // Busca o telefone e o chat_id do Telegram ANTES da transação (leitura read-only).
    const clients = await db
      .select({ phone: clientsTable.phone, telegramChatId: clientsTable.telegramChatId })
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
    const telegramChatId = clients[0].telegramChatId ?? null;

    // ── Transação atômica com lock exclusivo por (fingerprint, CPF) ──────────
    // Usa device_contact_verifications (mesma tabela que verifyDeviceCode lê),
    // garantindo que resend e verify-device sejam consistentes.
    type SendResult =
      | { blocked: "cooldown" | "daily" }
      | { blocked: null; code: string; challengeId: number };

    const lockKey = `otp:${fingerprint}:${rawCpf}`;
    const txResult = await db.transaction(async (tx): Promise<SendResult> => {
      // Lock exclusivo liberado automaticamente ao fim da transação.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // 1. Cooldown de 60s: bloqueia se existe código criado há menos de 60s
      //    (expires_at = created_at + 10min → se sobram >9min, foi criado <1min atrás).
      const cooldownRows = await tx.execute<{ id: number }>(sql`
        SELECT id FROM device_contact_verifications
         WHERE device_fingerprint = ${fingerprint}
           AND cpf = ${rawCpf}
           AND expires_at > NOW() + INTERVAL '9 minutes'
           AND verified_at IS NULL
         LIMIT 1
      `);
      if (((cooldownRows.rows ?? cooldownRows) as { id: number }[]).length > 0) {
        return { blocked: "cooldown" };
      }

      // 2. Limite diário de 5 envios por dispositivo+CPF (enviados nas últimas 24h).
      const dailyRows = await tx.execute<{ cnt: string }>(sql`
        SELECT COUNT(*) AS cnt FROM device_contact_verifications
         WHERE device_fingerprint = ${fingerprint}
           AND cpf = ${rawCpf}
           AND sent_at > NOW() - INTERVAL '24 hours'
      `);
      const dailyCount = Number(
        ((dailyRows.rows ?? dailyRows) as { cnt: string }[])[0]?.cnt ?? 0,
      );
      if (dailyCount >= 5) {
        return { blocked: "daily" };
      }

      // Gera código de 6 dígitos com entropia criptográfica (nunca Math.random).
      const code = String(randomInt(100000, 1000000));

      // Insere novo desafio em device_contact_verifications (tabela canônica).
      const inserted = await tx.execute<{ id: number }>(sql`
        INSERT INTO device_contact_verifications
          (cpf, device_fingerprint, code, expires_at, phone, sent_via)
        VALUES
          (${rawCpf}, ${fingerprint}, ${code},
           NOW() + INTERVAL '10 minutes', ${phone}, 'whatsapp')
        RETURNING id
      `);
      const challengeId = ((inserted.rows ?? inserted) as { id: number }[])[0]?.id ?? 0;

      return { blocked: null, code, challengeId };
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
    // { blocked: null; code: string; challengeId: number } — explicit cast for TS narrowing.
    const { code, challengeId: newChallengeId } = txResult as { blocked: null; code: string; challengeId: number };

    // Envia via WhatsApp FORA da transação (I/O lento não deve segurar o lock).
    // NUNCA incluir o código numa URL/link de fallback — exporia o OTP a
    // qualquer chamador que conheça o CPF (ataque de SMS pumping).
    const otpMessage =
      `Seu código de verificação PAXTER: ${code}\n\n` +
      `Válido por 10 minutos. Não compartilhe este código com ninguém.`;
    const sendResult = await sendWhatsapp(phone, otpMessage, {
      contexto: "device_verification",
    });

    // Mascara o telefone para exibição: (***) *****-XXXX
    const digits = phone.replace(/\D/g, "");
    const maskedPhone = `(***) *****-${digits.slice(-4)}`;

    if (!sendResult.sent) {
      // Fallback: tenta Telegram se o paciente tiver chat vinculado.
      if (telegramChatId) {
        try {
          const { sendTelegram } = await import("../lib/telegram.js");
          const tgMessage =
            `Seu código de verificação PAXTER: *${code}*\n\nVálido por 10 minutos. Não compartilhe este código com ninguém.`;
          const tgResult = await sendTelegram(telegramChatId, tgMessage);
          if (tgResult.sent) {
            res.json({ sent: true, via: "telegram", maskedPhone, challengeId: newChallengeId });
            return;
          }
        } catch (tgErr: unknown) {
          req.log.warn({ err: String(tgErr) }, "Fallback Telegram falhou após falha no WhatsApp");
        }
      }

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

    res.json({ sent: true, via: "whatsapp", maskedPhone, challengeId: newChallengeId });
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

  // Ordem de validação: código → CPF → challengeId (campo `message` por contrato).
  if (!rawCode) {
    res.status(400).json({ message: "Código não informado." });
    return;
  }
  if (rawCpf.length < 11) {
    res.status(400).json({ message: "CPF inválido." });
    return;
  }
  const challengeId = Number(req.body?.challengeId ?? 0);
  if (!challengeId || challengeId <= 0) {
    res.status(400).json({ message: "Identificador de desafio ausente ou inválido." });
    return;
  }

  try {
    const result = await verifyDeviceCode(rawCpf, rawCode, challengeId);
    if (!result.ok) {
      res.status(400).json({ message: result.message ?? "Código incorreto ou expirado." });
      return;
    }
    res.json({ verified: true });
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
