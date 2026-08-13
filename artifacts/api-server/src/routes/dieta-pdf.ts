// ============================================================================
// ROTA: Gerador de PDF de Plano Nutricional — PADAXOR
//
// POST /api/dieta/emitir-pdf
//   Gera PDF via Claude + pdf-lib; busca médico responsável para assinar;
//   persiste prescrição no Órgão Dieta; salva PDF no Object Storage e
//   registra histórico em dieta_planos_emitidos.
//   clientId é OPCIONAL para geração e download direto; obrigatório para
//   persistir prescrição e histórico.
//
// GET  /api/dieta/planos-emitidos?clienteId=N      [requireCollaborator]
//   Lista histórico de planos emitidos para um cliente.
//
// GET  /api/dieta/planos-emitidos/:id/pdf          [requireCollaborator]
//   Baixa o PDF armazenado (anti-IDOR: filtra por empresa_id).
//
// POST /api/dieta/planos-emitidos/:id/reenviar     [requireCollaborator]
//   Reenvia o PDF ao destinatário ORIGINAL gravado no registro.
// ============================================================================

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
  nivelAtividade: z.enum(["sedentario", "leve", "moderado", "intenso", "atleta"]).default("moderado"),
  caloriasAlvo: z.number().positive().optional().nullable(),
  enviarEmail: z.boolean().default(false),
});

// ─── POST /api/dieta/emitir-pdf ───────────────────────────────────────────────
router.post("/dieta/emitir-pdf", async (req, res): Promise<void> => {
  const parsed = EmitirPdfSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  // Resolver nome e e-mail do paciente
  let nomePaciente = body.nomePaciente ?? "Paciente";
  let emailDestino = body.email ?? null;

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
        } catch {
          // Assinatura indisponível — continua sem imagem
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

  const caloriasAlvo = body.caloriasAlvo ?? conta.caloriasAlvo ?? Math.round(body.pesoKg * 25);
  const tmb = conta.tmb ?? 0;
  const tdee = conta.tdee ?? 0;

  // Gerar PDF (pode levar 30-120 segundos pelo Claude)
  // AbortController garante que a rota responda com 504 antes do gateway cortar a conexão.
  const TIMEOUT_MS = Number(process.env.DIETA_PDF_TIMEOUT_MS ?? 120_000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let pdfBytes: Uint8Array;
  let plano: Awaited<ReturnType<typeof gerarDietaPdf>>["plano"];
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

  // Persistir a prescrição no Órgão Dieta (dieta_prescricao + dieta_prescricao_item)
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

  // ── Salvar histórico (Object Storage + dieta_planos_emitidos) — task #211
  let planoId: number | null = null;
  let pdfStorageKey: string | null = null;
  let storageError: string | null = null;

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

      planoId = inserted?.id ?? null;

      if (planoId) {
        pdfStorageKey = await uploadDietaPdf(planoId, Buffer.from(pdfBytes));
        await db
          .update(dietaPlanosEmitidosTable)
          .set({ pdfStorageKey })
          .where(and(
            eq(dietaPlanosEmitidosTable.id, planoId),
            eq(dietaPlanosEmitidosTable.empresaId, EMPRESA_ID),
          ));
      }
    } catch (err) {
      storageError = (err as Error)?.message ?? String(err);
      req.log?.error?.({ err }, "Falha ao salvar histórico/PDF do plano nutricional");
    }
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

    // Atualizar emailEnviado no histórico
    if (emailResult.success && planoId) {
      await db
        .update(dietaPlanosEmitidosTable)
        .set({ emailEnviado: true })
        .where(and(
          eq(dietaPlanosEmitidosTable.id, planoId),
          eq(dietaPlanosEmitidosTable.empresaId, EMPRESA_ID),
        )).catch(() => { /* não abortar */ });
    }
  }

  // Download direto (sem e-mail)
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
    planoId,
    pdfStorageKey,
    historicoSalvo: planoId !== null && pdfStorageKey !== null,
    historicoErro: storageError ?? undefined,
    pdfBytes: Buffer.from(pdfBytes).toString("base64"),
  });
});

// ─── GET /api/dieta/planos-emitidos ───────────────────────────────────────────
router.get("/dieta/planos-emitidos", requireCollaborator, async (req, res): Promise<void> => {
  const clienteId = Number(req.query.clienteId);
  if (!clienteId || isNaN(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clienteId é obrigatório e deve ser um inteiro positivo" });
    return;
  }

  try {
    const [cliente] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, EMPRESA_ID)));
    if (!cliente) {
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
        pdfBytes: r.pdfBytes,
        emitidoEm: r.emitidoEm,
      })),
    );
  } catch (err) {
    req.log?.error?.({ err }, "Falha ao listar planos emitidos");
    res.status(500).json({ error: "Falha ao carregar histórico" });
  }
});

// ─── GET /api/dieta/planos-emitidos/:id/pdf ───────────────────────────────────
router.get("/dieta/planos-emitidos/:id/pdf", requireCollaborator, async (req, res): Promise<void> => {
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
});

// ─── POST /api/dieta/planos-emitidos/:id/reenviar ─────────────────────────────
router.post("/dieta/planos-emitidos/:id/reenviar", requireCollaborator, async (req, res): Promise<void> => {
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
      res.status(422).json({ error: "PDF não disponível para reenvio" });
      return;
    }

    const emailDestino = plano.emailDestino;
    if (!emailDestino) {
      res.status(422).json({ error: "Este plano não tem e-mail de destino" });
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
      notaRodape: "Este plano é personalizado e intransferível. O acompanhamento médico é indispensável.",
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
      await db
        .update(dietaPlanosEmitidosTable)
        .set({ emailEnviado: true })
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
});

export default router;
