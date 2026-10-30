import { z } from "zod/v4";

export const deliveryBody = z.object({
  confirmed: z.literal(true),
  channel: z.enum(["email", "whatsapp", "telegram"]),
  recipient: z.string().trim().min(1),
  pharmacyId: z.number().int().positive().optional(),
}).strict();

export type DeliveryTarget = {
  channel: "email" | "whatsapp" | "telegram";
  recipient: string;
  label: string;
  pharmacyId?: number;
};

export function confirmedTarget(body: unknown, targets: DeliveryTarget[]) {
  const parsed = deliveryBody.safeParse(body);
  if (!parsed.success) throw new Error("Confirme um canal e o destinatário exibido antes de enviar.");
  const target = targets.find(t => t.channel === parsed.data.channel &&
    t.recipient === parsed.data.recipient && t.pharmacyId === parsed.data.pharmacyId);
  if (!target) throw new Error("Destinatário alterado ou não autorizado. Atualize os contatos e confirme novamente.");
  return target;
}

/** Only provider acknowledgement; this is never proof of delivery to a person. */
export async function auditedDelivery(
  start: () => Promise<number>,
  send: () => Promise<{ accepted: boolean; error?: string | null }>,
  finish: (id: number, status: string, error: string | null) => Promise<void>,
) {
  const id = await start(); // No provider call if audit storage is unavailable.
  let accepted = false;
  let error: string | null = null;
  try {
    const result = await send();
    accepted = result.accepted === true;
    error = accepted ? null : result.error || "O provedor não aceitou o envio.";
  } catch {
    error = "Falha ao consultar o provedor; entrega não confirmada.";
  }
  const status = accepted ? "accepted" : "failed";
  try {
    await finish(id, status, error);
  } catch {
    // Keep the pre-send pending row. Never invite an automatic retry.
    return { id, status: "unknown", accepted: false, error: "Resultado não registrado. Confira o provedor antes de tentar novamente." };
  }
  return { id, status, accepted, error };
}
