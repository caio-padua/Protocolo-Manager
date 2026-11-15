import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { verifyPortalToken } from "../lib/portal-token";
import {
  boloesDisponiveis, definirJogos, entrarNoBolao, participacoesDoPortal, recusarConviteBolao, responderGrupo, statusDoMembro,
  type RespostaGrupo,
} from "../lib/grupo-vip";

/**
 * Grupo VIP no portal do paciente. O cliente vem SEMPRE do token do portal (Authorization: Bearer):
 * nenhuma rota aceita id de cliente, de clinica ou de participacao de outra pessoa vindo do corpo ou da URL.
 * Nada aqui cobra, chama Asaas ou CAIXA, envia mensagem, compra ou aposta. Independente de Prata/Ouro/Platinum/Diamond.
 */
const router: IRouter = Router();
const P = "/area-paciente/grupo-vip";

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

router.get(P, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  try {
    const status = await statusDoMembro(clientId);
    const ativo = status === "ativo";
    res.set("Cache-Control", "private, no-store");
    res.json({
      status,
      boloes: ativo ? await boloesDisponiveis(clientId) : [],
      participacoes: await participacoesDoPortal(clientId),
    });
  } catch (err) { falha(req, res, err, "Não foi possível carregar o Grupo VIP agora."); }
});

const MSG_GRUPO: Record<string, [number, string]> = {
  sem_cadastro: [404, "Cadastro não encontrado."],
  sem_convite: [404, "Você não tem convite para o Grupo VIP."],
  estado_invalido: [409, "Esta resposta não se aplica ao seu estado atual."],
};
for (const acao of ["aceitar", "recusar", "sair"] as const) {
  router.post(`${P}/${acao}`, async (req, res): Promise<void> => {
    const clientId = portalClientId(req);
    if (!clientId) return nao(res);
    try {
      const r = await responderGrupo(clientId, acao as RespostaGrupo);
      if (r.ok) { res.json({ ok: true, status: r.status }); return; }
      const [status, error] = MSG_GRUPO[r.motivo] ?? [409, "Não foi possível registrar a resposta."];
      res.status(status).json({ error });
    } catch (err) { falha(req, res, err, "Não foi possível registrar a resposta."); }
  });
}

const Entrar = z.object({ cotas: z.number().int().min(1).max(1000) }).strict();
const MSG_ENTRADA: Record<string, [number, string]> = {
  sem_cadastro: [404, "Cadastro não encontrado."],
  nao_membro: [403, "Participe do Grupo VIP aceitando o convite para entrar em bolões."],
  bolao_indisponivel: [404, "Bolão não encontrado ou não está aberto."],
  ja_participa: [409, "Você já participa deste bolão."],
  sem_cotas: [409, "Não há cotas suficientes neste bolão."],
};
router.post(`${P}/boloes/:id/entrar`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const id = idParam(req.params.id);
  const b = Entrar.safeParse(req.body);
  if (!id) { res.status(404).json({ error: "Bolão não encontrado ou não está aberto." }); return; }
  if (!b.success) { res.status(400).json({ error: "Informe a quantidade de cotas (1 a 1000)." }); return; }
  try {
    const r = await entrarNoBolao({ clientId, campanhaId: id, cotas: b.data.cotas });
    if (r.ok) { res.status(201).json({ ok: true, participacaoId: r.participacaoId }); return; }
    const [status, error] = MSG_ENTRADA[r.motivo] ?? [409, "Não foi possível entrar no bolão."];
    res.status(status).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível entrar no bolão."); }
});

router.post(`${P}/boloes/:id/recusar`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const id = idParam(req.params.id);
  try {
    if (!id || !(await recusarConviteBolao(clientId, id))) { res.status(404).json({ error: "Convite não encontrado." }); return; }
    res.json({ ok: true });
  } catch (err) { falha(req, res, err, "Não foi possível recusar o convite."); }
});

const MSG_JOGOS: Record<string, [number, string]> = {
  inexistente: [404, "Participação não encontrada."],
  cancelada: [409, "Participação cancelada não recebe jogos."],
  bolao_fechado: [409, "O bolão não está aberto."],
  origem_nao_permitida: [409, "Neste bolão os jogos são definidos pela clínica."],
  ja_efetivado: [409, "Já existe comprovante oficial; os jogos não podem mais ser alterados."],
  regras_ausentes: [409, "O bolão não tem as regras de dezenas definidas."],
  quantidade: [422, "A quantidade de jogos não confere com as suas cotas e a regra do bolão."],
  dezenas_invalidas: [422, "Dezenas inválidas: respeite a quantidade por jogo e o universo, sem repetir dezenas nem jogos."],
};
const Jogos = z.object({ jogos: z.array(z.array(z.number().int()).max(30)).max(400) }).strict();
router.put(`${P}/participacoes/:id/jogos`, async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return nao(res);
  const id = idParam(req.params.id);
  const b = Jogos.safeParse(req.body);
  if (!id) { res.status(404).json({ error: "Participação não encontrada." }); return; }
  if (!b.success) { res.status(400).json({ error: "Envie os jogos como listas de dezenas." }); return; }
  try {
    const r = await definirJogos({ participacaoId: id, origem: "participante", empresaId: null, clientId, jogos: b.data.jogos, ator: { texto: `cliente:${clientId}`, profissionalId: null } });
    if (r.ok) { res.json({ ok: true, jogos: r.jogos }); return; }
    const [status, error] = MSG_JOGOS[r.motivo] ?? [409, "Não foi possível salvar os jogos."];
    res.status(status).json({ error });
  } catch (err) { falha(req, res, err, "Não foi possível salvar os jogos."); }
});

export default router;
