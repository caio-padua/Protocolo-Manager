import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, protocolsTable } from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import { requireCollaborator } from "./collaborator";
import { authorizeProtocol } from "./protocols";
import { EquipeErro } from "../lib/equipe-reserva.js";
import {
  abrirRevisao, ajustarEquipe, ajustarOcorrencias, cancelarPlano, carregarPlano, confirmarPlano, criarPlano, detalharPlano,
  estruturaPitStopDisponivel, liberarRevisao, listarPlanos, revalidarPlano,
} from "../lib/pit-stop.js";
import { sincronizarPlano } from "../lib/pit-stop-google.js";
import { autorizarPitStop } from "../lib/pit-stop-acesso.js";

/**
 * PIT STOP: fila compartilhada de planos de agendamento (recepção, enfermagem e médico veem o MESMO plano).
 * O navegador envia só identificadores; o servidor valida a clínica, o vínculo com o local do cliente,
 * quem está revisando e a versão vista antes de qualquer alteração ou reserva.
 */
const router: IRouter = Router();
const guardAgenda = [moduleGuard("agenda"), requireCollaborator];
const guardProtocolos = [moduleGuard("protocolos"), requireCollaborator];

const Participante = z.strictObject({
  categoryId: z.number().int().positive(),
  alternativeCategoryIds: z.array(z.number().int().positive()).max(5).optional(),
  locationId: z.number().int().positive().nullish(),
  professionalIds: z.array(z.number().int().positive()).max(20).optional(),
  modalidade: z.enum(["local", "online", "externo", "home_care"]).optional(),
  agendaId: z.number().int().positive().nullish(),
  // O requisito de nível vem do cadastro do procedimento; o servidor reaplica e o navegador não consegue removê-lo.
  exigeNivel: z.enum(["enfermeiro"]).nullish(),
});
const Procedimento = z.strictObject({
  procedimentoId: z.number().int().positive(),
  totalSessoes: z.number().int().min(1).max(365).optional(),
  intervaloDias: z.number().int().min(0).max(365).optional(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  produtoId: z.number().int().positive().nullish(),
  dose: z.string().trim().max(60).nullish(),
  equipe: z.array(Participante).min(1).max(3).optional(),
});
const CriarBody = z.strictObject({ procedimentos: z.array(Procedimento).max(30).default([]), assumir: z.boolean().optional() });
const VersaoBody = z.strictObject({ versao: z.number().int().positive() });
const OcorrenciasBody = z.strictObject({
  versao: z.number().int().positive(),
  ajustes: z.array(z.strictObject({
    id: z.number().int().positive(), data: z.string().nullable(), hora: z.string().nullable(),
    enderecoVisita: z.string().max(300).nullish(), usarEnderecoPaciente: z.boolean().optional(),
  })).min(1).max(400),
});
const EquipeBody = z.strictObject({ versao: z.number().int().positive(), equipe: z.array(Participante).min(1).max(3) });
const Ids = z.object({
  id: z.coerce.number().int().positive().optional(), planoId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
});

function recusar(res: Response, error: unknown) {
  if (error instanceof EquipeErro) { res.status(error.status).json({ code: error.code, error: error.message, ...(error.detalhes ?? {}) }); return; }
  throw error;
}
async function estrutura(res: Response): Promise<boolean> {
  if (await estruturaPitStopDisponivel()) return true;
  res.status(503).json({ code: "estrutura_pendente", error: "Pit Stop indisponível: a estrutura do banco ainda não foi aplicada." });
  return false;
}
const pedidoInvalido = (res: Response, msg = "Pedido inválido") => { res.status(400).json({ code: "pedido_invalido", error: msg }); };

/**
 * Plano -> empresa da sessão -> autorização do Pit Stop (permissão da matriz + corpo clínico da MESMA empresa).
 * Não exige ser o profissional executor nem vínculo legado com o local do cliente. Plano de outra empresa = 404.
 */
async function autorizarPlano(req: Request, res: Response) {
  const ids = Ids.safeParse(req.params);
  if (!ids.success || !ids.data.planoId) { pedidoInvalido(res, "Identificador inválido."); return null; }
  if (!(await estrutura(res))) return null;
  const acesso = await autorizarPitStop(req);
  if (!acesso.ok) { res.status(acesso.status).json({ code: acesso.code, error: acesso.error }); return null; }
  const plano = await carregarPlano(acesso.empresaId, ids.data.planoId);
  if (!plano) { res.status(404).json({ code: "plano_nao_encontrado", error: "Registro não encontrado" }); return null; }
  return { plano, empresaId: acesso.empresaId, planoId: Number(plano.id), itemId: ids.data.itemId, me: acesso.me };
}

async function responderPlano(res: Response, empresaId: number, planoId: number, status = 200, extra: Record<string, unknown> = {}) {
  res.status(status).json({ plano: await detalharPlano(empresaId, planoId), ...extra });
}

router.get("/agendamento/pit-stop", ...guardAgenda, async (req, res): Promise<void> => {
  if (!(await estrutura(res))) return;
  const acesso = await autorizarPitStop(req);
  if (!acesso.ok) { res.status(acesso.status).json({ code: acesso.code, error: acesso.error }); return; }
  const empresaId = acesso.empresaId;
  const estado = typeof req.query.estado === "string" && ["pendente", "em_revisao", "confirmado", "cancelado"].includes(req.query.estado)
    ? req.query.estado : undefined;
  const busca = typeof req.query.busca === "string" ? req.query.busca.slice(0, 80) : undefined;
  res.json({ planos: await listarPlanos(empresaId, acesso.me, { estado, busca }) });
});

router.post("/protocols/:id/plano-agendamento", ...guardProtocolos, async (req, res): Promise<void> => {
  const body = CriarBody.safeParse(req.body ?? {});
  const ids = Ids.safeParse(req.params);
  if (!body.success || !ids.success || !ids.data.id) { pedidoInvalido(res); return; }
  if (!(await estrutura(res))) return;
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, ids.data.id));
  if (!protocol) { res.status(404).json({ code: "protocolo_nao_encontrado", error: "Registro não encontrado" }); return; }
  const member = await authorizeProtocol(req, protocol, res);
  if (!member) return;
  try {
    const me = req.collaborator!.professionalId;
    const planoId = await criarPlano({
      empresaId: member.clinic.empresaId, protocolId: protocol.id, clientId: protocol.clientId, prescritorId: me, criadoPor: me,
      assumir: body.data.assumir,
      procedimentos: body.data.procedimentos.map((p) => ({
        ...p, equipe: p.equipe?.map((e) => ({ ...e, locationId: e.locationId ?? null, agendaId: e.agendaId ?? null })),
      })),
    });
    await responderPlano(res, member.clinic.empresaId, planoId, 201, { planoId });
  } catch (error) { recusar(res, error); }
});

router.get("/protocols/:id/plano-agendamento", ...guardProtocolos, async (req, res): Promise<void> => {
  const ids = Ids.safeParse(req.params);
  if (!ids.success || !ids.data.id) { pedidoInvalido(res); return; }
  if (!(await estrutura(res))) return;
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, ids.data.id));
  if (!protocol) { res.status(404).json({ code: "protocolo_nao_encontrado", error: "Registro não encontrado" }); return; }
  const member = await authorizeProtocol(req, protocol, res);
  if (!member) return;
  const { rows } = await db.execute(sqlVivo(protocol.id));
  const planoId = rows[0] ? Number(rows[0].id) : null;
  res.json({ planoId, plano: planoId ? await detalharPlano(member.clinic.empresaId, planoId) : null });
});

router.get("/agendamento/planos/:planoId", ...guardAgenda, async (req, res): Promise<void> => {
  const a = await autorizarPlano(req, res);
  if (!a) return;
  await responderPlano(res, a.empresaId, a.planoId);
});

router.post("/agendamento/planos/:planoId/abrir", ...guardAgenda, async (req, res): Promise<void> => {
  const a = await autorizarPlano(req, res);
  if (!a) return;
  try { await abrirRevisao(a.empresaId, a.planoId, a.me); await responderPlano(res, a.empresaId, a.planoId); } catch (e) { recusar(res, e); }
});

router.post("/agendamento/planos/:planoId/liberar", ...guardAgenda, async (req, res): Promise<void> => {
  const a = await autorizarPlano(req, res);
  if (!a) return;
  try { await liberarRevisao(a.empresaId, a.planoId, a.me); await responderPlano(res, a.empresaId, a.planoId); } catch (e) { recusar(res, e); }
});

router.post("/agendamento/planos/:planoId/cancelar", ...guardAgenda, async (req, res): Promise<void> => {
  const a = await autorizarPlano(req, res);
  if (!a) return;
  try { await cancelarPlano(a.empresaId, a.planoId, a.me); await responderPlano(res, a.empresaId, a.planoId); } catch (e) { recusar(res, e); }
});

router.put("/agendamento/planos/:planoId/ocorrencias", ...guardAgenda, async (req, res): Promise<void> => {
  const body = OcorrenciasBody.safeParse(req.body ?? {});
  if (!body.success) { pedidoInvalido(res); return; }
  const a = await autorizarPlano(req, res);
  if (!a) return;
  try {
    await ajustarOcorrencias(a.empresaId, a.planoId, a.me, body.data.versao, body.data.ajustes);
    await responderPlano(res, a.empresaId, a.planoId);
  } catch (e) { recusar(res, e); }
});

router.put("/agendamento/planos/:planoId/itens/:itemId/equipe", ...guardAgenda, async (req, res): Promise<void> => {
  const body = EquipeBody.safeParse(req.body ?? {});
  if (!body.success) { pedidoInvalido(res); return; }
  const a = await autorizarPlano(req, res);
  if (!a) return;
  if (!a.itemId) { pedidoInvalido(res, "Procedimento inválido."); return; }
  try {
    await ajustarEquipe(a.empresaId, a.planoId, a.me, body.data.versao, a.itemId,
      body.data.equipe.map((e) => ({ ...e, locationId: e.locationId ?? null, agendaId: e.agendaId ?? null })));
    await responderPlano(res, a.empresaId, a.planoId);
  } catch (e) { recusar(res, e); }
});

router.post("/agendamento/planos/:planoId/revalidar", ...guardAgenda, async (req, res): Promise<void> => {
  const a = await autorizarPlano(req, res);
  if (!a) return;
  try { res.json(await revalidarPlano(a.empresaId, a.planoId)); } catch (e) { recusar(res, e); }
});

router.post("/agendamento/planos/:planoId/confirmar", ...guardAgenda, async (req, res): Promise<void> => {
  const body = VersaoBody.safeParse(req.body ?? {});
  if (!body.success) { pedidoInvalido(res, "Confirmação explícita exige a versão do plano que você viu."); return; }
  const a = await autorizarPlano(req, res);
  if (!a) return;
  try {
    const { repetido } = await confirmarPlano(a.empresaId, a.planoId, a.me, body.data.versao);
    // A reserva interna já vale. O envio ao Google é uma segunda etapa, com resultado próprio e honesto.
    let sincronizacao: unknown = null;
    if (!repetido) {
      try { sincronizacao = await sincronizarPlano(a.empresaId, a.planoId, a.me); }
      catch (err) {
        req.log?.error({ err, planoId: a.planoId }, "Falha inesperada ao enviar o plano ao Google");
        sincronizacao = { estado: "erro", motivo: "falha_inesperada", visitas: [] };
      }
    }
    await responderPlano(res, a.empresaId, a.planoId, 200, { repetido, sincronizacao });
  } catch (e) { recusar(res, e); }
});

router.post("/agendamento/planos/:planoId/sincronizar", ...guardAgenda, async (req, res): Promise<void> => {
  const a = await autorizarPlano(req, res);
  if (!a) return;
  try {
    const sincronizacao = await sincronizarPlano(a.empresaId, a.planoId, a.me);
    await responderPlano(res, a.empresaId, a.planoId, 200, { sincronizacao });
  } catch (e) { recusar(res, e); }
});

function sqlVivo(protocolId: number) {
  return sql`SELECT id FROM agendamento_planos WHERE protocol_id=${protocolId} AND estado IN ('pendente','em_revisao','confirmado') LIMIT 1`;
}

export default router;
