import { PDFDocument, StandardFonts } from "pdf-lib";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { createReissueRequest } from "../src/lib/clinical-document-reissue-policy";
import { resolveReissueReview } from "../src/lib/clinical-document-reissue-review";
import { randomUUID } from "node:crypto";

await db.execute(sql`INSERT INTO clinical_document_reissue_settings
  (empresa_id,location_id,enabled,fee_collection_enabled,require_human_review,fee_amount)
  VALUES(5,30,TRUE,TRUE,TRUE,15.00)
  ON CONFLICT (empresa_id,location_id) DO UPDATE SET enabled=TRUE,fee_collection_enabled=TRUE,require_human_review=TRUE,fee_amount=15.00`);
const pdf = await PDFDocument.create();
const page = pdf.addPage([595, 842]);
const font = await pdf.embedFont(StandardFonts.Helvetica);
page.drawText("ATESTADO DE TESTE - segunda via (cliente de teste)", { x: 50, y: 780, size: 14, font });
page.drawText("Documento sintetico emitido para validar o fluxo de segunda via.", { x: 50, y: 750, size: 11, font });
const b64 = Buffer.from(await pdf.save()).toString("base64");
const ins = await db.execute(sql`INSERT INTO medical_certificates
  (client_id,client_name,professional_id,professional_name,tipo,corpo,status,file_name,pdf_data,emitted_at,empresa_id)
  VALUES(12,'Dayana Ludman Alves Caldas da Silva',6,'Dr. Caio Henrique Fernandes Pádua','comparecimento',
   'Atestado sintetico de teste.','emitted','atestado-teste-segunda-via.pdf',${b64},NOW(),5) RETURNING id,issued_empresa_id,issued_location_id`);
console.log("atestado", ins.rows[0]);
const id = Number((ins.rows[0] as any).id);
const req = await createReissueRequest({ clientId:12, empresaId:5, locationId:30, documentType:"atestado",
  documentId:id, requestedByChannel:"telegram", clientConsent:false, operationKey: randomUUID() });
console.log("pedido", req);
if (req.status === "awaiting_review") {
  const r = await resolveReissueReview({ requestId:Number(req.id), actorProfessionalId:6, resolution:"fee_required",
    reason:"Teste real autorizado pelo CEO: sem tratamento vigente, taxa de R$ 15,00." });
  console.log("revisao", r);
}
process.exit(0);
