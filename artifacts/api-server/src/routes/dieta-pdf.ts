// ============================================================================
// ROTA: Gerador de PDF de Plano Nutricional — PADAXOR
// POST /api/dieta/emitir-pdf
//   Recebe parâmetros antropométricos + clientId opcional
//   Gera PDF completo via Claude + pdf-lib
//   Opcionalmente envia por e-mail (campo enviarEmail: true)
// ============================================================================

import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { gerarDietaPdf } from "../lib/dieta-pdf";
import { calcularTdee } from "../lib/dieta-calc";
import { sendGmailMessage } from "../lib/google-gmail";
import { renderPaxterEmail } from "../lib/messaging/render-email";
import { baseUrlFromEnv } from "../lib/messaging/base-url";
import type { PaxterDoc } from "../lib/messaging/types";

const router: IRouter = Router();

const EmitirPdfSchema = z.object({
  clientId: z.number().int().positive().optional().nullable(),
  // Dados antropométricos (obrigatórios se clientId não tiver dados no DB)
  nomePaciente: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  sexo: z.enum(["F", "M"]).default("F"),
  objetivo: z.string().default("hipertrofia e definição muscular"),
  estiloAlimentar: z.string().optional().nullable(),
  pesoKg: z.number().positive(),
  alturaCm: z.number().positive(),
  idade: z.number().int().positive(),
  nivelAtividade: z.enum(["sedentario", "leve", "moderado", "intenso", "atleta"]).default("moderado"),
  caloriasAlvo: z.number().positive().optional().nullable(),
  enviarEmail: z.boolean().default(false),
});

router.post("/dieta/emitir-pdf", async (req, res): Promise<void> => {
  const parsed = EmitirPdfSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  // Tentar buscar dados do cliente se clientId fornecido
  let nomePaciente = body.nomePaciente ?? "Paciente";
  let emailDestino = body.email ?? null;

  if (body.clientId) {
    const [cliente] = await db
      .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
      .from(clientsTable)
      .where(eq(clientsTable.id, body.clientId));
    if (!cliente) {
      res.status(404).json({ error: "Cliente não encontrado", clientId: body.clientId });
      return;
    }
    nomePaciente = body.nomePaciente ?? cliente.name;
    emailDestino = body.email ?? cliente.email ?? null;
  }

  // Calcular TDEE/meta se não fornecidos
  const conta = calcularTdee({
    pesoKg: body.pesoKg,
    alturaCm: body.alturaCm,
    idade: body.idade,
    sexo: body.sexo,
    nivelAtividade: body.nivelAtividade,
    objetivo: body.objetivo,
  });

  const caloriasAlvo = body.caloriasAlvo ?? conta.caloriasAlvo ?? Math.round(body.pesoKg * 25);
  const tmb = conta.tmb ?? 0;
  const tdee = conta.tdee ?? 0;

  // Gerar PDF (pode levar 30-90 segundos pelo Claude)
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await gerarDietaPdf({
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
    });
  } catch (err) {
    req.log?.error?.({ err }, "Falha ao gerar PDF de dieta");
    res.status(500).json({
      error: "Falha ao gerar o plano nutricional",
      detail: (err as Error)?.message ?? String(err),
    });
    return;
  }

  // Enviar por e-mail se solicitado
  let emailResult: { success: boolean; messageId?: string; error?: string } | null = null;
  if (body.enviarEmail && emailDestino) {
    const primeiroNome = nomePaciente.split(" ")[0];
    const doc: PaxterDoc = {
      titulo: "Seu Plano Nutricional Personalizado",
      paragrafos: [
        `Olá, ${primeiroNome}!`,
        "Preparamos o seu Plano Alimentar Personalizado com base nos seus dados antropométricos e objetivos clínicos.",
        `Meta energética: ${caloriasAlvo} kcal/dia · Estratégia: ${body.estiloAlimentar ?? "Hiperproteica para hipertrofia e definição muscular"}`,
        "O PDF em anexo contém todas as refeições com 3 opções por refeição, guia de suplementação, guia de treino e tabela de acompanhamento de 8 semanas.",
        "Em caso de dúvidas, entre em contato com a equipe PADAXOR.",
      ],
      notaRodape: "Este plano é personalizado e intransferível. O acompanhamento médico é indispensável.",
    };
    const baseUrl = baseUrlFromEnv();
    const html = renderPaxterEmail(doc, baseUrl);

    emailResult = await sendGmailMessage({
      to: emailDestino,
      subject: `Plano Nutricional Personalizado — ${nomePaciente}`,
      html,
      attachments: [
        {
          filename: `PlanoNutricional_${nomePaciente.replace(/\s+/g, "_")}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: "application/pdf",
        },
      ],
    });
  }

  // Se pediu download (sem enviar email) — devolve o PDF diretamente
  if (!body.enviarEmail) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="PlanoNutricional_${nomePaciente.replace(/\s+/g, "_")}.pdf"`,
    );
    res.setHeader("Content-Length", pdfBytes.length.toString());
    res.send(Buffer.from(pdfBytes));
    return;
  }

  res.json({
    ok: true,
    nomePaciente,
    caloriasAlvo,
    tmb,
    tdee,
    emailDestino,
    email: emailResult,
    pdfBytes: Buffer.from(pdfBytes).toString("base64"),
  });
});

export default router;
