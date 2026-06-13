import { Router, type IRouter } from "express";
import {
  db,
  prescriptionsTable,
  prescriptionItemsTable,
  recipesTable,
  pharmaciesTable,
  dispatchLogTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { PreviewPrescriptionBody, EmitPrescriptionBody } from "@workspace/api-zod";
import { planDesmembramento, type PrescriptionItemInput } from "../lib/desmembramento";
import { consumeSncrNumber } from "../lib/sncr";
import { generateRecipePdf } from "../lib/prescription-pdf";
import { ensurePharmacyDayFolder, uploadFileToDrive } from "../lib/google-drive";
import { sendWhatsapp } from "../lib/whatsapp";
import { recipeTypeForControlledClass } from "../lib/anvisa-catalog";
import { handleSncrAlert } from "../lib/sncr-alerts";

const router: IRouter = Router();

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

router.post("/prescriptions/preview", async (req, res): Promise<void> => {
  const parsed = PreviewPrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const plans = planDesmembramento(parsed.data.items as PrescriptionItemInput[]);
  res.json(plans);
});

router.get("/prescriptions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(prescriptionsTable).orderBy(desc(prescriptionsTable.createdAt)).limit(200);
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
    const fileName = `${batchDate} RECEITA ${kind} ${safeClient}.pdf`.replace(/\s+/g, " ");

    // 2c) Upload Drive (best-effort).
    let driveFileId: string | null = null;
    let driveWebViewLink: string | null = null;
    if (pharmacy) {
      try {
        const { dayFolderId } = await ensurePharmacyDayFolder(pharmacy.name, batchDate);
        const up = await uploadFileToDrive(dayFolderId, fileName, "application/pdf", pdfBuffer);
        driveFileId = up.fileId;
        driveWebViewLink = up.webViewLink;
      } catch (err) {
        req.log.warn({ err }, "Falha ao subir receita ao Drive");
      }
    }

    // 2d) Persiste receita.
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
        driveFileId,
        driveWebViewLink,
        fileName,
        pdfData: pdfBase64,
        batchDate,
        status: "generated",
      })
      .returning();

    emittedRecipes.push({
      id: recipe.id,
      recipeType: recipe.recipeType,
      title: recipe.title ?? "Receita",
      pharmacyId: recipe.pharmacyId ?? null,
      anvisaType: recipe.anvisaType ?? null,
      anvisaColorName: recipe.anvisaColorName ?? null,
      sncrNumber: recipe.sncrNumber ?? null,
      sncrStatus: recipe.sncrStatus ?? null,
      driveWebViewLink: recipe.driveWebViewLink ?? null,
      pdfUrl: `/api/recipes/${recipe.id}/pdf`,
    });
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

  res.status(201).json({
    prescriptionId: prescription.id,
    recipes: emittedRecipes,
    sncrAlerts,
    pharmacyDispatches,
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

export default router;
