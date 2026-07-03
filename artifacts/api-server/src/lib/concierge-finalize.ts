import { db, clientsTable, schedulingRequestsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  hashPassword,
  generateProvisionalPassword,
  generateAccessToken,
} from "./patient-auth.js";
import { sendArrivalEmail } from "./email-service.js";
import { sendWhatsapp } from "./whatsapp.js";
import { baseUrlFromEnv } from "./messaging/index.js";
import { createBookingStatusToken } from "./portal-token.js";
import { logger } from "./logger.js";

// Validade da senha provisoria / token de acesso (7 dias). Caso extremo 6 da spec:
// se expirar, o paciente pede reenvio; nunca trava.
const PROVISIONAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

// Monta o link publico de status do pagamento (abre por token, sem login) — R9.
// Token de status STATELESS (HMAC do id, escopo bstatus, 30 dias): independe do
// passwordSetToken, que e limpo na troca de senha e mataria o link.
function statusLink(id: number): string {
  const base = baseUrlFromEnv().replace(/\/$/, "");
  const token = createBookingStatusToken(id);
  return `${base}/agendar/status/${id}?t=${encodeURIComponent(token)}`;
}

// Link para definir/recuperar acesso (paciente JA cadastrado COM senha) — R14.
function accessLink(token: string): string {
  const base = baseUrlFromEnv().replace(/\/$/, "");
  return `${base}/area?definir=${encodeURIComponent(token)}`;
}

// finalizeConciergeBooking — rotina POS-PAGAMENTO idempotente (Blocos B, C, D).
// Dispara quando a cobranca Concierge do Dr. Caio fica "pago" (polling ou webhook).
// Passos: triagem por CPF (cria/acha cadastro), gera acesso (senha provisoria) e
// envia o e-mail de chegada. Guardada por advisory lock + coluna finalizedAt para
// nunca duplicar cadastro/e-mail (R7 + caso extremo 4 do webhook).
export async function finalizeConciergeBooking(id: number): Promise<void> {
  // 1) Pre-checagem barata FORA da trava (evita abrir transacao a toa).
  const [pre] = await db
    .select()
    .from(schedulingRequestsTable)
    .where(eq(schedulingRequestsTable.id, id))
    .limit(1);
  if (!pre) return;
  if (pre.entrada !== "dr_caio" || pre.path !== "concierge") return;
  if (pre.paymentStatus !== "pago") return;
  if (pre.finalizedAt) return;

  // 2) Secao critica: triagem + vinculo + senha, tudo idempotente sob advisory lock.
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);

    const [row] = await tx
      .select()
      .from(schedulingRequestsTable)
      .where(eq(schedulingRequestsTable.id, id))
      .limit(1);
    if (!row) return null;
    if (row.finalizedAt) return null; // outro processo ja finalizou

    const cpf = onlyDigits(row.patientCpf);
    if (cpf.length < 11) {
      // Sem CPF valido nao ha como cruzar/cadastrar com seguranca. Marca finalizado
      // com erro para a clinica ver a pendencia (nao trava, nao reprocessa em loop).
      await tx
        .update(schedulingRequestsTable)
        .set({ finalizedAt: new Date(), arrivalEmailError: "cpf_ausente" })
        .where(eq(schedulingRequestsTable.id, id));
      return null;
    }

    // Cruza o CPF com clients por DIGITOS (independe de mascara). Caso extremo 7:
    // colisao (2+ cadastros) nunca vincula por match ambiguo — escala para a clinica.
    const matches = await tx
      .select()
      .from(clientsTable)
      .where(
        sql`regexp_replace(coalesce(${clientsTable.cpf}, ''), '\D', '', 'g') = ${cpf}`,
      );

    if (matches.length > 1) {
      await tx
        .update(schedulingRequestsTable)
        .set({
          finalizedAt: new Date(),
          arrivalEmailError: "cpf_ambiguo",
          notes: [row.notes, "Triagem: CPF com mais de um cadastro — revisar manualmente."]
            .filter(Boolean)
            .join(" | "),
        })
        .where(eq(schedulingRequestsTable.id, id));
      return null;
    }

    let client = matches[0] ?? null;
    let triagem: "novo" | "retorno";

    if (!client) {
      // Paciente NOVO: cria cadastro nativo (nome, CPF, e-mail, telefone).
      const [created] = await tx
        .insert(clientsTable)
        .values({
          name: row.patientName,
          cpf: row.patientCpf,
          email: row.patientEmail ?? null,
          phone: row.patientPhone ?? null,
        })
        .returning();
      client = created;
      triagem = "novo";
    } else {
      // Paciente RETORNO: usa o cadastro atual. Caso extremo 3: NAO sobrescrever
      // cegamente e-mail/telefone divergentes — a clinica decide depois.
      triagem = "retorno";
    }

    // Acesso (Bloco D): se o cadastro nao tem senha ativa, gera senha provisoria
    // (uso unico, troca obrigatoria no 1o acesso). Se JA tem senha, nao gera nova
    // (R14) — o e-mail traz "entrar/recuperar" via token.
    const hasActivePassword = Boolean(client.passwordHash) && !client.mustChangePassword;
    let provisionalPassword: string | null = null;
    const accessToken = generateAccessToken();
    const tokenExpiry = new Date(Date.now() + PROVISIONAL_TTL_MS);

    if (!hasActivePassword) {
      provisionalPassword = generateProvisionalPassword();
      await tx
        .update(clientsTable)
        .set({
          passwordHash: hashPassword(provisionalPassword),
          mustChangePassword: true,
          passwordSetToken: accessToken,
          passwordSetTokenExpiresAt: tokenExpiry,
        })
        .where(eq(clientsTable.id, client.id));
    } else {
      // Somente token de recuperacao (sem tocar na senha vigente).
      await tx
        .update(clientsTable)
        .set({ passwordSetToken: accessToken, passwordSetTokenExpiresAt: tokenExpiry })
        .where(eq(clientsTable.id, client.id));
    }

    // Vincula a solicitacao ao cadastro e marca a triagem para a clinica (R6).
    await tx
      .update(schedulingRequestsTable)
      .set({ clientId: client.id, triagem, finalizedAt: new Date() })
      .where(eq(schedulingRequestsTable.id, id));

    return {
      requestId: id,
      clientName: client.name,
      clientEmail: client.email,
      clientCpf: cpf,
      triagem,
      chosenDate: row.chosenDate,
      chosenTime: row.chosenTime,
      provisionalPassword,
      accessToken,
      hasActivePassword,
    };
  });

  if (!outcome) return;

  // 3) WhatsApp de chegada (Bloco B da spec cartão): mesmo link de status do
  //    e-mail, best-effort e INDEPENDENTE do e-mail (roda antes dele para não
  //    ser pulado pelo early-return de "e-mail ausente"). Fora da janela de 24h
  //    do WhatsApp o envio pode não entregar — registramos o erro honestamente,
  //    sem fingir entrega e sem derrubar o finalize. Idempotente: este bloco só
  //    roda no primeiro finalize (outcome != null), como o e-mail.
  const phone = onlyDigits(pre.patientPhone);
  if (!phone) {
    await db
      .update(schedulingRequestsTable)
      .set({ arrivalWhatsappError: "telefone_ausente" })
      .where(eq(schedulingRequestsTable.id, id));
  } else {
    try {
      const wpp = await sendWhatsapp(
        phone,
        `Olá, ${outcome.clientName}! Recebemos o pagamento do seu agendamento com o Dr. Caio. ` +
          `Acompanhe seu agendamento por aqui: ${statusLink(outcome.requestId)}`,
      );
      if (wpp.sent) {
        await db
          .update(schedulingRequestsTable)
          .set({ arrivalWhatsappSentAt: new Date(), arrivalWhatsappError: null })
          .where(eq(schedulingRequestsTable.id, id));
      } else {
        await db
          .update(schedulingRequestsTable)
          .set({
            arrivalWhatsappError: (wpp.error ?? "nao_entregue").slice(0, 200),
          })
          .where(eq(schedulingRequestsTable.id, id));
      }
    } catch (err) {
      logger.error(
        { err: String(err), requestId: id },
        "Falha ao enviar WhatsApp de chegada",
      );
      await db
        .update(schedulingRequestsTable)
        .set({ arrivalWhatsappError: "excecao_envio" })
        .where(eq(schedulingRequestsTable.id, id));
    }
  }

  // 4) E-mail de chegada (Bloco C), FORA da transacao (rede lenta nao segura a
  //    trava). Best-effort: falha de e-mail nunca desfaz o cadastro; registra o
  //    erro para a clinica ver (caso extremo 5).
  if (!outcome.clientEmail) {
    await db
      .update(schedulingRequestsTable)
      .set({ arrivalEmailError: "email_ausente" })
      .where(eq(schedulingRequestsTable.id, id));
    return;
  }

  try {
    const result = await sendArrivalEmail({
      clientName: outcome.clientName,
      clientEmail: outcome.clientEmail,
      clientCpf: outcome.clientCpf,
      triagem: outcome.triagem,
      chosenDate: outcome.chosenDate,
      chosenTime: outcome.chosenTime,
      provisionalPassword: outcome.provisionalPassword,
      statusUrl: statusLink(outcome.requestId),
      accessUrl: outcome.hasActivePassword ? accessLink(outcome.accessToken) : null,
    });
    if (result.success) {
      await db
        .update(schedulingRequestsTable)
        .set({ arrivalEmailSentAt: new Date(), arrivalEmailError: null })
        .where(eq(schedulingRequestsTable.id, id));
    } else {
      await db
        .update(schedulingRequestsTable)
        .set({ arrivalEmailError: (result.error ?? "falha_envio").slice(0, 200) })
        .where(eq(schedulingRequestsTable.id, id));
    }
  } catch (err) {
    logger.error({ err: String(err), requestId: id }, "Falha ao enviar e-mail de chegada");
    await db
      .update(schedulingRequestsTable)
      .set({ arrivalEmailError: "excecao_envio" })
      .where(eq(schedulingRequestsTable.id, id));
  }
}
