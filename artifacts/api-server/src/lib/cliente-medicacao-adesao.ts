/**
 * Adesão às medicações (Tomei / Esqueci) e recálculo do lembrete.
 *
 * Regras:
 *  - Duas listas SEMPRE separadas: 'prescritas' (fórmulas do lembrete emitido pela clínica) e
 *    'proprias' (autodeclaradas pelo cliente). Nome igual NUNCA funde nem substitui: a prescrição
 *    da clínica permanece na lista de prescritas e a medicação do cliente na de próprias.
 *  - O registro é do dia de Brasília informado pela rota; um horário-chave só tem UM estado por dia
 *    (corrigir "Esqueci" para "Tomei" troca a linha; nada é apagado de outras datas).
 *  - Denominador REAL: cada dia grava um instantâneo dos horários esperados (cliente_medicacao_agenda_dia).
 *    A janela só conta dias que têm instantâneo; dias anteriores ao início do histórico ficam FORA do
 *    cálculo e aparecem como "sem histórico" (nunca estimados). Sem registro NÃO conta como tomado.
 *  - Nada aqui envia mensagem.
 */
import type { Pool } from "pg";
import {
  ErroMedicacao, listarAutodeclaradasDoPaciente, nomeChave, PERIODOS_MEDICACAO,
  type MedicacaoDoPaciente, type PeriodoMedicacao,
} from "./cliente-medicacoes.js";
import type { ItemLembretePrescricao, PeriodoAntigo } from "./lembrete-periodo.js";

export const SIGLA_POR_PERIODO: Record<PeriodoMedicacao, { sigla: string; nome: string }> = {
  jejum: { sigla: "JE", nome: "Jejum" },
  manha: { sigla: "IM", nome: "Início da Manhã" },
  meio_manha: { sigla: "MM", nome: "Meio da Manhã" },
  almoco: { sigla: "AL", nome: "Almoço" },
  tarde: { sigla: "IT", nome: "Início da Tarde" },
  meio_tarde: { sigla: "MT", nome: "Meio da Tarde" },
  noite: { sigla: "NO", nome: "Noite" },
  final_noite: { sigla: "FN", nome: "Final da Noite" },
  ceia: { sigla: "CE", nome: "Ceia" },
};
const PERIODO_POR_SIGLA = Object.fromEntries(
  PERIODOS_MEDICACAO.map((p) => [SIGLA_POR_PERIODO[p].sigla, p]),
) as Record<string, PeriodoMedicacao>;

export type OrigemLista = "prescrita" | "propria";
export const JANELAS_ADESAO = [7, 15, 30] as const;

const DDL = [
  `CREATE TABLE IF NOT EXISTS cliente_medicacao_tomadas (
     id          SERIAL PRIMARY KEY,
     client_id   INTEGER NOT NULL REFERENCES clients(id),
     origem      TEXT NOT NULL,
     nome_chave  TEXT NOT NULL,
     data        DATE NOT NULL,
     periodo     TEXT NOT NULL,
     status      TEXT NOT NULL,
     criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
     atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT cliente_medicacao_tomadas_origem_ck CHECK (origem IN ('prescrita','propria')),
     CONSTRAINT cliente_medicacao_tomadas_status_ck CHECK (status IN ('tomei','esqueci'))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_medicacao_tomadas
     ON cliente_medicacao_tomadas (client_id, origem, nome_chave, data, periodo)`,
  `CREATE INDEX IF NOT EXISTS ix_cliente_medicacao_tomadas_cliente_data
     ON cliente_medicacao_tomadas (client_id, data)`,
  // Instantâneo diário dos horários esperados (histórico real do denominador). Só cresce; nunca é recalculado para trás.
  `CREATE TABLE IF NOT EXISTS cliente_medicacao_agenda_dia (
     client_id  INTEGER NOT NULL REFERENCES clients(id),
     data       DATE NOT NULL,
     origem     TEXT NOT NULL,
     nome_chave TEXT NOT NULL,
     periodo    TEXT NOT NULL,
     medicacao_id INTEGER,
     registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (client_id, data, origem, nome_chave, periodo),
     CONSTRAINT cliente_medicacao_agenda_dia_origem_ck CHECK (origem IN ('prescrita','propria'))
   )`,
  `ALTER TABLE cliente_medicacao_tomadas ADD COLUMN IF NOT EXISTS medicacao_id INTEGER`,
  // Situação do horário no dia: ativo (conta no denominador), suspenso (medicação pausada) ou retirado (horário
  // deixou de existir naquele dia por alteração). Linhas nunca são apagadas; só mudam de situação.
  `ALTER TABLE cliente_medicacao_agenda_dia ADD COLUMN IF NOT EXISTS situacao TEXT NOT NULL DEFAULT 'ativo'`,
];

/** Aditivo e idempotente (Regra de Ouro: nunca DROP). */
export async function criarTabelaTomadas(pool: Pick<Pool, "query">): Promise<void> {
  for (const stmt of DDL) await pool.query(stmt);
}

export interface HorarioDoDia {
  origem: OrigemLista; nome: string; nomeChave: string; dose: string | null;
  sigla: string; periodoNome: string; status: "tomei" | "esqueci" | null;
}
export interface MedicacaoPrescrita { nome: string; dose: string | null; observacao: string | null; periodos: { sigla: string; nome: string }[] }

interface FormulaLembrete { nome: string; dose?: string; posologia?: string; observacaoRefeicao?: string }
interface PeriodoLembrete { sigla?: string; nome: string; tipo: string; formulas: FormulaLembrete[] }

/** Fórmulas "tomar" do lembrete gravado. Nome igual a uma medicação do cliente NÃO remove a prescrição. */
export async function prescritasDoLembrete(pool: Pick<Pool, "query">, clientId: number): Promise<MedicacaoPrescrita[]> {
  const r = await pool.query(`SELECT periodos FROM lembretes_prescricao WHERE cliente_id=$1`, [clientId]);
  const porNome = new Map<string, MedicacaoPrescrita>();
  for (const per of ((r.rows[0]?.periodos ?? []) as PeriodoLembrete[])) {
    if (per.tipo !== "tomar" || !per.sigla) continue;
    for (const f of per.formulas ?? []) {
      const k = nomeChave(f.nome);
      const atual = porNome.get(k) ?? { nome: f.nome, dose: f.dose ?? null, observacao: f.observacaoRefeicao ?? f.posologia ?? null, periodos: [] };
      if (!atual.periodos.some((p) => p.sigla === per.sigla)) atual.periodos.push({ sigla: per.sigla, nome: per.nome });
      porNome.set(k, atual);
    }
  }
  return [...porNome.values()];
}

function doseTexto(m: MedicacaoDoPaciente): string | null {
  return m.doseValor != null && m.doseUnidade ? `${String(m.doseValor).replace(".", ",")} ${m.doseUnidade}` : null;
}

/** Horários-chave de HOJE (dose por horário) com o estado já registrado. */
export async function horariosDoDia(pool: Pick<Pool, "query">, clientId: number, hoje: string): Promise<HorarioDoDia[]> {
  const proprias = (await listarAutodeclaradasDoPaciente(pool, clientId))
    .filter((m) => !m.pausada && (m.estado === "nao_validada" || m.estado === "validada"));
  const prescritas = await prescritasDoLembrete(pool, clientId);
  const itens: Omit<HorarioDoDia, "status">[] = [];
  for (const m of prescritas) {
    for (const p of m.periodos) itens.push({ origem: "prescrita", nome: m.nome, nomeChave: nomeChave(m.nome), dose: m.dose, sigla: p.sigla, periodoNome: p.nome });
  }
  for (const m of proprias) {
    for (const p of m.periodos) {
      itens.push({ origem: "propria", nome: m.nome, nomeChave: nomeChave(m.nome), dose: doseTexto(m), sigla: SIGLA_POR_PERIODO[p].sigla, periodoNome: SIGLA_POR_PERIODO[p].nome });
    }
  }
  const t = await pool.query(
    `SELECT origem, nome_chave, periodo, status FROM cliente_medicacao_tomadas WHERE client_id=$1 AND data=$2::date`,
    [clientId, hoje],
  );
  const mapa = new Map<string, "tomei" | "esqueci">(t.rows.map((x) => [`${x.origem}|${x.nome_chave}|${x.periodo}`, x.status]));
  return itens.map((i) => ({ ...i, status: mapa.get(`${i.origem}|${i.nomeChave}|${i.sigla}`) ?? null }));
}

/** Registra/corrige Tomei ou Esqueci. O horário precisa existir na rotina atual do cliente. */
export async function registrarTomada(
  pool: Pick<Pool, "query">,
  p: { clientId: number; hoje: string; origem: OrigemLista; nome: string; sigla: string; status: "tomei" | "esqueci" },
): Promise<void> {
  if (p.status !== "tomei" && p.status !== "esqueci") throw new ErroMedicacao("status_invalido");
  const chave = nomeChave(p.nome ?? "");
  const doDia = await horariosDoDia(pool, p.clientId, p.hoje);
  const existe = doDia.some((h) => h.origem === p.origem && h.nomeChave === chave && h.sigla === p.sigla);
  if (!existe) throw new ErroMedicacao("horario_nao_encontrado", 404);
  await sincronizarAgendaDoDia(pool, p.clientId, p.hoje); // o denominador do dia nasce junto do primeiro registro
  await pool.query(
    `INSERT INTO cliente_medicacao_tomadas (client_id, origem, nome_chave, data, periodo, status)
     VALUES ($1,$2,$3,$4::date,$5,$6)
     ON CONFLICT (client_id, origem, nome_chave, data, periodo)
     DO UPDATE SET status = EXCLUDED.status, atualizado_em = now()`,
    [p.clientId, p.origem, chave, p.hoje, p.sigla, p.status],
  );
}

export type SituacaoHorario = "ativo" | "suspenso" | "retirado";
export interface DiaAdesao { data: string; tomei: number; esqueci: number; esperado: number; comHistorico: boolean; suspenso: number; retirado: number }
export interface JanelaAdesao {
  dias: number; tomei: number; esqueci: number; semRegistro: number; esperado: number; percentual: number | null;
  /** Dias da janela com instantâneo real dos horários; os demais ficam fora do cálculo (sem histórico). */
  diasComHistorico: number; diasSemHistorico: number;
  /** Horários de medicação pausada / retirados da rotina no período: ficam FORA do denominador, mas visíveis. */
  suspenso: number; retirado: number; diasSuspensos: number;
}
export interface AdesaoLista { esperadoPorDia: number; janelas: JanelaAdesao[]; historico: DiaAdesao[] }

/** Grava (sem apagar nada) os horários esperados de hoje. Chamado a cada leitura/registro do dia. */
export async function registrarAgendaDoDia(
  pool: Pick<Pool, "query">, clientId: number, hoje: string,
  horarios: Pick<HorarioDoDia, "origem" | "nomeChave" | "sigla">[],
  idsPorChave: Map<string, number> = new Map(),
): Promise<void> {
  for (const h of horarios) {
    await pool.query(
      `INSERT INTO cliente_medicacao_agenda_dia (client_id, data, origem, nome_chave, periodo, medicacao_id)
       VALUES ($1,$2::date,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [clientId, hoje, h.origem, h.nomeChave, h.sigla, h.origem === "propria" ? (idsPorChave.get(h.nomeChave) ?? null) : null],
    );
  }
}

/**
 * Sincroniza o instantâneo de HOJE com a rotina atual: retomada volta a "ativo"; pausa vira "suspenso" (se ainda sem
 * resposta); horário alterado/removido vira "retirado" (se sem resposta). Respondido nunca muda de situação.
 */
export async function sincronizarAgendaDoDia(pool: Pick<Pool, "query">, clientId: number, hoje: string): Promise<HorarioDoDia[]> {
  const horarios = await horariosDoDia(pool, clientId, hoje);
  const ids = await pool.query(`SELECT id, nome_chave FROM cliente_medicacoes WHERE client_id=$1 AND origem='autodeclarada' AND removido_em IS NULL`, [clientId]);
  const idsPorChave = new Map<string, number>(ids.rows.map((x) => [x.nome_chave as string, Number(x.id)]));
  const ativos = new Set(horarios.map((h) => `${h.origem}|${h.nomeChave}|${h.sigla}`));
  const pausadas = (await listarAutodeclaradasDoPaciente(pool, clientId))
    .filter((m) => m.pausada && (m.estado === "nao_validada" || m.estado === "validada"));
  const suspensos = new Set<string>();
  for (const m of pausadas) for (const per of m.periodos) suspensos.add(`propria|${nomeChave(m.nome)}|${SIGLA_POR_PERIODO[per].sigla}`);
  for (const h of horarios) {
    await pool.query(
      `INSERT INTO cliente_medicacao_agenda_dia (client_id, data, origem, nome_chave, periodo, medicacao_id)
       VALUES ($1,$2::date,$3,$4,$5,$6)
       ON CONFLICT (client_id, data, origem, nome_chave, periodo) DO UPDATE SET situacao='ativo' WHERE cliente_medicacao_agenda_dia.situacao <> 'ativo'`,
      [clientId, hoje, h.origem, h.nomeChave, h.sigla, h.origem === "propria" ? (idsPorChave.get(h.nomeChave) ?? null) : null],
    );
  }
  const jaRespondido = `EXISTS (SELECT 1 FROM cliente_medicacao_tomadas t WHERE t.client_id=a.client_id AND t.data=a.data
                          AND t.origem=a.origem AND t.nome_chave=a.nome_chave AND t.periodo=a.periodo)`;
  for (const k of suspensos) {
    if (ativos.has(k)) continue;
    const [origem, nome, sigla] = k.split("|");
    await pool.query(
      `INSERT INTO cliente_medicacao_agenda_dia AS a (client_id, data, origem, nome_chave, periodo, medicacao_id, situacao)
       VALUES ($1,$2::date,$3,$4,$5,$6,'suspenso')
       ON CONFLICT (client_id, data, origem, nome_chave, periodo) DO UPDATE SET situacao='suspenso'
         WHERE a.situacao='ativo' AND NOT ${jaRespondido}`,
      [clientId, hoje, origem, nome, sigla, idsPorChave.get(nome) ?? null],
    );
  }
  const hojeRows = await pool.query(
    `SELECT origem, nome_chave, periodo, situacao FROM cliente_medicacao_agenda_dia WHERE client_id=$1 AND data=$2::date`, [clientId, hoje]);
  for (const x of hojeRows.rows) {
    const k = `${x.origem}|${x.nome_chave}|${x.periodo}`;
    if (x.situacao === "ativo" && !ativos.has(k) && !suspensos.has(k)) {
      await pool.query(
        `UPDATE cliente_medicacao_agenda_dia a SET situacao='retirado'
          WHERE a.client_id=$1 AND a.data=$2::date AND a.origem=$3 AND a.nome_chave=$4 AND a.periodo=$5 AND a.situacao='ativo' AND NOT ${jaRespondido}`,
        [clientId, hoje, x.origem, x.nome_chave, x.periodo]);
    }
  }
  return horarios;
}

function somaDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Cálculo puro (testável). `agendaPorDia` = instantâneos reais (data -> origem -> chaves "nome|sigla").
 * Sem instantâneo no dia, o dia NÃO entra no denominador nem no numerador (sem histórico).
 */
export function montarAdesao(
  hoje: string,
  horarios: Pick<HorarioDoDia, "origem" | "nomeChave" | "sigla">[],
  tomadas: { origem: OrigemLista; nomeChave: string; sigla: string; data: string; status: "tomei" | "esqueci" }[],
  agendaPorDia?: Map<string, { origem: OrigemLista; nomeChave: string; sigla: string; situacao?: SituacaoHorario }[]>,
): Record<OrigemLista, AdesaoLista> {
  // Sem histórico gravado (chamada pura antiga): só HOJE é conhecido, vindo dos horários de hoje.
  const agenda = agendaPorDia ?? new Map([[hoje, horarios.map((h) => ({ origem: h.origem, nomeChave: h.nomeChave, sigla: h.sigla }))]]);
  const out = {} as Record<OrigemLista, AdesaoLista>;
  for (const origem of ["prescrita", "propria"] as OrigemLista[]) {
    const esperadoPorDia = horarios.filter((h) => h.origem === origem).length;
    const dias = new Map<string, DiaAdesao>();
    for (let i = 29; i >= 0; i--) {
      const data = somaDias(hoje, -i);
      const doDia = agenda.get(data);
      const doDiaOrigem = doDia ? doDia.filter((h) => h.origem === origem) : [];
      const sit = (h: { situacao?: SituacaoHorario }) => h.situacao ?? "ativo";
      dias.set(data, {
        data, tomei: 0, esqueci: 0, esperado: doDiaOrigem.filter((h) => sit(h) === "ativo").length, comHistorico: doDia !== undefined,
        suspenso: doDiaOrigem.filter((h) => sit(h) === "suspenso").length, retirado: doDiaOrigem.filter((h) => sit(h) === "retirado").length,
      });
    }
    const chavesDia = (data: string) => new Set((agenda.get(data) ?? []).filter((h) => h.origem === origem && (h.situacao ?? "ativo") === "ativo").map((h) => `${h.nomeChave}|${h.sigla}`));
    for (const t of tomadas) {
      if (t.origem !== origem) continue;
      const d = dias.get(t.data);
      if (d && d.comHistorico && chavesDia(t.data).has(`${t.nomeChave}|${t.sigla}`)) d[t.status] += 1;
    }
    const historico = [...dias.values()];
    const janelas = JANELAS_ADESAO.map((n) => {
      const parte = historico.slice(-n);
      const comH = parte.filter((d) => d.comHistorico);
      const tomei = comH.reduce((s, d) => s + d.tomei, 0);
      const esqueci = comH.reduce((s, d) => s + d.esqueci, 0);
      const esperado = comH.reduce((s, d) => s + d.esperado, 0);
      return {
        dias: n, tomei, esqueci, esperado, semRegistro: Math.max(0, esperado - tomei - esqueci),
        percentual: esperado > 0 ? Math.round((tomei / esperado) * 1000) / 10 : null,
        diasComHistorico: comH.length, diasSemHistorico: n - comH.length,
        suspenso: comH.reduce((s, d) => s + d.suspenso, 0), retirado: comH.reduce((s, d) => s + d.retirado, 0),
        diasSuspensos: comH.filter((d) => d.esperado === 0 && d.suspenso > 0).length,
      };
    });
    out[origem] = { esperadoPorDia, janelas, historico };
  }
  return out;
}

export async function calcularAdesao(pool: Pick<Pool, "query">, clientId: number, hoje: string) {
  const horarios = await sincronizarAgendaDoDia(pool, clientId, hoje);
  const t = await pool.query(
    `SELECT origem, nome_chave, periodo, to_char(data,'YYYY-MM-DD') AS data, status
       FROM cliente_medicacao_tomadas WHERE client_id=$1 AND data > $2::date - 30 AND data <= $2::date`,
    [clientId, hoje],
  );
  const ag = await pool.query(
    `SELECT origem, nome_chave, periodo, situacao, to_char(data,'YYYY-MM-DD') AS data
       FROM cliente_medicacao_agenda_dia WHERE client_id=$1 AND data > $2::date - 30 AND data <= $2::date`,
    [clientId, hoje],
  );
  const agendaPorDia = new Map<string, { origem: OrigemLista; nomeChave: string; sigla: string; situacao?: SituacaoHorario }[]>();
  for (const x of ag.rows) {
    const l = agendaPorDia.get(x.data) ?? [];
    l.push({ origem: x.origem, nomeChave: x.nome_chave, sigla: x.periodo, situacao: x.situacao });
    agendaPorDia.set(x.data, l);
  }
  return montarAdesao(hoje, horarios, t.rows.map((x) => ({
    origem: x.origem, nomeChave: x.nome_chave, sigla: x.periodo, data: x.data, status: x.status,
  })), agendaPorDia);
}

// ── Recálculo do lembrete (pausar/editar/excluir/validar/recusar/revogar) ──────────────────────

export interface DepsRecalculo {
  hoje: string;
  /** Itens vindos do motor de medicações (itensLembreteDeMedicacoes já resolvido). */
  itensMedicacao: ItemLembretePrescricao[];
  sincronizar: (clientId: number, itens: ItemLembretePrescricao[]) => Promise<unknown>;
}

interface FormulaRica extends FormulaLembrete {
  ativoPrincipal?: string; substancias?: ItemLembretePrescricao["substancias"]; horario?: string; alertas?: string[];
}

/**
 * Reconstrói os itens do lembrete: mantém TUDO que já estava no lembrete e não é do próprio cliente
 * e acrescenta as medicações do cliente hoje elegíveis (validadas, não pausadas, com consentimento).
 * Limites: se uma fórmula tem doses diferentes em horários diferentes, vale a primeira. A fórmula da
 * clínica NUNCA é removida por ter o mesmo nome de uma medicação do cliente.
 */
export async function recalcularLembreteCore(pool: Pick<Pool, "query">, clientId: number, deps: DepsRecalculo) {
  const r = await pool.query(`SELECT periodos FROM lembretes_prescricao WHERE cliente_id=$1`, [clientId]);
  const porNome = new Map<string, ItemLembretePrescricao>();
  for (const per of ((r.rows[0]?.periodos ?? []) as (PeriodoLembrete & { formulas: FormulaRica[] })[])) {
    if (per.tipo !== "tomar") continue;
    const chavePeriodo = per.sigla ? PERIODO_POR_SIGLA[per.sigla] : undefined;
    if (!chavePeriodo) continue;
    for (const f of per.formulas ?? []) {
      const k = nomeChave(f.nome);
      const item = porNome.get(k) ?? {
        tipo: "formula" as const, nome: f.nome, ativoPrincipal: f.ativoPrincipal, substancias: f.substancias, dose: f.dose,
        horario: f.horario, observacaoRefeicao: f.observacaoRefeicao, posologia: f.posologia,
        ...(f.alertas?.length ? { alertas: f.alertas } : {}), periodos: [] as PeriodoAntigo[],
      };
      if (!item.periodos!.includes(chavePeriodo)) item.periodos!.push(chavePeriodo);
      porNome.set(k, item);
    }
  }
  const itens = [...porNome.values(), ...deps.itensMedicacao];
  await deps.sincronizar(clientId, itens);
  return { itens: itens.length };
}
