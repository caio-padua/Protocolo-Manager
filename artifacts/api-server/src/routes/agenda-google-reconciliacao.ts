import { Router, type IRouter, type Response } from "express";
import { requireCollaborator } from "./collaborator";
import { listCalendars, verifyClinicAccount } from "../lib/google-calendar";
import { mayManageAgendaEmpresa } from "../lib/agenda-governance";
import {
  aplicarReconciliacao, planejarReconciliacao, type CalendarioGoogle,
} from "../lib/agenda-google-reconciliacao";

/**
 * Conferência Google x sistema (identidade = id real do calendário). A pré-visualização só LÊ o Google;
 * a aplicação só mexe no cadastro do sistema (renomeia, cria agenda) e nunca em eventos, histórico ou vínculos existentes.
 */
const router: IRouter = Router();

async function carregarCalendarios(res: Response): Promise<CalendarioGoogle[] | null> {
  let conta: { ok: boolean; account: string | null } = { ok: false, account: null };
  try { conta = await verifyClinicAccount(); } catch { /* tratado abaixo */ }
  if (!conta.ok) {
    res.status(409).json({
      code: "google_conta_nao_confirmada",
      error: "Não foi possível confirmar a conta Google da clínica. Nada foi conferido nem alterado.",
      faltando: ["Conexão ativa do Google Agenda com a conta da clínica"],
    });
    return null;
  }
  try {
    const itens = await listCalendars();
    return itens.map((c) => ({
      id: String(c.id), nome: String(c.summary ?? "").trim(), cor: typeof c.backgroundColor === "string" ? c.backgroundColor : null,
      somenteLeitura: !(c.accessRole === "owner" || c.accessRole === "writer"),
    }));
  } catch (err) {
    res.status(502).json({ code: "google_lista_indisponivel", error: `Não foi possível ler a lista de agendas do Google: ${(err as Error).message}`,
      faltando: ["Permissão de leitura da lista de agendas (calendarList)"] });
    return null;
  }
}

async function autorizar(req: Parameters<typeof mayManageAgendaEmpresa>[0], res: Response) {
  if (!(await mayManageAgendaEmpresa(req))) {
    res.status(403).json({ code: "sem_permissao", error: "A conferência de agendas exige administrador autorizado ou responsável técnico." });
    return null;
  }
  return req.tenantContext.empresaId;
}

router.get("/agenda/google/reconciliacao", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = await autorizar(req, res);
  if (!empresaId) return;
  const cals = await carregarCalendarios(res);
  if (!cals) return;
  res.json(await planejarReconciliacao(empresaId, cals));
});

router.post("/agenda/google/reconciliacao/aplicar", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = await autorizar(req, res);
  if (!empresaId) return;
  const somente = Array.isArray(req.body?.googleCalendarIds) ? (req.body.googleCalendarIds as unknown[]).map(String).slice(0, 100) : undefined;
  if (req.body?.confirmar !== true) { res.status(400).json({ code: "confirmacao_obrigatoria", error: "Confirme explicitamente a aplicação." }); return; }
  const cals = await carregarCalendarios(res);
  if (!cals) return;
  const plano = await planejarReconciliacao(empresaId, cals);
  const resultado = await aplicarReconciliacao(empresaId, req.collaborator?.professionalId ?? null, plano, somente);
  res.json({ ...resultado, depois: await planejarReconciliacao(empresaId, cals) });
});

export default router;
