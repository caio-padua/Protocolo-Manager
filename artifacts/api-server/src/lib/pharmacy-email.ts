// Email noturno em lote para farmácias (22:00 BRT). Agrupa receitas pendentes
// de cada farmácia do dia e envia em um único email com os PDFs anexados.
import { db, dispatchLogTable, pharmaciesTable, recipesTable, prescriptionsTable, clientsTable } from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { sendGmailMessage, isGmailConnected } from "./google-gmail";
import { uploadFileToDrive, ensurePharmacyDayFolder, sharePharmacyFolder } from "./google-drive";
import { logger } from "./logger";

function todayBR(): string {
  const now = new Date();
  // BRT = UTC-3
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function formatDateBR(d: Date): string {
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const day = String(brt.getUTCDate()).padStart(2, "0");
  const month = String(brt.getUTCMonth() + 1).padStart(2, "0");
  const year = brt.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export interface BatchResult {
  pharmacies: number;
  recipesSent: number;
  emailsSent: number;
  errors: string[];
}

// Envia o lote noturno. Pode ser chamado pelo cron ou manualmente via rota.
export async function sendNightlyPharmacyBatch(forDate?: string): Promise<BatchResult> {
  const result: BatchResult = { pharmacies: 0, recipesSent: 0, emailsSent: 0, errors: [] };
  const dateStr = forDate || todayBR();

  // Receitas que ainda não foram enviadas em lote por email (emailSentAt nulo).
  const pendingRecipes = await db
    .select()
    .from(recipesTable)
    .where(and(eq(recipesTable.batchDate, dateStr), isNull(recipesTable.emailSentAt)));

  if (pendingRecipes.length === 0) {
    logger.info({ dateStr }, "Nenhuma receita pendente para o lote noturno");
    return result;
  }

  // Agrupa por farmácia.
  const byPharmacy = new Map<number, typeof pendingRecipes>();
  for (const r of pendingRecipes) {
    if (r.pharmacyId == null) continue;
    if (!byPharmacy.has(r.pharmacyId)) byPharmacy.set(r.pharmacyId, []);
    byPharmacy.get(r.pharmacyId)!.push(r);
  }

  const gmailOk = await isGmailConnected();

  for (const [pharmacyId, recipes] of byPharmacy) {
    result.pharmacies++;
    const [pharmacy] = await db.select().from(pharmaciesTable).where(eq(pharmaciesTable.id, pharmacyId));
    if (!pharmacy) {
      result.errors.push(`Farmácia ${pharmacyId} não encontrada`);
      continue;
    }

    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    const rows: string[] = [];

    for (const recipe of recipes) {
      let clientName = "";
      try {
        const [presc] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, recipe.prescriptionId));
        if (presc?.clientId) {
          const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, presc.clientId));
          clientName = client?.name ?? "";
        }
      } catch {
        /* best-effort */
      }

      if (recipe.pdfData) {
        const buf = Buffer.from(recipe.pdfData, "base64");
        const fname = recipe.fileName || `receita-${recipe.id}.pdf`;
        attachments.push({ filename: fname, content: buf, contentType: "application/pdf" });
      }
      rows.push(
        `<tr><td style="padding:6px;border:1px solid #ddd">${recipe.title ?? "Receita"}</td><td style="padding:6px;border:1px solid #ddd">${clientName}</td><td style="padding:6px;border:1px solid #ddd">${recipe.sncrNumber ?? "-"}</td></tr>`,
      );
    }

    const html = `
      <div style="font-family:Arial,sans-serif;color:#1a1a1a">
        <h2 style="color:#3D7A7A">Instituto Padua — Receitas do dia ${formatDateBR(new Date())}</h2>
        <p>Prezada equipe <strong>${pharmacy.name}</strong>,</p>
        <p>Seguem em anexo as receitas emitidas hoje. Total: <strong>${recipes.length}</strong>.</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <thead><tr style="background:#e8f4f4">
            <th style="padding:6px;border:1px solid #ddd;text-align:left">Receita</th>
            <th style="padding:6px;border:1px solid #ddd;text-align:left">Cliente</th>
            <th style="padding:6px;border:1px solid #ddd;text-align:left">Nº SNCR</th>
          </tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
        <p style="margin-top:16px;font-size:12px;color:#666">As receitas também estão disponíveis na pasta compartilhada do Google Drive.</p>
      </div>`;

    // Compartilha a pasta do dia (best-effort).
    try {
      const { dayFolderId } = await ensurePharmacyDayFolder(pharmacy.name, dateStr);
      if (pharmacy.email) await sharePharmacyFolder(dayFolderId, pharmacy.email);
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Falha ao compartilhar pasta da farmácia");
    }

    if (gmailOk && pharmacy.email) {
      const res = await sendGmailMessage({
        to: pharmacy.email,
        subject: `Instituto Padua | Receitas ${formatDateBR(new Date())} | ${pharmacy.name}`,
        html,
        attachments,
      });
      if (res.success) {
        result.emailsSent++;
        result.recipesSent += recipes.length;
        const ids = recipes.map((r) => r.id);
        const now = new Date();
        await db.update(recipesTable).set({ emailSentAt: now }).where(inArray(recipesTable.id, ids));
        await db.insert(dispatchLogTable).values({
          pharmacyId,
          channel: "email_batch",
          status: "sent",
          recipeCount: recipes.length,
          detail: `Lote ${dateStr} enviado para ${pharmacy.email}`,
        });
      } else {
        result.errors.push(`Email farmácia ${pharmacy.name}: ${res.error}`);
        await db.insert(dispatchLogTable).values({
          pharmacyId,
          channel: "email_batch",
          status: "failed",
          recipeCount: recipes.length,
          detail: res.error ?? "erro desconhecido",
        });
      }
    } else {
      result.errors.push(`Gmail indisponível ou farmácia ${pharmacy.name} sem email`);
    }
  }

  logger.info(result, "Lote noturno de farmácias concluído");
  return result;
}
