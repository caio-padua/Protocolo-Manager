import { Router, type IRouter } from "express";
import { requireCollaborator } from "./collaborator";
import { mayManageAgendaEmpresa } from "../lib/agenda-governance";
import {
  carregarConflitoAberto, fecharConflitoGoogle, listarConflitosGoogle,
} from "../lib/agenda-google-conflitos";
import { refreshSessionEventInPlace } from "../lib/session-google-sync";

/**
 * Conflitos de edição concorrente (alguém mudou o evento direto no Google depois do último envio do sistema).
 * O sistema nunca sobrescreve sozinho: um responsável decide aqui, e a decisão fica registrada com autor e hora.
 *  - enviar_sistema: grava por cima o horário e o título do sistema no MESMO evento (mesmo identificador, sem duplicar).
 *  - dispensar: mantém o Google como está e fecha o aviso. A visita no sistema NÃO muda; a próxima atualização
 *    do sistema para esse evento volta a ser bloqueada enquanto o Google continuar diferente.
 */
const router: IRouter = Router();

async function autorizar(req: Parameters<typeof mayManageAgendaEmpresa>[0], res: import("express").Response) {
  if (!(await mayManageAgendaEmpresa(req))) {
    res.status(403).json({ code: "sem_permissao", error: "Decidir conflitos com o Google exige administrador autorizado ou responsável técnico." });
    return null;
  }
  const empresaId = req.tenantContext.empresaId;
  if (!empresaId) { res.status(403).json({ code: "sem_empresa", error: "Selecione a empresa." }); return null; }
  return empresaId;
}

router.get("/agenda/google/conflitos", requireCollaborator, async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const empresaId = await autorizar(req, res);
  if (!empresaId) return;
  try {
    const estado = req.query.estado === "todos" ? "todos" : "aberto";
    res.json({ conflitos: await listarConflitosGoogle(empresaId, estado) });
  } catch (error) {
    req.log?.error({ err: error }, "Falha ao listar conflitos com o Google");
    res.status(500).json({ code: "conflitos_indisponiveis", error: "Não foi possível consultar os conflitos com o Google." });
  }
});

router.post("/agenda/google/conflitos/:id/resolver", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = await autorizar(req, res);
  if (!empresaId) return;
  const id = Number(req.params.id);
  const decisao = req.body?.decisao;
  if (!Number.isSafeInteger(id) || id <= 0 || (decisao !== "enviar_sistema" && decisao !== "dispensar")) {
    res.status(400).json({ code: "pedido_invalido", error: "Informe o conflito e a decisão (enviar_sistema ou dispensar)." });
    return;
  }
  if (req.body?.confirmar !== true) {
    res.status(400).json({ code: "confirmacao_obrigatoria", error: "Confirme explicitamente a decisão." });
    return;
  }
  const atorId = req.collaborator?.professionalId ?? null;
  try {
    const conflito = await carregarConflitoAberto(empresaId, id);
    if (!conflito) { res.status(404).json({ code: "conflito_nao_encontrado", error: "Conflito não encontrado nesta empresa." }); return; }
    if (conflito.estado !== "aberto") { res.status(409).json({ code: "conflito_ja_decidido", error: "Este conflito já foi decidido." }); return; }
    if (decisao === "dispensar") {
      await fecharConflitoGoogle(empresaId, id, "dispensado", "dispensar", atorId);
      res.json({ ok: true, estado: "dispensado", mensagem: "Aviso dispensado. O Google continua como está e o sistema não enviou nada." });
      return;
    }
    const resultado = await refreshSessionEventInPlace(conflito.sessaoId, empresaId, { forcarGoogle: true });
    if (!resultado) {
      await fecharConflitoGoogle(empresaId, id, "dispensado", "sessao_sem_evento", atorId);
      res.json({ ok: true, estado: "dispensado", mensagem: "A visita não está mais ativa no Google; nada foi enviado e o aviso foi encerrado." });
      return;
    }
    if (resultado.status !== "sincronizado") {
      res.status(resultado.status === "incerto" ? 409 : 502).json({
        code: resultado.code ?? "erro_google",
        error: `${resultado.error ?? "O Google não confirmou o envio."} O conflito continua aberto; nada foi marcado como resolvido.`,
      });
      return;
    }
    await fecharConflitoGoogle(empresaId, id, "resolvido", "enviar_sistema", atorId);
    res.json({ ok: true, estado: "resolvido", mensagem: "Horário e título do sistema enviados ao mesmo evento do Google." });
  } catch (error) {
    req.log?.error({ err: error }, "Falha ao decidir conflito com o Google");
    res.status(500).json({ code: "falha_ao_decidir", error: "Não foi possível concluir a decisão. Nada foi marcado como resolvido." });
  }
});

export default router;
