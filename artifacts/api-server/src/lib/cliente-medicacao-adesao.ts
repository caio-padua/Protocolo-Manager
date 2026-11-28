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
  // Quem gravou o instantâneo: 'app' (abertura/registro do cliente) ou 'job_diario' (horário esperado materializado
  // pelo job das 00:05 quando o cliente não abriu o app; continua SEM resposta = "não informado").
  `ALTER TABLE cliente_medicacao_agenda_dia ADD COLUMN IF NOT EXISTS registro_origem TEXT NOT NULL DEFAULT 'app'`,
  // Identidade ESTÁVEL: medicacao_id (cliente_medicacoes.id) passa a fazer parte da chave. Dois remédios próprios
  // com o mesmo nome deixam de colapsar. Histórico preservado: só se preenche o id quando o nome tem UM só cadastro.
  `DO $$ BEGIN IF to_regclass('cliente_medicacoes') IS NOT NULL THEN
     UPDATE cliente_medicacao_tomadas t SET medicacao_id = m.id FROM cliente_medicacoes m
      WHERE t.origem='propria' AND t.medicacao_id IS NULL AND m.client_id=t.client_id AND m.origem='autodeclarada'
        AND m.nome_chave=t.nome_chave
        AND (SELECT count(*) FROM cliente_medicacoes m2 WHERE m2.client_id=t.client_id AND m2.origem='autodeclarada' AND m2.nome_chave=t.nome_chave)=1;
     UPDATE cliente_medicacao_agenda_dia a SET medicacao_id = m.id FROM cliente_medicacoes m
      WHERE a.origem='propria' AND a.medicacao_id IS NULL AND m.client_id=a.client_id AND m.origem='autodeclarada'
        AND m.nome_chave=a.nome_chave
        AND (SELECT count(*) FROM cliente_medicacoes m2 WHERE m2.client_id=a.client_id AND m2.origem='autodeclarada' AND m2.nome_chave=a.nome_chave)=1;
   END IF; END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_medicacao_tomadas_ref
     ON cliente_medicacao_tomadas (client_id, origem, nome_chave, (COALESCE(medicacao_id, 0)), data, periodo)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_medicacao_agenda_dia_ref
     ON cliente_medicacao_agenda_dia (client_id, data, origem, nome_chave, (COALESCE(medicacao_id, 0)), periodo)`,
  // Só depois de a chave nova existir saem as chaves antigas (só estrutura; nenhuma linha é apagada).
  `DROP INDEX IF EXISTS ux_cliente_medicacao_tomadas`,
  `ALTER TABLE cliente_medicacao_agenda_dia DROP CONSTRAINT IF EXISTS cliente_medicacao_agenda_dia_pkey`,
];

/** Chave do horário que distingue homônimos: nome + id estável (só remédio próprio tem id). */
export const chaveItem = (nome: string, referenciaId?: number | null): string => (referenciaId ? `${nome}#${referenciaId}` : nome);

/** Aditivo e idempotente (Regra de Ouro: nunca DROP). */
export async function criarTabelaTomadas(pool: Pick<Pool, "query">): Promise<void> {
  for (const stmt of DDL) await pool.query(stmt);
}

export interface HorarioDoDia {
  origem: OrigemLista; nome: string; nomeChave: string; dose: string | null;
  /** id estável (cliente_medicacoes.id) do remédio próprio; null para fórmula da clínica (o lembrete não traz id). */
  referenciaId: number | null;
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
    for (const p of m.periodos) itens.push({ origem: "prescrita", nome: m.nome, nomeChave: nomeChave(m.nome), dose: m.dose, referenciaId: null, sigla: p.sigla, periodoNome: p.nome });
  }
  for (const m of proprias) {
    for (const p of m.periodos) {
      itens.push({ origem: "propria", nome: m.nome, nomeChave: nomeChave(m.nome), dose: doseTexto(m), referenciaId: m.id, sigla: SIGLA_POR_PERIODO[p].sigla, periodoNome: SIGLA_POR_PERIODO[p].nome });
    }
  }
  const t = await pool.query(
    `SELECT origem, nome_chave, medicacao_id, periodo, status FROM cliente_medicacao_tomadas WHERE client_id=$1 AND data=$2::date`,
    [clientId, hoje],
  );
  const mapa = new Map<string, "tomei" | "esqueci">(t.rows.map((x) => [`${x.origem}|${chaveItem(x.nome_chave, x.medicacao_id ? Number(x.medicacao_id) : null)}|${x.periodo}`, x.status]));
  return itens.map((i) => ({ ...i, status: mapa.get(`${i.origem}|${chaveItem(i.nomeChave, i.referenciaId)}|${i.sigla}`) ?? null }));
}

/** Registra/corrige Tomei ou Esqueci. O horário precisa existir na rotina atual do cliente. */
export async function registrarTomada(
  pool: Pick<Pool, "query">,
  p: { clientId: number; hoje: string; origem: OrigemLista; nome: string; sigla: string; status: "tomei" | "esqueci"; referenciaId?: number | null },
): Promise<void> {
  if (p.status !== "tomei" && p.status !== "esqueci") throw new ErroMedicacao("status_invalido");
  const chave = nomeChave(p.nome ?? "");
  const doDia = await horariosDoDia(pool, p.clientId, p.hoje);
  const candidatos = doDia.filter((h) => h.origem === p.origem && h.nomeChave === chave && h.sigla === p.sigla
    && (p.referenciaId ? h.referenciaId === p.referenciaId : true));
  if (candidatos.length === 0) throw new ErroMedicacao("horario_nao_encontrado", 404);
  // Dois remédios com o mesmo nome no mesmo horário: sem o id, não se adivinha qual foi tomado.
  if (candidatos.length > 1) throw new ErroMedicacao("horario_ambiguo", 409);
  const ref = candidatos[0].referenciaId;
  await sincronizarAgendaDoDia(pool, p.clientId, p.hoje); // o denominador do dia nasce junto do primeiro registro
  await pool.query(
    `INSERT INTO cliente_medicacao_tomadas (client_id, origem, nome_chave, medicacao_id, data, periodo, status)
     VALUES ($1,$2,$3,$4,$5::date,$6,$7)
     ON CONFLICT (client_id, origem, nome_chave, (COALESCE(medicacao_id, 0)), data, periodo)
     DO UPDATE SET status = EXCLUDED.status, atualizado_em = now()`,
    [p.clientId, p.origem, chave, ref, p.hoje, p.sigla, p.status],
  );
}

export type SituacaoHorario = "ativo" | "suspenso" | "retirado" | "desconhecido";
export interface DiaAdesao { data: string; tomei: number; esqueci: number; esperado: number; comHistorico: boolean; suspenso: number; retirado: number; desconhecido?: number }
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
  type H = { origem: OrigemLista; nomeChave: string; referenciaId: number | null; sigla: string };
  const kH = (x: H) => `${x.origem}|${chaveItem(x.nomeChave, x.referenciaId)}|${x.sigla}`;
  const ativos = new Set(horarios.map(kH));
  const pausadas = (await listarAutodeclaradasDoPaciente(pool, clientId))
    .filter((m) => m.pausada && (m.estado === "nao_validada" || m.estado === "validada"));
  const suspensos = new Map<string, H>();
  for (const m of pausadas) for (const per of m.periodos) {
    const h: H = { origem: "propria", nomeChave: nomeChave(m.nome), referenciaId: m.id, sigla: SIGLA_POR_PERIODO[per].sigla };
    suspensos.set(kH(h), h);
  }
  const ALVO = `(client_id, data, origem, nome_chave, periodo, (COALESCE(medicacao_id, 0)))`;
  for (const h of horarios) {
    await pool.query(
      `INSERT INTO cliente_medicacao_agenda_dia (client_id, data, origem, nome_chave, periodo, medicacao_id)
       VALUES ($1,$2::date,$3,$4,$5,$6)
       ON CONFLICT ${ALVO} DO UPDATE SET situacao='ativo' WHERE cliente_medicacao_agenda_dia.situacao <> 'ativo'`,
      [clientId, hoje, h.origem, h.nomeChave, h.sigla, h.referenciaId],
    );
  }
  const jaRespondido = `EXISTS (SELECT 1 FROM cliente_medicacao_tomadas t WHERE t.client_id=a.client_id AND t.data=a.data
                          AND t.origem=a.origem AND t.nome_chave=a.nome_chave AND t.periodo=a.periodo
                          AND COALESCE(t.medicacao_id,0)=COALESCE(a.medicacao_id,0))`;
  for (const [k, h] of suspensos) {
    if (ativos.has(k)) continue;
    await pool.query(
      `INSERT INTO cliente_medicacao_agenda_dia AS a (client_id, data, origem, nome_chave, periodo, medicacao_id, situacao)
       VALUES ($1,$2::date,$3,$4,$5,$6,'suspenso')
       ON CONFLICT ${ALVO} DO UPDATE SET situacao='suspenso'
         WHERE a.situacao='ativo' AND NOT ${jaRespondido}`,
      [clientId, hoje, h.origem, h.nomeChave, h.sigla, h.referenciaId],
    );
  }
  const hojeRows = await pool.query(
    `SELECT origem, nome_chave, medicacao_id, periodo, situacao FROM cliente_medicacao_agenda_dia WHERE client_id=$1 AND data=$2::date`, [clientId, hoje]);
  for (const x of hojeRows.rows) {
    const h: H = { origem: x.origem, nomeChave: x.nome_chave, referenciaId: x.medicacao_id ? Number(x.medicacao_id) : null, sigla: x.periodo };
    const k = kH(h);
    if (x.situacao === "ativo" && !ativos.has(k) && !suspensos.has(k)) {
      await pool.query(
        `UPDATE cliente_medicacao_agenda_dia a SET situacao='retirado'
          WHERE a.client_id=$1 AND a.data=$2::date AND a.origem=$3 AND a.nome_chave=$4 AND a.periodo=$5
            AND COALESCE(a.medicacao_id,0)=COALESCE($6::int,0) AND a.situacao='ativo' AND NOT ${jaRespondido}`,
        [clientId, hoje, h.origem, h.nomeChave, h.sigla, h.referenciaId]);
    }
  }
  return horarios;
}

/**
 * Job diário (00:05 BRT): materializa os horários dos dias que o cliente NÃO abriu o app. Só afirma o que é conhecido:
 *  - remédio próprio vira "ativo" no dia D SÓ se já existia e NÃO foi alterado/pausado desde antes de D
 *    (criado_em e atualizado_em anteriores a 00:00 de D em Brasília) e D está dentro da vigência (data_inicio/data_fim);
 *    como o sistema não guarda versões de rotina, qualquer alteração posterior torna o dia "desconhecido";
 *  - fórmula da clínica (lembrete sem data de vigência) e remédio alterado depois: "desconhecido" (fora do denominador,
 *    visível); nunca se inventa dose, horário nem resposta (Tomei/Esqueci só nascem de ação do cliente);
 *  - só clientes que JÁ têm instantâneo; nunca antes do primeiro; ontem e até `diasRecuperacao` dias atrás;
 *  - dia que já tem instantâneo não é tocado; ON CONFLICT DO NOTHING (execução dupla não duplica); conta excluída é pulada;
 *  - falha em um cliente é registrada e não impede os demais.
 */
export async function materializarDiasSemAbertura(
  pool: Pick<Pool, "query">, hoje: string, opts: { diasRecuperacao?: number } = {},
): Promise<{ clientes: number; linhas: number; falhas: number }> {
  const dias = Math.min(Math.max(opts.diasRecuperacao ?? 3, 1), 7);
  const cand = await pool.query(
    `SELECT client_id, to_char(min(data),'YYYY-MM-DD') AS primeiro FROM cliente_medicacao_agenda_dia GROUP BY client_id`);
  const excl = await pool.query(`SELECT to_regclass('area_paciente_contas_excluidas') AS t`);
  let clientes = 0, linhas = 0, falhas = 0;
  for (const c of cand.rows) {
    const clientId = Number(c.client_id);
    try {
      if (excl.rows[0]?.t && (await pool.query(`SELECT 1 FROM area_paciente_contas_excluidas WHERE client_id=$1`, [clientId])).rows.length > 0) continue;
      const faltam: string[] = [];
      for (let i = 1; i <= dias; i++) {
        const d = somaDias(hoje, -i);
        if (d <= c.primeiro) continue; // nunca antes (nem no dia) do primeiro instantâneo real
        const ja = await pool.query(`SELECT 1 FROM cliente_medicacao_agenda_dia WHERE client_id=$1 AND data=$2::date LIMIT 1`, [clientId, d]);
        if (ja.rows.length === 0) faltam.push(d);
      }
      if (faltam.length === 0) continue;
      const proprias = (await pool.query(
        `SELECT * FROM cliente_medicacoes WHERE client_id=$1 AND origem='autodeclarada' AND removido_em IS NULL
            AND estado IN ('nao_validada','validada')`, [clientId])).rows;
      const prescritas = await prescritasDoLembrete(pool, clientId);
      let gravouCliente = false;
      for (const d of faltam) {
        const inicioDia = Date.parse(`${d}T00:00:00-03:00`);
        const linhasDia: { origem: OrigemLista; nomeChave: string; ref: number | null; sigla: string; situacao: "ativo" | "desconhecido" }[] = [];
        for (const m of proprias) {
          if (Date.parse(m.criado_em) >= inicioDia + 86_400_000) continue; // ainda nem existia naquele dia
          const intocada = Date.parse(m.criado_em) < inicioDia && Date.parse(m.atualizado_em) < inicioDia && m.pausada_em == null;
          const ini = m.data_inicio ? new Date(m.data_inicio).toISOString().slice(0, 10) : null;
          const fim = m.data_fim ? new Date(m.data_fim).toISOString().slice(0, 10) : null;
          if (intocada && ((ini && d < ini) || (fim && d > fim))) continue; // vigência conhecida: não era dia dela
          for (const per of PERIODOS_MEDICACAO) {
            if (m[`p_${per}`] !== true) continue;
            linhasDia.push({ origem: "propria", nomeChave: m.nome_chave, ref: Number(m.id), sigla: SIGLA_POR_PERIODO[per].sigla, situacao: intocada ? "ativo" : "desconhecido" });
          }
        }
        for (const m of prescritas) for (const p of m.periodos) {
          linhasDia.push({ origem: "prescrita", nomeChave: nomeChave(m.nome), ref: null, sigla: p.sigla, situacao: "desconhecido" });
        }
        for (const h of linhasDia) {
          const r = await pool.query(
            `INSERT INTO cliente_medicacao_agenda_dia (client_id, data, origem, nome_chave, periodo, medicacao_id, situacao, registro_origem)
             VALUES ($1,$2::date,$3,$4,$5,$6,$7,'job_diario')
             ON CONFLICT (client_id, data, origem, nome_chave, periodo, (COALESCE(medicacao_id, 0))) DO NOTHING`,
            [clientId, d, h.origem, h.nomeChave, h.sigla, h.ref, h.situacao]);
          linhas += r.rowCount ?? 0;
          if (r.rowCount) gravouCliente = true;
        }
      }
      if (gravouCliente) clientes++;
    } catch (err) {
      falhas++;
      console.error(JSON.stringify({ evento: "agenda_diaria_falha_cliente", clientId, errorType: err instanceof Error ? err.constructor.name : typeof err }));
    }
  }
  return { clientes, linhas, falhas };
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
  const agenda: Map<string, { origem: OrigemLista; nomeChave: string; sigla: string; situacao?: SituacaoHorario }[]> =
    agendaPorDia ?? new Map([[hoje, horarios.map((h) => ({ origem: h.origem, nomeChave: h.nomeChave, sigla: h.sigla }))]]);
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
        desconhecido: doDiaOrigem.filter((h) => sit(h) === "desconhecido").length,
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
    `SELECT origem, nome_chave, medicacao_id, periodo, to_char(data,'YYYY-MM-DD') AS data, status
       FROM cliente_medicacao_tomadas WHERE client_id=$1 AND data > $2::date - 30 AND data <= $2::date`,
    [clientId, hoje],
  );
  const ag = await pool.query(
    `SELECT origem, nome_chave, medicacao_id, periodo, situacao, to_char(data,'YYYY-MM-DD') AS data
       FROM cliente_medicacao_agenda_dia WHERE client_id=$1 AND data > $2::date - 30 AND data <= $2::date`,
    [clientId, hoje],
  );
  const agendaPorDia = new Map<string, { origem: OrigemLista; nomeChave: string; sigla: string; situacao?: SituacaoHorario }[]>();
  for (const x of ag.rows) {
    const l = agendaPorDia.get(x.data) ?? [];
    l.push({ origem: x.origem, nomeChave: chaveItem(x.nome_chave, x.medicacao_id ? Number(x.medicacao_id) : null), sigla: x.periodo, situacao: x.situacao });
    agendaPorDia.set(x.data, l);
  }
  return montarAdesao(hoje, horarios, t.rows.map((x) => ({
    origem: x.origem, nomeChave: chaveItem(x.nome_chave, x.medicacao_id ? Number(x.medicacao_id) : null), sigla: x.periodo, data: x.data, status: x.status,
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
