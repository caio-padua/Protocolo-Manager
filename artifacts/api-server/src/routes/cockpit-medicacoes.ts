import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { requireCollaborator } from "./collaborator";
import { resolveEmpresaId } from "../middleware/tenantContext";
import {
  decidirMedicacao, editarMedicacaoDoPaciente, ErroMedicacao, listarAutodeclaradasDoPaciente, nomeChave,
  PERIODOS_MEDICACAO, REFEICOES, temConsentimentoAtivo, UNIDADES_DOSE,
} from "../lib/cliente-medicacoes.js";
import { calcularAdesao, prescritasDoLembrete, sincronizarAgendaDoDia } from "../lib/cliente-medicacao-adesao.js";
import { recalcularLembreteDoCliente } from "../lib/lembrete-medicacoes-recalculo.js";
import { brtISODate } from "../lib/brt.js";

// Pausa, retomada, edição e decisão da clínica atualizam o instantâneo de HOJE já na hora (não só na próxima leitura).
// Falha aqui nunca derruba a alteração do cliente: a leitura seguinte sincroniza de novo; a falha vai ao log.
async function sincronizarAgendaSegura(clientId: number): Promise<void> {
  try { await sincronizarAgendaDoDia(pool, clientId, brtISODate()); }
  catch (err) { logger.error({ evento: "agenda_dia_sync_falhou", clientId, errorType: err instanceof Error ? err.constructor.name : typeof err }, "instantâneo do dia não sincronizado"); }
}

// ===========================================================================
// Cockpit > "Adesão & Medicações em Uso". Autenticado (colaborador) e isolado por empresa: o cliente
// precisa ser da empresa do contexto; medicações cadastradas pelo cliente só aparecem com consentimento
// ATIVO dele para esta clínica. Validar/recusar: só médico (ou dono da plataforma). Nada envia mensagem.
// ===========================================================================

const router: IRouter = Router();
const idNum = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

const MSG: Record<string, string> = {
  medicacao_nao_encontrada: "Medicação não encontrada.",
  sem_consentimento_para_a_clinica: "O cliente não autoriza esta clínica a ver/validar este medicamento.",
  motivo_obrigatorio: "Escreva o motivo da recusa.",
  estado_nao_permite_decisao: "Esta medicação já foi decidida ou mudou. Atualize a tela.",
  somente_autodeclarada_precisa_de_validacao: "Só medicações cadastradas pelo cliente precisam de validação.",
  dose_invalida: "Informe a dose com um número maior que zero e a unidade.",
  dose_incompleta: "Informe a dose e a unidade juntas.",
  periodo_invalido: "Horário inválido.", refeicao_invalida: "Opção de refeição inválida.", nome_invalido: "Nome inválido.",
  medicacao_ja_cadastrada: "O cliente já tem outra medicação com esse nome.",
};
function erro(req: Request, res: Response, err: unknown, rotulo: string): void {
  if (err instanceof ErroMedicacao) { res.status(err.status).json({ error: MSG[err.codigo] ?? "Dados inválidos.", codigo: err.codigo }); return; }
  req.log.error({ err: String(err) }, rotulo);
  res.status(500).json({ error: "Não foi possível concluir. Tente novamente." });
}

/** Cliente existe E pertence à empresa do contexto; senão 404 (não revela existência em outra clínica). */
async function clienteDaEmpresa(req: Request, res: Response): Promise<{ clientId: number; empresaId: number } | null> {
  const clientId = idNum(req.params.clientId);
  if (!clientId) { res.status(400).json({ error: "Cliente inválido." }); return null; }
  const empresaId = resolveEmpresaId(req);
  const r = await pool.query(`SELECT 1 FROM clients WHERE id=$1 AND empresa_id=$2`, [clientId, empresaId]);
  if (!r.rows.length) { res.status(404).json({ error: "Cliente não encontrado." }); return null; }
  return { clientId, empresaId };
}

function podeDecidir(req: Request): boolean {
  const t = req.tenantContext;
  return !!t && t.authenticated === true && (t.isPlatformOwner === true || t.perfilPlataforma === "medico");
}

// Fila central da clínica: clientes DESTA empresa com medicação cadastrada por eles aguardando conferência,
// só com consentimento ativo para esta empresa. Leitura liberada a quem acessa o Cockpit; decidir segue só médico.
router.get("/cockpit-medicacoes/fila", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const empresaId = resolveEmpresaId(req);
    const r = await pool.query(
      `SELECT m.id, m.client_id, c.name AS client_name, m.nome, m.dose_valor, m.dose_unidade, m.posologia_texto, m.criado_em
         FROM cliente_medicacoes m
         JOIN clients c ON c.id = m.client_id AND c.empresa_id = $1
        WHERE m.origem = 'autodeclarada' AND m.estado = 'nao_validada' AND m.removido_em IS NULL
          AND EXISTS (SELECT 1 FROM cliente_medicacao_consentimentos k
                       WHERE k.client_id = m.client_id AND k.empresa_id = $1 AND k.revogado_em IS NULL)
        ORDER BY m.criado_em ASC LIMIT 200`,
      [empresaId],
    );
    res.json({
      podeDecidir: podeDecidir(req),
      itens: r.rows.map((x) => ({
        id: x.id, clientId: x.client_id, clientName: x.client_name, nome: x.nome,
        doseValor: x.dose_valor == null ? null : Number(x.dose_valor), doseUnidade: x.dose_unidade, observacao: x.posologia_texto, criadoEm: x.criado_em,
      })),
    });
  } catch (err) { erro(req, res, err, "cockpit medicacoes fila"); }
});

router.get("/cockpit/:clientId/medicacoes", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const c = await clienteDaEmpresa(req, res);
    if (!c) return;
    const consentimentoAtivo = await temConsentimentoAtivo(pool, c.clientId, c.empresaId);
    const todasProprias = await listarAutodeclaradasDoPaciente(pool, c.clientId);
    const prescritas = await prescritasDoLembrete(pool, c.clientId);
    const adesao = await calcularAdesao(pool, c.clientId, brtISODate());
    res.json({
      podeDecidir: podeDecidir(req),
      prescritas,
      // Sem consentimento ativo a clínica NÃO vê nada do que o cliente cadastrou (nem a quantidade).
      cadastradasPeloCliente: { consentimentoAtivo, itens: consentimentoAtivo ? todasProprias : [] },
      // A adesão das próprias só é exibida com consentimento.
      adesao: { prescrita: adesao.prescrita, propria: consentimentoAtivo ? adesao.propria : null },
      opcoes: { periodos: PERIODOS_MEDICACAO, refeicoes: REFEICOES, unidades: UNIDADES_DOSE },
    });
  } catch (err) { erro(req, res, err, "cockpit medicacoes listar"); }
});

const ajusteSchema = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  doseValor: z.number().positive().max(100000).optional(),
  doseUnidade: z.enum(UNIDADES_DOSE).optional(),
  refeicao: z.enum(REFEICOES).nullable().optional(),
  observacao: z.string().trim().max(300).nullable().optional(),
  periodos: z.array(z.enum(PERIODOS_MEDICACAO)).min(1).max(9).refine((a) => new Set(a).size === a.length).optional(),
}).strict().refine((o) => Object.keys(o).length > 0);
const decisaoSchema = z.object({
  decisao: z.enum(["validar", "ajustar", "recusar"]),
  motivo: z.string().trim().max(300).optional(),
  ajuste: ajusteSchema.optional(),
}).strict();

router.post("/cockpit/:clientId/medicacoes/:id/decisao", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const c = await clienteDaEmpresa(req, res);
    if (!c) return;
    if (!podeDecidir(req)) { res.status(403).json({ error: "Somente médico valida ou recusa medicações do cliente." }); return; }
    const id = idNum(req.params.id);
    const p = decisaoSchema.safeParse(req.body);
    if (!id || !p.success || (p.data.decisao === "ajustar" && !p.data.ajuste)) { res.status(400).json({ error: "Dados inválidos." }); return; }
    const profissionalId = req.collaborator?.professionalId;
    if (!profissionalId) { res.status(401).json({ error: "Acesso restrito: faça login de colaborador" }); return; }
    // A medicação precisa ser DESTE cliente (decidirMedicacao só conhece o id da medicação).
    const dono = await pool.query(`SELECT 1 FROM cliente_medicacoes WHERE id=$1 AND client_id=$2 AND removido_em IS NULL`, [id, c.clientId]);
    if (!dono.rows.length) { res.status(404).json({ error: MSG.medicacao_nao_encontrada }); return; }
    if (p.data.decisao === "ajustar") {
      if (!(await temConsentimentoAtivo(pool, c.clientId, c.empresaId))) throw new ErroMedicacao("sem_consentimento_para_a_clinica", 403);
      await editarMedicacaoDoPaciente(pool, c.clientId, id, p.data.ajuste!);
    }
    const estado = await decidirMedicacao(pool, {
      medicacaoId: id, profissionalId, empresaId: c.empresaId,
      decisao: p.data.decisao === "recusar" ? "recusar" : "validar", motivo: p.data.motivo,
    });
    await sincronizarAgendaSegura(c.clientId);
    const lembreteRecalculado = await recalcularLembreteDoCliente(c.clientId, `clinica_${p.data.decisao}`);
    res.json({ estado, lembreteRecalculado });
  } catch (err) { erro(req, res, err, "cockpit medicacoes decidir"); }
});

export default router;
