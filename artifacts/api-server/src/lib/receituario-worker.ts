/**
 * WORKER DO RECEITUÁRIO MAGISTRAL
 *
 * Contém TODA a lógica de entrega de um slot:
 *   - gera PDF assinado (ICP-Brasil / PAdES)
 *   - faz upload na pasta RECEITAS do Drive
 *   - envia e-mail com PDF anexo
 *   - envia WhatsApp
 *   - envia Telegram
 *
 * Exporta também `processarReceituarioDiario()` (cron 06:00 BRT)
 * e `liberarSlot(id)` usada pelas rotas de liberação manual.
 */
import { db, receitasAgendadasTable, receitasAgendadasSlotsTable, clientsTable, professionalsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { generateReceituarioPdf } from "./receituario-pdf";
import { ensureClientFolderStructure, uploadFileToDrive } from "./google-drive";
import { sendGmailMessage, isGmailConnected } from "./google-gmail";
import { sendWhatsapp } from "./whatsapp";
import { sendTelegram, isTelegramConfigured } from "./telegram";
import { logger } from "./logger";

// ─── helpers ─────────────────────────────────────────────────────────────────
function hojeStr(): string {
  const now = new Date();
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return brt.toISOString().split("T")[0];
}
function fmtBR(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Motor de liberação de um slot ───────────────────────────────────────────
export async function liberarSlot(slotId: number): Promise<void> {
  // 1. Carregar slot + agenda + cliente + médico responsável
  const [slot] = await db
    .select()
    .from(receitasAgendadasSlotsTable)
    .where(eq(receitasAgendadasSlotsTable.id, slotId))
    .limit(1);

  if (!slot) throw new Error(`Slot ${slotId} não encontrado`);
  if (slot.status === "ENTREGUE") return; // idempotente

  const [agenda] = await db
    .select()
    .from(receitasAgendadasTable)
    .where(eq(receitasAgendadasTable.id, slot.agendaId))
    .limit(1);

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, slot.clientId))
    .limit(1);

  const [medico] = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.isPrimaryDoctor, true))
    .limit(1);

  // 2. Marcar LIBERADA + portal (imediatamente, idempotente mesmo se PDF falhar)
  await db
    .update(receitasAgendadasSlotsTable)
    .set({
      status: "LIBERADA",
      disponivelPortalEm: new Date(),
      tentativas: (slot.tentativas ?? 0) + 1,
      ultimaTentativaEm: new Date(),
    } as never)
    .where(eq(receitasAgendadasSlotsTable.id, slotId));

  const formulas = (slot.formulas ?? []) as Array<Record<string, string>>;
  const canais   = (slot.canais ?? agenda?.canaisPadrao ?? ["email", "whatsapp", "portal"]) as string[];

  // 3. Gerar PDF assinado ICP-Brasil
  let pdfBuffer: Buffer | null = null;
  let driveFileId: string | null = null;
  let driveWebViewLink: string | null = null;

  try {
    const pdfBytes = await generateReceituarioPdf({
      clientName:       client?.name ?? "—",
      clientCpf:        client?.cpf ?? null,
      clientPhone:      client?.phone ?? null,
      professionalName: medico?.name ?? null,
      professionalCrm:  medico?.crm ?? null,
      nomeSerie:     agenda?.nome ?? "Receituário",
      nomeSlot:      slot.nome,
      dataLiberacao: slot.dataLiberacao,
      formulas: formulas.map((f) => ({
        nome:           f.nome ?? "",
        ativoPrincipal: f.ativoPrincipal ?? null,
        posologia:      f.posologia ?? null,
        dose:           f.dose ?? null,
        via:            f.via ?? null,
        frequencia:     f.frequencia ?? null,
        observacao:     f.observacao ?? null,
      })),
    });
    pdfBuffer = Buffer.from(pdfBytes);
    const pdfBase64 = pdfBuffer.toString("base64");

    await db
      .update(receitasAgendadasSlotsTable)
      .set({ pdfUrl: `data:application/pdf;base64,${pdfBase64}` } as never)
      .where(eq(receitasAgendadasSlotsTable.id, slotId));

    logger.info({ slotId }, "[receituario] PDF gerado e assinado (ICP-Brasil)");
  } catch (err) {
    logger.warn({ err: (err as Error)?.message, slotId }, "[receituario] falha ao gerar PDF — entrega continua sem anexo");
  }

  // 4. Upload Drive (pasta RECEITAS) — best-effort
  if (pdfBuffer && canais.includes("drive") && client) {
    try {
      const structure = await ensureClientFolderStructure(client.name, client.cpf ?? "");
      const folderId  = structure.subfolders["RECEITAS"] ?? structure.clientFolderId;
      const safeName  = client.name.replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase();
      const dt        = slot.dataLiberacao.slice(2).replace(/-/g, "."); // YY.MM.DD
      const fileName  = `${dt} RECEITA MAGISTRAL ${safeName} #${slotId}.pdf`;
      const up = await uploadFileToDrive(folderId, fileName, "application/pdf", pdfBuffer, true);
      driveFileId      = up.fileId;
      driveWebViewLink = up.webViewLink;
      await db
        .update(receitasAgendadasSlotsTable)
        .set({ driveFileId, driveWebViewLink, enviadoDriveEm: new Date() } as never)
        .where(eq(receitasAgendadasSlotsTable.id, slotId));
      logger.info({ slotId, driveFileId }, "[receituario] PDF enviado ao Drive (RECEITAS)");
    } catch (err) {
      logger.warn({ err: (err as Error)?.message, slotId }, "[receituario] falha no Drive");
    }
  }

  // 5. E-mail com PDF anexo — best-effort
  if (canais.includes("email") && client?.email) {
    try {
      if (await isGmailConnected()) {
        const driveLink = driveWebViewLink
          ? `<p><a href="${driveWebViewLink}" style="color:#45B8CC">📂 Abrir no Google Drive</a></p>`
          : "";
        const formulasHtml = formulas
          .map((f) =>
            `<tr>
              <td style="padding:6px 10px;border-bottom:1px solid #1e2840;font-weight:600;color:#e2e8f0">${f.nome ?? ""}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #1e2840;color:#94a3b8">${[f.posologia, f.dose].filter(Boolean).join(" — ") || "—"}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #1e2840;color:#94a3b8">${f.via ?? "—"}</td>
            </tr>`,
          )
          .join("");

        const html = `
          <div style="font-family:Inter,sans-serif;background:#0a0f1c;min-height:100vh;padding:32px 0">
            <div style="max-width:560px;margin:0 auto;background:#151c2e;border-radius:8px;overflow:hidden;border:1px solid #1e2840">
              <div style="background:#151c2e;padding:28px 32px 16px;border-bottom:2px solid #c2a05a">
                <span style="font-size:22px;font-weight:800;color:#c2a05a;letter-spacing:2px">PAXTER</span>
                <span style="display:block;font-size:9px;color:#45B8CC;letter-spacing:3px;text-transform:uppercase;margin-top:2px">Clinical Intelligence System</span>
              </div>
              <div style="padding:28px 32px">
                <h2 style="color:#f1f5f9;font-size:16px;margin:0 0 6px">Receituário Magistral Disponível</h2>
                <p style="color:#94a3b8;font-size:13px;margin:0 0 20px">
                  Olá, <strong style="color:#e2e8f0">${client.name}</strong>.<br>
                  Sua receita <em style="color:#45B8CC">${slot.nome}</em> foi liberada e está pronta para retirada na farmácia de manipulação.
                </p>
                <table style="width:100%;border-collapse:collapse;background:#0f1623;border-radius:6px;overflow:hidden">
                  <thead>
                    <tr style="background:#0a0f1c">
                      <th style="padding:8px 10px;text-align:left;color:#c2a05a;font-size:10px;text-transform:uppercase;letter-spacing:1px">Fórmula</th>
                      <th style="padding:8px 10px;text-align:left;color:#c2a05a;font-size:10px;text-transform:uppercase;letter-spacing:1px">Posologia / Dose</th>
                      <th style="padding:8px 10px;text-align:left;color:#c2a05a;font-size:10px;text-transform:uppercase;letter-spacing:1px">Via</th>
                    </tr>
                  </thead>
                  <tbody>${formulasHtml}</tbody>
                </table>
                <div style="margin-top:20px;padding:12px 16px;background:#0f1623;border-left:3px solid #45B8CC;border-radius:4px">
                  <p style="margin:0;color:#94a3b8;font-size:12px">
                    📅 Data de liberação: <strong style="color:#e2e8f0">${fmtBR(slot.dataLiberacao)}</strong>
                  </p>
                </div>
                ${driveLink}
                <p style="color:#475569;font-size:11px;margin-top:24px;line-height:1.6">
                  O receituário assinado digitalmente (ICP-Brasil / PAdES) está anexado a este e-mail.<br>
                  Apresente-o ao farmacêutico responsável pela manipulação.
                </p>
              </div>
              <div style="background:#0a0f1c;padding:14px 32px;text-align:center;border-top:1px solid #1e2840">
                <span style="color:#334155;font-size:10px">PAXTER Clinical Intelligence System — documento assinado digitalmente</span>
              </div>
            </div>
          </div>`;

        const attachments = pdfBuffer
          ? [{ filename: `Receituario_${slot.nome.replace(/\s+/g, "_")}_${slotId}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
          : [];

        const result = await sendGmailMessage({
          to: client.email,
          subject: `PAXTER | Receituário Magistral | ${slot.nome}`,
          html,
          attachments,
        });

        if (result.success) {
          await db
            .update(receitasAgendadasSlotsTable)
            .set({ enviadoEmailEm: new Date() } as never)
            .where(eq(receitasAgendadasSlotsTable.id, slotId));
          logger.info({ slotId, to: client.email }, "[receituario] e-mail enviado");
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error)?.message, slotId }, "[receituario] falha no e-mail");
    }
  }

  // 6. WhatsApp — best-effort (truncar em 1.500 chars — Twilio 21617)
  if (canais.includes("whatsapp") && client?.phone) {
    try {
      const formulasTexto = formulas
        .map((f, i) => `${i + 1}. *${f.nome}* — ${[f.posologia, f.dose].filter(Boolean).join(" / ") || "ver receita"}`)
        .join("\n");
      const driveInfo = driveWebViewLink ? `\n\n📂 Drive: ${driveWebViewLink}` : "";
      const msg = [
        `🧪 *PAXTER — Receituário Magistral*`,
        ``,
        `Olá, ${client.name}!`,
        `Sua receita *${slot.nome}* está pronta.`,
        ``,
        `*Fórmulas:*`,
        formulasTexto,
        ``,
        `📅 Liberada em: ${fmtBR(slot.dataLiberacao)}`,
        driveInfo,
        ``,
        `Apresente o PDF (enviado por e-mail) ao farmacêutico responsável.`,
      ].join("\n").trim();

      const msgFinal = msg.length > 1500 ? msg.slice(0, 1497) + "…" : msg;

      const r = await sendWhatsapp(client.phone, msgFinal, {
        clienteId: client.id,
        contexto: `receituario:slot:${slotId}`,
      });
      if (r.sent || r.via === "link") {
        await db
          .update(receitasAgendadasSlotsTable)
          .set({ enviadoWhatsappEm: new Date() } as never)
          .where(eq(receitasAgendadasSlotsTable.id, slotId));
        logger.info({ slotId, via: r.via }, "[receituario] WhatsApp enviado");
      }
    } catch (err) {
      logger.warn({ err: (err as Error)?.message, slotId }, "[receituario] falha no WhatsApp");
    }
  }

  // 7. Telegram — best-effort
  if (canais.includes("telegram") && client?.telegramChatId) {
    try {
      if (await isTelegramConfigured()) {
        const formulasTexto = formulas
          .map((f, i) => `${i + 1}. <b>${f.nome}</b> — ${[f.posologia, f.dose].filter(Boolean).join(" / ") || "ver receita"}`)
          .join("\n");
        const driveInfo = driveWebViewLink
          ? `\n\n📂 <a href="${driveWebViewLink}">Abrir no Drive</a>`
          : "";
        const msg = [
          `🧪 <b>PAXTER — Receituário Magistral</b>`,
          ``,
          `Olá, ${client.name}!`,
          `Receita <b>${slot.nome}</b> liberada em ${fmtBR(slot.dataLiberacao)}.`,
          ``,
          `<b>Fórmulas:</b>`,
          formulasTexto,
          driveInfo,
        ].join("\n").trim();

        const r = await sendTelegram(client.telegramChatId, msg);
        if (r.ok) {
          await db
            .update(receitasAgendadasSlotsTable)
            .set({ enviadoTelegramEm: new Date() } as never)
            .where(eq(receitasAgendadasSlotsTable.id, slotId));
          logger.info({ slotId }, "[receituario] Telegram enviado");
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error)?.message, slotId }, "[receituario] falha no Telegram");
    }
  }

  // 8. Marcar ENTREGUE (todos os canais tentados)
  await db
    .update(receitasAgendadasSlotsTable)
    .set({ status: "ENTREGUE" } as never)
    .where(eq(receitasAgendadasSlotsTable.id, slotId));

  logger.info({ slotId }, "[receituario] slot marcado ENTREGUE");
}

// ─── Processamento diário (cron 06:00 BRT) ───────────────────────────────────
export async function processarReceituarioDiario(): Promise<{ processados: number; falhas: number }> {
  const hoje = hojeStr();

  const pendentes = await db
    .select({ id: receitasAgendadasSlotsTable.id })
    .from(receitasAgendadasSlotsTable)
    .where(
      and(
        eq(receitasAgendadasSlotsTable.status, "AGUARDANDO"),
        lte(receitasAgendadasSlotsTable.dataLiberacao, hoje),
      ),
    );

  logger.info({ total: pendentes.length, hoje }, "[receituario-worker] iniciando processamento diário");

  let processados = 0;
  let falhas = 0;

  for (const { id } of pendentes) {
    try {
      await liberarSlot(id);
      processados++;
    } catch (err) {
      falhas++;
      logger.error({ err: (err as Error)?.message, slotId: id }, "[receituario-worker] falha ao liberar slot");
    }
  }

  logger.info({ processados, falhas }, "[receituario-worker] concluído");
  return { processados, falhas };
}
