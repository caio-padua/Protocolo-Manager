import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, protocolsTable } from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import { requireCollaborator } from "./collaborator";
import { authorizeProtocol } from "./protocols";
import { EquipeErro, buscarHorariosDaEquipe, reservarOcorrencia } from "../lib/equipe-reserva.js";
import { carregarItem, estruturaDisponivel, incluirProcedimento, listarItens } from "../lib/protocolo-procedimentos-store.js";

/**
 * Protocolo por PROCEDIMENTO real, com equipe (1 a 3 participantes) e reserva conjunta por ocorrência.
 * O navegador envia identificadores (procedimento, categoria, profissional, local); nunca agendas escolhidas
 * por nome nem o tipo legado: o servidor resolve e valida tudo dentro da clínica da sessão.
 */
const router: IRouter = Router();
const guard = [moduleGuard("protocolos"), requireCollaborator];

const Participante = z.strictObject({
  categoryId: z.number().int().positive(),
  // Alternativas da MESMA necessidade (uma pessoa: categoria principal OU uma destas), nunca duas pessoas.
  alternativeCategoryIds: z.array(z.number().int().positive()).max(5).optional(),
  locationId: z.number().int().positive().nullish(),
  professionalIds: z.array(z.number().int().positive()).max(20).optional(),
  modalidade: z.enum(["local", "online", "externo", "home_care"]).optional(),
  agendaId: z.number().int().positive().nullish(),
});
const IncluirBody = z.strictObject({
  procedimentoId: z.number().int().positive(),
  totalSessoes: z.number().int().min(1).max(365).optional(),
  intervaloDias: z.number().int().min(0).max(365).optional(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  produtoId: z.number().int().positive().nullish(),
  dose: z.string().trim().max(60).nullish(),
  equipe: z.array(Participante).min(1).max(3).optional(),
});
const HorariosBody = z.strictObject({ from: z.string(), to: z.string() });
const ReservarBody = z.strictObject({
  numero: z.number().int().positive(),
  date: z.string(), time: z.string(),
});
const Ids = z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive().optional() });

async function autorizar(req: Request, res: Response) {
  const ids = Ids.safeParse(req.params);
  if (!ids.success) { res.status(400).json({ code: "pedido_invalido", error: "Identificador inválido." }); return null; }
  if (!(await estruturaDisponivel())) {
    res.status(503).json({ code: "estrutura_pendente", error: "Protocolo por procedimento indisponível: estrutura pendente de conferência." });
    return null;
  }
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, ids.data.id));
  if (!protocol) { res.status(404).json({ code: "protocolo_nao_encontrado", error: "Registro não encontrado" }); return null; }
  const member = await authorizeProtocol(req, protocol, res);
  if (!member) return null;
  return { protocol, empresaId: member.clinic.empresaId, itemId: ids.data.itemId };
}
function recusar(res: Response, error: unknown) {
  if (error instanceof EquipeErro) { res.status(error.status).json({ code: error.code, error: error.message, ...(error.detalhes ?? {}) }); return; }
  throw error;
}

router.get("/protocols/:id/procedimentos", ...guard, async (req, res): Promise<void> => {
  const a = await autorizar(req, res);
  if (!a) return;
  res.json({ itens: await listarItens(a.empresaId, a.protocol.id) });
});

router.post("/protocols/:id/procedimentos", ...guard, async (req, res): Promise<void> => {
  const body = IncluirBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ code: "pedido_invalido", error: body.error.issues[0]?.message ?? "Pedido inválido" }); return; }
  const a = await autorizar(req, res);
  if (!a) return;
  try {
    const itemId = await incluirProcedimento({
      empresaId: a.empresaId, protocolId: a.protocol.id, professionalId: req.collaborator!.professionalId,
      entrada: { ...body.data, equipe: body.data.equipe?.map((p) => ({ ...p, locationId: p.locationId ?? null, agendaId: p.agendaId ?? null })) },
    });
    res.status(201).json({ itemId, itens: await listarItens(a.empresaId, a.protocol.id) });
  } catch (error) { recusar(res, error); }
});

router.post("/protocols/:id/procedimentos/:itemId/horarios", ...guard, async (req, res): Promise<void> => {
  const body = HorariosBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ code: "pedido_invalido", error: "Informe o período." }); return; }
  const a = await autorizar(req, res);
  if (!a) return;
  try {
    if (!a.itemId) { res.status(400).json({ code: "pedido_invalido", error: "Procedimento inválido." }); return; }
    const item = await carregarItem(a.empresaId, a.protocol.id, a.itemId);
    const dias = await buscarHorariosDaEquipe({
      empresaId: a.empresaId, participantes: item.participantes, duracaoSegundos: item.duracaoSegundos, ...body.data,
    });
    res.json({ dias });
  } catch (error) { recusar(res, error); }
});

router.post("/protocols/:id/procedimentos/:itemId/reservar", ...guard, async (req, res): Promise<void> => {
  const body = ReservarBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ code: "pedido_invalido", error: "Informe ocorrência, data e horário." }); return; }
  const a = await autorizar(req, res);
  if (!a) return;
  try {
    if (!a.itemId) { res.status(400).json({ code: "pedido_invalido", error: "Procedimento inválido." }); return; }
    await carregarItem(a.empresaId, a.protocol.id, a.itemId);
    const reservada = await reservarOcorrencia({
      empresaId: a.empresaId, protocoloProcedimentoId: a.itemId, criadoPor: req.collaborator!.professionalId, ...body.data,
    });
    res.status(201).json(reservada);
  } catch (error) { recusar(res, error); }
});

export default router;
