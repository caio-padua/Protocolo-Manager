import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import {
  db,
  prescriptionsTable,
  prescriptionItemsTable,
  recipesTable,
  pharmaciesTable,
  catalogoItensTable,
  catalogoFormulasTable,
} from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireCollaborator } from "./collaborator";
import { PreviewPrescriptionBody, EmitPrescriptionBody } from "@workspace/api-zod";
import { planDesmembramento, type PrescriptionItemInput } from "../lib/desmembramento";
import { consumeSncrNumber } from "../lib/sncr";
import { handleSncrAlert } from "../lib/sncr-alerts";
import { generateRecipePdf } from "../lib/prescription-pdf";
// ── MOTOR ÚNICO: cópia visual para o paciente (além do PDF regulatório M3) ──
import { emitirReceituarioPdf } from "../lib/receituario-motor.js";
// ── Motor de lembretes por período (portado do IHE) ──
import { sincronizarLembretePrescricao } from "../lib/lembrete-periodo";
import { mapPeriodosTextoToCanonicos } from "../lib/prescription-reminder-message";
import { resolvePrescriptionClient } from "../lib/prescription-client";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";
import deliveryRouter, { authorizedPrescription, authorizedPrescriptionFilter } from "./prescription-delivery";

const router: IRouter = Router();
router.use(moduleGuard("protocolos"));
router.use(deliveryRouter);

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

router.get("/prescriptions", requireCollaborator, async (req, res): Promise<void> => {
  const rows = await db.select().from(prescriptionsTable)
    .where(authorizedPrescriptionFilter(req.collaborator!.professionalId))
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

router.get("/prescriptions/:id", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const { pres: p } = await authorizedPrescription(req, id);
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

router.get("/clinical-context/:clientId", requireCollaborator, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json(await resolveClinicalEmitter(req, Number(req.params.clientId)));
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.post("/prescriptions/emit", requireCollaborator, async (req, res): Promise<void> => {
  let identity;
  try {
    identity = await resolveClinicalEmitter(req, req.body?.clientId);
    if (req.body?.professionalId != null && req.body.professionalId !== identity.professional.id) {
      throw new ClinicalIdentityError(403, "O prescritor deve ser o médico autenticado.");
    }
    if (!identity.canPrescribe) throw new ClinicalIdentityError(422, identity.issue!);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  // Browser fields are presentation only. Persist the verified registry snapshot.
  req.body = {
    ...req.body,
    clientId: identity.client.id, clientName: identity.client.name, clientCpf: identity.client.cpf,
    clientPhone: identity.client.phone, clientEmail: identity.client.email,
    professionalId: identity.professional.id, professionalName: identity.professional.name,
    professionalCrm: identity.professional.crm, professionalUf: identity.professional.uf,
  };
  const parsed = EmitPrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const items = body.items as PrescriptionItemInput[];
  const batchDate = todayBR();
  const uf = identity.professional.uf!;

  // 1) Persiste prescrição + itens.
  const empresaId = identity.clinic.empresaId;
  const resolvedClientId = await resolvePrescriptionClient(body, empresaId);
  if (resolvedClientId === null) {
    res.status(422).json({
      error: "Não foi possível vincular a prescrição a um único paciente. Selecione um paciente cadastrado e confira nome, CPF, e-mail e telefone com o cadastro antes de emitir.",
    });
    return;
  }
  // Todos os consumidores abaixo (persistência, lembretes e alertas) usam o vínculo validado.
  body.clientId = resolvedClientId;
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

  // Conteúdo preparado, mas nunca ativa a agenda nem autoriza destinatários.
  try {
    await sincronizarLembretePrescricao(body.clientId, items.map(it => ({
      tipo: "formula" as const, nome: it.name,
      ativoPrincipal: it.ativos?.split("\n")[0]?.trim() ?? undefined,
      dose: it.dose ?? undefined, periodos: mapPeriodosTextoToCanonicos(it.periodo ?? ""),
    })));
  } catch (err) {
    req.log.warn({ err }, "Conteúdo do lembrete não preparado; emissão clínica continua sem envios");
  }

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
        const message = `Atenção: restam ${consume.remaining} números SNCR para ${controlledType} (${uf}). Solicite novo talão.`;
        sncrAlerts.push({ controlledType, status: "low", remaining: consume.remaining, message });
      } else if (consume.status === "exhausted") {
        const message = `Numeração SNCR ESGOTADA para ${controlledType} (${uf}). Receita emitida SEM número — providencie novo talão com urgência.`;
        sncrAlerts.push({ controlledType, status: "exhausted", remaining: 0, message });
      } else if (consume.status === "no_range") {
        const message = `Sem intervalo SNCR cadastrado para ${controlledType} (${uf}). Receita emitida SEM número.`;
        sncrAlerts.push({ controlledType, status: "no_range", remaining: null, message });
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
    // Nenhum upload para pasta compartilhada de farmácia durante a emissão.

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

  // Preserve internal regulatory warnings without notifying any external recipient.
  for (const alert of sncrAlerts) {
    await handleSncrAlert({
      ...alert, uf, prescriptionId: prescription.id, clientId: body.clientId,
      professionalName: body.professionalName ?? null,
    }, { notifyEmail: false });
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
      posologia: it.posologia ?? "",
      via:       it.via ?? undefined,
      forma:     it.observacao ?? undefined,
      dose:      it.dose ?? undefined,
    }));

    // Generation only: email is a separate confirmed delivery action.
    const emailDestinatarios: string[] = [];

    const motorResult = await emitirReceituarioPdf({
      medicoId: identity.professional.id,
      clinicaId: identity.clinic.id,
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

  // Entregas são ações separadas, confirmadas por destinatário.
  const pharmacyDispatches: Array<{
    pharmacyId: number;
    pharmacyName: string;
    recipeCount: number;
    sent: boolean;
    whatsappLink: string | null;
  }> = [];

  // Alertas SNCR são exibidos no retorno; não há cópia externa implícita.

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
router.get("/recipes/:id/pdf", requireCollaborator, async (req, res): Promise<void> => {
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
  await authorizedPrescription(req, recipe.prescriptionId);
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

router.use((error: unknown, _req: import("express").Request, res: import("express").Response,
  next: import("express").NextFunction) => {
  if (error instanceof ClinicalIdentityError) {
    res.status(error.status).json({ error: error.message }); return;
  }
  next(error);
});

export default router;
