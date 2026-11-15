import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { verifyPortalToken } from "../lib/portal-token";
import {
  baixarComprovante, cancelarPedido, catalogoDoPortal, criarPedido, iniciarPagamento, listarFavoritos, listarPedidos,
  obterPedido, removerFavorito, salvarFavorito, sincronizarPagamento,
} from "../lib/meus-jogos";
import { resultadosAtuais } from "../lib/meus-jogos-resultados";
import { ehModalidade } from "../lib/meus-jogos-regras";

/**
 * MEUS JOGOS no portal do cliente (jogos individuais; separado de Conexao Milionaria/boloes).
 * O cliente vem SEMPRE do token do portal: nenhuma rota aceita id de cliente ou de clinica vindo do corpo ou da URL.
 * Sem execucao real conectada o servidor RECUSA criar pedido (503): nada e aceito como se fosse registrado.
 */
const router: IRouter = Router();
const P = "/area-paciente/meus-jogos";

function portalClientId(req: Request): number | null {
  const a = req.headers.authorization;
  return a && a.startsWith("Bearer ") ? verifyPortalToken(a.slice(7)) : null;
}
const nao = (res: Response) => void res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." });
const idParam = (v: unknown): number | null => (/^[1-9]\d{0,9}$/.test(String(v ?? "")) ? Number(String(v)) : null);
function falha(req: Request, res: Response, err: unknown, msg: string): void {
  req.log.error({ err: String(err) }, msg);
  if (!res.headersSent) res.status(500).json({ error: msg });
}
const privado = (res: Response) => void res.set("Cache-Control", "private, no-store");

router.get(P, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  try {
    const c = await catalogoDoPortal(clientId);
    if (!c) { res.status(404).json({ error: "Cadastro não encontrado." }); return; }
    privado(res); res.json(c);
  } catch (err) { falha(req, res, err, "Não foi possível carregar Meus Jogos agora."); }
});

// Resultados oficiais: so leitura publica da CAIXA, com estado honesto (ok, desatualizado, indisponivel).
router.get(`${P}/resultados`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  try { privado(res); res.json({ modalidades: await resultadosAtuais() }); }
  catch (err) { falha(req, res, err, "Não foi possível carregar os resultados agora."); }
});

// ------------------------------------------------------------------ favoritos
router.get(`${P}/favoritos`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  try { privado(res); res.json({ favoritos: await listarFavoritos(clientId) }); }
  catch (err) { falha(req, res, err, "Não foi possível carregar os favoritos."); }
});

const Favorito = z.object({ modalidade: z.string(), dezenas: z.array(z.number().int()).max(60), apelido: z.string().max(40).nullish() }).strict();
const MSG_FAV: Record<string, [number, string]> = {
  sem_cadastro: [404, "Cadastro não encontrado."], nao_membro: [403, "Meus Jogos é exclusivo de quem participa do Grupo VIP."],
  aposta_invalida: [422, "Jogo inválido para esta modalidade: confira a quantidade e as dezenas."], limite: [409, "Você já tem 30 favoritos nesta modalidade."],
  apelido_invalido: [422, "O apelido deve ter de 1 a 40 caracteres."],
};
router.post(`${P}/favoritos`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const b = Favorito.safeParse(req.body);
  if (!b.success || !ehModalidade(b.data.modalidade)) { res.status(400).json({ error: "Informe a modalidade e as dezenas." }); return; }
  try {
    const r = await salvarFavorito({ clientId, modalidade: b.data.modalidade, dezenas: b.data.dezenas, apelido: b.data.apelido ?? null });
    if (r.ok) { res.status(r.jaExistia ? 200 : 201).json({ ok: true, id: r.id, jaExistia: r.jaExistia }); return; }
    const [s, error] = MSG_FAV[r.motivo] ?? [409, "Não foi possível salvar o favorito."];
    res.status(s).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível salvar o favorito."); }
});
router.delete(`${P}/favoritos/:id`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const id = idParam(req.params.id);
  try {
    if (!id || !(await removerFavorito(clientId, id))) { res.status(404).json({ error: "Favorito não encontrado." }); return; }
    res.json({ ok: true });
  } catch (err) { falha(req, res, err, "Não foi possível remover o favorito."); }
});

// ------------------------------------------------------------------ pedidos
const Pedido = z.object({ modalidade: z.string(), jogos: z.array(z.array(z.number().int()).max(60)).min(1).max(20), chave: z.string(), concurso: z.number().int().positive().optional() }).strict();
const MSG_PEDIDO: Record<string, [number, string]> = {
  sem_cadastro: [404, "Cadastro não encontrado."],
  nao_membro: [403, "Meus Jogos é exclusivo de quem participa do Grupo VIP."],
  chave_invalida: [400, "Pedido inválido. Tente novamente."],
  chave_reutilizada: [409, "Este envio já foi usado em outro pedido. Monte o pedido novamente."],
  quantidade_jogos: [422, "Envie de 1 a 20 jogos por pedido."],
  jogos_invalidos: [422, "Há jogo inválido: confira a quantidade de dezenas e o intervalo permitido."],
  jogo_repetido: [422, "Há jogos repetidos no pedido."],
  pedido_duplicado: [409, "Você já tem um pedido ativo com estes mesmos jogos neste concurso."],
  acima_do_teto: [422, "O valor do pedido passa do limite definido pela clínica."],
  execucao_indisponivel: [503, "O registro automático dos jogos ainda não está conectado a um canal autorizado. Seus jogos podem ser salvos como favoritos, mas ainda não é possível confirmar pedidos."],
  regras_desatualizadas: [503, "Preços e regras desta modalidade aguardam conferência com a CAIXA. Nenhum pedido é aceito agora."],
  concurso_desconhecido: [503, "O próximo concurso oficial ainda não foi identificado."],
  fechamento_nao_informado: [503, "O horário oficial de fechamento desta modalidade ainda não foi informado pela clínica."],
  fora_do_prazo: [409, "O prazo para novos pedidos deste concurso já passou. Nenhum valor foi cobrado."],
  calendario_indisponivel: [503, "O calendário oficial da CAIXA não está disponível para conferência."],
  calendario_desatualizado: [503, "O calendário oficial venceu e precisa ser atualizado."],
  dados_divergentes: [503, "A data ou o número do concurso diverge da fonte oficial."],
  proximo_indisponivel: [503, "O próximo concurso não foi confirmado nos últimos dez minutos."],
  precos_indisponiveis: [503, "O preço e as regras precisam ser confirmados na fonte oficial."],
  precos_divergentes: [503, "O preço ou as regras divergiram da fonte oficial."],
  concurso_nao_selecionado: [409, "O prazo terminou. Escolha um próximo concurso antes de criar o pedido."],
  concurso_especial: [503, "Este concurso especial ainda não tem preço e regras de venda confirmados."],
};
router.post(`${P}/pedidos`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const b = Pedido.safeParse(req.body);
  if (!b.success || !ehModalidade(b.data.modalidade)) { res.status(400).json({ error: "Informe a modalidade e os jogos." }); return; }
  try {
    const r = await criarPedido({ clientId, modalidade: b.data.modalidade, jogos: b.data.jogos, idempotencyKey: b.data.chave, concurso: b.data.concurso });
    if (r.ok) { res.status(r.repetido ? 200 : 201).json({ ok: true, id: r.id, repetido: r.repetido }); return; }
    const [s, error] = MSG_PEDIDO[r.motivo] ?? [409, "Não foi possível criar o pedido."];
    res.status(s).json({ error: r.mensagem ?? error, motivo: r.motivo, ...(r.pedidoId ? { pedidoId: r.pedidoId } : {}), ...(r.opcoesConcurso ? { opcoesConcurso: r.opcoesConcurso } : {}) });
  } catch (err) { falha(req, res, err, "Não foi possível criar o pedido."); }
});

router.get(`${P}/pedidos`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  try {
    // Atualiza do Asaas (somente leitura) os pedidos que aguardam pagamento antes de listar.
    const antes = await listarPedidos(clientId);
    for (const p of antes) if (p.status === "aguardando_pagamento") await sincronizarPagamento(p.id);
    privado(res); res.json({ pedidos: await listarPedidos(clientId) });
  } catch (err) { falha(req, res, err, "Não foi possível carregar seus pedidos."); }
});

router.get(`${P}/pedidos/:id`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const id = idParam(req.params.id);
  try {
    if (!id || !(await obterPedido(clientId, id))) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
    await sincronizarPagamento(id);
    privado(res); res.json(await obterPedido(clientId, id));
  } catch (err) { falha(req, res, err, "Não foi possível carregar o pedido."); }
});

const MSG_PAGAR: Record<string, [number, string]> = {
  inexistente: [404, "Pedido não encontrado."], estado_invalido: [409, "Este pedido não está aguardando pagamento."],
  cliente_sem_cadastro_pagamento: [409, "Seu cadastro de pagamento ainda não foi criado pela clínica. Fale com a clínica."],
  execucao_indisponivel: [503, "O registro dos jogos está indisponível; o pagamento não pode ser iniciado agora."],
  fora_do_prazo: [409, "O prazo deste pedido passou. Nenhum valor foi cobrado."],
  asaas_indisponivel: [502, "Não foi possível gerar a cobrança agora. Nada foi cobrado; tente novamente."],
  calendario_indisponivel: [503, "O calendário oficial da CAIXA está indisponível."],
  calendario_desatualizado: [503, "O calendário oficial venceu e precisa ser atualizado."],
  dados_divergentes: [503, "A data ou o número do concurso diverge da fonte oficial."],
  proximo_indisponivel: [503, "O próximo concurso não foi confirmado nos últimos dez minutos."],
  precos_indisponiveis: [503, "Preço e regras não foram confirmados na fonte oficial."],
  precos_divergentes: [503, "O preço ou as regras divergiram da fonte oficial."],
  concurso_desconhecido: [503, "Este concurso não consta no calendário oficial validado."],
  concurso_especial: [503, "Este concurso especial não pode receber pagamento enquanto preço e regras não forem verificados."],
};
router.post(`${P}/pedidos/:id/pagar`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const id = idParam(req.params.id);
  if (!id) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  try {
    const r = await iniciarPagamento({ clientId, pedidoId: id });
    if (r.ok) { privado(res); res.json({ ok: true, invoiceUrl: r.invoiceUrl, pix: r.pix }); return; }
    const [s, error] = MSG_PAGAR[r.motivo] ?? [409, "Não foi possível iniciar o pagamento."];
    res.status(s).json({ error, motivo: r.motivo });
  } catch (err) { falha(req, res, err, "Não foi possível iniciar o pagamento."); }
});

router.post(`${P}/pedidos/:id/cancelar`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const id = idParam(req.params.id);
  try {
    const r = id ? await cancelarPedido(clientId, id) : "inexistente";
    if (r === "ok") { res.json({ ok: true }); return; }
    res.status(r === "inexistente" ? 404 : 409).json({ error: r === "inexistente" ? "Pedido não encontrado." : "Este pedido já não pode ser cancelado por aqui." });
  } catch (err) { falha(req, res, err, "Não foi possível cancelar o pedido."); }
});

router.get(`${P}/pedidos/:id/comprovante`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const id = idParam(req.params.id);
  try {
    const c = id ? await baixarComprovante(clientId, null, id) : null;
    if (!c) { res.status(404).json({ error: "Comprovante não disponível." }); return; }
    res.set({ "Content-Type": c.mime, "Content-Disposition": `attachment; filename="comprovante-pedido-${id}.${c.ext}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.send(c.bytes);
  } catch (err) { falha(req, res, err, "Não foi possível baixar o comprovante."); }
});

export default router;
