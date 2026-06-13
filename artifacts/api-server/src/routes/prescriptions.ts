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
        sncrAlerts.push({
          controlledType,
          status: "low",
          remaining: consume.remaining,
          message: `Atenção: restam ${consume.remaining} números SNCR para ${controlledType} (${uf}). Solicite novo talão.`,
        });
      } else if (consume.status === "exhausted") {
        sncrAlerts.push({
          controlledType,
          status: "exhausted",
          remaining: 0,
          message: `Numeração SNCR ESGOTADA para ${controlledType} (${uf}). Receita emitida SEM número — providencie novo talão com urgência.`,
        });
      } else if (consume.status === "no_range") {
        sncrAlerts.push({
          controlledType,
          status: "no_range",
          remaining: null,
          message: `Sem intervalo SNCR cadastrado para ${controlledType} (${uf}). Receita emitida SEM número.`,
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

  // 3) WhatsApp ao cliente (best-effort).
  let whatsappLink: string | null = null;
  let whatsappSent = false;
  if (body.clientPhone) {
    const msg =
      body.message?.trim() ||
      `Olá ${body.clientName}, suas receitas foram emitidas pelo Instituto Padua e encaminhadas à farmácia. Qualquer dúvida, estamos à disposição.`;
    const wa = await sendWhatsapp(body.clientPhone, msg);
    whatsappLink = wa.link;
    whatsappSent = wa.sent;
    await db.insert(dispatchLogTable).values({
      prescriptionId: prescription.id,
      channel: "whatsapp",
      status: wa.sent ? "sent" : "link_only",
      detail: wa.error ?? (wa.sent ? "Enviado via Twilio" : "Link de fallback gerado"),
      batchDate,
    });
  }

  res.status(201).json({
    prescriptionId: prescription.id,
    recipes: emittedRecipes,
    sncrAlerts,
    whatsappLink,
    whatsappSent,
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
