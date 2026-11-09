/**
 * Confirmação do cliente por visita (K8) — rotas.
 *
 * Autenticadas (profissional, mesma guarda de empresa/vínculo da aplicação da substância):
 *   GET  /sessions/:id/confirmacao
 *   POST /sessions/:id/confirmacao/chave/enviar      (nunca devolve a chave)
 *   POST /sessions/:id/confirmacao/chave/validar
 *   POST /sessions/:id/confirmacao/pendente          ("Cliente confirma depois")
 *   GET  /sessions/:id/confirmacao/desafio
 *   POST /sessions/:id/confirmacao/desafio
 * Públicas (montar ANTES do portão de colaborador; o token é a credencial):
 *   GET  /confirmacao-visita/:token   mostra a página; abrir NÃO confirma
 *   POST /confirmacao-visita/:token   só este POST confirma
 *
 * Montagem: depois do sessionsRouter, que já aplica o módulo "agenda" a tudo que passa por ele.
 * Nada aqui toca o registro clínico da aplicação: falha de canal vira aviso, nunca bloqueio.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { moduleGuard } from "../middleware/moduleGuard";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { realChannels } from "../lib/visit-confirmation-channels";
import {
  confirmByLink, dispatchDue, fingerprint, getBySession, getChallenge, hasRegisteredApplication, issueKey, loadContext,
  lookupLink, markPending, releaseUnsentKey, sendKeyToClient, submitChallenge, summarize, verifyKey,
  type ChannelSenders, type VisitContext, type VisitRef,
} from "../lib/visit-confirmation";
import { firstName, publicPage, whenLabel, escapeHtml } from "../lib/visit-confirmation-messages";
import { logger } from "../lib/logger";

const NOT_FOUND = "Registro não encontrado neste acesso.";

interface Authorized { ref: VisitRef; ctx: VisitContext; professionalId: number }

async function authorizeVisit(req: Request, sessionId: number): Promise<Authorized | null> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;
  const professionalId = req.collaborator?.professionalId;
  if (!professionalId) return null;
  const companyId = resolveEmpresaId(req);
  const result = await db.execute(sql`
    SELECT s.empresa_id AS s_emp, s.client_id, s.protocol_id, s.status, s.agenda_archived,
           c.empresa_id AS c_emp, c.status AS c_status, c.location_id,
           pr.empresa_id AS pr_emp, pr.client_id AS pr_client,
           l.active AS l_active, l.empresa_id AS l_emp,
           lp.professional_id AS lp_prof, pf.active AS pf_active, pf.credential_version AS pf_cv
      FROM sessions s
      JOIN clients c ON c.id = s.client_id
      LEFT JOIN protocols pr ON pr.id = s.protocol_id
      LEFT JOIN locations l ON l.id = c.location_id
      LEFT JOIN professionals pf ON pf.id = ${professionalId}
      LEFT JOIN location_professionals lp ON lp.location_id = c.location_id AND lp.professional_id = ${professionalId}
     WHERE s.id = ${sessionId} LIMIT 1`);
  const r = (result as unknown as { rows: Record<string, any>[] }).rows[0];
  if (!r || r.agenda_archived) return null;
  if (r.s_emp !== null && r.s_emp !== companyId) return null;
  if (r.c_emp !== companyId || r.c_status !== "active" || !r.location_id) return null;
  if (r.pr_emp !== companyId || r.pr_client !== r.client_id) return null;
  if (!r.pf_active || (r.pf_cv ?? 0) !== (req.collaborator!.credentialVersion ?? 0)) return null;
  if (r.l_active !== "true" || r.l_emp !== companyId || r.lp_prof === null) return null;
  const ctx = await loadContext(sessionId);
  if (!ctx) return null;
  return { ref: { sessionId, empresaId: companyId, clientId: r.client_id, locationId: r.location_id }, ctx, professionalId };
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
}

export function createVisitConfirmationRouter(channels: ChannelSenders = realChannels): IRouter {
  const router: IRouter = Router();

  // O módulo Agenda vale explicitamente para estas rotas (não depende do guarda de outro router).
  router.use("/sessions/:id/confirmacao", moduleGuard("agenda"));

  /**
   * Carrega a visita autorizada ou responde 404 neutro. Com `needsApplication`, exige que a enfermagem já tenha
   * registrado ao menos uma aplicação da visita (a confirmação do cliente diz "a aplicação aconteceu").
   */
  async function guard(req: Request, res: Response, needsApplication = false): Promise<Authorized | null> {
    const auth = await authorizeVisit(req, Number(req.params.id));
    if (!auth) { res.status(404).json({ error: NOT_FOUND }); return null; }
    if (["cancelled", "missed"].includes(auth.ctx.status)) {
      res.status(409).json({ error: "Esta visita está cancelada ou marcada como falta; a confirmação não se aplica." });
      return null;
    }
    if (needsApplication && !(await hasRegisteredApplication(auth.ref.sessionId))) {
      res.status(409).json({
        error: "Registre ao menos uma aplicação desta visita antes de pedir a confirmação do cliente.",
        motivo: "sem_aplicacao",
      });
      return null;
    }
    return auth;
  }

  const resumoDe = async (a: Authorized) => ({
    ...summarize(await getBySession(a.ref.sessionId, a.ref.empresaId), new Date()),
    aplicacaoRegistrada: await hasRegisteredApplication(a.ref.sessionId),
  });

  router.get("/sessions/:id/confirmacao", requireCollaborator, async (req, res): Promise<void> => {
    try {
      const a = await guard(req, res); if (!a) return;
      noStore(res);
      res.json({ resumo: await resumoDe(a) });
    } catch (error) { fail(res, error, "consulta"); }
  });

  router.post("/sessions/:id/confirmacao/chave/enviar", requireCollaborator, async (req, res): Promise<void> => {
    try {
      const a = await guard(req, res, true); if (!a) return;
      noStore(res);
      const issued = await issueKey(a.ref, a.professionalId);
      if (!issued.ok) {
        res.status(409).json({
          error: issued.reason === "ja_completa" ? "A confirmação do cliente desta visita já está completa."
            : `Aguarde ${issued.retryAfterSec ?? 60} segundos para pedir uma nova chave.`,
          motivo: issued.reason, aguardeSegundos: issued.retryAfterSec ?? 0, resumo: await resumoDe(a),
        });
        return;
      }
      const canais = await sendKeyToClient(channels, a.ctx, issued.key);
      if (!canais.some((c) => c.estado === "aceito")) {
        await releaseUnsentKey(issued.confirmationId, issued.keyHash);
        res.status(502).json({
          error: "Nenhum canal aceitou a chave (e-mail, WhatsApp ou Telegram). Confira os contatos do cliente e tente de novo.",
          canais, resumo: await resumoDe(a),
        });
        return;
      }
      // A resposta NUNCA leva a chave.
      res.json({ enviado: true, canais, chaveValidaAte: issued.expiresAt.toISOString(), resumo: await resumoDe(a) });
    } catch (error) { fail(res, error, "envio da chave"); }
  });

  router.post("/sessions/:id/confirmacao/chave/validar", requireCollaborator, async (req, res): Promise<void> => {
    try {
      const a = await guard(req, res); if (!a) return;
      noStore(res);
      const result = await verifyKey(a.ref, req.body?.codigo, a.professionalId);
      const resumo = await resumoDe(a);
      if (result.ok) { res.json({ ok: true, resumo }); return; }
      const messages: Record<string, [number, string]> = {
        formato: [400, "A chave tem 6 números."],
        sem_chave: [409, "Não há chave ativa. Envie uma nova chave ao cliente."],
        expirada: [409, "A chave expirou. Envie uma nova chave ao cliente."],
        tentativas_esgotadas: [409, "A chave foi bloqueada por tentativas erradas. Envie uma nova chave ao cliente."],
        ja_completa: [409, "A confirmação do cliente desta visita já está completa."],
        ja_usada: [409, "Esta chave já foi usada."],
        incorreta: [422, "Chave incorreta."],
      };
      const [status, error] = messages[result.reason] ?? [409, "Não foi possível validar a chave."];
      res.status(status).json({
        error, motivo: result.reason,
        ...(result.reason === "incorreta" ? { tentativasRestantes: result.tentativasRestantes } : {}),
        resumo,
      });
    } catch (error) { fail(res, error, "validação da chave"); }
  });

  /** Envia o que estiver vencido para esta visita; falha vira aviso, nunca erro da ação principal. */
  async function dispatchSafe(confirmationId: number): Promise<{ avisos: string[]; clienteEmails: number; gestao: number }> {
    try {
      const stats = await dispatchDue(channels, { onlyId: confirmationId });
      return { avisos: stats.avisos, clienteEmails: stats.clienteEmails, gestao: stats.gestaoInicio };
    } catch (error) {
      logger.error({ err: (error as Error).message }, "[visit-confirmation] envio imediato falhou; a rotina tenta de novo");
      return { avisos: ["O registro foi feito, mas o envio dos e-mails falhou agora. O sistema tenta de novo sozinho."], clienteEmails: 0, gestao: 0 };
    }
  }

  router.post("/sessions/:id/confirmacao/pendente", requireCollaborator, async (req, res): Promise<void> => {
    try {
      const a = await guard(req, res, true); if (!a) return;
      noStore(res);
      const pending = await markPending(a.ref, { professionalId: a.professionalId, origin: "enfermeira", reason: req.body?.motivo });
      if (!pending.ok) {
        res.status(409).json({ error: "A confirmação do cliente desta visita já está completa.", motivo: pending.reason, resumo: await resumoDe(a) });
        return;
      }
      const sent = await dispatchSafe(pending.confirmationId);
      res.json({ ok: true, jaEstavaPendente: pending.already, ...sent, resumo: await resumoDe(a) });
    } catch (error) { fail(res, error, "pendência"); }
  });

  router.get("/sessions/:id/confirmacao/desafio", requireCollaborator, async (req, res): Promise<void> => {
    try {
      const a = await guard(req, res, true); if (!a) return;
      noStore(res);
      res.json(await getChallenge(a.ref, a.ctx));
    } catch (error) { fail(res, error, "desafio"); }
  });

  router.post("/sessions/:id/confirmacao/desafio", requireCollaborator, async (req, res): Promise<void> => {
    try {
      const a = await guard(req, res, true); if (!a) return;
      noStore(res);
      const result = await submitChallenge(a.ref, a.ctx, { metade1: req.body?.metade1, metade2: req.body?.metade2 }, a.professionalId);
      const current = await getBySession(a.ref.sessionId, a.ref.empresaId);
      // Sucesso (liga o caminho por e-mail) ou trava (liga sozinho): dispara o que estiver vencido.
      const extra = (result.ok || result.reason === "travou") && current ? await dispatchSafe(current.id) : { avisos: [] as string[] };
      const resumo = await resumoDe(a);
      if (result.ok) { res.json({ ok: true, metodo: result.metodo, ...extra, resumo }); return; }
      if (result.reason === "incorreta") { res.status(422).json({ error: "Resposta incorreta.", motivo: "incorreta", tentativasRestantes: result.tentativasRestantes, resumo }); return; }
      if (result.reason === "nova_rodada") { res.status(422).json({ error: "Respostas incorretas: novo desafio sorteado.", motivo: "nova_rodada", desafio: result.desafio, resumo }); return; }
      if (result.reason === "travou") {
        res.status(423).json({ error: "O desafio travou nesta visita. O cliente receberá a confirmação por e-mail e a gestão foi avisada.", motivo: "travou", ...extra, resumo });
        return;
      }
      const map: Record<string, [number, string]> = {
        ja_completa: [409, "A confirmação do cliente desta visita já está completa."],
        travado: [423, "O desafio está travado nesta visita."],
        sem_desafio: [409, "Abra o desafio antes de responder."],
        tente_novamente: [409, "Outra resposta chegou ao mesmo tempo. Recarregue o desafio e tente de novo."],
        formato: [400, "Preencha as duas metades."],
      };
      const [status, error] = map[result.reason] ?? [409, "Não foi possível validar o desafio."];
      res.status(status).json({ error, motivo: result.reason, resumo });
    } catch (error) { fail(res, error, "desafio"); }
  });

  return router;
}

function fail(res: Response, error: unknown, what: string): void {
  logger.error({ err: (error as Error).message, what }, "[visit-confirmation] falha");
  if (!res.headersSent) res.status(500).json({ error: "Não foi possível concluir esta ação agora. Tente de novo em instantes." });
}

// ---------------------------------------------------------------------------
// Rotas públicas (link de um clique)
// ---------------------------------------------------------------------------
const INVALID_PAGE = publicPage({
  title: "Link indisponível",
  bodyHtml: `<p>Este link não é mais válido. Se você precisa confirmar uma aplicação, fale com a clínica.</p>`,
});

export function createVisitConfirmationPublicRouter(): IRouter {
  const router: IRouter = Router();

  router.get("/confirmacao-visita/:token", async (req, res): Promise<void> => {
    noStore(res);
    res.type("html");
    try {
      const found = await lookupLink(String(req.params.token ?? ""));
      if (found.status === "invalido" || found.status === "expirado") { res.status(404).send(INVALID_PAGE); return; }
      const ctx = await loadContext(found.row.session_id);
      if (found.status === "ja_confirmada") {
        res.send(publicPage({ title: "Confirmação já registrada", bodyHtml: `<p>Obrigado${ctx ? `, ${escapeHtml(firstName(ctx.clientName))}` : ""}. A confirmação desta aplicação já está registrada.</p>` }));
        return;
      }
      const when = ctx ? whenLabel(ctx.scheduledDate, ctx.scheduledTime) : "";
      // Abrir o link NÃO confirma: só o botão (POST) confirma.
      res.send(publicPage({
        title: "Confirmação da sua aplicação",
        bodyHtml: `<p>Olá${ctx ? `, ${escapeHtml(firstName(ctx.clientName))}` : ""}.</p>
<p>Você confirma que a aplicação de <strong>${escapeHtml(when)}</strong> aconteceu?</p>
<form method="post" style="margin-top:24px;"><button type="submit" style="background:#c9a24b;color:#0b1f3a;border:0;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:6px;cursor:pointer;">Confirmo</button></form>
<p style="color:#b8ad92;font-size:13px;margin-top:20px;">Se você não reconhece esta aplicação, feche esta página e avise a clínica.</p>`,
      }));
    } catch (error) {
      logger.error({ err: (error as Error).message }, "[visit-confirmation] falha na página pública");
      res.status(500).send(publicPage({ title: "Tente novamente", bodyHtml: "<p>Não foi possível abrir agora. Tente de novo em instantes.</p>" }));
    }
  });

  router.post("/confirmacao-visita/:token", async (req, res): Promise<void> => {
    noStore(res);
    res.type("html");
    try {
      const result = await confirmByLink(String(req.params.token ?? ""), fingerprint(req.ip, req.get("user-agent")));
      if (result.status === "invalido" || result.status === "expirado") { res.status(404).send(INVALID_PAGE); return; }
      const late = result.late ? " Registramos que a confirmação chegou depois do prazo." : "";
      res.send(publicPage({
        title: result.status === "confirmada" ? "Confirmado" : "Confirmação já registrada",
        bodyHtml: `<p>${result.status === "confirmada" ? "Obrigado. Sua confirmação foi registrada." : "A confirmação desta aplicação já estava registrada."}${late}</p>`,
      }));
    } catch (error) {
      logger.error({ err: (error as Error).message }, "[visit-confirmation] falha ao confirmar pelo link");
      res.status(500).send(publicPage({ title: "Tente novamente", bodyHtml: "<p>Não foi possível registrar agora. Tente de novo em instantes.</p>" }));
    }
  });

  return router;
}

export default createVisitConfirmationRouter();
export const visitConfirmationPublicRouter = createVisitConfirmationPublicRouter();
