// -- ROTA: Gerador de PDF de Plano Nutricional -- PADAXOR
// POST /api/dieta/emitir-pdf
//   Recebe parametros antropometricos + clientId opcional
//   Gera PDF completo via Claude + pdf-lib
//   Opcionalmente envia por e-mail (campo enviarEmail: true)

import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  clientsTable,
  professionalsTable,
  dietaPrescricaoTable,
  dietaPrescricaoItemTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { gerarDietaPdf } from "../lib/dieta-pdf";
import { calcularTdee } from "../lib/dieta-calc";
import { sendGmailMessage } from "../lib/google-gmail";
import { renderPaxterEmail } from "../lib/messaging/render-email";
import { baseUrlFromEnv } from "../lib/messaging/base-url";
import type { PaxterDoc } from "../lib/messaging/types";
import { ObjectStorageService } from "../lib/objectStorage";

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

  // Buscar médico responsável (isPrimaryDoctor = true)
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
  if (medicoRow) {
    // Preferir registrationNumber (novo campo) se disponível, fallback para crm (legado)
    const crmFinal = medicoRow.registrationNumber ?? medicoRow.crm ?? "";
    if (medicoRow.nome && crmFinal) {
      let signatureImageBytes: Buffer | null = null;
      let signatureMime: string | null = null;

      if (medicoRow.signatureUrl) {
        try {
          // signatureUrl é "/api/storage/objects/uploads/signatures/xxx.ext"
          // getObjectEntityFile espera "/objects/uploads/signatures/xxx.ext"
          const objectPath = medicoRow.signatureUrl.replace(/^\/api\/storage/, "");
          const svc = new ObjectStorageService();
          const file = await svc.getObjectEntityFile(objectPath);
          const [buf] = await file.download();
          signatureImageBytes = buf;
          // Inferir MIME pelo nome do arquivo
          signatureMime = medicoRow.signatureUrl.endsWith(".png") ? "image/png" : "image/jpeg";
        } catch {
          // Assinatura indisponível no storage — continua sem imagem (placeholder)
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
  let plano: Awaited<ReturnType<typeof gerarDietaPdf>>["plano"];
  try {
    const resultado = await gerarDietaPdf({
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
    });
    pdfBytes = resultado.pdfBytes;
    plano = resultado.plano;
  } catch (err) {
    req.log?.error?.({ err }, "Falha ao gerar PDF de dieta");
    res.status(500).json({
      error: "Falha ao gerar o plano nutricional",
      detail: (err as Error)?.message ?? String(err),
    });
    return;
  }

  // Persistir a prescrição REAL na tabela do Órgão Dieta (dieta_prescricao +
  // dieta_prescricao_item), para que apareça no histórico do cliente igual a
  // qualquer cardápio montado manualmente na tela "Montar cardápio". Sem isso,
  // o PDF fica desconectado do sistema (não aparece em GET /dieta/prescricoes).
  let prescricaoId: number | null = null;
  if (body.clientId) {
    prescricaoId = await db.transaction(async (tx) => {
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
          observacao: "Plano nutricional emitido em PDF (opção 1 de cada refeição registrada aqui; PDF completo tem 3 opções).",
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

      return prescricao.id;
    });
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
    prescricaoId,
    pdfBytes: Buffer.from(pdfBytes).toString("base64"),
  });
});

export default router;
