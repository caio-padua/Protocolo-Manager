import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, protocolsTable } from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { resolveClinicalMember } from "../lib/clinical-emitter";
import {
  confirmProtocolRecovery, confirmProtocolScheduling, planProtocolRecovery, planProtocolScheduling,
  type SchedulingRefusal,
} from "../lib/protocol-scheduling";
import { googleReadinessWarning, syncProtocolSessionsToGoogle } from "../lib/session-google-sync";
import { requireCollaborator } from "./collaborator";
import { authorizeProtocol } from "./protocols";

/**
 * Agendamento de protocolo com prévia (etapa 4 de 7).
 *
 *   POST /protocols/:id/scheduling/preview  -> calcula e mostra; não grava nada.
 *   POST /protocols/:id/scheduling/confirm  -> recalcula no servidor e reserva se
 *                                              o plano for idêntico ao da prévia.
 *   POST /protocols/:id/recovery/preview   -> confere o legado sem gravar.
 *   POST /protocols/:id/recovery/confirm   -> atualiza as mesmas sessões após confirmação.
 *   POST /protocols/:id/scheduling/google-sync -> envia (ou atualiza) no Google Agenda um evento
 *                                              por visita já reservada (etapa 5). Falha aqui nunca
 *                                              desfaz a reserva.
 *
 * O navegador nunca envia o plano, só uma agenda autorizada no cadastro do
 * cliente e a impressão digital da prévia. A validação antiga não cria sessões.
 */
const router: IRouter = Router();

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const PreviewBody = z.strictObject({ nursingResourceId: z.number().int().positive().nullish() });
const ConfirmBody = z.strictObject({
  nursingResourceId: z.number().int().positive().nullish(),
  fingerprint: z.string().min(1).max(200),
});

const GoogleSyncBody = z.strictObject({ refresh: z.boolean().optional() });

function refusalBody(refusal: SchedulingRefusal) {
  const { ok: _ok, status: _status, ...body } = refusal;
  return body;
}

async function loadAuthorized(req: Request, res: Response) {
  const params = ParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "pedido_invalido", error: "Protocolo inválido" });
    return null;
  }
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, params.data.id));
  if (!protocol) {
    res.status(404).json({ code: "protocolo_nao_encontrado", error: "Registro não encontrado" });
    return null;
  }
  const member = await authorizeProtocol(req, protocol, res);
  if (!member) return null;
  return { protocol, empresaId: member.clinic.empresaId };
}

router.post("/protocols/:id/scheduling/preview", moduleGuard("protocolos"), requireCollaborator,
  async (req, res): Promise<void> => {
    const body = PreviewBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ code: "pedido_invalido", error: "Pedido inválido" });
      return;
    }
    const authorized = await loadAuthorized(req, res);
    if (!authorized) return;
    const result = await planProtocolScheduling({
      empresaId: authorized.empresaId, clientId: authorized.protocol.clientId,
      protocolId: authorized.protocol.id, nursingResourceId: body.data.nursingResourceId ?? null,
    });
    if (!result.ok) {
      res.status(result.status).json(refusalBody(result));
      return;
    }
    // Aviso fora da prévia (não entra na impressão digital): o Google receberá os eventos desta agenda?
    const googleWarning = await googleReadinessWarning(
      result.preview.nursingResourceId, authorized.empresaId, req.collaborator!.professionalId);
    res.json({ preview: result.preview, googleWarning });
  });

router.post("/protocols/:id/scheduling/confirm", moduleGuard("protocolos"), requireCollaborator,
  async (req, res): Promise<void> => {
    const body = ConfirmBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ code: "confirmacao_ausente", error: "Confirme a partir de uma prévia do agendamento" });
      return;
    }
    const authorized = await loadAuthorized(req, res);
    if (!authorized) return;
    const { protocol, empresaId } = authorized;
    const result = await confirmProtocolScheduling({
      empresaId, clientId: protocol.clientId, protocolId: protocol.id,
      nursingResourceId: body.data.nursingResourceId ?? null, fingerprint: body.data.fingerprint,
      // O cálculo leva vários segundos: reconfere o acesso clínico imediatamente antes de reservar.
      stillAuthorized: async () => {
        try {
          const current = await resolveClinicalMember(req, protocol.clientId);
          return current.clinic.empresaId === resolveEmpresaId(req) && current.clinic.empresaId === protocol.empresaId;
        } catch {
          return false;
        }
      },
    });
    if (!result.ok) {
      // "plano_mudou" devolve a prévia nova: o aviso do Google precisa acompanhar a agenda dela.
      const googleWarning = result.code === "plano_mudou" && result.preview
        ? await googleReadinessWarning(result.preview.nursingResourceId, empresaId, req.collaborator!.professionalId)
        : undefined;
      res.status(result.status).json({ ...refusalBody(result), ...(googleWarning !== undefined ? { googleWarning } : {}) });
      return;
    }
    req.log.info({ protocolId: protocol.id, visits: result.reserved.length },
      "Protocolo agendado por períodos na agenda de enfermagem");
    res.status(201).json({
      protocolStatus: result.protocolStatus, preview: result.preview, reserved: result.reserved,
    });
  });

router.post("/protocols/:id/recovery/preview", moduleGuard("protocolos"), requireCollaborator,
  async (req, res): Promise<void> => {
    const body = PreviewBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ code: "pedido_invalido", error: "Pedido inválido" });
      return;
    }
    const authorized = await loadAuthorized(req, res);
    if (!authorized) return;
    const result = await planProtocolRecovery({
      empresaId: authorized.empresaId, clientId: authorized.protocol.clientId,
      protocolId: authorized.protocol.id, nursingResourceId: body.data.nursingResourceId ?? null,
    });
    if (!result.ok) {
      res.status(result.status).json(refusalBody(result));
      return;
    }
    const googleWarning = await googleReadinessWarning(
      result.preview.nursingResourceId, authorized.empresaId, req.collaborator!.professionalId);
    // Não expor os identificadores internos usados para preservar as linhas antigas.
    res.json({ preview: result.preview, googleWarning });
  });

router.post("/protocols/:id/recovery/confirm", moduleGuard("protocolos"), requireCollaborator,
  async (req, res): Promise<void> => {
    const body = ConfirmBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ code: "confirmacao_ausente", error: "Confirme a partir de uma prévia atual da recuperação" });
      return;
    }
    const authorized = await loadAuthorized(req, res);
    if (!authorized) return;
    const { protocol, empresaId } = authorized;
    const result = await confirmProtocolRecovery({
      empresaId, clientId: protocol.clientId, protocolId: protocol.id,
      nursingResourceId: body.data.nursingResourceId ?? null, fingerprint: body.data.fingerprint,
      stillAuthorized: async () => {
        try {
          const current = await resolveClinicalMember(req, protocol.clientId);
          return current.clinic.empresaId === resolveEmpresaId(req) &&
            current.clinic.empresaId === protocol.empresaId;
        } catch {
          return false;
        }
      },
    });
    if (!result.ok) {
      const googleWarning = result.code === "plano_mudou" && result.preview
        ? await googleReadinessWarning(result.preview.nursingResourceId, empresaId, req.collaborator!.professionalId)
        : undefined;
      res.status(result.status).json({ ...refusalBody(result), ...(googleWarning !== undefined ? { googleWarning } : {}) });
      return;
    }
    req.log.info({ protocolId: protocol.id, recoveredSessions: result.reserved.length },
      "Sessões legadas recuperadas após confirmação explícita");
    res.status(201).json({
      protocolStatus: result.protocolStatus, preview: result.preview, reserved: result.reserved,
    });
  });

router.post("/protocols/:id/scheduling/google-sync", moduleGuard("protocolos"), requireCollaborator,
  async (req, res): Promise<void> => {
    const body = GoogleSyncBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ code: "pedido_invalido", error: "Pedido inválido" });
      return;
    }
    const authorized = await loadAuthorized(req, res);
    if (!authorized) return;
    const { protocol, empresaId } = authorized;
    const result = await syncProtocolSessionsToGoogle({
      empresaId, clientId: protocol.clientId, protocolId: protocol.id,
      professionalId: req.collaborator!.professionalId, refresh: body.data.refresh === true,
      stillAuthorized: async () => {
        try {
          const current = await resolveClinicalMember(req, protocol.clientId);
          return current.clinic.empresaId === resolveEmpresaId(req) && current.clinic.empresaId === protocol.empresaId;
        } catch {
          return false;
        }
      },
    });
    if (!result.ok) {
      const { ok: _ok, status, ...refusal } = result;
      res.status(status).json(refusal);
      return;
    }
    req.log.info({ protocolId: protocol.id, synced: result.synced, failed: result.failed, remaining: result.remaining },
      "Visitas do protocolo enviadas ao Google Agenda");
    const { ok: _ok, ...payload } = result;
    res.json(payload);
  });

export default router;
