// -------------------------------------------------------------------------------
// ROTA: Gerador de PDF de Plano Nutricional — PADAXOR
//
// POST /api/dieta/emitir-pdf
//   Gera PDF via Claude + pdf-lib; busca médico responsável para assinar;
//   persiste prescrição no Órgão Dieta; salva PDF no Object Storage e
//   registra histórico em dieta_planos_emitidos.
//   NUNCA envia e-mail — o CEO revisa o PDF antes de confirmar.
//
// POST /api/dieta/enviar-pdf-email
//   Recebe apenas clientId e planId e carrega o PDF privado armazenado.
//   Chamado somente após confirmação explícita na tela.
//
// GET  /api/dieta/planos-emitidos?clienteId=N      [requireCollaborator]
//   Lista histórico de planos emitidos para um cliente.
//
// GET  /api/dieta/planos-emitidos/:id/pdf          [requireCollaborator]
//   Baixa o PDF armazenado no escopo validado de empresa, unidade e cliente.
//
// POST /api/dieta/planos-emitidos/:id/reenviar     [requireCollaborator]
//   Reenvia o PDF privado ao endereço confirmado pela pessoa autenticada.
// -------------------------------------------------------------------------------

import { Router, type IRouter } from "express";
import type { Response } from "express";
import { z } from "zod";
import {
  db,
  professionalsTable,
  dietaPrescricaoTable,
  dietaPrescricaoItemTable,
  dietaPlanosEmitidosTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { gerarDietaPdf } from "../lib/dieta-pdf";
import { calcularTdee } from "../lib/dieta-calc";
import { sendGmailMessage } from "../lib/google-gmail";
import { renderPaxterEmail } from "../lib/messaging/render-email";
import { baseUrlFromEnv } from "../lib/messaging/base-url";
import type { PaxterDoc } from "../lib/messaging/types";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  ensureDietaPlanosTable,
  uploadDietaPdf,
  readDietaPdf,
  listPlanosByCliente,
  getPlanoById,
} from "../lib/dieta-planos-storage";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";

const router: IRouter = Router();

type ResolvedDietaIdentity = Awaited<ReturnType<typeof resolveClinicalEmitter>>;
type DietaIdentity = Omit<ResolvedDietaIdentity, "professional"> & {
  professional: ResolvedDietaIdentity["professional"] & { uf: string };
};

async function resolveDietaIdentity(
  req: Parameters<typeof resolveClinicalEmitter>[0],
  clientId: number,
): Promise<DietaIdentity> {
  const identity = await resolveClinicalEmitter(req, clientId);
  if (!identity.canPrescribe || !identity.professional.uf) {
    throw new ClinicalIdentityError(
      422,
      identity.issue ?? "Informe o número do CRM e a unidade federativa no cadastro do médico.",
    );
  }
  return identity as DietaIdentity;
}

function respondClinicalIdentityError(err: unknown, res: Response): boolean {
  if (!(err instanceof ClinicalIdentityError)) return false;
  res.status(err.status).json({ error: err.message });
  return true;
}

function planoMatchesIdentity(
  plano: { clienteId: number; empresaId: number; locationId: number | null },
  identity: DietaIdentity,
): boolean {
  return plano.clienteId === identity.client.id &&
    plano.empresaId === identity.clinic.empresaId &&
    plano.locationId === identity.clinic.id;
}
// -------------------------------------------------------------------------------
// Schema de validação — geração do PDF
// -------------------------------------------------------------------------------
const EmitirPdfSchema = z.object({
  clientId: z.number().int().positive(),
  sexo: z.enum(["F", "M"]).default("F"),
  objetivo: z.string().default("hipertrofia e definição muscular"),
  estiloAlimentar: z.string().optional().nullable(),
  pesoKg: z.number().positive(),
  alturaCm: z.number().positive(),
  idade: z.number().int().positive(),
  nivelAtividade: z
    .enum(["sedentario", "leve", "moderado", "intenso", "atleta"])
    .default("moderado"),
  caloriasAlvo: z.number().positive().optional().nullable(),
  // Mantido para compatibilidade retroativa; ignorado — nunca envia e-mail aqui.
  enviarEmail: z.boolean().default(false),
});

// -------------------------------------------------------------------------------
// POST /api/dieta/emitir-pdf — gera PDF e devolve os bytes (nunca envia e-mail)
// -------------------------------------------------------------------------------
router.post("/dieta/emitir-pdf", requireCollaborator, async (req, res): Promise<void> => {
  try {
  const parsed = EmitirPdfSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  const identity = await resolveDietaIdentity(req, body.clientId);
  const nomePaciente = identity.client.name;
  const emailDestino = identity.client.email ?? null;
  await ensureDietaPlanosTable();

  // Buscar somente os dados de assinatura do profissional autenticado.
  const [medicoRow] = await db
    .select({
      nome: professionalsTable.name,
      crm: professionalsTable.crm,
      registrationCouncil: professionalsTable.registrationCouncil,
      registrationNumber: professionalsTable.registrationNumber,
      especialidade: professionalsTable.specialty,
      signatureUrl: professionalsTable.signatureUrl,
    })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, identity.professional.id))
    .limit(1);

  if (!medicoRow?.nome) {
    res.status(403).json({ error: "Não foi possível confirmar o médico autenticado." });
    return;
  }

  let medicoAssinatura: import("../lib/dieta-pdf").MedicoAssinatura | null = {
    nome: medicoRow.nome,
    crm: identity.professional.crm,
    registrationCouncil: `CRM/${identity.professional.uf}`,
    especialidade: medicoRow.especialidade,
    signatureImageBytes: null,
    signatureMime: null,
  };
  let signatureLoadFailed = false;
  if (medicoRow.signatureUrl) {
    try {
      const objectPath = medicoRow.signatureUrl.replace(/^\/api\/storage/, "");
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(objectPath);
      const [buf] = await file.download();
      medicoAssinatura.signatureImageBytes = buf;
      medicoAssinatura.signatureMime = medicoRow.signatureUrl.endsWith(".png") ? "image/png" : "image/jpeg";
    } catch (err) {
      signatureLoadFailed = true;
      req.log?.warn?.(
        { err, signatureUrl: medicoRow.signatureUrl },
        "Falha ao baixar imagem de assinatura do médico — PDF usará linha tracejada no rodapé",
      );
    }
  }

  // Calcular TDEE/meta
  const conta = calcularTdee({
    pesoKg: body.pesoKg,
    alturaCm: body.alturaCm,
    idade: body.idade,
    sexo: body.sexo,
    nivelAtividade: body.nivelAtividade,
    objetivo: body.objetivo,
  });

  const caloriasAlvo =
    body.caloriasAlvo ?? conta.caloriasAlvo ?? Math.round(body.pesoKg * 25);
  const tmb = conta.tmb ?? 0;
  const tdee = conta.tdee ?? 0;

  // Gerar PDF (pode levar 30-120 segundos pelo Claude)
  // AbortController garante que a rota responda com 504 antes do gateway cortar a conexão.
  const TIMEOUT_MS = Number(process.env.DIETA_PDF_TIMEOUT_MS ?? 120_000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let pdfBytes: Uint8Array;
  let plano: Awaited<ReturnType<typeof gerarDietaPdf>>["plano"];
  let signatureImageEmbedded = false;
  try {
    const resultado = await gerarDietaPdf(
      {
        nomePaciente,
        email: emailDestino,
        sexo: body.sexo,
        objetivo: body.objetivo,
        estiloAlimentar: body.estiloAlimentar,
        pesoKg: body.pesoKg,
        alturaCm: body.alturaCm,
        idade: body.idade,
        nivelAtividade: body.nivelAtividade,
        caloriasAlvo,
        tmb,
        tdee,
        medico: medicoAssinatura,
      },
      ac.signal,
    );
    pdfBytes = resultado.pdfBytes;
    plano = resultado.plano;
    signatureImageEmbedded = resultado.signatureImageEmbedded;
  } catch (err) {
    clearTimeout(timer);
    const isTimeout =
      (err instanceof Error && err.name === "AbortError") ||
      ac.signal.aborted;
    if (isTimeout) {
      req.log?.warn?.({ timeoutMs: TIMEOUT_MS }, "Timeout ao gerar PDF de dieta via Claude");
      res.status(504).json({ error: "Timeout ao gerar plano nutricional — tente novamente." });
    } else {
      req.log?.error?.({ err }, "Falha ao gerar PDF de dieta");
      res.status(500).json({
        error: "Falha ao gerar o plano nutricional",
        detail: (err as Error)?.message ?? String(err),
      });
    }
    return;
  } finally {
    clearTimeout(timer);
  }

  // Salvar histórico e PDF privado com o emissor, a unidade e a empresa reais.
  const [inserted] = await db
    .insert(dietaPlanosEmitidosTable)
    .values({
      clienteId: body.clientId,
      empresaId: identity.clinic.empresaId,
      professionalId: identity.professional.id,
      locationId: identity.clinic.id,
      nomePaciente,
      pesoKg: body.pesoKg,
      alturaCm: body.alturaCm,
      idade: body.idade,
      sexo: body.sexo,
      objetivo: body.objetivo,
      estrategia: body.estiloAlimentar ?? null,
      nivelAtividade: body.nivelAtividade,
      caloriasAlvo,
      tmb,
      tdee,
      emailDestino,
      emailEnviado: false,
      emailStatus: "not_sent",
      pdfBytes: pdfBytes.length,
    })
    .returning({ id: dietaPlanosEmitidosTable.id });

  if (!inserted?.id) {
    throw new Error("Não foi possível criar o registro do plano nutricional.");
  }
  const planoId = inserted.id;
  const pdfStorageKey = await uploadDietaPdf(planoId, Buffer.from(pdfBytes));
  const [stored] = await db
    .update(dietaPlanosEmitidosTable)
    .set({ pdfStorageKey })
    .where(and(
      eq(dietaPlanosEmitidosTable.id, planoId),
      eq(dietaPlanosEmitidosTable.empresaId, identity.clinic.empresaId),
      eq(dietaPlanosEmitidosTable.locationId, identity.clinic.id),
    ))
    .returning({ id: dietaPlanosEmitidosTable.id });
  if (!stored) {
    throw new Error("Não foi possível registrar o PDF privado no histórico do plano.");
  }

  // Só persistir a prescrição no Órgão Dieta depois que o histórico e o PDF
  // privado estão confirmados; falha de armazenamento não deixa prescrição sem arquivo.
  await db.transaction(async (tx) => {
    const [prescricao] = await tx
      .insert(dietaPrescricaoTable)
      .values({
        clientId: body.clientId,
        professionalId: identity.professional.id,
        objetivo: body.objetivo,
        estiloAlimentar: body.estiloAlimentar ?? null,
        pesoKg: body.pesoKg,
        alturaCm: body.alturaCm,
        idade: body.idade,
        sexo: body.sexo,
        nivelAtividade: body.nivelAtividade,
        tmb,
        tdee,
        caloriasAlvo,
        status: "ativa",
        observacao:
          "Plano nutricional emitido em PDF (opção 1 de cada refeição registrada aqui; PDF completo tem 3 opções).",
      })
      .returning();

    const itemRows = plano.refeicoes.flatMap((ref, refIdx) => {
      const opcao1 = ref.opcoes.find((o) => o.numero === 1) ?? ref.opcoes[0];
      if (!opcao1) return [];
      return opcao1.itens.map((item, itemIdx) => ({
        prescricaoId: prescricao.id,
        refeicao: ref.id,
        horario: ref.horario.split("–")[0]?.trim() ?? null,
        ordem: refIdx * 100 + itemIdx,
        alimentoNome: item.nome,
        quantidadeG: item.pesoG,
        kcal: item.kcal,
        proteinaG: item.proteinaG,
        observacao: `${item.medidaCaseira} · opção 1 de 3 (ver PDF)`,
      }));
    });

    if (itemRows.length > 0) {
      await tx.insert(dietaPrescricaoItemTable).values(itemRows);
    }
  });

  // A geração apenas devolve o PDF; o envio exige confirmação autenticada separada.
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="PlanoNutricional_${nomePaciente.replace(/\s+/g, "_")}.pdf"`,
  );
  res.setHeader("Content-Length", pdfBytes.length.toString());
  res.setHeader("X-Dieta-Plan-Id", String(planoId));
  if (emailDestino) res.setHeader("X-Dieta-Email-Target", emailDestino);

  // Sinaliza ao CEO quando havia imagem cadastrada mas não foi possível embutir.
  // signatureLoadFailed = erro ao baixar do Object Storage.
  // !signatureImageEmbedded + signatureUrl = erro ao embutir no pdf-lib.
  const hadSignatureUrl = !!medicoRow.signatureUrl;
  if (hadSignatureUrl && (signatureLoadFailed || !signatureImageEmbedded)) {
    res.setHeader("X-Signature-Image-Failed", "true");
  }

  res.send(Buffer.from(pdfBytes));
  } catch (err) {
    if (respondClinicalIdentityError(err, res)) return;
    req.log?.error?.({ err }, "Falha ao emitir plano nutricional");
    if (res.headersSent) return;
    res.status(500).json({ error: "Falha ao emitir ou registrar o plano nutricional." });
  }
});

// -------------------------------------------------------------------------------
// O pedido de envio aceita apenas o cliente, o identificador do plano e um destino opcional.
// -------------------------------------------------------------------------------
const EnviarPdfEmailSchema = z.object({
  clientId: z.number().int().positive(),
  planId: z.number().int().positive(),
});

// -------------------------------------------------------------------------------
// POST /api/dieta/enviar-pdf-email — envia e-mail após revisão do CEO
// -------------------------------------------------------------------------------
router.post("/dieta/enviar-pdf-email", requireCollaborator, async (req, res): Promise<void> => {
  try {
  const parsed = EnviarPdfEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  const identity = await resolveDietaIdentity(req, body.clientId);
  const plano = await getPlanoById(
    body.planId,
    identity.clinic.empresaId,
    identity.clinic.id,
  );
  if (
    !plano ||
    !planoMatchesIdentity(plano, identity) ||
    plano.professionalId !== identity.professional.id
  ) {
    res.status(404).json({ error: "Plano não encontrado para este cliente e clínica." });
    return;
  }

  if (!plano.pdfStorageKey) {
    res.status(422).json({ error: "O PDF registrado não está disponível para envio." });
    return;
  }
  if (plano.emailEnviado || plano.emailStatus !== "not_sent") {
    res.status(409).json({ error: "Este envio já foi iniciado. Confira o histórico antes de tentar novamente." });
    return;
  }

  const emailDestino = identity.client.email ?? null;
  if (!emailDestino) {
    res.status(422).json({ error: "Cliente sem e-mail cadastrado." });
    return;
  }
  if (plano.emailDestino !== emailDestino) {
    res.status(409).json({ error: "O e-mail do cadastro mudou após a emissão. Confira os dados e gere um novo plano." });
    return;
  }

  const nomePaciente = plano.nomePaciente;
  const caloriasAlvo = plano.caloriasAlvo ?? 0;
  const pdfBuffer = await readDietaPdf(plano.pdfStorageKey);

  const primeiroNome = nomePaciente.split(" ")[0];
  const doc: PaxterDoc = {
    titulo: "Seu Plano Nutricional Personalizado",
    paragrafos: [
      `Olá, ${primeiroNome}!`,
      "Preparamos o seu Plano Alimentar Personalizado com base nos seus dados antropométricos e objetivos clínicos.",
      `Meta energética: ${caloriasAlvo} kcal/dia · Estratégia: ${
        plano.estrategia ?? "Hiperproteica para hipertrofia e definição muscular"
      }`,
      "O PDF em anexo contém todas as refeições com 3 opções por refeição, guia de suplementação, guia de treino e tabela de acompanhamento de 8 semanas.",
      "Em caso de dúvidas, entre em contato com a equipe PADAXOR.",
    ],
    notaRodape:
      "Este plano é personalizado e intransferível. O acompanhamento médico é indispensável.",
  };

  const baseUrl = baseUrlFromEnv();
  const html = renderPaxterEmail(doc, baseUrl);

  const [claimed] = await db
    .update(dietaPlanosEmitidosTable)
    .set({ emailStatus: "sending" })
    .where(and(
      eq(dietaPlanosEmitidosTable.id, plano.id),
      eq(dietaPlanosEmitidosTable.clienteId, identity.client.id),
      eq(dietaPlanosEmitidosTable.empresaId, identity.clinic.empresaId),
      eq(dietaPlanosEmitidosTable.locationId, identity.clinic.id),
      eq(dietaPlanosEmitidosTable.professionalId, identity.professional.id),
      eq(dietaPlanosEmitidosTable.emailEnviado, false),
      eq(dietaPlanosEmitidosTable.emailStatus, "not_sent"),
    ))
    .returning({ id: dietaPlanosEmitidosTable.id });
  if (!claimed) {
    res.status(409).json({ error: "Este envio já foi iniciado. Confira o histórico antes de tentar novamente." });
    return;
  }

  let emailResult: Awaited<ReturnType<typeof sendGmailMessage>>;
  try {
    emailResult = await sendGmailMessage({
      to: emailDestino,
      subject: `Plano Nutricional Personalizado — ${nomePaciente}`,
      html,
      attachments: [
        {
          filename: `PlanoNutricional_${nomePaciente.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (err) {
    req.log?.error?.({ err, planId: plano.id }, "Resultado do envio inicial de Dieta incerto");
    res.status(502).json({ error: "Resultado do envio incerto. Confira o histórico antes de tentar novamente." });
    return;
  }

  if (!emailResult.success) {
    await db
      .update(dietaPlanosEmitidosTable)
      .set({ emailStatus: "failed" })
      .where(and(
        eq(dietaPlanosEmitidosTable.id, plano.id),
        eq(dietaPlanosEmitidosTable.emailStatus, "sending"),
      ));
    res.status(502).json({ error: emailResult.error ?? "Não foi possível enviar o plano." });
    return;
  }

  const [sent] = await db
    .update(dietaPlanosEmitidosTable)
    .set({
      emailEnviado: true,
      emailStatus: "sent",
      emailDestino,
      emailEnviadoPor: identity.professional.id,
      emailEnviadoEm: new Date(),
    })
    .where(and(
      eq(dietaPlanosEmitidosTable.id, plano.id),
      eq(dietaPlanosEmitidosTable.empresaId, identity.clinic.empresaId),
      eq(dietaPlanosEmitidosTable.locationId, identity.clinic.id),
      eq(dietaPlanosEmitidosTable.emailStatus, "sending"),
    ))
    .returning({ id: dietaPlanosEmitidosTable.id });
  if (!sent) {
    res.status(502).json({ error: "O e-mail pode ter sido enviado, mas o registro não foi confirmado. Confira o histórico antes de tentar novamente." });
    return;
  }

  res.json({ ok: true, planId: plano.id, nomePaciente, emailDestino, email: emailResult });
  } catch (err) {
    if (respondClinicalIdentityError(err, res)) return;
    req.log?.error?.({ err }, "Falha ao enviar plano nutricional");
    res.status(500).json({ error: "Falha ao carregar ou enviar o plano nutricional." });
  }
});

// -------------------------------------------------------------------------------
// GET /api/dieta/planos-emitidos
// -------------------------------------------------------------------------------
router.get("/dieta/planos-emitidos", requireCollaborator, async (req, res): Promise<void> => {
  const clienteId = Number(req.query.clienteId);
  if (!clienteId || isNaN(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clienteId é obrigatório e deve ser um inteiro positivo" });
    return;
  }

  try {
    const identity = await resolveDietaIdentity(req, clienteId);
    const rows = await listPlanosByCliente(
      clienteId,
      identity.clinic.empresaId,
      identity.clinic.id,
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        clienteId: r.clienteId,
        professionalId: r.professionalId,
        locationId: r.locationId,
        nomePaciente: r.nomePaciente,
        objetivo: r.objetivo,
        estrategia: r.estrategia,
        caloriasAlvo: r.caloriasAlvo,
        pesoKg: r.pesoKg,
        alturaCm: r.alturaCm,
        emailDestino: r.emailDestino,
        emailEnviado: r.emailEnviado,
        emailStatus: r.emailStatus,
        emailEnviadoPor: r.emailEnviadoPor,
        emailEnviadoEm: r.emailEnviadoEm,
        temPdf: !!r.pdfStorageKey,
        pdfBytes: r.pdfBytes,
        emitidoEm: r.emitidoEm,
      })),
    );
  } catch (err) {
    if (respondClinicalIdentityError(err, res)) return;
    req.log?.error?.({ err }, "Falha ao listar planos emitidos");
    res.status(500).json({ error: "Falha ao carregar histórico" });
  }
});

// -------------------------------------------------------------------------------
// GET /api/dieta/planos-emitidos/:id/pdf
// -------------------------------------------------------------------------------
router.get(
  "/dieta/planos-emitidos/:id/pdf",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const clienteId = Number(req.query.clienteId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }
    if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
      res.status(400).json({ error: "clienteId é obrigatório e deve ser um inteiro positivo" });
      return;
    }

    try {
      const identity = await resolveDietaIdentity(req, clienteId);
      const plano = await getPlanoById(id, identity.clinic.empresaId, identity.clinic.id);
      if (!plano || !planoMatchesIdentity(plano, identity)) {
        res.status(404).json({ error: "Plano não encontrado para este cliente e clínica." });
        return;
      }
      if (!plano.pdfStorageKey) {
        res.status(404).json({ error: "PDF não disponível para este plano" });
        return;
      }

      const pdfBuffer = await readDietaPdf(plano.pdfStorageKey);
      const filename = `PlanoNutricional_${plano.nomePaciente.replace(/\s+/g, "_")}_${id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (err) {
      if (respondClinicalIdentityError(err, res)) return;
      req.log?.error?.({ err }, "Falha ao baixar PDF do plano emitido");
      res.status(500).json({ error: "Falha ao baixar o PDF" });
    }
  },
);

// -------------------------------------------------------------------------------
// POST /api/dieta/planos-emitidos/:id/reenviar
//
// Body: { clientId: number, email?: string }
//   O destinatário alternativo é explícito; não altera o e-mail cadastrado
//   no registro do cliente.
// -------------------------------------------------------------------------------
const ReenviarSchema = z.object({
  clientId: z.number().int().positive(),
  email: z.string().email("E-mail inválido").optional().nullable(),
});

router.post(
  "/dieta/planos-emitidos/:id/reenviar",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!id || isNaN(id) || id <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const parsed = ReenviarSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "E-mail inválido" });
      return;
    }

    const { clientId, email: emailOverride } = parsed.data;

    try {
      const identity = await resolveDietaIdentity(req, clientId);
      const plano = await getPlanoById(
        id,
        identity.clinic.empresaId,
        identity.clinic.id,
      );
      if (!plano || !planoMatchesIdentity(plano, identity)) {
        res.status(404).json({ error: "Plano não encontrado para este cliente e clínica." });
        return;
      }
      if (!plano.pdfStorageKey) {
        res.status(422).json({ error: "PDF não disponível para reenvio" });
        return;
      }
      if (plano.emailStatus === "sending") {
        res.status(409).json({ error: "Há um reenvio com resultado incerto. Confira o histórico antes de tentar novamente." });
        return;
      }

      // O padrão é o e-mail atual do cadastro; o endereço alternativo só é usado
      // quando a pessoa autenticada o confirmou explicitamente na tela.
      const emailDestino = emailOverride ?? identity.client.email ?? plano.emailDestino ?? null;
      if (!emailDestino) {
        res
          .status(422)
          .json({ error: "Nenhum e-mail de destino disponível. Informe um endereço no campo de reenvio." });
        return;
      }

      const pdfBuffer = await readDietaPdf(plano.pdfStorageKey);
      const primeiroNome = plano.nomePaciente.split(" ")[0];
      const doc: PaxterDoc = {
        titulo: "Seu Plano Nutricional Personalizado",
        paragrafos: [
          `Olá, ${primeiroNome}!`,
          "Segue o reenvio do seu Plano Alimentar Personalizado com base nos seus dados clínicos.",
          `Meta energética: ${plano.caloriasAlvo ?? "—"} kcal/dia · Estratégia: ${plano.estrategia ?? "Personalizada"}`,
          "O PDF em anexo contém todas as refeições com 3 opções por refeição, guia de suplementação, guia de treino e tabela de acompanhamento de 8 semanas.",
          "Em caso de dúvidas, entre em contato com a equipe PADAXOR.",
        ],
        notaRodape:
          "Este plano é personalizado e intransferível. O acompanhamento médico é indispensável.",
      };
      const baseUrl = baseUrlFromEnv();
      const html = renderPaxterEmail(doc, baseUrl);

      const [claimed] = await db
        .update(dietaPlanosEmitidosTable)
        .set({
          emailStatus: "sending",
          emailDestino,
          emailEnviadoPor: identity.professional.id,
        })
        .where(and(
          eq(dietaPlanosEmitidosTable.id, id),
          eq(dietaPlanosEmitidosTable.empresaId, identity.clinic.empresaId),
          eq(dietaPlanosEmitidosTable.locationId, identity.clinic.id),
          eq(dietaPlanosEmitidosTable.clienteId, identity.client.id),
          eq(dietaPlanosEmitidosTable.emailStatus, plano.emailStatus),
        ))
        .returning({ id: dietaPlanosEmitidosTable.id });
      if (!claimed) {
        res.status(409).json({ error: "Outro envio foi iniciado. Confira o histórico antes de tentar novamente." });
        return;
      }

      let emailResult: Awaited<ReturnType<typeof sendGmailMessage>>;
      try {
        emailResult = await sendGmailMessage({
          to: emailDestino,
          subject: `Plano Nutricional Personalizado — ${plano.nomePaciente}`,
          html,
          attachments: [
            {
              filename: `PlanoNutricional_${plano.nomePaciente.replace(/\s+/g, "_")}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });
      } catch (err) {
        req.log?.error?.({ err, planId: id }, "Resultado do reenvio de Dieta incerto");
        res.status(502).json({ error: "Resultado do reenvio incerto. Confira o histórico antes de tentar novamente." });
        return;
      }

      if (emailResult.success) {
        const [sent] = await db
          .update(dietaPlanosEmitidosTable)
          .set({
            emailEnviado: true,
            emailStatus: "sent",
            emailDestino,
            emailEnviadoPor: identity.professional.id,
            emailEnviadoEm: new Date(),
          })
          .where(and(
            eq(dietaPlanosEmitidosTable.id, id),
            eq(dietaPlanosEmitidosTable.empresaId, identity.clinic.empresaId),
            eq(dietaPlanosEmitidosTable.locationId, identity.clinic.id),
            eq(dietaPlanosEmitidosTable.clienteId, identity.client.id),
            eq(dietaPlanosEmitidosTable.emailStatus, "sending"),
          ))
          .returning({ id: dietaPlanosEmitidosTable.id });
        if (!sent) {
          res.status(502).json({ error: "O e-mail pode ter sido enviado, mas o registro não foi confirmado. Confira o histórico antes de tentar novamente." });
          return;
        }
      } else {
        await db
          .update(dietaPlanosEmitidosTable)
          .set({ emailStatus: "failed" })
          .where(and(
            eq(dietaPlanosEmitidosTable.id, id),
            eq(dietaPlanosEmitidosTable.empresaId, identity.clinic.empresaId),
            eq(dietaPlanosEmitidosTable.locationId, identity.clinic.id),
            eq(dietaPlanosEmitidosTable.clienteId, identity.client.id),
            eq(dietaPlanosEmitidosTable.emailStatus, "sending"),
          ));
      }

      if (!emailResult.success) {
        res.status(502).json({ ok: false, error: emailResult.error ?? "Não foi possível enviar o plano." });
        return;
      }
      res.json({ ok: true, email: emailResult, emailDestino });
    } catch (err) {
      if (respondClinicalIdentityError(err, res)) return;
      req.log?.error?.({ err }, "Falha ao reenviar plano emitido");
      res.status(500).json({ error: "Falha ao reenviar o plano" });
    }
  },
);

export default router;
