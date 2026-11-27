/**
 * Medicações do cliente (PAXCARE) — Etapa A do desenho aprovado.
 *
 * Regras:
 *  - Duas origens: 'prescrita' (nasce validada, vem de prescrição da clínica) e 'autodeclarada'
 *    (nasce SEM validação; o servidor ignora qualquer estado enviado pelo cliente).
 *  - Autodeclarada só gera lembrete DEPOIS de um profissional da clínica validar, e só se o cliente
 *    tiver consentimento ativo para aquela clínica.
 *  - Consentimento por clínica com hash SHA-256 do texto exato aceito; revogação imediata e histórico
 *    preservado (nova linha por novo aceite; nada é apagado).
 *  - Nove marcadores de período = os nove períodos canônicos do motor de lembretes
 *    (jejum, manha, meio_manha, almoco, tarde, meio_tarde, noite, final_noite, ceia).
 *  - Dose nunca é convertida. Sem dose estruturada o item sai com alerta e o motor NÃO envia.
 *
 * Serviços recebem `pool` por parâmetro (padrão do projeto) para rodar em banco descartável.
 */
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { ItemLembretePrescricao, PeriodoAntigo } from "./lembrete-periodo.js";

export const PERIODOS_MEDICACAO = [
  "jejum", "manha", "meio_manha", "almoco", "tarde", "meio_tarde", "noite", "final_noite", "ceia",
] as const satisfies readonly PeriodoAntigo[];

export type PeriodoMedicacao = (typeof PERIODOS_MEDICACAO)[number];
export type OrigemMedicacao = "prescrita" | "autodeclarada";
export type EstadoMedicacao = "nao_validada" | "validada" | "recusada" | "encerrada";

export const CONSENTIMENTO_VERSAO = "v1";
export const CONSENTIMENTO_TEXTO_V1 =
  "Autorizo esta clínica a ver as medicações que cadastrei no PaxCare e a conferi-las comigo. " +
  "Posso revogar esta autorização quando quiser, e ela deixa de valer imediatamente.";

export function hashTexto(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export class ErroMedicacao extends Error {
  constructor(public codigo: string, public status = 400) {
    super(codigo);
    this.name = "ErroMedicacao";
  }
}

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS cliente_medicacoes (
    id                        SERIAL PRIMARY KEY,
    client_id                 INTEGER NOT NULL REFERENCES clients(id),
    origem                    TEXT NOT NULL,
    empresa_origem_id         INTEGER REFERENCES empresas(id),
    prescricao_ref            TEXT,
    nome                      TEXT NOT NULL,
    nome_chave                TEXT NOT NULL,
    principio_ativo           TEXT,
    dose_valor                NUMERIC(12,3),
    dose_unidade              TEXT,
    via                       TEXT,
    p_jejum                   BOOLEAN NOT NULL DEFAULT FALSE,
    p_manha                   BOOLEAN NOT NULL DEFAULT FALSE,
    p_meio_manha              BOOLEAN NOT NULL DEFAULT FALSE,
    p_almoco                  BOOLEAN NOT NULL DEFAULT FALSE,
    p_tarde                   BOOLEAN NOT NULL DEFAULT FALSE,
    p_meio_tarde              BOOLEAN NOT NULL DEFAULT FALSE,
    p_noite                   BOOLEAN NOT NULL DEFAULT FALSE,
    p_final_noite             BOOLEAN NOT NULL DEFAULT FALSE,
    p_ceia                    BOOLEAN NOT NULL DEFAULT FALSE,
    posologia_texto           TEXT,
    data_inicio               DATE,
    data_fim                  DATE,
    estado                    TEXT NOT NULL,
    validada_por_profissional INTEGER,
    validada_em               TIMESTAMPTZ,
    validacao_empresa_id      INTEGER REFERENCES empresas(id),
    recusa_motivo             TEXT,
    criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
    removido_em               TIMESTAMPTZ,
    CONSTRAINT cliente_medicacoes_origem_ck CHECK (origem IN ('prescrita','autodeclarada')),
    CONSTRAINT cliente_medicacoes_estado_ck CHECK (estado IN ('nao_validada','validada','recusada','encerrada')),
    CONSTRAINT cliente_medicacoes_dose_ck CHECK ((dose_valor IS NULL) = (dose_unidade IS NULL)),
    CONSTRAINT cliente_medicacoes_periodo_ck CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio),
    CONSTRAINT cliente_medicacoes_auto_validacao_ck CHECK (
      origem = 'prescrita' OR estado <> 'validada' OR (validada_por_profissional IS NOT NULL AND validacao_empresa_id IS NOT NULL)),
    CONSTRAINT cliente_medicacoes_prescrita_empresa_ck CHECK (origem = 'autodeclarada' OR empresa_origem_id IS NOT NULL)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_medicacoes_ativa
     ON cliente_medicacoes (client_id, nome_chave, origem)
     WHERE removido_em IS NULL AND estado IN ('nao_validada','validada')`,
  `CREATE INDEX IF NOT EXISTS ix_cliente_medicacoes_cliente ON cliente_medicacoes (client_id, estado)`,
  `CREATE TABLE IF NOT EXISTS cliente_medicacao_consentimentos (
    id           SERIAL PRIMARY KEY,
    client_id    INTEGER NOT NULL REFERENCES clients(id),
    empresa_id   INTEGER NOT NULL REFERENCES empresas(id),
    versao_texto TEXT NOT NULL,
    texto_hash   TEXT NOT NULL,
    aceito_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revogado_em  TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_medicacao_consent_ativo
     ON cliente_medicacao_consentimentos (client_id, empresa_id) WHERE revogado_em IS NULL`,
];

/** Aditivo e idempotente (Regra de Ouro: nunca DROP). */
export async function criarTabelasMedicacoes(pool: Pick<Pool, "query">): Promise<void> {
  for (const stmt of DDL) await pool.query(stmt);
}

export function nomeChave(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface NovaMedicacao {
  clientId: number;
  origem: OrigemMedicacao;
  nome: string;
  /** Obrigatório para 'prescrita': clínica que prescreveu. */
  empresaOrigemId?: number | null;
  prescricaoRef?: string | null;
  principioAtivo?: string | null;
  doseValor?: number | null;
  doseUnidade?: string | null;
  via?: string | null;
  periodos?: PeriodoMedicacao[];
  posologiaTexto?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}

const COLUNA_PERIODO: Record<PeriodoMedicacao, string> = {
  jejum: "p_jejum", manha: "p_manha", meio_manha: "p_meio_manha", almoco: "p_almoco", tarde: "p_tarde",
  meio_tarde: "p_meio_tarde", noite: "p_noite", final_noite: "p_final_noite", ceia: "p_ceia",
};

export async function registrarMedicacao(pool: Pick<Pool, "query">, m: NovaMedicacao): Promise<{ id: number; estado: EstadoMedicacao }> {
  const nome = m.nome?.trim() ?? "";
  if (!nome || nome.length > 200) throw new ErroMedicacao("nome_invalido");
  if (!Number.isSafeInteger(m.clientId) || m.clientId <= 0) throw new ErroMedicacao("cliente_invalido");
  if (m.origem !== "prescrita" && m.origem !== "autodeclarada") throw new ErroMedicacao("origem_invalida");
  if (m.origem === "prescrita" && !m.empresaOrigemId) throw new ErroMedicacao("empresa_origem_obrigatoria");
  if ((m.doseValor == null) !== (m.doseUnidade == null)) throw new ErroMedicacao("dose_incompleta");
  if (m.doseValor != null && !(Number.isFinite(m.doseValor) && m.doseValor > 0)) throw new ErroMedicacao("dose_invalida");
  const periodos = new Set(m.periodos ?? []);
  for (const p of periodos) if (!PERIODOS_MEDICACAO.includes(p)) throw new ErroMedicacao("periodo_invalido");
  // O estado é decidido AQUI, nunca recebido: autodeclarada sempre começa sem validação.
  const estado: EstadoMedicacao = m.origem === "prescrita" ? "validada" : "nao_validada";
  const cols = PERIODOS_MEDICACAO.map((p) => COLUNA_PERIODO[p]);
  try {
    const r = await pool.query(
      `INSERT INTO cliente_medicacoes
         (client_id, origem, empresa_origem_id, prescricao_ref, nome, nome_chave, principio_ativo,
          dose_valor, dose_unidade, via, ${cols.join(", ")}, posologia_texto, data_inicio, data_fim, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, ${cols.map((_, i) => `$${11 + i}`).join(", ")}, $20,$21,$22,$23)
       RETURNING id, estado`,
      [
        m.clientId, m.origem, m.empresaOrigemId ?? null, m.prescricaoRef ?? null, nome, nomeChave(nome),
        m.principioAtivo ?? null, m.doseValor ?? null, m.doseUnidade ?? null, m.via ?? null,
        ...PERIODOS_MEDICACAO.map((p) => periodos.has(p)),
        m.posologiaTexto ?? null, m.dataInicio ?? null, m.dataFim ?? null, estado,
      ],
    );
    return { id: Number(r.rows[0].id), estado: r.rows[0].estado };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new ErroMedicacao("medicacao_ja_cadastrada", 409);
    throw err;
  }
}

/** Texto exibido ao cliente e seu hash: o aceite só vale se o hash enviado for o do texto vigente. */
export function textoDeConsentimentoVigente(): { versao: string; texto: string; hash: string } {
  return { versao: CONSENTIMENTO_VERSAO, texto: CONSENTIMENTO_TEXTO_V1, hash: hashTexto(CONSENTIMENTO_TEXTO_V1) };
}

export async function registrarConsentimento(
  pool: Pick<Pool, "query">,
  p: { clientId: number; empresaId: number; hashAceito: string },
): Promise<{ id: number; jaExistia: boolean }> {
  const vigente = textoDeConsentimentoVigente();
  if (p.hashAceito !== vigente.hash) throw new ErroMedicacao("texto_de_consentimento_desatualizado", 409);
  const ins = await pool.query(
    `INSERT INTO cliente_medicacao_consentimentos (client_id, empresa_id, versao_texto, texto_hash)
     VALUES ($1,$2,$3,$4) ON CONFLICT (client_id, empresa_id) WHERE revogado_em IS NULL DO NOTHING RETURNING id`,
    [p.clientId, p.empresaId, vigente.versao, vigente.hash],
  );
  if (ins.rows.length) return { id: Number(ins.rows[0].id), jaExistia: false };
  const ex = await pool.query(
    `SELECT id FROM cliente_medicacao_consentimentos WHERE client_id=$1 AND empresa_id=$2 AND revogado_em IS NULL`,
    [p.clientId, p.empresaId],
  );
  return { id: Number(ex.rows[0].id), jaExistia: true };
}

export async function revogarConsentimento(pool: Pick<Pool, "query">, p: { clientId: number; empresaId: number }): Promise<boolean> {
  const r = await pool.query(
    `UPDATE cliente_medicacao_consentimentos SET revogado_em = now()
      WHERE client_id=$1 AND empresa_id=$2 AND revogado_em IS NULL`,
    [p.clientId, p.empresaId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function temConsentimentoAtivo(pool: Pick<Pool, "query">, clientId: number, empresaId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM cliente_medicacao_consentimentos WHERE client_id=$1 AND empresa_id=$2 AND revogado_em IS NULL`,
    [clientId, empresaId],
  );
  return r.rows.length > 0;
}

/**
 * Validação por profissional da clínica. A AUTORIZAÇÃO do papel (médico etc.) é do servidor/rota;
 * aqui o serviço exige o que o banco consegue provar: consentimento ativo do cliente para a clínica.
 */
export async function decidirMedicacao(
  pool: Pick<Pool, "query">,
  p: { medicacaoId: number; profissionalId: number; empresaId: number; decisao: "validar" | "recusar"; motivo?: string },
): Promise<EstadoMedicacao> {
  const med = await pool.query(
    `SELECT client_id, origem, estado FROM cliente_medicacoes WHERE id=$1 AND removido_em IS NULL`,
    [p.medicacaoId],
  );
  const m = med.rows[0];
  if (!m) throw new ErroMedicacao("medicacao_nao_encontrada", 404);
  if (m.origem !== "autodeclarada") throw new ErroMedicacao("somente_autodeclarada_precisa_de_validacao", 409);
  if (m.estado !== "nao_validada") throw new ErroMedicacao("estado_nao_permite_decisao", 409);
  if (!(await temConsentimentoAtivo(pool, m.client_id, p.empresaId))) throw new ErroMedicacao("sem_consentimento_para_a_clinica", 403);
  if (p.decisao === "recusar" && !(p.motivo ?? "").trim()) throw new ErroMedicacao("motivo_obrigatorio");
  const novo: EstadoMedicacao = p.decisao === "validar" ? "validada" : "recusada";
  const r = await pool.query(
    `UPDATE cliente_medicacoes
        SET estado=$2, validada_por_profissional=$3, validacao_empresa_id=$4, validada_em=now(),
            recusa_motivo=$5, atualizado_em=now()
      WHERE id=$1 AND estado='nao_validada' RETURNING estado`,
    [p.medicacaoId, novo, p.profissionalId, p.empresaId, p.decisao === "recusar" ? p.motivo!.trim() : null],
  );
  if (!r.rows.length) throw new ErroMedicacao("estado_nao_permite_decisao", 409);
  return novo;
}

export async function listarParaClinica(pool: Pick<Pool, "query">, clientId: number, empresaId: number) {
  const r = await pool.query(
    `SELECT id, origem, nome, estado, dose_valor, dose_unidade, via, posologia_texto
       FROM cliente_medicacoes m
      WHERE m.client_id = $1 AND m.removido_em IS NULL
        AND ( (m.origem = 'prescrita' AND m.empresa_origem_id = $2)
           OR EXISTS (SELECT 1 FROM cliente_medicacao_consentimentos c
                       WHERE c.client_id = m.client_id AND c.empresa_id = $2 AND c.revogado_em IS NULL) )
      ORDER BY m.nome_chave`,
    [clientId, empresaId],
  );
  return r.rows;
}

/**
 * Entrada do motor de lembretes: SOMENTE medicações validadas, vigentes e não removidas.
 * `hoje` vem de lib/brt (YYYY-MM-DD, fuso de Brasília). Dose ausente => alerta, e o motor não envia.
 * Autodeclarada validada só entra se o consentimento da clínica que validou segue ativo.
 */
export async function itensLembreteDeMedicacoes(
  pool: Pick<Pool, "query">,
  clientId: number,
  hoje: string,
): Promise<ItemLembretePrescricao[]> {
  const r = await pool.query(
    `SELECT m.nome, m.principio_ativo, m.dose_valor, m.dose_unidade, m.posologia_texto,
            m.p_jejum, m.p_manha, m.p_meio_manha, m.p_almoco, m.p_tarde, m.p_meio_tarde, m.p_noite, m.p_final_noite, m.p_ceia
       FROM cliente_medicacoes m
      WHERE m.client_id = $1 AND m.estado = 'validada' AND m.removido_em IS NULL
        AND (m.data_inicio IS NULL OR m.data_inicio <= $2::date)
        AND (m.data_fim IS NULL OR m.data_fim >= $2::date)
        AND (m.origem = 'prescrita' OR EXISTS (
              SELECT 1 FROM cliente_medicacao_consentimentos c
               WHERE c.client_id = m.client_id AND c.empresa_id = m.validacao_empresa_id AND c.revogado_em IS NULL))
      ORDER BY m.nome_chave`,
    [clientId, hoje],
  );
  const itens: ItemLembretePrescricao[] = [];
  for (const row of r.rows) {
    const periodos = PERIODOS_MEDICACAO.filter((p) => row[COLUNA_PERIODO[p]] === true);
    if (!periodos.length) continue; // sem horário marcado: nada a lembrar
    const temDose = row.dose_valor != null && row.dose_unidade;
    itens.push({
      tipo: "formula",
      nome: row.nome,
      ativoPrincipal: row.principio_ativo ?? undefined,
      dose: temDose ? `${String(Number(row.dose_valor)).replace(".", ",")} ${row.dose_unidade}` : undefined,
      posologia: row.posologia_texto ?? undefined,
      periodos,
      ...(temDose ? {} : { alertas: ["dose_nao_estruturada"] }),
    });
  }
  return itens;
}

/** Une itens do motor com as medicações do cliente sem duplicar por nome (a prescrição da clínica vence). */
export function mesclarItensSemDuplicar(
  base: ItemLembretePrescricao[],
  extras: ItemLembretePrescricao[],
): ItemLembretePrescricao[] {
  const vistos = new Set(base.map((i) => nomeChave(i.nome)));
  return [...base, ...extras.filter((i) => !vistos.has(nomeChave(i.nome)))];
}
