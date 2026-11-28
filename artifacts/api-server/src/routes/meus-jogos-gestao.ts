import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { isGestorDaEmpresa, isPlatformOwner } from "../lib/clinical-access";
import { requireCollaborator } from "./collaborator";
import { uploadMw } from "./boloes";
import {
  anexarComprovante, atestarSemAposta, baixarComprovante, gravarConfig, lerConfig, listarPedidosGestor, processarFila,
  reconciliarPrazos, registrarDevolucao,
} from "../lib/meus-jogos";
import { lerConferencia } from "../lib/meus-jogos-resultados";
import { roboAtual } from "../lib/meus-jogos-robo";
import { MODALIDADES, REGRAS, SNAPSHOT_VERIFICADO_EM, situacaoDaFonte } from "../lib/meus-jogos-regras";
import { atualizarCalendarioPersistido, gravarAgendamentoCalendario, lerEstadoCalendario } from "../lib/meus-jogos-calendario-store";
import { lerEstadoAvatarMedico } from "../lib/meus-jogos-avatar";

/**
 * MEUS JOGOS na Central do gestor (menu Grupo VIP). A clinica vem SEMPRE do contexto autenticado do servidor;
 * o gestor escolhe o CLIENTE na tela, mas so enxerga clientes da propria clinica.
 * Devolucao e atestado de "nao houve aposta" sao atos humanos registrados: o sistema nao movimenta dinheiro.
 */
const router: IRouter = Router();
const G = "/boloes/gestao/meus-jogos";

async function gestor(req: Request, res: Response): Promise<{ empresaId: number; ator: string } | null> {
  const t = req.tenantContext;
  const actor = Number(req.collaborator?.professionalId);
  if (!t?.authenticated || !Number.isSafeInteger(actor) || actor <= 0 || t.professionalId !== actor) {
    res.status(401).json({ error: "Faça login de colaborador." });
    return null;
  }
  if (!(await isGestorDaEmpresa(actor, t.empresaId))) {
    res.status(403).json({ error: "Acesso restrito ao gestor da clínica." });
    return null;
  }
  return { empresaId: t.empresaId, ator: `gestor:${actor}` };
}
const idParam = (v: unknown): number | null => (/^[1-9]\d{0,9}$/.test(String(v ?? "")) ? Number(String(v)) : null);
function falha(req: Request, res: Response, err: unknown, msg: string): void {
  req.log.error({ err: String(err) }, msg);
  if (!res.headersSent) res.status(500).json({ error: msg });
}

router.get(`${G}/cliente/:clientId`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  const id = idParam(req.params.clientId);
  try {
    const r = id ? await listarPedidosGestor(g.empresaId, id) : null;
    if (!r) { res.status(404).json({ error: "Cliente não encontrado nesta clínica." }); return; }
    res.set("Cache-Control", "private, no-store"); res.json(r);
  } catch (err) { falha(req, res, err, "Não foi possível carregar os jogos do cliente."); }
});

router.get(`${G}/painel`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  try {
    const robo = await roboAtual().estado().catch(() => ({ disponivel: false, motivo: "Estado indisponível.", ambiente: "nenhum" as const }));
    const agora = new Date();
    const fontes = [];
    for (const m of MODALIDADES) {
      const conf = await lerConferencia(m);
      fontes.push({ modalidade: m, nome: REGRAS[m].nome, fonteUrl: REGRAS[m].fonteUrl, situacao: situacaoDaFonte(m, agora, conf), conferencia: conf });
    }
    res.set("Cache-Control", "private, no-store");
    res.json({
      config: await lerConfig(g.empresaId), execucao: robo, snapshotVerificadoEm: SNAPSHOT_VERIFICADO_EM, fontes,
      calendario: await lerEstadoCalendario(),
      avatarMedico: await lerEstadoAvatarMedico(),
      podeConfigurarAgendamento: await isPlatformOwner(Number(req.collaborator?.professionalId)),
    });
  } catch (err) { falha(req, res, err, "Não foi possível carregar o painel de Meus Jogos."); }
});

const Config = z.object({
  margemMinutos: z.number().int().optional(), metaMinutos: z.number().int().optional(), tetoPedidoCentavos: z.number().int().optional(),
  fechamentoOficial: z.record(z.string(), z.string()).optional(), fonteFechamento: z.string().nullable().optional(),
}).strict();
router.put(`${G}/config`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  const b = Config.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Configuração inválida." }); return; }
  try {
    const r = await gravarConfig(g.empresaId, b.data, g.ator);
    if (!r.ok) { res.status(422).json({ error: r.erro }); return; }
    res.json({ ok: true, config: r.config });
  } catch (err) { falha(req, res, err, "Não foi possível salvar a configuração."); }
});

router.post(`${G}/fonte/conferir`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  try {
    const resultado = await atualizarCalendarioPersistido();
    const calendario = await lerEstadoCalendario();
    if (!resultado.ok) {
      res.status(503).json({ error: "A conferência não validou todas as fontes; as vendas continuam bloqueadas.", resultado, calendario });
      return;
    }
    res.json({ resultado, calendario });
  }
  catch (err) { falha(req, res, err, "Não foi possível conferir a fonte oficial."); }
});

const Agendamento = z.object({ habilitado: z.boolean(), diaSemana: z.number().int().min(0).max(6), hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).strict();
router.put(`${G}/calendario/agendamento`, requireCollaborator, async (req, res): Promise<void> => {
  const actor = Number(req.collaborator?.professionalId);
  if (!Number.isSafeInteger(actor) || actor <= 0) { res.status(401).json({ error: "Faça login de colaborador." }); return; }
  if (!(await isPlatformOwner(actor))) { res.status(403).json({ error: "Somente o responsável pela plataforma pode alterar a rotina global do calendário." }); return; }
  const body = Agendamento.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Informe dia da semana, horário e estado válidos." }); return; }
  try {
    const saved = await gravarAgendamentoCalendario(body.data);
    if (!saved.ok) { res.status(422).json({ error: "Agendamento inválido." }); return; }
    res.json({ ok: true, agendamento: saved.agendamento });
  } catch (err) { falha(req, res, err, "Não foi possível salvar a rotina do calendário."); }
});

// Fila e reconciliacao sob demanda (nao ha job agendado). Sem robo disponivel, a fila nao toca em nenhum pedido.
router.post(`${G}/fila/processar`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  if (req.body?.confirmarEnvio !== true) {
    res.status(409).json({ error: "Confirme explicitamente o envio manual dos pedidos pagos ao canal de registro. Nenhum pagamento é movimentado por esta ação." });
    return;
  }
  try {
    const rec = await reconciliarPrazos();
    res.json({ reconciliacao: rec, fila: await processarFila() });
  } catch (err) { falha(req, res, err, "Não foi possível processar a fila."); }
});

const Atesto = z.object({ nota: z.string() }).strict();
const Devolucao = z.object({ referencia: z.string() }).strict();
const MSG: Record<string, [number, string]> = {
  inexistente: [404, "Pedido não encontrado."], estado_invalido: [409, "O pedido não está no estado adequado para esta ação."],
  texto_invalido: [422, "Preencha o texto da ação (nota com 10 a 250 caracteres; referência com 3 a 80)."],
  arquivo_invalido: [422, "O comprovante precisa ser PDF, PNG ou JPEG de verdade."], arquivo_grande: [413, "Arquivo maior que 10 MB."],
};

router.post(`${G}/pedidos/:id/atestar-sem-aposta`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  const id = idParam(req.params.id); const b = Atesto.safeParse(req.body);
  if (!id || !b.success) { res.status(400).json({ error: "Informe a nota do atestado." }); return; }
  try {
    const r = await atestarSemAposta({ empresaId: g.empresaId, pedidoId: id, nota: b.data.nota, ator: g.ator });
    if (r.ok) { res.json({ ok: true }); return; }
    const [s, error] = MSG[r.motivo]!; res.status(s).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível registrar o atestado."); }
});

router.post(`${G}/pedidos/:id/devolucao`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  const id = idParam(req.params.id); const b = Devolucao.safeParse(req.body);
  if (!id || !b.success) { res.status(400).json({ error: "Informe a referência da devolução." }); return; }
  try {
    const r = await registrarDevolucao({ empresaId: g.empresaId, pedidoId: id, referencia: b.data.referencia, ator: g.ator });
    if (r.ok) { res.json({ ok: true }); return; }
    const [s, error] = MSG[r.motivo]!; res.status(s).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível registrar a devolução."); }
});

router.post(`${G}/pedidos/:id/comprovante`, requireCollaborator, uploadMw, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  const id = idParam(req.params.id);
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!id || !file) { res.status(400).json({ error: "Envie o arquivo do comprovante." }); return; }
  try {
    const r = await anexarComprovante({ pedidoId: id, empresaId: g.empresaId, bytes: file.buffer, origem: "gestor", ator: g.ator });
    if (r.ok) { res.status(201).json({ ok: true }); return; }
    const [s, error] = MSG[r.motivo]!; res.status(s).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível anexar o comprovante."); }
});

router.get(`${G}/pedidos/:id/comprovante`, requireCollaborator, async (req, res): Promise<void> => {
  const g = await gestor(req, res); if (!g) return;
  const id = idParam(req.params.id);
  try {
    const c = id ? await baixarComprovante(null, g.empresaId, id) : null;
    if (!c) { res.status(404).json({ error: "Comprovante não disponível." }); return; }
    res.set({ "Content-Type": c.mime, "Content-Disposition": `attachment; filename="comprovante-pedido-${id}.${c.ext}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.send(c.bytes);
  } catch (err) { falha(req, res, err, "Não foi possível baixar o comprovante."); }
});

export default router;
