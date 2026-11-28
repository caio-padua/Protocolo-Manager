import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { contatoAutorizado, lerConfig, enviarTextoEvolution } from "./evolution";
import { resolverIdentidadeWhatsapp } from "./evolution-client-identity";
import { telefoneCanonico } from "./whatsapp-seguranca";
import { carregarFrases } from "./telegram-frases";

/** No silent provider fallback when Evolution is configured but its destination is unsafe. */
export async function destinoEvolutionDocumento(
  empresaId: number, clientId: number, locationId: number,
): Promise<string | null> {
  if (!await lerConfig(empresaId)) return null;
  const result = await db.execute(sql`SELECT c.phone,v.telefone
    FROM clients c LEFT JOIN evolution_vinculos_cliente v
      ON v.empresa_id=c.empresa_id AND v.cliente_id=c.id
    WHERE c.id=${clientId} AND c.empresa_id=${empresaId} AND c.location_id=${locationId}
      AND c.status='active' AND c.deleted_at IS NULL`);
  const row = result.rows[0] as { phone: string | null; telefone: string | null } | undefined;
  const destination = row?.telefone ?? telefoneCanonico(row?.phone);
  const identity = destination && contatoAutorizado(destination)
    ? await resolverIdentidadeWhatsapp(db, empresaId, destination) : null;
  if (!destination || identity?.id !== clientId || identity.locationId !== locationId) {
    throw new Error("Destino WhatsApp não confirmado de forma única para este cliente. Nenhum envio foi iniciado.");
  }
  return destination;
}

/** Uses the existing editable message, Evolution transport and receipt ledger. */
export async function enviarDocumentoEvolution(input: {
  empresaId: number; clientId: number; locationId: number; destination: string;
  title: string; url: string; professionalId: number; reissueRequestId?: string;
}) {
  if (await destinoEvolutionDocumento(input.empresaId, input.clientId, input.locationId) !== input.destination) {
    throw new Error("O destino mudou antes do envio. Confira antes de tentar novamente.");
  }
  const frases = await carregarFrases();
  const text = frases("documento_link_seguro_whatsapp", { titulo: input.title, url: input.url });
  return enviarTextoEvolution(input.empresaId, input.destination, text, "clinical_document_resend",
    input.professionalId, input.reissueRequestId);
}
