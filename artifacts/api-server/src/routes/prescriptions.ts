import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import {
  db,
  prescriptionsTable,
  prescriptionItemsTable,
  recipesTable,
  pharmaciesTable,
  dispatchLogTable,
  catalogoItensTable,
  catalogoFormulasTable,
  lembretesPrescricaoTable,
  clientsTable,
  type LembretePeriodoJson,
} from "@workspace/db";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { PreviewPrescriptionBody, EmitPrescriptionBody } from "@workspace/api-zod";
import { planDesmembramento, type PrescriptionItemInput } from "../lib/desmembramento";
import { consumeSncrNumber } from "../lib/sncr";
import { generateRecipePdf } from "../lib/prescription-pdf";
import { ensurePharmacyDayFolder, uploadFileToDrive } from "../lib/google-drive";
import { sendWhatsapp } from "../lib/whatsapp";
import { sendTelegram } from "../lib/telegram";
import { recipeTypeForControlledClass } from "../lib/anvisa-catalog";
import { handleSncrAlert } from "../lib/sncr-alerts";
// ── MOTOR ÚNICO: cópia visual para o paciente (além do PDF regulatório M3) ──
import { emitirReceituarioPdf } from "../lib/receituario-motor.js";
import { baseUrlFromEnv } from "../lib/messaging/base-url.js";
// ── Motor de lembretes por período (portado do IHE) ──
import {
  sincronizarLembretePrescricao,
  type ItemLembretePrescricao,
  type PeriodoAntigo,
} from "../lib/lembrete-periodo";
import { templateLembretePrescricao } from "../lib/lembrete-templates";

const router: IRouter = Router();
router.use(moduleGuard("protocolos"));

function todayBR(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function dateBRfull(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const day = String(brt.getUTCDate()).padStart(2, "0");
  const month = String(brt.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${brt.getUTCFullYear()}`;
}

// Converte o texto livre do campo `periodo` de prescription_items
// (ex.: "À Tarde; 2h Antes do Jantar") nos valores canônicos (PeriodoAntigo)
// que sincronizarLembretePrescricao aceita. Sem match → padrão de fórmula.
function mapPeriodosTextoToCanonicos(texto: string): PeriodoAntigo[] {
  const norm = (s: string) =>
    s.trim().toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");

  const MAP: Record<string, PeriodoAntigo> = {
    "jejum":              "jejum",
    "ao acordar":         "manha",
    "inicio da manha":    "manha",
    "manha":              "manha",
    "meio da manha":      "meio_manha",
    "meio manha":         "meio_manha",
    "almoco":             "almoco",
    "antes do almoco":    "almoco",
    "2h antes do almoco": "almoco",
    "inicio da tarde":    "tarde",
    "a tarde":            "tarde",
    "tarde":              "tarde",
    "meio tarde":         "meio_tarde",
    "meio da tarde":      "meio_tarde",
    "noite":              "noite",
    "antes do jantar":    "noite",
    "2h antes do jantar": "noite",
    "final da noite":     "final_noite",
    "final noite":        "final_noite",
    "ceia":               "ceia",
  };

  if (!texto.trim()) return ["manha", "noite"]; // padrão para fórmula
  const result = texto
    .split(";")
    .map((p) => MAP[norm(p)])
    .filter((p): p is PeriodoAntigo => !!p);
  return result.length > 0 ? result : ["manha", "noite"];
}

// Trunca a mensagem no último parágrafo vazio antes de `max` chars (padrão 1.450).
// Evita erro 21617 do Twilio (limite de 1.600 chars no WhatsApp).
function truncarMensagemWhatsapp(msg: string, max = 1450): string {
  if (msg.length <= max) return msg;
  const corte = msg.lastIndexOf("\n\n", max);
  return (corte > 0 ? msg.slice(0, corte) : msg.slice(0, max - 5)) + "\n\n(…)";
}

router.post("/prescriptions/preview", async (req, res): Promise<void> => {
  const parsed = PreviewPrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const plans = planDesmembramento(parsed.data.items as PrescriptionItemInput[]);
  res.json(plans);
});

router.get("/prescriptions", async (req, res): Promise<void> => {
  const empresaId = resolveEmpresaId(req);
  const rows = await db.select().from(prescriptionsTable)
    .where(eq(prescriptionsTable.empresaId, empresaId))
    .orderBy(desc(prescriptionsTable.createdAt)).limit(200);
  res.json(
    rows.map((p) => ({
      id: p.id,
      clientId: p.clientId ?? null,
      clientName: p.clientName,
      clientCpf: p.clientCpf ?? null,
      professionalName: p.professionalName ?? null,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      emittedAt: p.emittedAt ? p.emittedAt.toISOString() : null,
    })),
  );
});

router.get("/prescriptions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [p] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, id));
  if (!p) {
    res.status(404).json({ error: "Prescrição não encontrada" });
    return;
  }
  const recipes = await db.select().from(recipesTable).where(eq(recipesTable.prescriptionId, id));
  res.json({
    id: p.id,
    clientName: p.clientName,
    clientCpf: p.clientCpf ?? null,
    professionalName: p.professionalName ?? null,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    emittedAt: p.emittedAt ? p.emittedAt.toISOString() : null,
    recipes: recipes.map((r) => ({
      id: r.id,
      recipeType: r.recipeType,
      title: r.title ?? "Receita",
      pharmacyId: r.pharmacyId ?? null,
      anvisaType: r.anvisaType ?? null,
      anvisaColorName: r.anvisaColorName ?? null,
      sncrNumber: r.sncrNumber ?? null,
      sncrStatus: r.sncrStatus ?? null,
      driveWebViewLink: r.driveWebViewLink ?? null,
      pdfUrl: `/api/recipes/${r.id}/pdf`,
    })),
  });
});

router.post("/prescriptions/emit", async (req, res): Promise<void> => {
  const parsed = EmitPrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const items = body.items as PrescriptionItemInput[];
  const batchDate = todayBR();
  const uf = (body.professionalUf || "SP").toUpperCase();

  // 1) Persiste prescrição + itens.
  const empresaId = resolveEmpresaId(req);
  const [prescription] = await db
    .insert(prescriptionsTable)
    .values({
      clientId: body.clientId ?? null,
      clientName: body.clientName,
      clientCpf: body.clientCpf ?? null,
      clientPhone: body.clientPhone ?? null,
      clientEmail: body.clientEmail ?? null,
      professionalId: body.professionalId ?? null,
      professionalName: body.professionalName ?? null,
      professionalCrm: body.professionalCrm ?? null,
      professionalUf: body.professionalUf ?? null,
      durationDays: body.durationDays ?? null,
      cid: body.cid ?? null,
      message: body.message ?? null,
      status: "emitted",
      emittedAt: new Date(),
      empresaId,
    })
    .returning();

  await db.insert(prescriptionItemsTable).values(
    items.map((it, idx) => ({
      prescriptionId: prescription.id,
      orderIndex: idx,
      name: it.name,
      ativos: it.ativos ?? null,
      posologia: it.posologia ?? null,
      dose: it.dose ?? null,
      via: it.via ?? null,
      frequencia: it.frequencia ?? null,
      periodo: it.periodo ?? null,
      observacao: it.observacao ?? null,
      category: it.category ?? null,
      internalColor: it.internalColor ?? null,
      isControlled: it.isControlled ?? false,
      anvisaType: it.anvisaType ?? null,
      pharmacyId: it.pharmacyId ?? null,
    })),
  );

  // 1c) Motor de lembretes — sincronizar prescrição por período (idempotente).
  // Mapeia o campo livre `periodo` dos itens aos 9 períodos canônicos (JE…CE)
  // e faz upsert em lembretes_prescricao. Fail-safe: nunca bloqueia a emissão.
  let lembretePeriodos: LembretePeriodoJson[] | null = null;
  if (body.clientId) {
    try {
      const itensLembrete: ItemLembretePrescricao[] = items.map((it) => ({
        tipo: "formula" as const,
        nome: it.name,
        ativoPrincipal: it.ativos?.split("\n")[0]?.trim() ?? undefined,
        dose: it.dose ?? undefined,
        // posologia OMITIDA: o campo do receituário é verboso (para a farmácia).
        // O lembrete para o paciente deve conter apenas nome + dose — conciso.
        periodos: mapPeriodosTextoToCanonicos(it.periodo ?? ""),
      }));
      await sincronizarLembretePrescricao(body.clientId, itensLembrete);
      const [lembrete] = await db
        .select({ periodos: lembretesPrescricaoTable.periodos })
        .from(lembretesPrescricaoTable)
        .where(eq(lembretesPrescricaoTable.clienteId, body.clientId))
        .limit(1);
      lembretePeriodos = (lembrete?.periodos as LembretePeriodoJson[]) ?? null;
    } catch (err) {
      req.log?.warn({ err }, "[prescriptions/emit] falha ao sincronizar lembrete — emissão não interrompida");
    }
  }

  // 2) Desmembra.
  const plans = planDesmembramento(items);

  // Mapa de farmácias para nome/tipo.
  const pharmRows = await db.select().from(pharmaciesTable);
  const pharmMap = new Map(pharmRows.map((p) => [p.id, p]));

  const emittedRecipes: any[] = [];
  const sncrAlerts: any[] = [];
  const sncrSideEffects: Parameters<typeof handleSncrAlert>[0][] = [];

  for (const plan of plans) {
    // 2a) SNCR (somente controlado isolado que exige numeração).
    let sncrNumber: string | null = null;
    let sncrStatus: string | null = null;
    let sncrRangeId: number | null = null;
    if (plan.needsSncr && plan.recipeType === "controlado_isolado") {
      const controlledType = plan.anvisaType ?? "";
      const consume = await consumeSncrNumber({
        professionalId: body.professionalId ?? null,
        uf,
        controlledType,
        prescriptionId: prescription.id,
      });
      sncrNumber = consume.number;
      sncrStatus = consume.status;
      sncrRangeId = consume.rangeId;

      if (consume.status === "consumed" && consume.low) {
        const message = `Atenção: restam ${consume.remaining} números SNCR para ${controlledType} (${uf}). Solicite novo talão.`;
        sncrAlerts.push({ controlledType, status: "low", remaining: consume.remaining, message });
        sncrSideEffects.push({
          status: "low",
          controlledType,
          uf,
          remaining: consume.remaining,
          prescriptionId: prescription.id,
          clientId: body.clientId ?? null,
          professionalName: body.professionalName ?? null,
          message,
        });
      } else if (consume.status === "exhausted") {
        const message = `Numeração SNCR ESGOTADA para ${controlledType} (${uf}). Receita emitida SEM número — providencie novo talão com urgência.`;
        sncrAlerts.push({ controlledType, status: "exhausted", remaining: 0, message });
        sncrSideEffects.push({
          status: "exhausted",
          controlledType,
          uf,
          remaining: 0,
          prescriptionId: prescription.id,
          clientId: body.clientId ?? null,
          professionalName: body.professionalName ?? null,
          message,
        });
      } else if (consume.status === "no_range") {
        const message = `Sem intervalo SNCR cadastrado para ${controlledType} (${uf}). Receita emitida SEM número.`;
        sncrAlerts.push({ controlledType, status: "no_range", remaining: null, message });
        sncrSideEffects.push({
          status: "no_range",
          controlledType,
          uf,
          remaining: null,
          prescriptionId: prescription.id,
          clientId: body.clientId ?? null,
          professionalName: body.professionalName ?? null,
          message,
        });
      }
    }

    // 2b) Gera PDF.
    const pharmacy = plan.pharmacyId != null ? pharmMap.get(plan.pharmacyId) : undefined;
    const pdfBytes = await generateRecipePdf(plan, {
      clientName: body.clientName,
      clientCpf: body.clientCpf ?? null,
      professionalName: body.professionalName ?? null,
      professionalCrm: body.professionalCrm ?? null,
      professionalUf: body.professionalUf ?? null,
      cid: body.cid ?? null,
      durationDays: body.durationDays ?? null,
      dateBR: dateBRfull(),
      pharmacyName: pharmacy?.name ?? null,
      pharmacyType: pharmacy?.type ?? null,
      sncrNumber,
      sncrStatus,
    });
    const pdfBuffer = Buffer.from(pdfBytes);
    const pdfBase64 = pdfBuffer.toString("base64");

    const safeClient = body.clientName.replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase();
    const kind = plan.recipeType === "controlado_isolado" ? `CONTROLADO ${plan.anvisaType ?? ""}` : "MANIPULACAO";

    // 2c) Persiste receita PRIMEIRO para obter um id estavel — o id entra no nome
    //     do arquivo, garantindo unicidade (sem colisao/sobrescrita no Drive
    //     para mesmo cliente/tipo/dia).
    const [recipe] = await db
      .insert(recipesTable)
      .values({
        prescriptionId: prescription.id,
        pharmacyId: plan.pharmacyId,
        recipeType: plan.recipeType,
        anvisaType: plan.anvisaType,
        anvisaColor: plan.anvisaColor,
        anvisaColorName: plan.anvisaColorName,
        sncrNumber,
        sncrRangeId,
        sncrStatus,
        title: plan.title,
        itemsJson: plan.items,
        pdfData: pdfBase64,
        batchDate,
        status: "generated",
      })
      .returning();

    const fileName = `${batchDate} RECEITA ${kind} ${safeClient} #${recipe.id}.pdf`.replace(/\s+/g, " ");

    // 2d) Upload Drive (best-effort). allowDuplicates=true: nunca apaga homonimo
    //     (o id ja torna o nome unico; protege PDFs anteriores do mesmo dia).
    let driveFileId: string | null = null;
    let driveWebViewLink: string | null = null;
    if (pharmacy) {
      try {
        const { dayFolderId } = await ensurePharmacyDayFolder(pharmacy.name, batchDate);
        const up = await uploadFileToDrive(dayFolderId, fileName, "application/pdf", pdfBuffer, true);
        driveFileId = up.fileId;
        driveWebViewLink = up.webViewLink;
      } catch (err) {
        req.log.warn({ err }, "Falha ao subir receita ao Drive");
      }
    }

    // 2e) Atualiza a receita com o nome final + vinculo do Drive (best-effort:
    //     a receita ja esta persistida com pdfData e e baixavel via
    //     /api/recipes/:id/pdf mesmo se este update falhar).
    try {
      await db
        .update(recipesTable)
        .set({ fileName, driveFileId, driveWebViewLink })
        .where(eq(recipesTable.id, recipe.id));
    } catch (err) {
      req.log.warn({ err, recipeId: recipe.id }, "Falha ao atualizar metadados da receita");
    }

    emittedRecipes.push({
      id: recipe.id,
      recipeType: recipe.recipeType,
      title: recipe.title ?? "Receita",
      pharmacyId: recipe.pharmacyId ?? null,
      anvisaType: recipe.anvisaType ?? null,
      anvisaColorName: recipe.anvisaColorName ?? null,
      sncrNumber: recipe.sncrNumber ?? null,
      sncrStatus: recipe.sncrStatus ?? null,
      driveWebViewLink,
      pdfUrl: `/api/recipes/${recipe.id}/pdf`,
    });
  }

  // 2.5) MOTOR ÚNICO — cópia visual assinada para o PACIENTE (best-effort).
  //      O M3 acima gera o PDF regulatório que vai para a farmácia.
  //      O motor único gera o PDF visual (modelo ativo do banco) que vai ao paciente.
  let pacientePdfMotorUnico: {
    fileName: string;
    driveUrl: string | null;
    emailSent: boolean;
    modeloUsado: string;
    tipoMotor: string;
  } | null = null;

  try {
    // Consolida todos os itens da prescrição para o motor único (ignora desmembramento —
    // o paciente recebe UMA receita visual completa com todas as substâncias).
    const formulasParaMotor = items.map((it) => ({
      nome:      it.name,
      ativos:    it.ativos ?? undefined,
      posologia: it.posologia ?? undefined,
      via:       it.via ?? undefined,
      forma:     it.observacao ?? undefined,
      dose:      it.dose ?? undefined,
    }));

    const emailDestinatarios: string[] = ["drcaiohenriquepadua@gmail.com"];
    if (body.clientEmail) emailDestinatarios.push(body.clientEmail);

    const motorResult = await emitirReceituarioPdf({
      patient: {
        nome:          body.clientName,
        cpf:           body.clientCpf ?? undefined,
        telefone:      body.clientPhone ?? undefined,
        email:         body.clientEmail ?? undefined,
      },
      formulas:    formulasParaMotor,
      tipoReceita: "especial",
      emailTo:     emailDestinatarios,
    });

    pacientePdfMotorUnico = {
      fileName:    motorResult.fileName,
      driveUrl:    motorResult.driveUrl,
      emailSent:   motorResult.emailSent,
      modeloUsado: motorResult.modeloUsado,
      tipoMotor:   motorResult.tipoMotor,
    };
    req.log.info({ fileName: motorResult.fileName, tipoMotor: motorResult.tipoMotor }, "prescriptions/emit: cópia motor único gerada para o paciente");
  } catch (motorErr) {
    // Falha na cópia visual NÃO cancela a emissão regulatória M3
    req.log.warn({ err: motorErr instanceof Error ? motorErr.message : String(motorErr) }, "prescriptions/emit: motor único falhou — receita M3 regulatória intacta");
  }

  // 3) WhatsApp às FARMÁCIAS (best-effort, uma mensagem por farmácia).
  //    A receita é roteada à farmácia de manipulação, não ao cliente.
  const pharmacyDispatches: Array<{
    pharmacyId: number;
    pharmacyName: string;
    recipeCount: number;
    sent: boolean;
    whatsappLink: string | null;
  }> = [];

  const distinctPharmacyIds = [
    ...new Set(
      emittedRecipes
        .map((r) => r.pharmacyId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];

  for (const pid of distinctPharmacyIds) {
    const pharmacy = pharmMap.get(pid);
    if (!pharmacy) continue;
    const recipeCount = emittedRecipes.filter((r) => r.pharmacyId === pid).length;
    const target = (pharmacy.whatsapp || pharmacy.phone || "").trim();

    let sent = false;
    let link: string | null = null;
    let detail = "Sem WhatsApp/telefone cadastrado na farmácia";
    if (target) {
      const msg =
        `Olá, equipe ${pharmacy.name}. O Instituto Padua emitiu ${recipeCount} receita(s) ` +
        `para o(a) cliente ${body.clientName}. O lote completo com os PDFs segue por e-mail/Drive. ` +
        `Em caso de urgência, retornar por este contato.`;
      try {
        const wa = await sendWhatsapp(target, msg);
        sent = wa.sent;
        link = wa.link;
        detail = wa.error ?? (wa.sent ? "Enviado via Twilio à farmácia" : "Link de fallback gerado");
      } catch (err) {
        req.log.warn({ err, pharmacyId: pid }, "Falha ao enviar WhatsApp à farmácia");
        detail = "Falha no envio do WhatsApp";
      }
    }

    try {
      await db.insert(dispatchLogTable).values({
        prescriptionId: prescription.id,
        pharmacyId: pid,
        channel: "whatsapp",
        status: sent ? "sent" : target ? "link_only" : "skipped",
        recipeCount,
        detail,
        batchDate,
      });
    } catch (err) {
      req.log.warn({ err, pharmacyId: pid }, "Falha ao registrar dispatch WhatsApp");
    }

    pharmacyDispatches.push({
      pharmacyId: pid,
      pharmacyName: pharmacy.name,
      recipeCount,
      sent,
      whatsappLink: link,
    });
  }

  // 4) Efeitos colaterais dos alertas SNCR (best-effort, não bloqueia).
  for (const alert of sncrSideEffects) {
    await handleSncrAlert(alert);
  }

  // 4b) Motor de lembretes — disparo imediato ao emitir (fire-and-forget).
  // Canal preferido: Telegram (quando telegramChatId vinculado) + WhatsApp em paralelo.
  // Cópia ao CEO via Telegram sempre que o PADAXOR_TELEGRAM_CHAT_ID estiver configurado.
  if (lembretePeriodos && lembretePeriodos.length > 0) {
    const mensagemLembrete = truncarMensagemWhatsapp(templateLembretePrescricao({
      clienteNome: body.clientName,
      clienteGenero: "nao_informado",
      periodos: lembretePeriodos,
      agora: new Date(),
    }));

    // WhatsApp (paralelo, fire-and-forget)
    if (body.clientPhone) {
      sendWhatsapp(body.clientPhone, mensagemLembrete, {
        contexto: "lembrete_prescricao",
        clienteId: body.clientId ?? undefined,
      }).catch((err) =>
        req.log?.warn({ err }, "[prescriptions/emit] whatsapp lembrete — falhou silenciosamente"),
      );
    }

    // Telegram ao paciente + cópia ao CEO (fire-and-forget)
    if (body.clientId) {
      db.select({ telegramChatId: clientsTable.telegramChatId })
        .from(clientsTable)
        .where(eq(clientsTable.id, body.clientId))
        .limit(1)
        .then(async ([cli]) => {
          if (cli?.telegramChatId) {
            await sendTelegram(cli.telegramChatId, mensagemLembrete).catch((e) =>
              req.log?.warn({ err: e }, "[prescriptions/emit] telegram paciente — falhou"),
            );
          }
          const ceoChatId = process.env.PADAXOR_TELEGRAM_CHAT_ID;
          if (ceoChatId) {
            const msgCeo = `Copia CEO - Emissao #${prescription.id} - ${body.clientName}\n\n${mensagemLembrete}`;
            await sendTelegram(ceoChatId, truncarMensagemWhatsapp(msgCeo, 3800)).catch((e) =>
              req.log?.warn({ err: e }, "[prescriptions/emit] telegram CEO — falhou"),
            );
          }
        })
        .catch((e) =>
          req.log?.warn({ err: e }, "[prescriptions/emit] telegram lembrete — erro ao buscar chatId"),
        );
    }
  }

  res.status(201).json({
    prescriptionId:      prescription.id,
    recipes:             emittedRecipes,
    sncrAlerts,
    pharmacyDispatches,
    // Cópia visual para o paciente gerada pelo motor único (null se falhou)
    pacientePdfMotorUnico,
  });
});

// PDF binário (fora do OpenAPI — acesso direto por link).
router.get("/recipes/:id/pdf", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, id));
  if (!recipe || !recipe.pdfData) {
    res.status(404).json({ error: "Receita/PDF não encontrado" });
    return;
  }
  const buf = Buffer.from(recipe.pdfData, "base64");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${recipe.fileName ?? `receita-${id}.pdf`}"`);
  res.send(buf);
});

// GET /recipes/demo -> abre no navegador um RECEITUÁRIO de AMOSTRA (dados
// fictícios) para conferir o padrão visual (marca Instituto Pádua). Sem efeito
// colateral (não grava, não envia, não sobe ao Drive).
router.get("/recipes/demo", async (_req, res): Promise<void> => {
  const plans = planDesmembramento([
    {
      name: "Tirzepatida 5mg/mL",
      ativos: "Tirzepatida 5mg",
      posologia: "Aplicar 0,5mL por via subcutânea, 1x/semana",
      isControlled: true,
      anvisaType: "B1",
    },
    {
      name: "Coenzima Q10 100mg",
      ativos: "Ubiquinona 100mg",
      posologia: "1 cápsula ao dia, via oral, após o café da manhã",
      isControlled: false,
    },
  ]);
  const plan = plans[0];
  if (!plan) {
    res.status(500).json({ error: "Falha ao montar receituário de amostra" });
    return;
  }
  const pdfBytes = await generateRecipePdf(plan, {
    clientName: "Cliente de Demonstração",
    clientCpf: "000.000.000-00",
    professionalName: "Dr. Caio Padua",
    professionalCrm: "123456",
    professionalUf: "SP",
    cid: "E66.0",
    durationDays: "84",
    dateBR: dateBRfull(),
    pharmacyName: "Farmácia de Manipulação (amostra)",
    pharmacyType: "Manipulação",
    sncrNumber: null,
    sncrStatus: "ok",
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="amostra-receituario.pdf"');
  res.send(Buffer.from(pdfBytes));
});

// Formulas vindas do deposito transmutado (catalogo_itens categoria=formula +
// componentes em catalogo_formulas). Servidas no formato FormulaSeed que a tela
// de Prescricao consome, para juntar com as formulas curadas (estaticas). Assim
// futuras importacoes aparecem sozinhas, sem perder nenhuma formula existente.
router.get("/prescription-formulas", async (_req, res): Promise<void> => {
  const itens = await db
    .select()
    .from(catalogoItensTable)
    .where(eq(catalogoItensTable.categoria, "formula"))
    .orderBy(asc(catalogoItensTable.codigoPadcom));

  const componentes = await db.select().from(catalogoFormulasTable);
  const compByCodigo = new Map<string, typeof componentes>();
  for (const c of componentes) {
    const k = c.codigoPadcom ?? "";
    if (!k) continue;
    const arr = compByCodigo.get(k) ?? [];
    arr.push(c);
    compByCodigo.set(k, arr);
  }

  const formulas = itens
    .filter((it) => it.codigoPadcom && it.nome)
    .map((it) => {
      const codigo = it.codigoPadcom as string;
      let body = "";
      const composicao = (it.composicao ?? "").trim();
      if (composicao) {
        // "ZINCO 30 MG, MAGNESIO 150 MG" -> uma linha por ativo.
        body = composicao
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .join("\n");
      } else {
        // Sem composicao consolidada: monta a partir dos componentes SUBS.
        body = (compByCodigo.get(codigo) ?? [])
          .filter((c) => (c.identificador ?? "").toUpperCase().startsWith("SUBS"))
          .map((c) => (c.conteudo ?? "").trim())
          .filter(Boolean)
          .join("\n");
      }
      const posologia = (it.posologia ?? "").trim();
      if (posologia) body = body ? `${body}\n${posologia}` : posologia;
      return {
        id: codigo,
        cat: "ihe",
        name: it.nome as string,
        body,
        precoMedio: typeof it.preco === "number" ? it.preco : undefined,
      };
    });

  res.json(formulas);
});

// POST /prescriptions/:id/enviar-lembrete
// Dispara o motor de lembretes para uma prescrição já emitida.
// Útil para reenvio manual ou quando a emissão original não tinha clientId.
// Fluxo: sincroniza lembretes_prescricao → templateLembretePrescricao → sendWhatsapp.
router.post("/prescriptions/:id/enviar-lembrete", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }

  const [pres] = await db
    .select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.id, id));
  if (!pres) {
    res.status(404).json({ error: "Prescrição não encontrada" });
    return;
  }

  // Resolver clientId e telefone — tenta o registro direto, depois busca pelo CPF.
  let clientId = pres.clientId ?? null;
  let clientPhone = pres.clientPhone ?? null;

  if ((!clientId || !clientPhone) && pres.clientCpf) {
    const cpfDigits = pres.clientCpf.replace(/\D/g, "");
    const [cli] = await db
      .select({ id: clientsTable.id, phone: clientsTable.phone })
      .from(clientsTable)
      .where(
        sql`REGEXP_REPLACE(${clientsTable.cpf}, '[^0-9]', '', 'g') = ${cpfDigits}`,
      )
      .limit(1);
    if (cli) {
      clientId   = clientId   ?? cli.id;
      clientPhone = clientPhone ?? cli.phone ?? null;
    }
  }

  if (!clientId) {
    res.status(422).json({
      error: "clientId não encontrado — vincule o paciente à prescrição ou forneça um CPF válido",
    });
    return;
  }

  // Itens da prescrição
  const itens = await db
    .select()
    .from(prescriptionItemsTable)
    .where(eq(prescriptionItemsTable.prescriptionId, id));

  if (itens.length === 0) {
    res.status(422).json({ error: "Prescrição sem itens" });
    return;
  }

  // Sincronizar lembrete (idempotente — cria ou atualiza)
  const itensLembrete: ItemLembretePrescricao[] = itens.map((it) => ({
    tipo: "formula" as const,
    nome: it.name,
    ativoPrincipal: it.ativos?.split("\n")[0]?.trim() ?? undefined,
    dose: it.dose ?? undefined,
    // posologia OMITIDA: verbosa do receituário (para farmácia), não para o paciente.
    periodos: mapPeriodosTextoToCanonicos(it.periodo ?? ""),
  }));

  const sync = await sincronizarLembretePrescricao(clientId, itensLembrete);

  // Ler os períodos recém-gravados
  const [lembrete] = await db
    .select({ periodos: lembretesPrescricaoTable.periodos })
    .from(lembretesPrescricaoTable)
    .where(eq(lembretesPrescricaoTable.clienteId, clientId))
    .limit(1);

  const lembretePeriodos = (lembrete?.periodos as LembretePeriodoJson[]) ?? [];

  if (lembretePeriodos.length === 0) {
    res.status(422).json({
      error: "Nenhum período canônico mapeado — verifique o campo 'periodo' dos itens",
      itens: itens.map((it) => ({ nome: it.name, periodo: it.periodo })),
    });
    return;
  }

  // Montar mensagem pelo motor oficial e enviar via sendWhatsapp
  const mensagem = truncarMensagemWhatsapp(templateLembretePrescricao({
    clienteNome: pres.clientName,
    clienteGenero: "nao_informado",
    periodos: lembretePeriodos,
    agora: new Date(),
  }));

  let whatsappResult = null;
  if (clientPhone) {
    whatsappResult = await sendWhatsapp(clientPhone, mensagem, {
      contexto: "lembrete_prescricao",
      clienteId: clientId,
    });
  }

  // Telegram: ao paciente (se telegramChatId vinculado) + cópia ao CEO (sempre).
  // Canal preferido pelo CEO (14/08/2026). WhatsApp mantido como canal paralelo.
  const telegramResults: { destino: string; sent: boolean; error?: string | null }[] = [];

  const [cliTelegram] = await db
    .select({ telegramChatId: clientsTable.telegramChatId })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (cliTelegram?.telegramChatId) {
    const rt = await sendTelegram(cliTelegram.telegramChatId, mensagem);
    telegramResults.push({ destino: `paciente (ID ${clientId})`, sent: rt.sent, error: rt.error ?? null });
  } else {
    telegramResults.push({
      destino: "paciente",
      sent: false,
      error: "telegram_chat_id nao vinculado — paciente precisa enviar /start ao @Paduaclinica_bot",
    });
  }

  const ceoChatId = process.env.PADAXOR_TELEGRAM_CHAT_ID;
  if (ceoChatId) {
    const msgCeo = `Copia CEO - Prescricao #${id} - ${pres.clientName}\n\n${mensagem}`;
    const rc = await sendTelegram(ceoChatId, truncarMensagemWhatsapp(msgCeo, 3800));
    telegramResults.push({ destino: "CEO", sent: rc.sent, error: rc.error ?? null });
  }

  res.json({
    ok: true,
    prescriptionId: id,
    clientId,
    clientPhone: clientPhone ?? "não encontrado",
    sync: {
      lembreteId:  sync.lembreteId,
      periodos:    sync.periodos,
      horarios:    sync.horarios,
      formulas:    sync.formulas,
      ativo:       sync.ativo,
    },
    whatsapp: whatsappResult
      ? { sent: whatsappResult.sent, via: whatsappResult.via, error: whatsappResult.error ?? null }
      : { sent: false, via: null, error: "telefone não encontrado — mensagem não enviada" },
    telegram: telegramResults,
    mensagemPreview: mensagem.slice(0, 300) + (mensagem.length > 300 ? "…" : ""),
  });
});

// ── Teste de template de e-mail (CEO only — remove após confirmar visual) ──────
router.post("/prescriptions/test-email-receituario", async (req, res): Promise<void> => {
  const emailTo = (req.body?.emailTo as string) ?? "drcaiohenriquepadua@gmail.com";
  const baseUrl = baseUrlFromEnv();
  const result = await emitirReceituarioPdf({
    patient: { nome: "CARLUCIA SANTOS FERNANDES", cpf: "012.345.678-90", telefone: "(62) 98269-6656" },
    formulas: [
      { nome: "Sibutramina 5mg",        dose: "5mg",        via: "VO", posologia: "1 cap a tarde (14h)" },
      { nome: "Vitamina D3 50.000UI",   dose: "50.000UI",   via: "VO", posologia: "1 cap por semana" },
      { nome: "Metformina 500mg",       dose: "500mg",      via: "VO", posologia: "1 cap nas refeicoes" },
      { nome: "Oxacarbazepina 600mg",   dose: "600mg",      via: "VO", posologia: "1 cap ao deitar" },
    ],
    emailTo:         [emailTo],
    assetsBaseUrl:   baseUrl,
  });
  res.json({ ok: true, emailSent: result.emailSent, modeloUsado: result.modeloUsado });
});

export default router;
