/**
 * Categorias de mensagens, regras versionadas por clinica e trilha de auditoria.
 *
 * - A mensagem NUNCA e alterada: a categoria e calculada na leitura, pela regra vigente na DATA da mensagem.
 * - Regra editada = NOVA VERSAO (a anterior e encerrada, nunca sobrescrita).
 * - Sem regra = "sem categoria" (visivel, filtravel, nunca escondida).
 * - Toda escrita grava uma linha na trilha (tabela append-only, protegida por gatilho).
 * - Toda funcao recebe a clinica; nada le ou grava fora dela.
 */
import type { Pool } from "pg";

export type NaturezaCategoria = "financeira" | "operacional";
export const NATUREZAS: readonly NaturezaCategoria[] = ["financeira", "operacional"];

export class ErroCategoria extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const MIGRACAO_CATEGORIAS_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS comunicacao_categorias (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    natureza TEXT NOT NULL CHECK (natureza IN ('financeira','operacional')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por_nome TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comunicacao_categorias_nome ON comunicacao_categorias (empresa_id, lower(nome))`,
  `CREATE TABLE IF NOT EXISTS comunicacao_regras (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    padrao TEXT NOT NULL,
    categoria_id INTEGER NOT NULL REFERENCES comunicacao_categorias(id),
    versao INTEGER NOT NULL,
    vigente_desde TIMESTAMPTZ NOT NULL,
    vigente_ate TIMESTAMPTZ,
    motivo TEXT,
    criado_por_nome TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // No maximo UMA versao aberta por (clinica, padrao): impede duplicidade em edicoes simultaneas.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comunicacao_regras_aberta ON comunicacao_regras (empresa_id, padrao) WHERE vigente_ate IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comunicacao_regras_versao ON comunicacao_regras (empresa_id, padrao, versao)`,
  `CREATE TABLE IF NOT EXISTS comunicacao_trilha (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    entidade TEXT NOT NULL,
    entidade_id INTEGER,
    acao TEXT NOT NULL,
    antes JSONB,
    depois JSONB,
    ator_id INTEGER,
    ator_nome TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comunicacao_trilha_empresa ON comunicacao_trilha (empresa_id, id DESC)`,
  `CREATE OR REPLACE FUNCTION comunicacao_trilha_imutavel() RETURNS trigger AS $$
   BEGIN RAISE EXCEPTION 'A trilha de auditoria e somente de acrescimo'; END; $$ LANGUAGE plpgsql`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_comunicacao_trilha_imutavel') THEN
       CREATE TRIGGER trg_comunicacao_trilha_imutavel BEFORE UPDATE OR DELETE ON comunicacao_trilha
       FOR EACH ROW EXECUTE FUNCTION comunicacao_trilha_imutavel();
     END IF; END $$`,
];

export async function criarTabelasCategorias(db: Pick<Pool, "query">): Promise<void> {
  for (const sql of MIGRACAO_CATEGORIAS_SQL) await db.query(sql);
}

/**
 * Fragmento SQL: classifica a linha `u` pela regra vigente na data da mensagem.
 * Padrao exato ou terminado em * (prefixo). O mais especifico (mais longo) vence; empate = versao maior.
 * starts_with evita o curinga "_" do LIKE (contextos tem sublinhado).
 */
export const CLASSIFICACAO_SQL = `
LEFT JOIN LATERAL (
  SELECT r.id AS regra_id, r.versao AS regra_versao, r.categoria_id, ca.nome AS categoria_nome, ca.natureza AS categoria_natureza
    FROM comunicacao_regras r
    JOIN comunicacao_categorias ca ON ca.id = r.categoria_id AND ca.empresa_id = r.empresa_id
   WHERE r.empresa_id = u.empresa_id
     AND u.contexto IS NOT NULL AND u.contexto <> ''
     AND (r.padrao = u.contexto OR (right(r.padrao, 1) = '*' AND starts_with(u.contexto, left(r.padrao, -1))))
     AND u.quando >= r.vigente_desde AND (r.vigente_ate IS NULL OR u.quando < r.vigente_ate)
   ORDER BY length(r.padrao) DESC, r.versao DESC
   LIMIT 1) rg ON TRUE`;

export function padraoValido(p: unknown): string {
  const s = String(p ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_:\-]{1,80}\*?$/.test(s) || s === "*") {
    throw new ErroCategoria(400, "Padrão inválido: use letras minúsculas, números, _ ou -, com * opcional no fim (ex.: cobranca*).");
  }
  return s;
}
function nomeValido(n: unknown): string {
  const s = String(n ?? "").trim();
  if (s.length < 2 || s.length > 60) throw new ErroCategoria(400, "O nome da categoria deve ter de 2 a 60 caracteres.");
  return s;
}

export interface Ator { id: number | null; nome: string }
type Tx = { query: Pool["query"] };

async function trilha(c: Tx, empresaId: number, entidade: string, entidadeId: number | null, acao: string, antes: unknown, depois: unknown, ator: Ator) {
  await c.query(
    `INSERT INTO comunicacao_trilha (empresa_id, entidade, entidade_id, acao, antes, depois, ator_id, ator_nome)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
    [empresaId, entidade, entidadeId, acao, antes == null ? null : JSON.stringify(antes), depois == null ? null : JSON.stringify(depois), ator.id, ator.nome],
  );
}

async function emTransacao<T>(db: Pool, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c as unknown as Tx);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { c.release(); }
}

const MODELO_CATEGORIAS: { nome: string; natureza: NaturezaCategoria; padroes: string[] }[] = [
  { nome: "Cobrança e financeiro", natureza: "financeira", padroes: ["cobranca*", "pagamento*", "fatura*"] },
  { nome: "Lembretes clínicos", natureza: "operacional", padroes: ["lembrete_*", "galeria_lembrete*"] },
  { nome: "Exames", natureza: "operacional", padroes: ["exame*"] },
  { nome: "Relacionamento e sessões", natureza: "operacional", padroes: ["galeria_boas_vindas", "galeria_pre_sessao", "galeria_pos_sessao", "galeria_ultima_sessao", "galeria_resumo_cockpit"] },
  { nome: "Atendimento (equipe e IA)", natureza: "operacional", padroes: ["cockpit_telegram", "inbound_reply*"] },
  { nome: "Testes de canal", natureza: "operacional", padroes: ["teste-canal"] },
];

/** Modelo inicial por clinica, so quando a clinica ainda nao tem NENHUMA categoria. Idempotente e serializado. */
export async function garantirModeloInicial(db: Pool, empresaId: number): Promise<boolean> {
  return emTransacao(db, async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`comcat:${empresaId}`]);
    const n = await c.query(`SELECT count(*)::int AS n FROM comunicacao_categorias WHERE empresa_id = $1`, [empresaId]);
    if (n.rows[0].n > 0) return false;
    const ator: Ator = { id: null, nome: "Sistema (modelo inicial)" };
    for (const m of MODELO_CATEGORIAS) {
      const cat = await c.query(
        `INSERT INTO comunicacao_categorias (empresa_id, nome, natureza, criado_por_nome) VALUES ($1,$2,$3,$4) RETURNING id`,
        [empresaId, m.nome, m.natureza, ator.nome]);
      await trilha(c, empresaId, "categoria", cat.rows[0].id, "criada", null, { nome: m.nome, natureza: m.natureza }, ator);
      for (const p of m.padroes) {
        const r = await c.query(
          `INSERT INTO comunicacao_regras (empresa_id, padrao, categoria_id, versao, vigente_desde, motivo, criado_por_nome)
           VALUES ($1,$2,$3,1,'1970-01-01',$4,$5) RETURNING id`,
          [empresaId, p, cat.rows[0].id, "Modelo inicial", ator.nome]);
        await trilha(c, empresaId, "regra", r.rows[0].id, "criada", null, { padrao: p, categoria: m.nome, versao: 1 }, ator);
      }
    }
    return true;
  });
}

export async function listarCategorias(db: Pool, empresaId: number) {
  const cats = await db.query(
    `SELECT id, nome, natureza, ativo, criado_por_nome, criado_em FROM comunicacao_categorias WHERE empresa_id = $1 ORDER BY lower(nome)`, [empresaId]);
  const regras = await db.query(
    `SELECT r.id, r.padrao, r.categoria_id, c.nome AS categoria_nome, r.versao, r.vigente_desde, r.vigente_ate, r.motivo, r.criado_por_nome, r.criado_em
       FROM comunicacao_regras r JOIN comunicacao_categorias c ON c.id = r.categoria_id
      WHERE r.empresa_id = $1 ORDER BY r.padrao, r.versao DESC`, [empresaId]);
  return { categorias: cats.rows, regras: regras.rows };
}

export async function criarCategoria(db: Pool, empresaId: number, nome: unknown, natureza: unknown, ator: Ator) {
  const n = nomeValido(nome);
  if (!NATUREZAS.includes(natureza as NaturezaCategoria)) throw new ErroCategoria(400, "Natureza deve ser 'financeira' ou 'operacional'.");
  return emTransacao(db, async (c) => {
    try {
      const r = await c.query(
        `INSERT INTO comunicacao_categorias (empresa_id, nome, natureza, criado_por_nome) VALUES ($1,$2,$3,$4) RETURNING id, nome, natureza, ativo`,
        [empresaId, n, natureza, ator.nome]);
      await trilha(c, empresaId, "categoria", r.rows[0].id, "criada", null, r.rows[0], ator);
      return r.rows[0];
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new ErroCategoria(409, "Já existe uma categoria com esse nome nesta clínica.");
      throw e;
    }
  });
}

export async function editarCategoria(db: Pool, empresaId: number, id: number, campos: { nome?: unknown; natureza?: unknown; ativo?: unknown }, ator: Ator) {
  return emTransacao(db, async (c) => {
    const at = await c.query(`SELECT id, nome, natureza, ativo FROM comunicacao_categorias WHERE id = $1 AND empresa_id = $2 FOR UPDATE`, [id, empresaId]);
    if (!at.rows[0]) throw new ErroCategoria(404, "Categoria não encontrada nesta clínica.");
    const antes = at.rows[0];
    const nome = campos.nome === undefined ? antes.nome : nomeValido(campos.nome);
    const natureza = campos.natureza === undefined ? antes.natureza : campos.natureza;
    if (!NATUREZAS.includes(natureza as NaturezaCategoria)) throw new ErroCategoria(400, "Natureza inválida.");
    const ativo = campos.ativo === undefined ? antes.ativo : Boolean(campos.ativo);
    try {
      const r = await c.query(
        `UPDATE comunicacao_categorias SET nome=$3, natureza=$4, ativo=$5 WHERE id=$1 AND empresa_id=$2 RETURNING id, nome, natureza, ativo`,
        [id, empresaId, nome, natureza, ativo]);
      await trilha(c, empresaId, "categoria", id, "editada", antes, r.rows[0], ator);
      return r.rows[0];
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new ErroCategoria(409, "Já existe uma categoria com esse nome nesta clínica.");
      throw e;
    }
  });
}

/**
 * Nova versao da regra de um padrao. Se ja ha versao aberta, ela e encerrada agora.
 * retroativa=true: a nova versao vale tambem para mensagens antigas; false: so de agora em diante.
 */
export async function salvarRegra(db: Pool, empresaId: number, entrada: { padrao: unknown; categoriaId: unknown; retroativa?: unknown; motivo?: unknown }, ator: Ator) {
  const padrao = padraoValido(entrada.padrao);
  const categoriaId = Number(entrada.categoriaId);
  if (!Number.isSafeInteger(categoriaId) || categoriaId <= 0) throw new ErroCategoria(400, "Escolha uma categoria.");
  const motivo = String(entrada.motivo ?? "").trim().slice(0, 300) || null;
  return emTransacao(db, async (c) => {
    const cat = await c.query(`SELECT id, nome, ativo FROM comunicacao_categorias WHERE id = $1 AND empresa_id = $2`, [categoriaId, empresaId]);
    if (!cat.rows[0]) throw new ErroCategoria(404, "Categoria não encontrada nesta clínica.");
    if (!cat.rows[0].ativo) throw new ErroCategoria(409, "A categoria está desativada.");
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`comregra:${empresaId}:${padrao}`]);
    const ab = await c.query(
      `SELECT id, versao, categoria_id FROM comunicacao_regras WHERE empresa_id=$1 AND padrao=$2 AND vigente_ate IS NULL FOR UPDATE`, [empresaId, padrao]);
    const ult = await c.query(`SELECT COALESCE(max(versao),0)::int AS v FROM comunicacao_regras WHERE empresa_id=$1 AND padrao=$2`, [empresaId, padrao]);
    const agora = await c.query(`SELECT clock_timestamp() AS t`);
    if (ab.rows[0]) {
      if (ab.rows[0].categoria_id === categoriaId) throw new ErroCategoria(409, "Esta regra já aponta para essa categoria.");
      await c.query(`UPDATE comunicacao_regras SET vigente_ate = $2 WHERE id = $1`, [ab.rows[0].id, agora.rows[0].t]);
    }
    const desde = entrada.retroativa ? new Date("1970-01-01T00:00:00Z") : agora.rows[0].t;
    const r = await c.query(
      `INSERT INTO comunicacao_regras (empresa_id, padrao, categoria_id, versao, vigente_desde, motivo, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, padrao, categoria_id, versao, vigente_desde`,
      [empresaId, padrao, categoriaId, ult.rows[0].v + 1, desde, motivo, ator.nome]);
    await trilha(c, empresaId, "regra", r.rows[0].id, ab.rows[0] ? "nova_versao" : "criada",
      ab.rows[0] ?? null, { ...r.rows[0], categoria: cat.rows[0].nome, retroativa: Boolean(entrada.retroativa), motivo }, ator);
    return r.rows[0];
  });
}

/** Desativar = encerrar a versao aberta. Nada e apagado; mensagens voltam a "sem categoria" a partir de agora. */
export async function encerrarRegra(db: Pool, empresaId: number, regraId: number, ator: Ator) {
  return emTransacao(db, async (c) => {
    const r = await c.query(
      `UPDATE comunicacao_regras SET vigente_ate = clock_timestamp()
        WHERE id=$1 AND empresa_id=$2 AND vigente_ate IS NULL RETURNING id, padrao, categoria_id, versao`, [regraId, empresaId]);
    if (!r.rows[0]) throw new ErroCategoria(404, "Regra aberta não encontrada nesta clínica.");
    await trilha(c, empresaId, "regra", regraId, "encerrada", r.rows[0], null, ator);
    return r.rows[0];
  });
}

export async function listarTrilha(db: Pool, empresaId: number, limite = 100) {
  const r = await db.query(
    `SELECT id, entidade, entidade_id, acao, antes, depois, ator_nome, criado_em FROM comunicacao_trilha
      WHERE empresa_id = $1 ORDER BY id DESC LIMIT $2`, [empresaId, Math.min(Math.max(limite, 1), 500)]);
  return r.rows;
}
