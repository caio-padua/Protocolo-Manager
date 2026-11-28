import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { verifyPatientToken, verifyPortalToken } from "../lib/portal-token";
import {
  clinicasParaConsentimento, editarMedicacaoDoPaciente, ErroMedicacao, listarAutodeclaradasDoPaciente,
  listarPrescritasRegistradas, nomeChave, pausarMedicacaoDoPaciente, PERIODOS_MEDICACAO, REFEICOES,
  registrarConsentimento, registrarMedicacao, removerMedicacaoDoPaciente, revogarConsentimento,
  temVinculoAtivo, textoDeConsentimentoVigente, UNIDADES_DOSE,
} from "../lib/cliente-medicacoes.js";
import { calcularAdesao, horariosDoDia, registrarTomada, sincronizarAgendaDoDia } from "../lib/cliente-medicacao-adesao.js";
import { recalcularLembreteDoCliente, recalculoPendente, tentarRecuperarRecalculo } from "../lib/lembrete-medicacoes-recalculo.js";
import { brtISODate } from "../lib/brt.js";

// Pausa, retomada, edição e decisão da clínica atualizam o instantâneo de HOJE já na hora (não só na próxima leitura).
// Falha aqui nunca derruba a alteração do cliente: a leitura seguinte sincroniza de novo; a falha vai ao log.
async function sincronizarAgendaSegura(clientId: number): Promise<void> {
  try { await sincronizarAgendaDoDia(pool, clientId, brtISODate()); }
  catch (err) { logger.error({ evento: "agenda_dia_sync_falhou", clientId, errorType: err instanceof Error ? err.constructor.name : typeof err }, "instantâneo do dia não sincronizado"); }
}

// ===========================================================================
// MEUS MEDICAMENTOS (Área do Cliente / PaxCare). O clientId vem SEMPRE do token do paciente
// (nunca do corpo ou da URL). Leitura aceita a prévia do administrador; escrita exige o
// paciente autenticado. O paciente só mexe nas PRÓPRIAS medicações autodeclaradas; elas nascem
// sem validação e nunca viram prescrição nem lembrete sem a validação de um profissional.
// Nada aqui envia mensagem.
// ===========================================================================

const router: IRouter = Router();
type ReqPaciente = Request & { medClientId?: number };

function exigeLeitura(req: Request, res: Response, next: NextFunction): void {
  const a = req.headers.authorization;
  const id = a && a.startsWith("Bearer ") ? verifyPortalToken(a.slice(7)) : null;
  if (id === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  (req as ReqPaciente).medClientId = id; next();
}
function exigeEscrita(req: Request, res: Response, next: NextFunction): void {
  const a = req.headers.authorization;
  const id = a && a.startsWith("Bearer ") ? verifyPatientToken(a.slice(7)) : null;
  if (id === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  (req as ReqPaciente).medClientId = id; next();
}
const cid = (req: Request) => (req as ReqPaciente).medClientId!;
const idParam = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

const MSG: Record<string, string> = {
  nome_invalido: "Informe o nome do medicamento (até 200 letras).",
  dose_invalida: "Informe a dose com um número maior que zero e a unidade.",
  dose_incompleta: "Informe a dose e a unidade juntas.",
  periodo_invalido: "Horário inválido.",
  refeicao_invalida: "Opção de refeição inválida.",
  medicacao_ja_cadastrada: "Você já cadastrou este medicamento.",
  limite_de_medicacoes: "Limite de medicamentos cadastrados atingido.",
  medicacao_nao_encontrada: "Medicamento não encontrado.",
  status_invalido: "Escolha Tomei ou Esqueci.",
  horario_nao_encontrado: "Esse horário não está na sua rotina.",
  horario_ambiguo: "Há dois medicamentos com o mesmo nome neste horário. Atualize a tela e tente de novo.",
  texto_de_consentimento_desatualizado: "O texto de autorização mudou. Leia de novo e confirme.",
};
function responderErro(req: Request, res: Response, err: unknown, rotulo: string): void {
  if (err instanceof ErroMedicacao) { res.status(err.status).json({ error: MSG[err.codigo] ?? "Dados inválidos.", codigo: err.codigo }); return; }
  req.log.error({ err: String(err) }, rotulo);
  res.status(500).json({ error: "Não foi possível concluir. Tente novamente." });
}

const periodoSchema = z.enum(PERIODOS_MEDICACAO);
const baseSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  doseValor: z.number().positive().max(100000),
  doseUnidade: z.enum(UNIDADES_DOSE),
  refeicao: z.enum(REFEICOES).nullable().optional(),
  observacao: z.string().trim().max(300).nullable().optional(),
  periodos: z.array(periodoSchema).min(1).max(9).refine((a) => new Set(a).size === a.length),
});
const novoSchema = baseSchema.strict();
const edicaoSchema = baseSchema.partial().strict().refine((o) => Object.keys(o).length > 0);

interface FormulaLembrete { nome: string; dose?: string; posologia?: string; observacaoRefeicao?: string }
interface PeriodoLembrete { sigla?: string; nome: string; tipo: string; formulas: FormulaLembrete[] }

router.get("/area-paciente/medicacoes", exigeLeitura, async (req, res): Promise<void> => {
  try {
    const clientId = cid(req);
    const [proprias, registradas, lembrete, clinicas] = await Promise.all([
      listarAutodeclaradasDoPaciente(pool, clientId),
      listarPrescritasRegistradas(pool, clientId),
      pool.query(`SELECT periodos FROM lembretes_prescricao WHERE cliente_id=$1`, [clientId]),
      clinicasParaConsentimento(pool, clientId),
    ]);
    // Prescritas pela clínica = fórmulas do lembrete da prescrição emitida. Nome igual ao de uma medicação
    // cadastrada pelo paciente NÃO esconde nem substitui a prescrição: as duas listas ficam separadas por origem.
    const porNome = new Map<string, { nome: string; dose: string | null; observacao: string | null; periodos: string[] }>();
    for (const per of ((lembrete.rows[0]?.periodos ?? []) as PeriodoLembrete[])) {
      if (per.tipo !== "tomar") continue;
      for (const f of per.formulas ?? []) {
        const k = nomeChave(f.nome);
        const atual = porNome.get(k) ?? { nome: f.nome, dose: f.dose ?? null, observacao: f.observacaoRefeicao ?? f.posologia ?? null, periodos: [] };
        if (!atual.periodos.includes(per.nome)) atual.periodos.push(per.nome);
        porNome.set(k, atual);
      }
    }
    for (const r of registradas) if (!porNome.has(nomeChave(r.nome))) porNome.set(nomeChave(r.nome), { ...r, periodos: r.periodos.map(String) });
    await tentarRecuperarRecalculo(clientId);
    res.json({
      lembretePendente: await recalculoPendente(clientId),
      prescritas: [...porNome.values()],
      proprias,
      clinicas,
      consentimento: textoDeConsentimentoVigente(),
      opcoes: { periodos: PERIODOS_MEDICACAO, refeicoes: REFEICOES, unidades: UNIDADES_DOSE },
    });
  } catch (err) { responderErro(req, res, err, "area medicacoes listar"); }
});

router.post("/area-paciente/medicacoes", exigeEscrita, async (req, res): Promise<void> => {
  const p = novoSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Confira o nome, a dose, a unidade e ao menos um horário." }); return; }
  try {
    // origem e estado são decididos pelo servidor; o corpo não os aceita (schema strict).
    const r = await registrarMedicacao(pool, {
      clientId: cid(req), origem: "autodeclarada", nome: p.data.nome, doseValor: p.data.doseValor,
      doseUnidade: p.data.doseUnidade, refeicao: p.data.refeicao ?? null, posologiaTexto: p.data.observacao ?? null,
      periodos: p.data.periodos,
    });
    res.status(201).json(r);
  } catch (err) { responderErro(req, res, err, "area medicacoes criar"); }
});

router.patch("/area-paciente/medicacoes/:id", exigeEscrita, async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  // Pausar/retomar é ação à parte e não mexe na validação.
  if (id && Object.keys(body).length === 1 && typeof body.pausada === "boolean") {
    try {
      const r = await pausarMedicacaoDoPaciente(pool, cid(req), id, body.pausada);
      await sincronizarAgendaSegura(cid(req));
    const lembreteRecalculado = await recalcularLembreteDoCliente(cid(req), body.pausada ? "paciente_pausou" : "paciente_retomou");
      res.json({ ...r, lembreteRecalculado });
    }
    catch (err) { responderErro(req, res, err, "area medicacoes pausar"); }
    return;
  }
  const p = edicaoSchema.safeParse(body);
  if (!id || !p.success) { res.status(400).json({ error: "Dados inválidos." }); return; }
  try {
    const r = await editarMedicacaoDoPaciente(pool, cid(req), id, p.data);
    await sincronizarAgendaSegura(cid(req));
    const lembreteRecalculado = await recalcularLembreteDoCliente(cid(req), "paciente_editou");
    res.json({ ...r, lembreteRecalculado });
  }
  catch (err) { responderErro(req, res, err, "area medicacoes editar"); }
});

router.delete("/area-paciente/medicacoes/:id", exigeEscrita, async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (!id) { res.status(400).json({ error: "Medicamento inválido." }); return; }
  try {
    await removerMedicacaoDoPaciente(pool, cid(req), id);
    await sincronizarAgendaSegura(cid(req));
    const lembreteRecalculado = await recalcularLembreteDoCliente(cid(req), "paciente_excluiu");
    res.json({ ok: true, lembreteRecalculado });
  }
  catch (err) { responderErro(req, res, err, "area medicacoes excluir"); }
});

const consentSchema = z.object({ empresaId: z.number().int().positive(), hash: z.string().length(64) }).strict();

router.post("/area-paciente/medicacoes/consentimentos", exigeEscrita, async (req, res): Promise<void> => {
  const p = consentSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Escolha a clínica e confirme o texto." }); return; }
  try {
    if (!(await temVinculoAtivo(pool, cid(req), p.data.empresaId))) {
      res.status(404).json({ error: "Clínica não vinculada ao seu PaxCare." }); return;
    }
    const r = await registrarConsentimento(pool, { clientId: cid(req), empresaId: p.data.empresaId, hashAceito: p.data.hash });
    res.status(r.jaExistia ? 200 : 201).json({ ok: true });
  } catch (err) { responderErro(req, res, err, "area medicacoes consentir"); }
});

router.delete("/area-paciente/medicacoes/consentimentos/:empresaId", exigeEscrita, async (req, res): Promise<void> => {
  const empresaId = idParam(req.params.empresaId);
  if (!empresaId) { res.status(400).json({ error: "Clínica inválida." }); return; }
  try {
    const ok = await revogarConsentimento(pool, { clientId: cid(req), empresaId });
    if (!ok) { res.status(404).json({ error: "Não há autorização ativa para esta clínica." }); return; }
    await sincronizarAgendaSegura(cid(req));
    const lembreteRecalculado = await recalcularLembreteDoCliente(cid(req), "paciente_revogou_consentimento");
    res.json({ ok: true, lembreteRecalculado });
  } catch (err) { responderErro(req, res, err, "area medicacoes revogar"); }
});

const tomadaSchema = z.object({
  origem: z.enum(["prescrita", "propria"]),
  nome: z.string().trim().min(1).max(200),
  sigla: z.string().trim().min(2).max(3),
  status: z.enum(["tomei", "esqueci"]),
  referenciaId: z.number().int().positive().nullish(),
}).strict();

// Horários-chave de hoje + adesão 7/15/30 dias, separados por origem. A data é SEMPRE a de Brasília no servidor.
router.get("/area-paciente/medicacoes/adesao", exigeLeitura, async (req, res): Promise<void> => {
  try {
    const hoje = brtISODate();
    res.json({ hoje: await horariosDoDia(pool, cid(req), hoje), adesao: await calcularAdesao(pool, cid(req), hoje), data: hoje });
  } catch (err) { responderErro(req, res, err, "area medicacoes adesao"); }
});

router.post("/area-paciente/medicacoes/tomadas", exigeEscrita, async (req, res): Promise<void> => {
  const p = tomadaSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Escolha o medicamento, o horário e Tomei ou Esqueci." }); return; }
  try {
    await registrarTomada(pool, { clientId: cid(req), hoje: brtISODate(), ...p.data });
    res.json({ ok: true });
  } catch (err) { responderErro(req, res, err, "area medicacoes tomada"); }
});

export default router;
