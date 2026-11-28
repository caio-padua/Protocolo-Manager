import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, paymentsTable } from "@workspace/db";
import { asaasCreateCharge, asaasCreateCustomer } from "./asaas";
import { sendTelegram } from "./telegram";
import { escaparHtmlTelegram } from "./orientacao-texto";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual";
import { brtISODate } from "./brt";
import { recordClinicalDocumentReissueEvent } from "./clinical-document-reissue-policy";

function nextBrtDay(): string {
  const day = brtISODate();
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function createAndSendReissueCharge(
  requestId: string,
  chatId: string,
): Promise<{ sent: boolean; error?: string; invoiceUrl?: string }> {
  const claim = await db.execute(sql`
    UPDATE clinical_document_reissue_requests
       SET payment_status='pending', payment_provider='asaas_creating',
           eligibility_reason='Criação de cobrança iniciada após consentimento explícito do cliente.',
           updated_at=NOW()
     WHERE id=${requestId}::bigint AND request_status='awaiting_payment'
       AND payment_status='unverified' AND payment_provider IS NULL
       AND client_consent_at IS NOT NULL AND document_pdf_sha256 IS NOT NULL
     RETURNING id,client_id,empresa_id,location_id,fee_amount
  `);
  const row = claim.rows[0] as {
    id: string | number; client_id: number | string; empresa_id: number | string;
    location_id: number | string; fee_amount: number | string | null;
  } | undefined;
  if (!row) return { sent: false, error: "cobranca_ja_iniciada_ou_solicitacao_bloqueada" };

  const id = String(row.id);
  const clientId = Number(row.client_id);
  const empresaId = Number(row.empresa_id);
  const locationId = Number(row.location_id);
  const amount = Number(row.fee_amount);
  if (!Number.isFinite(amount) || amount < 5) {
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET payment_status='unverified',payment_provider='asaas_unknown',
          eligibility_reason='Valor de cobrança inválido; requer conferência humana.',updated_at=NOW()
      WHERE id=${id}::bigint AND payment_provider='asaas_creating'`);
    return { sent: false, error: "valor_de_cobranca_invalido" };
  }

  const clientResult = await db.execute(sql`SELECT id,empresa_id,location_id,name,cpf,email,phone,
      asaas_customer_id,telegram_chat_id,status,deleted_at
    FROM clients WHERE id=${clientId} LIMIT 1`);
  const client = clientResult.rows[0] as {
    id: number | string; empresa_id: number | string; location_id: number | string;
    name: string; cpf: string | null; email: string | null; phone: string | null;
    asaas_customer_id: string | null; telegram_chat_id: string | null;
    status: string; deleted_at: Date | string | null;
  } | undefined;
  if (!client || Number(client.empresa_id) !== empresaId || Number(client.location_id) !== locationId ||
      client.status !== "active" || client.deleted_at || !client.telegram_chat_id ||
      client.telegram_chat_id !== chatId ||
      !await vinculoTelegramAtualUnico(db, { clienteId: clientId, empresaId, chatId })) {
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET payment_status='unverified',payment_provider='asaas_unknown',
          eligibility_reason='Identidade ou canal de cobrança não pôde ser confirmado.',updated_at=NOW()
      WHERE id=${id}::bigint AND payment_provider='asaas_creating'`);
    return { sent: false, error: "identidade_ou_canal_nao_confirmado" };
  }
  if (!client.asaas_customer_id && !client.cpf) {
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET payment_status='unverified',payment_provider='asaas_unknown',
          eligibility_reason='O cadastro precisa de CPF para criar a cobrança no provedor.',updated_at=NOW()
      WHERE id=${id}::bigint AND payment_provider='asaas_creating'`);
    return { sent: false, error: "cadastro_sem_documento_para_cobranca" };
  }

  let createdChargeId: string | null = null;
  try {
    let customerId = client.asaas_customer_id;
    if (!customerId) {
      const customer = await asaasCreateCustomer({
        name: client.name,
        cpfCnpj: client.cpf!,
        email: client.email,
        phone: client.phone,
      });
      customerId = customer.id;
      await db.execute(sql`UPDATE clients SET asaas_customer_id=${customerId} WHERE id=${clientId}`);
    }

    const dueDate = nextBrtDay();
    const charge = await asaasCreateCharge({
      customerId,
      value: amount,
      dueDate,
      description: `PaxMed - segunda via de documento - solicitação ${id}`,
      externalReference: `paxmed_reissue:${id}`,
    });
    createdChargeId = charge.id;
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET payment_provider='asaas',asaas_charge_id=${charge.id},asaas_invoice_url=${charge.invoiceUrl},
          eligibility_reason='Cobrança criada; aguardando confirmação do provedor.',updated_at=NOW()
      WHERE id=${id}::bigint AND payment_provider='asaas_creating'`);
    await recordClinicalDocumentReissueEvent({
      requestId: id,
      empresaId,
      locationId,
      eventType: "payment_charge_created",
      details: { provider: "asaas", amount, dueDate },
    });
    try {
      await db.insert(paymentsTable).values({
      clientId,
        empresaId,
        amount,
        method: "asaas",
        status: "pending",
        provider: "asaas",
        dueDate,
        description: `PaxMed - segunda via - solicitação ${id}`,
        asaasChargeId: charge.id,
        asaasInvoiceUrl: charge.invoiceUrl,
        billingType: charge.billingType,
      });
    } catch (err) {
      // A referência e o link já estão gravados na solicitação para conciliação manual.
      console.error("[reissue-billing] cobrança criada; registro financeiro local requer conciliação", {
        requestId: id,
        chargeIdHash: createHash("sha256").update(charge.id).digest("hex").slice(0, 12),
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
    const message = `A taxa administrativa da segunda via é de R$ ${amount.toFixed(2).replace(".", ",")}. ` +
      `Pague pelo link seguro: <a href="${escaparHtmlTelegram(charge.invoiceUrl)}">Pagar taxa</a>. ` +
      `O documento será liberado somente após a confirmação do pagamento.`;
    const result = await sendTelegram(chatId, message, { disableWebPagePreview: true });
    if (!result.sent) {
      await db.execute(sql`UPDATE clinical_document_reissue_requests
        SET delivery_result='Cobrança criada, mas o Telegram não confirmou o envio do link. Confira antes de repetir.',
            updated_at=NOW()
        WHERE id=${id}::bigint AND asaas_charge_id=${charge.id}`);
      await recordClinicalDocumentReissueEvent({
        requestId: id, empresaId, locationId, eventType: "payment_link_unknown",
        details: { provider: "telegram", amount },
      });
      return { sent: false, error: result.error ?? "link_de_pagamento_nao_confirmado", invoiceUrl: charge.invoiceUrl };
    }
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET delivery_channel='telegram',delivery_result='Link de pagamento enviado; aguardando confirmação do provedor.',
          updated_at=NOW()
      WHERE id=${id}::bigint AND asaas_charge_id=${charge.id}`);
    await recordClinicalDocumentReissueEvent({
      requestId: id, empresaId, locationId, eventType: "payment_link_sent",
      details: { provider: "telegram", amount },
    });
    return { sent: true, invoiceUrl: charge.invoiceUrl };
  } catch (err) {
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET payment_status='unverified',payment_provider='asaas_unknown',
          asaas_charge_id=COALESCE(asaas_charge_id,${createdChargeId}),
          eligibility_reason='O resultado da criação da cobrança é incerto; não tente novamente sem conferência.',
          updated_at=NOW()
      WHERE id=${id}::bigint AND payment_provider='asaas_creating'`).catch(() => undefined);
    console.error("[reissue-billing] resultado incerto ao criar cobrança", {
      requestId: id,
      chargeIdHash: createdChargeId ? createHash("sha256").update(createdChargeId).digest("hex").slice(0, 12) : null,
      error: err instanceof Error ? err.message : "erro desconhecido",
    });
    await recordClinicalDocumentReissueEvent({
      requestId: id,
      empresaId,
      locationId,
      eventType: "payment_charge_unknown",
      details: { amount },
    }).catch(() => undefined);
    return { sent: false, error: err instanceof Error ? err.message : "erro_ao_criar_cobranca" };
  }
}
