import { Router, type IRouter } from "express";
import {
  db,
  professionalsTable,
  agendaResourcesTable,
  schedulingRequestsTable,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  CreateSchedulingRequestBody,
  UpdateSchedulingRequestBody,
} from "@workspace/api-zod";
import { computeResourceSlots } from "../lib/agenda-booking.js";
import { sendWhatsapp, isWhatsappConfigured } from "../lib/whatsapp.js";

const router: IRouter = Router();

// Monta a mensagem de lembrete a partir da solicitacao. So texto; nao envia.
function buildReminderMessage(
  o: typeof schedulingRequestsTable.$inferSelect,
  professionalName: string | null,
): string {
  const nome = o.patientName?.trim() || "Cliente";
  const linhas: string[] = [`Olá, ${nome}! Lembrete do seu atendimento na Clínica Pádua.`];
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

    if (
      !prof ||
      !prof.active ||
      prof.category !== "medico" ||
      prof.isPrimaryDoctor
    ) {
      res.status(400).json({
        error: "Médico assistente inválido ou indisponível",
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
  }

  // Braco de pagamento default por entrada (estrutura; sem cobranca real).
  const paymentArm =
    data.paymentArm ??
    (entrada === "dr_caio" && data.path === "concierge"
      ? "concierge"
      : entrada === "assistente"
        ? "sinal25"
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

  res.status(201).json(formatRequest(row));
});

// Atualiza status/notas/pagamento de uma solicitacao (admin).
router.patch("/scheduling/requests/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
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
  const [row] = await db
    .update(schedulingRequestsTable)
    .set({ ...parsed.data })
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
    res.json({
      sent: result.sent,
      via: result.via,
      configured: isWhatsappConfigured(),
      reason: result.sent ? undefined : "twilio_nao_configurado",
      link: result.link,
      preview: message,
      error: result.error,
    });
  },
);

export default router;
