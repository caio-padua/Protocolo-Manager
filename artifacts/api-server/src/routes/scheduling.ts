import { Router, type IRouter, type Request } from "express";
import {
  db,
  professionalsTable,
  agendaResourcesTable,
  schedulingRequestsTable,
  professionalAreasTable,
  professionalSpecialtiesTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  createSchedulingToken,
  verifySchedulingToken,
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
} from "../lib/asaas.js";
import { getSetting } from "../lib/secure-settings.js";

const router: IRouter = Router();

// Valor padrao do sinal Concierge (R$). Configuravel por pay.conciergeValue.
const CONCIERGE_AMOUNT_DEFAULT = 150;

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

  // Regra de Ouro (Entrada 3): caminho obrigatorio e data minima de 3 meses.
  if (entrada === "dr_caio") {
    const path = data.path ?? "";
    if (path !== "concierge" && path !== "fila") {
      res
        .status(400)
        .json({ error: "Escolha o caminho: concierge ou fila" });
      return;
    }
    if (!data.earliestDate) {
      res
        .status(400)
        .json({ error: "Informe a data desejada (a partir de 3 meses)" });
      return;
    }
    const min = new Date();
    min.setMonth(min.getMonth() + 3);
    min.setHours(0, 0, 0, 0);
    const chosen = new Date(`${data.earliestDate}T00:00:00`);
    if (Number.isNaN(chosen.getTime()) || chosen < min) {
      res.status(400).json({
        error: "A data do Dr. Caio só pode ser a partir de 3 meses",
      });
      return;
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

        if (fresh.asaasChargeId && fresh.asaasInvoiceUrl) {
          return {
            created: false,
            requestId: fresh.id,
            chargeId: fresh.asaasChargeId,
            invoiceUrl: fresh.asaasInvoiceUrl,
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

      res.status(result.created ? 201 : 200).json({
        requestId: result.requestId,
        chargeId: result.chargeId,
        invoiceUrl: result.invoiceUrl,
        amount: result.amount,
        status: result.status,
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
