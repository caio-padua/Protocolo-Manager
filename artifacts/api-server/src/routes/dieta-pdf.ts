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
//   Recebe PDF já gerado (base64) + clientId e envia por e-mail.
//   Chamado APENAS após o CEO clicar "Confirmar envio" na UI.
//
// GET  /api/dieta/planos-emitidos?clienteId=N      [requireCollaborator]
//   Lista histórico de planos emitidos para um cliente.
//
// GET  /api/dieta/planos-emitidos/:id/pdf          [requireCollaborator]
//   Baixa o PDF armazenado (anti-IDOR: filtra por empresa_id).
//
// POST /api/dieta/planos-emitidos/:id/reenviar     [requireCollaborator]
//   Reenvia o PDF ao destinatário ORIGINAL gravado no registro.
// -------------------------------------------------------------------------------

import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  clientsTable,
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

// Empresa padrão desta instalação (tenant único).
const EMPRESA_ID = 5;

const router: IRouter = Router();

// -------------------------------------------------------------------------------
// Schema de validação — geração do PDF
// -------------------------------------------------------------------------------
const EmitirPdfSchema = z.object({
  clientId: z.number().int().positive().optional().nullable(),
  nomePaciente: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
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
router.post("/dieta/emitir-pdf", async (req, res): Promise<void> => {
    const parsed = ReenviarSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  // Resolver nome e e-mail do paciente
  const nomePaciente = body.nomePaciente ?? cliente.name;
      const emailDestino = emailOverride ?? plano.emailDestino ?? null;

  if (body.clientId) {
  const [cliente] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
    .from(clientsTable)
    .where(and(
      eq(clientsTable.id, body.clientId),
      eq(clientsTable.empresaId, EMPRESA_ID),
    ));

    if (!cliente) {
      res.status(404).json({ error: "Cliente não encontrado", clientId: body.clientId });
      return;
    }
    nomePaciente = body.nomePaciente ?? cliente.name;
    emailDestino = body.email ?? cliente.email ?? null;
  }

  // Buscar médico responsável (isPrimaryDoctor = true) — task #212
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
    .where(eq(professionalsTable.isPrimaryDoctor, true))
    .limit(1);

  let medicoAssinatura: import("../lib/dieta-pdf").MedicoAssinatura | null = null;
  let signatureLoadFailed = false;
  if (medicoRow) {
    const crmFinal = medicoRow.registrationNumber ?? medicoRow.crm ?? "";
    if (medicoRow.nome && crmFinal) {
      let signatureImageBytes: Buffer | null = null;
      let signatureMime: string | null = null;

      if (medicoRow.signatureUrl) {
        try {
          const objectPath = medicoRow.signatureUrl.replace(/^\/api\/storage/, "");
          const svc = new ObjectStorageService();
          const file = await svc.getObjectEntityFile(objectPath);
          const [buf] = await file.download();
          signatureImageBytes = buf;
          signatureMime = medicoRow.signatureUrl.endsWith(".png") ? "image/png" : "image/jpeg";
        } catch (err) {
          signatureLoadFailed = true;
          req.log?.warn?.(
            { err, signatureUrl: medicoRow.signatureUrl },
            "Falha ao baixar imagem de assinatura do médico — PDF usará linha tracejada no rodapé",
          );
        }
      }

      medicoAssinatura = {
        nome: medicoRow.nome,
        crm: crmFinal,
        registrationCouncil: medicoRow.registrationCouncil ?? "CRM",
        especialidade: medicoRow.especialidade,
        signatureImageBytes,
        signatureMime,
      };
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

  const caloriasAlvo = body.caloriasAlvo ?? 0;
  const tmb = conta.tmb ?? 0;
  const tdee = conta.tdee ?? 0;

  // Gerar PDF (pode levar 30-120 segundos pelo Claude)
  // AbortController garante que a rota responda com 504 antes do gateway cortar a conexão.
  const TIMEOUT_MS = Number(process.env.DIETA_PDF_TIMEOUT_MS ?? 120_000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let pdfBytes: Uint8Array;
      const plano = await getPlanoById(id, EMPRESA_ID);
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

  // Persistir a prescrição no Órgão Dieta
  if (body.clientId) {
    await db.transaction(async (tx) => {
      const [prescricao] = await tx
        .insert(dietaPrescricaoTable)
        .values({
          clientId: body.clientId!,
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
  }

  // Salvar histórico (Object Storage + dieta_planos_emitidos) — task #211
  if (body.clientId) {
    try {
      await ensureDietaPlanosTable();

      const [inserted] = await db
        .insert(dietaPlanosEmitidosTable)
        .values({
          clienteId: body.clientId,
          empresaId: EMPRESA_ID,
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
          pdfBytes: pdfBytes.length,
        })
        .returning({ id: dietaPlanosEmitidosTable.id });

      const planoId = inserted?.id ?? null;
      if (planoId) {
        const pdfStorageKey = await uploadDietaPdf(planoId, Buffer.from(pdfBytes));
        await db
          .update(dietaPlanosEmitidosTable)
          .set({ pdfStorageKey })
          .where(and(
            eq(dietaPlanosEmitidosTable.id, planoId),
            eq(dietaPlanosEmitidosTable.empresaId, EMPRESA_ID),
          ));
      }
    } catch (err) {
      req.log?.error?.({ err }, "Falha ao salvar histórico/PDF do plano nutricional");
      // Não abortar — o PDF ainda será entregue ao CEO
    }
  }

  // Devolver sempre os bytes do PDF — e-mail nunca é enviado aqui (task #215)
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="PlanoNutricional_${nomePaciente.replace(/\s+/g, "_")}.pdf"`,
  );
  res.setHeader("Content-Length", pdfBytes.length.toString());

  // Sinaliza ao CEO quando havia imagem cadastrada mas não foi possível embutir.
  // signatureLoadFailed = erro ao baixar do Object Storage.
  // !signatureImageEmbedded + signatureUrl = erro ao embutir no pdf-lib.
  const hadSignatureUrl = !!medicoRow?.signatureUrl;
  if (hadSignatureUrl && (signatureLoadFailed || !signatureImageEmbedded)) {
    res.setHeader("X-Signature-Image-Failed", "true");
  }

  res.send(Buffer.from(pdfBytes));
});

// -------------------------------------------------------------------------------
// Schema de validação — envio de e-mail pós-revisão (task #215)
// -------------------------------------------------------------------------------
const EnviarPdfEmailSchema = z.object({
  clientId: z.number().int().positive(),
  pdfBase64: z.string().min(1),
  nomePaciente: z.string().min(1).optional(),
  caloriasAlvo: z.number().optional().nullable(),
  estiloAlimentar: z.string().optional().nullable(),
});

// -------------------------------------------------------------------------------
// POST /api/dieta/enviar-pdf-email — envia e-mail após revisão do CEO
// -------------------------------------------------------------------------------
router.post("/dieta/enviar-pdf-email", async (req, res): Promise<void> => {
    const parsed = ReenviarSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  const [cliente] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
    .from(clientsTable)
    .where(and(
      eq(clientsTable.id, body.clientId),
      eq(clientsTable.empresaId, EMPRESA_ID),
    ));

  if (!cliente) {
    res.status(404).json({ error: "Cliente não encontrado", clientId: body.clientId });
    return;
  }

      const emailDestino = emailOverride ?? plano.emailDestino ?? null;
  if (!emailDestino) {
    res.status(422).json({ error: "Cliente sem e-mail cadastrado." });
    return;
  }

  const nomePaciente = body.nomePaciente ?? cliente.name;
  const caloriasAlvo = body.caloriasAlvo ?? 0;

      const pdfBuffer = await readDietaPdf(plano.pdfStorageKey);
  try {
    pdfBuffer = Buffer.from(body.pdfBase64, "base64");
    if (pdfBuffer.length === 0) throw new Error("PDF vazio");
  } catch {
    res.status(400).json({ error: "pdfBase64 inválido ou vazio." });
    return;
  }

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

      const emailResult = await sendGmailMessage({
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

  // Atualizar emailEnviado no histórico mais recente deste cliente
  if (emailResult.success) {
    await db
      .update(dietaPlanosEmitidosTable)
      .set({ emailEnviado: true })
      .where(and(
        eq(dietaPlanosEmitidosTable.clienteId, body.clientId),
        eq(dietaPlanosEmitidosTable.empresaId, EMPRESA_ID),
        eq(dietaPlanosEmitidosTable.emailEnviado, false),
      ))
      .catch(() => { /* não abortar */ });
  }

  res.json({ ok: true, nomePaciente, emailDestino, email: emailResult });
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
    const [clienteCheck] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, EMPRESA_ID)));
    if (!clienteCheck) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const rows = await listPlanosByCliente(clienteId, EMPRESA_ID);
    res.json(
      rows.map((r) => ({
        id: r.id,
        clienteId: r.clienteId,
        nomePaciente: r.nomePaciente,
        objetivo: r.objetivo,
        estrategia: r.estrategia,
        caloriasAlvo: r.caloriasAlvo,
        pesoKg: r.pesoKg,
        alturaCm: r.alturaCm,
        emailDestino: r.emailDestino,
        emailEnviado: r.emailEnviado,
        temPdf: !!r.pdfStorageKey,
        // true quando o PDF existiu (pdfBytes gravado) mas foi expirado (key zerada)
        pdfExpirado: r.pdfBytes !== null && !r.pdfStorageKey,
        pdfBytes: r.pdfBytes,
        emitidoEm: r.emitidoEm,
      })),
    );
  } catch (err) {
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
    if (!id || isNaN(id) || id <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    try {
      const plano = await getPlanoById(id, EMPRESA_ID);
      if (!plano) {
        res.status(404).json({ error: "Plano não encontrado" });
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
      req.log?.error?.({ err }, "Falha ao baixar PDF do plano emitido");
      res.status(500).json({ error: "Falha ao baixar o PDF" });
    }
  },
);

// -------------------------------------------------------------------------------
// POST /api/dieta/planos-emitidos/:id/reenviar
//
// Body (optional): { email?: string }
//   Se `email` for fornecido e válido, o reenvio vai para esse endereço em vez do
//   cadastrado; o campo emailDestino do registro é atualizado para refletir o
//   endereço realmente utilizado no reenvio.
// -------------------------------------------------------------------------------
const ReenviarSchema = z.object({
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

    const emailOverride = parsed.data.email ?? null;

    try {
      const plano = await getPlanoById(id, EMPRESA_ID);
      if (!plano) {
        res.status(404).json({ error: "Plano não encontrado" });
        return;
      }
      if (!plano.pdfStorageKey) {
        res.status(422).json({ error: "PDF não disponível para reenvio" });
        return;
      }

      // Usar override quando fornecido; caso contrário, usar o e-mail gravado no registro
      const emailDestino = emailOverride ?? plano.emailDestino ?? null;
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

      const emailResult = await sendGmailMessage({
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

      if (emailResult.success) {
        // Atualiza emailEnviado=true e, quando houve override, registra o novo destino
        await db
          .update(dietaPlanosEmitidosTable)
          .set({
            emailEnviado: true,
            ...(emailOverride ? { emailDestino: emailOverride } : {}),
          })
          .where(and(
            eq(dietaPlanosEmitidosTable.id, id),
            eq(dietaPlanosEmitidosTable.empresaId, EMPRESA_ID),
          ));
      }

      res.json({ ok: emailResult.success, email: emailResult, emailDestino });
    } catch (err) {
      req.log?.error?.({ err }, "Falha ao reenviar plano emitido");
      res.status(500).json({ error: "Falha ao reenviar o plano" });
    }
  },
);

export default router;
