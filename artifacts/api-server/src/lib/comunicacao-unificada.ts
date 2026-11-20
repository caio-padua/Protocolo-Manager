/**
 * Conversa unificada WWP (WhatsApp) + TG (Telegram).
 *
 * Fonte unica de leitura para Central de Auditoria, backup e telas de conversa.
 * REGRA DE ISOLAMENTO: toda leitura exige empresa_id e nunca devolve linha de outra clinica.
 * Linha legada sem clinica gravada herda a clinica do CLIENTE; sem cliente = nao atribuivel = fora da leitura.
 *
 * Honestidade: estado de entrega e cobranca vem sempre de dado gravado. Sem dado, o estado e
 * "nao informado" / "sem registro", nunca inventado.
 */
import { pool } from "@workspace/db";
import { brtISODate } from "./brt";
import { mascararTelefone } from "../routes/whatsapp-status";
import { CLASSIFICACAO_SQL } from "./comunicacao-categorias";

export type CanalConversa = "wwp" | "tg";
export type DirecaoConversa = "entrada" | "saida";
export type EstadoCobranca = "paga" | "isenta" | "sem_tarifa" | "teste" | "nao_tarifado" | "sem_registro";
export type OrigemMensagem = "cliente" | "humano" | "ia" | "automatico" | "nao_informado";

export interface FiltroConversas {
  empresaId: number;
  canal?: CanalConversa | null;
  clienteId?: number | null;
  de?: Date | null;
  ate?: Date | null;
  /** id da categoria, ou "sem" para mensagens sem categoria. So vale em listarConversas. */
  categoria?: number | "sem" | null;
  natureza?: "financeira" | "operacional" | "sem_categoria" | null;
}

export type EstadoEtapa = "registrado" | "recebido" | "enviado" | "entregue" | "lido" | "falhou" | "nao_informado";
export interface EtapaMensagem { chave: "envio" | "entrega" | "leitura" | "conclusao_servico"; rotulo: string; estado: EstadoEtapa; evidencia: string }

export interface LinhaConversa {
  ref: string;
  canal: CanalConversa;
  clienteId: number | null;
  clienteNome: string | null;
  empresaId: number;
  empresaNome: string | null;
  destino: string;
  direcao: DirecaoConversa;
  contexto: string | null;
  origem: OrigemMensagem;
  entrega: string;
  erro: string | null;
  cobranca: EstadoCobranca;
  valorCentavos: number | null;
  previa: string;
  corpo: string;
  criadoEm: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  natureza: "financeira" | "operacional" | "sem_categoria";
  regraVersao: number | null;
  etapas: EtapaMensagem[];
}

export const PERIODOS = ["hoje", "7d", "30d", "tudo"] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Inicio do periodo no fuso de Brasilia (fonte unica lib/brt.ts). */
export function inicioDoPeriodo(periodo: Periodo, agora: Date = new Date()): Date | null {
  if (periodo === "tudo") return null;
  const dias = periodo === "hoje" ? 0 : periodo === "7d" ? 6 : 29;
  const base = new Date(`${brtISODate(agora)}T00:00:00-03:00`);
  return new Date(base.getTime() - dias * 86_400_000);
}

const COBRANCA_SQL = `CASE
  WHEN u.canal = 'wwp' THEN 'nao_tarifado'
  WHEN u.e_id IS NULL THEN 'sem_registro'
  WHEN u.e_ambiente = 'teste' THEN 'teste'
  WHEN u.e_isento THEN 'isenta'
  WHEN u.e_sem_tarifa THEN 'sem_tarifa'
  WHEN u.e_valor > 0 THEN 'paga'
  ELSE 'sem_tarifa' END`;

/**
 * Uniao das duas tabelas. As linhas do log do WhatsApp com via='telegram' sao copias de envios do
 * Telegram; quando ja existe a mesma mensagem no historico do Telegram (mesmo cliente, mesmo texto,
 * ate 2 minutos), a copia e descartada para nao duplicar.
 */
const UNIAO_SQL = `
WITH w AS (
  SELECT 'wwp'::text AS canal, 'w' || l.id AS ref, l.cliente_id,
         COALESCE(l.empresa_id, c.empresa_id) AS empresa_id,
         l.telefone AS destino, COALESCE(l.direcao, 'saida') AS direcao, l.contexto,
         l.status AS status_bruto, l.error_code, l.corpo, l.criado_em AS quando
    FROM whatsapp_mensagens_log l
    LEFT JOIN clients c ON c.id = l.cliente_id
   WHERE l.via = 'whatsapp'
),
t AS (
  SELECT 'tg'::text AS canal, 't' || m.id AS ref, m.cliente_id,
         CASE WHEN m.empresa_id > 0 THEN m.empresa_id ELSE c.empresa_id END AS empresa_id,
         m.chat_id AS destino,
         CASE WHEN m.direcao = 'entrada' THEN 'entrada' ELSE 'saida' END AS direcao,
         (SELECT l.contexto FROM whatsapp_mensagens_log l
           WHERE l.via = 'telegram' AND l.cliente_id = m.cliente_id AND l.corpo = m.texto
             AND ABS(EXTRACT(EPOCH FROM (l.criado_em - m.recebida_em))) < 120
           ORDER BY l.id LIMIT 1) AS contexto,
         NULL::text AS status_bruto, NULL::text AS error_code, m.texto AS corpo, m.recebida_em AS quando
    FROM telegram_inbox_messages m
    JOIN clients c ON c.id = m.cliente_id
),
tg_log AS (
  SELECT 'tg'::text AS canal, 'w' || l.id AS ref, l.cliente_id,
         COALESCE(l.empresa_id, c.empresa_id) AS empresa_id,
         l.telefone AS destino, COALESCE(l.direcao, 'saida') AS direcao, l.contexto,
         l.status AS status_bruto, l.error_code, l.corpo, l.criado_em AS quando
    FROM whatsapp_mensagens_log l
    LEFT JOIN clients c ON c.id = l.cliente_id
   WHERE l.via = 'telegram'
     AND NOT EXISTS (
       SELECT 1 FROM telegram_inbox_messages m
        WHERE m.cliente_id = l.cliente_id AND m.texto = l.corpo AND m.direcao <> 'entrada'
          AND ABS(EXTRACT(EPOCH FROM (l.criado_em - m.recebida_em))) < 120)
),
base AS (SELECT * FROM w UNION ALL SELECT * FROM t UNION ALL SELECT * FROM tg_log),
u AS (
  SELECT b.*, e.id AS e_id, e.ambiente AS e_ambiente, e.isento AS e_isento,
         e.sem_tarifa AS e_sem_tarifa, e.valor_centavos AS e_valor
    FROM base b
    LEFT JOIN LATERAL (
      SELECT x.* FROM msg_extrato x
       WHERE b.canal = 'tg' AND b.ref LIKE 't%' AND x.empresa_id = b.empresa_id AND x.natureza = 'consumo'
         AND x.chave = (CASE WHEN b.direcao = 'entrada' THEN 'recebida:cli:' ELSE 'enviada:cli:' END) || substr(b.ref, 2)
       ORDER BY (x.ambiente = 'real') DESC, x.id DESC LIMIT 1) e ON TRUE
)`;

function montarFiltro(f: FiltroConversas, extra: { antes?: { quando: string; ref: string } | null; categoria?: boolean } = {}) {
  const params: unknown[] = [f.empresaId];
  const where: string[] = ["u.empresa_id = $1"];
  if (f.canal) { params.push(f.canal); where.push(`u.canal = $${params.length}`); }
  if (f.clienteId) { params.push(f.clienteId); where.push(`u.cliente_id = $${params.length}`); }
  if (f.de) { params.push(f.de.toISOString()); where.push(`u.quando >= $${params.length}::timestamptz`); }
  if (f.ate) { params.push(f.ate.toISOString()); where.push(`u.quando < $${params.length}::timestamptz`); }
  if (extra.categoria) {
    if (f.categoria === "sem") where.push(`rg.categoria_id IS NULL`);
    else if (typeof f.categoria === "number") { params.push(f.categoria); where.push(`rg.categoria_id = $${params.length}`); }
    if (f.natureza === "sem_categoria") where.push(`rg.categoria_id IS NULL`);
    else if (f.natureza) { params.push(f.natureza); where.push(`rg.categoria_natureza = $${params.length}`); }
  }
  if (extra.antes) {
    params.push(extra.antes.quando, extra.antes.ref);
    where.push(`(u.quando, u.ref) < ($${params.length - 1}::timestamptz, $${params.length})`);
  }
  return { params, where: where.join(" AND ") };
}

export function origemDaLinha(canal: CanalConversa, direcao: DirecaoConversa, contexto: string | null): OrigemMensagem {
  if (direcao === "entrada") return "cliente";
  const c = (contexto ?? "").toLowerCase();
  if (!c) return "nao_informado";
  if (c.includes("inbound_reply") || c.includes("ia_") || c.includes("assistente")) return "ia";
  if (c.startsWith("cockpit") || c.includes("manual")) return "humano";
  return "automatico";
}

const ENTREGA_WWP: Record<string, string> = {
  queued: "Na fila", sent: "Enviado", delivered: "Entregue", read: "Lido",
  failed: "Falhou", undelivered: "Falhou", link: "Só link",
};

export function entregaDaLinha(canal: CanalConversa, direcao: DirecaoConversa, statusBruto: string | null): string {
  if (direcao === "entrada") return "Recebido";
  if (canal === "tg" && !statusBruto) return "Enviado";
  return ENTREGA_WWP[statusBruto ?? ""] ?? "Não informado";
}

/**
 * Etapas INDEPENDENTES de uma mensagem. Cada uma so assume um estado com dado gravado:
 * enviar nao prova entregar, entregar nao prova ler, e nenhuma mensagem prova conclusao do servico.
 */
export function etapasDaLinha(canal: CanalConversa, direcao: DirecaoConversa, statusBruto: string | null): EtapaMensagem[] {
  const naoInf = (chave: EtapaMensagem["chave"], rotulo: string, evidencia: string): EtapaMensagem => ({ chave, rotulo, estado: "nao_informado", evidencia });
  if (direcao === "entrada") {
    return [
      { chave: "envio", rotulo: "Mensagem do cliente", estado: "recebido", evidencia: "Registrada na chegada" },
      naoInf("entrega", "Entrega", "Não se aplica a mensagem recebida"),
      naoInf("leitura", "Leitura", "Não se aplica a mensagem recebida"),
      naoInf("conclusao_servico", "Conclusão do serviço", "Mensagem não prova conclusão"),
    ];
  }
  const st = statusBruto ?? "";
  const falhou = st === "failed" || st === "undelivered";
  const entregue = st === "delivered" || st === "read";
  return [
    { chave: "envio", rotulo: "Envio", estado: falhou ? "falhou" : "registrado", evidencia: canal === "tg" ? "Registrado pelo sistema" : "Registrado pelo sistema, estado do provedor: " + (st || "sem estado") },
    entregue ? { chave: "entrega", rotulo: "Entrega", estado: "entregue", evidencia: "Confirmada pelo provedor" }
      : falhou ? { chave: "entrega", rotulo: "Entrega", estado: "falhou", evidencia: "Falha informada pelo provedor" }
      : naoInf("entrega", "Entrega", "O provedor não informou entrega"),
    st === "read" ? { chave: "leitura", rotulo: "Leitura", estado: "lido", evidencia: "Confirmada pelo provedor" }
      : naoInf("leitura", "Leitura", canal === "tg" ? "O Telegram não informa leitura ao sistema" : "O provedor não informou leitura"),
    naoInf("conclusao_servico", "Conclusão do serviço", "Envio de mensagem não prova conclusão"),
  ];
}

function destinoMascarado(canal: CanalConversa, destino: string): string {
  if (canal === "wwp") return mascararTelefone(destino);
  const d = (destino ?? "").replace(/\D/g, "");
  if (d.length >= 4 && /^\d+$/.test(destino ?? "")) return `chat ••••${d.slice(-4)}`;
  return mascararTelefone(destino);
}

function paraLinha(r: Record<string, any>): LinhaConversa {
  const canal = r.canal as CanalConversa;
  const direcao = r.direcao as DirecaoConversa;
  const corpo = String(r.corpo ?? "");
  const cobranca = r.cobranca as EstadoCobranca;
  return {
    ref: String(r.ref),
    canal,
    clienteId: r.cliente_id == null ? null : Number(r.cliente_id),
    clienteNome: r.cliente_nome ?? null,
    empresaId: Number(r.empresa_id),
    empresaNome: r.empresa_nome ?? null,
    destino: destinoMascarado(canal, String(r.destino ?? "")),
    direcao,
    contexto: r.contexto ?? null,
    origem: origemDaLinha(canal, direcao, r.contexto ?? null),
    entrega: entregaDaLinha(canal, direcao, r.status_bruto ?? null),
    erro: r.error_code ?? null,
    cobranca,
    valorCentavos: cobranca === "paga" && r.e_valor != null ? Number(r.e_valor) : null,
    previa: corpo.length > 90 ? `${corpo.slice(0, 90)}…` : corpo,
    corpo,
    criadoEm: new Date(r.quando).toISOString(),
    categoriaId: r.categoria_id == null ? null : Number(r.categoria_id),
    categoriaNome: r.categoria_nome ?? null,
    natureza: r.categoria_natureza ?? "sem_categoria",
    regraVersao: r.regra_versao == null ? null : Number(r.regra_versao),
    etapas: etapasDaLinha(canal, direcao, r.status_bruto ?? null),
  };
}

const SELECAO = `SELECT u.*, (${COBRANCA_SQL}) AS cobranca, cl.name AS cliente_nome, cl.cpf AS cliente_cpf, emp.nome AS empresa_nome,
  rg.categoria_id, rg.categoria_nome, rg.categoria_natureza, rg.regra_versao
  FROM u
  LEFT JOIN clients cl ON cl.id = u.cliente_id
  LEFT JOIN empresas emp ON emp.id = u.empresa_id
  ${CLASSIFICACAO_SQL}`;

export interface PaginaConversas { linhas: LinhaConversa[]; proximo: string | null }

export async function listarConversas(
  f: FiltroConversas,
  opts: { limite?: number; cursor?: string | null } = {},
): Promise<PaginaConversas> {
  const limite = Math.min(Math.max(opts.limite ?? 50, 1), 500);
  let antes: { quando: string; ref: string } | null = null;
  if (opts.cursor) {
    const [quando, ref] = Buffer.from(opts.cursor, "base64url").toString("utf8").split("|");
    if (!quando || !ref || Number.isNaN(Date.parse(quando))) throw new RangeError("cursor invalido");
    antes = { quando, ref };
  }
  const { params, where } = montarFiltro(f, { antes, categoria: true });
  params.push(limite + 1);
  const r = await pool.query(
    `${UNIAO_SQL} ${SELECAO} WHERE ${where} ORDER BY u.quando DESC, u.ref DESC LIMIT $${params.length}`,
    params,
  );
  const sobra = r.rows.length > limite;
  const rows = sobra ? r.rows.slice(0, limite) : r.rows;
  const ultimo = rows[rows.length - 1];
  return {
    linhas: rows.map(paraLinha),
    proximo: sobra && ultimo
      ? Buffer.from(`${new Date(ultimo.quando).toISOString()}|${ultimo.ref}`).toString("base64url")
      : null,
  };
}

/** Leitura em lotes para o backup (nunca carrega tudo de uma vez na consulta). */
export async function* lerConversasEmLotes(f: FiltroConversas, tamanho = 500): AsyncGenerator<LinhaConversa[]> {
  let cursor: string | null = null;
  for (;;) {
    const pagina: PaginaConversas = await listarConversas(f, { limite: tamanho, cursor });
    if (pagina.linhas.length) yield pagina.linhas;
    if (!pagina.proximo) return;
    cursor = pagina.proximo;
  }
}

export interface ResumoConversas {
  porCanal: Record<CanalConversa, { total: number; enviadas: number; recebidas: number; falhas: number }>;
  porCobranca: Record<EstadoCobranca, number>;
  valorPagoCentavos: number;
}

export async function resumirConversas(f: FiltroConversas): Promise<ResumoConversas> {
  const { params, where } = montarFiltro(f);
  const r = await pool.query(
    `${UNIAO_SQL}
     SELECT u.canal, u.direcao, (${COBRANCA_SQL}) AS cobranca,
            (u.status_bruto IN ('failed','undelivered')) AS falhou,
            COUNT(*)::int AS n, COALESCE(SUM(u.e_valor) FILTER (WHERE u.e_ambiente = 'real' AND NOT COALESCE(u.e_isento,FALSE)), 0)::bigint AS valor
       FROM u WHERE ${where} GROUP BY 1,2,3,4`,
    params,
  );
  const vazio = () => ({ total: 0, enviadas: 0, recebidas: 0, falhas: 0 });
  const res: ResumoConversas = {
    porCanal: { wwp: vazio(), tg: vazio() },
    porCobranca: { paga: 0, isenta: 0, sem_tarifa: 0, teste: 0, nao_tarifado: 0, sem_registro: 0 },
    valorPagoCentavos: 0,
  };
  for (const x of r.rows) {
    const c = res.porCanal[x.canal as CanalConversa];
    c.total += x.n;
    if (x.direcao === "entrada") c.recebidas += x.n; else c.enviadas += x.n;
    if (x.falhou) c.falhas += x.n;
    res.porCobranca[x.cobranca as EstadoCobranca] += x.n;
    if (x.cobranca === "paga") res.valorPagoCentavos += Number(x.valor);
  }
  return res;
}

/** CPF do cliente, somente se pertencer a clinica informada. */
export async function clienteDaClinica(
  empresaId: number,
  clienteId: number,
): Promise<{ id: number; nome: string; cpf: string | null } | null> {
  const r = await pool.query(`SELECT id, name, cpf FROM clients WHERE id = $1 AND empresa_id = $2`, [clienteId, empresaId]);
  const x = r.rows[0];
  return x ? { id: Number(x.id), nome: String(x.name), cpf: x.cpf ?? null } : null;
}

/** Contextos que ainda nao tem categoria nesta clinica (para o CEO criar a regra). */
export async function contextosSemCategoria(empresaId: number): Promise<{ contexto: string | null; total: number }[]> {
  const r = await pool.query(
    `${UNIAO_SQL}
     SELECT u.contexto, COUNT(*)::int AS total FROM u ${CLASSIFICACAO_SQL}
      WHERE u.empresa_id = $1 AND rg.categoria_id IS NULL GROUP BY u.contexto ORDER BY total DESC LIMIT 100`,
    [empresaId],
  );
  return r.rows.map((x) => ({ contexto: x.contexto ?? null, total: x.total }));
}

/** Totais por categoria (inclui "sem categoria"), mesma clinica e periodo. */
export async function resumirPorCategoria(f: FiltroConversas) {
  const { params, where } = montarFiltro(f);
  const r = await pool.query(
    `${UNIAO_SQL}
     SELECT rg.categoria_id, COALESCE(rg.categoria_nome, 'Sem categoria') AS nome, COALESCE(rg.categoria_natureza, 'sem_categoria') AS natureza, COUNT(*)::int AS total
       FROM u ${CLASSIFICACAO_SQL} WHERE ${where} GROUP BY 1,2,3 ORDER BY total DESC`,
    params,
  );
  return r.rows.map((x) => ({ categoriaId: x.categoria_id == null ? null : Number(x.categoria_id), nome: String(x.nome), natureza: String(x.natureza), total: x.total }));
}
