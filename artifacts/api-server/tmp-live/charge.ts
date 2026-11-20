import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { createAndSendReissueCharge } from "../src/lib/clinical-document-reissue-billing";
const u = await db.execute(sql`UPDATE clinical_document_reissue_requests
  SET client_consent_at=NOW(),request_status='awaiting_payment',payment_status='unverified',
      eligibility_reason='TESTE autorizado pelo CEO: consentimento verbal da cliente de teste, presencial; não veio pelo Telegram.',
      updated_at=NOW()
  WHERE id=1 AND request_status='awaiting_confirmation' AND client_consent_at IS NULL RETURNING id`);
console.log("consent", u.rows.length);
await db.execute(sql`UPDATE telegram_documento_reenvios SET status='enviando',confirmacao_inbox_message_id=-1,atualizado_em=NOW() WHERE reissue_request_id=1 AND status='oferecido'`);
const r = await createAndSendReissueCharge("1", "7156196852");
console.log(r);
const row = await db.execute(sql`SELECT request_status,payment_status,asaas_charge_id,fee_amount FROM clinical_document_reissue_requests WHERE id=1`);
console.log(row.rows[0]);
process.exit(0);
