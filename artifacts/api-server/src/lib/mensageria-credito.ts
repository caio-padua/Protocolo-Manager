/**
 * Crédito pré-pago da mensageria (pay per use), isolado por clínica.
 *
 * Regras (ordem do Dr. Caio):
 *  - A comunicação está incluída no PaxMed; cobra-se só o uso: mensagem recebida, enviada e solicitação
 *    solucionada. Cobrança por tempo existe mas nasce DESLIGADA, sem preço e sem critério.
 *  - Nenhum preço é inventado: sem tarifa cadastrada o evento é registrado com valor 0 e marcado "sem_tarifa".
 *  - Saldo nunca fica negativo: a linha da carteira é travada na mesma transação do débito.
 *  - Cada evento tem uma chave de idempotência por clínica: reentrega e concorrência não cobram duas vezes.
 *  - Isenção (Instituto Pádua) é explícita, por clínica, administrável e auditada: o evento continua no extrato
 *    com valor cobrado 0 e o valor de tabela que seria cobrado.
 *  - Custo do provedor de IA é registrado à parte e nunca entra no saldo da clínica; sem valor informado pelo
 *    provedor fica vazio (sem câmbio nem tarifa fixa no código).
 */
import { pool } from "@workspace/db";
import { logger } from "./logger";

export type TipoEvento = "recebida" | "enviada" | "solucionada" | "tempo";
export const TIPOS_EVENTO: readonly TipoEvento[] = ["recebida", "enviada", "solucionada", "tempo"];
export const INSTITUTO_EMPRESA_ID = 5;

interface Consulta { query: (q: string, v?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }

let _pronto: Promise<void> | null = null;
export function garantirTabelasCredito(): Promise<void> {
  _pronto ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS msg_carteira (
        empresa_id INTEGER PRIMARY KEY,
        saldo_centavos BIGINT NOT NULL DEFAULT 0 CHECK (saldo_centavos >= 0),
        limite_aviso_centavos BIGINT,
        pausado BOOLEAN NOT NULL DEFAULT FALSE,
        isento BOOLEAN NOT NULL DEFAULT FALSE,
        isento_motivo TEXT, isento_por TEXT, isento_em TIMESTAMPTZ,
        aviso_baixo_em TIMESTAMPTZ, aviso_sem_saldo_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS msg_tarifas (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER,                      -- NULL = tarifa padrão da plataforma
        tipo_evento TEXT NOT NULL,
        valor_centavos BIGINT NOT NULL CHECK (valor_centavos >= 0),
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        unidade TEXT, criterio TEXT,             -- só para tipo 'tempo'
        definido_por TEXT, vigente_desde TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS msg_tarifas_busca ON msg_tarifas (tipo_evento, empresa_id, vigente_desde DESC);
      CREATE TABLE IF NOT EXISTS msg_extrato (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        natureza TEXT NOT NULL CHECK (natureza IN ('credito','consumo','estorno')),
        tipo_evento TEXT,
        conversa_ref TEXT,
        chave TEXT NOT NULL,
        valor_centavos BIGINT NOT NULL CHECK (valor_centavos >= 0),
        valor_tabela_centavos BIGINT,
        isento BOOLEAN NOT NULL DEFAULT FALSE,
        sem_tarifa BOOLEAN NOT NULL DEFAULT FALSE,
        tarifa_id BIGINT,
        saldo_apos_centavos BIGINT NOT NULL,
        estorno_de BIGINT,
        descricao TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id, chave)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS msg_extrato_estorno_unico ON msg_extrato (estorno_de) WHERE estorno_de IS NOT NULL;
      ALTER TABLE msg_extrato ADD COLUMN IF NOT EXISTS franquia_abatida_centavos BIGINT NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS msg_recargas (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        valor_centavos BIGINT NOT NULL CHECK (valor_centavos > 0),
        status TEXT NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada','confirmada','cancelada')),
        ambiente TEXT NOT NULL DEFAULT 'real' CHECK (ambiente IN ('real','teste')),
        provedor_ref TEXT,
        solicitada_por TEXT, solicitada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confirmada_em TIMESTAMPTZ,
        UNIQUE (provedor_ref)
      );
      CREATE TABLE IF NOT EXISTS msg_eventos_pendentes (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        tipo_evento TEXT NOT NULL,
        chave TEXT NOT NULL,
        conversa_ref TEXT,
        inbox_message_id BIGINT,
        descricao TEXT,
        status TEXT NOT NULL DEFAULT 'aguardando_saldo' CHECK (status IN ('aguardando_saldo','cobrado')),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id, chave)
      );
      CREATE TABLE IF NOT EXISTS msg_avisos (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('saldo_baixo','sem_saldo','recarga_solicitada')),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS msg_custos_provedor (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        chave TEXT NOT NULL,
        etapa TEXT NOT NULL,
        provedor TEXT NOT NULL,
        modelo TEXT NOT NULL,
        input_tokens INTEGER, output_tokens INTEGER,
        custo_informado NUMERIC(14,6), moeda TEXT,   -- vazio quando o provedor não informou
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id, chave)
      );
      CREATE TABLE IF NOT EXISTS msg_config_ia (
        empresa_id INTEGER NOT NULL,
        etapa TEXT NOT NULL,
        provedor TEXT NOT NULL, modelo TEXT NOT NULL,
        orientacoes TEXT,
        atualizado_por TEXT, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (empresa_id, etapa)
      );
    `);
    // Isenção explícita e administrável do Instituto Pádua (única clínica isenta; as demais nascem sem isenção).
    await pool.query(
      `INSERT INTO msg_carteira (empresa_id, isento, isento_motivo, isento_por, isento_em)
       VALUES ($1, TRUE, 'Instituto Pádua (matriz) isento da tarifa PaxMed por decisão do CEO', 'sistema', NOW())
       ON CONFLICT (empresa_id) DO NOTHING`, [INSTITUTO_EMPRESA_ID]);
  })().catch((e) => { _pronto = null; throw e; });
  return _pronto;
}

async function tx<T>(fn: (c: Consulta) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c as unknown as Consulta);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { c.release(); }
}

export interface ResultadoEvento {
  ok: boolean;
  /** registrado | ja_registrado | saldo_insuficiente */
  situacao: "registrado" | "ja_registrado" | "saldo_insuficiente";
  valorCobradoCentavos: number;
  isento: boolean;
  semTarifa: boolean;
  saldoCentavos: number;
  avisoSaldoBaixo?: boolean;
  avisoSemSaldo?: boolean;
}

export interface EventoParams {
  empresaId: number;
  tipo: TipoEvento;
  /** Identifica o evento de forma estável: a mesma chave nunca cobra duas vezes. */
  chave: string;
  conversaRef?: string;
  inboxMessageId?: number;
  descricao?: string;
}

async function tarifaVigente(c: Consulta, empresaId: number, tipo: TipoEvento) {
  const r = await c.query(
    `SELECT id, valor_centavos, ativo FROM msg_tarifas
      WHERE tipo_evento = $1 AND (empresa_id = $2 OR empresa_id IS NULL)
      ORDER BY (empresa_id IS NULL), vigente_desde DESC, id DESC LIMIT 1`, [tipo, empresaId]);
  const t = r.rows[0];
  if (!t || !t.ativo) return null; // desativada ou inexistente: sem tarifa
  return { id: Number(t.id), valor: Number(t.valor_centavos) };
}

/** Franquia mensal restante (centavos de tabela) do contrato vigente; null sem contrato/franquia/elegibilidade. */
async function franquiaDisponivel(c: Consulta, empresaId: number, tipo: TipoEvento): Promise<{ restante: number; mes: string } | null> {
  const ok = await c.query(`SELECT to_regclass('cat_contratos') IS NOT NULL AND to_regclass('cat_tarifas') IS NOT NULL AND to_regclass('msg_franquia_uso') IS NOT NULL AS ok`);
  if (!ok.rows[0]?.ok) return null;
  const el = await c.query(`SELECT elegivel_franquia FROM cat_tarifas WHERE codigo = $1 ORDER BY versao DESC LIMIT 1`, [`msg_${tipo}`]);
  if (!el.rows[0]?.elegivel_franquia) return null;
  const ct = await c.query(`SELECT franquia_texto_centavos FROM cat_contratos WHERE empresa_id = $1 AND status IN ('piloto','ativo') ORDER BY id DESC LIMIT 1`, [empresaId]);
  const total = Number(ct.rows[0]?.franquia_texto_centavos ?? 0);
  if (total <= 0) return null;
  const mes = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const u = await c.query(`SELECT usado_centavos FROM msg_franquia_uso WHERE empresa_id = $1 AND mes = $2`, [empresaId, mes]);
  return { restante: Math.max(0, total - Number(u.rows[0]?.usado_centavos ?? 0)), mes };
}

/** Registra e cobra um evento. Atômico: trava a carteira, confere a chave e debita sem deixar saldo negativo. */
export async function registrarEvento(p: EventoParams): Promise<ResultadoEvento> {
  if (!TIPOS_EVENTO.includes(p.tipo)) throw new RangeError("tipo de evento inválido");
  if (!Number.isSafeInteger(p.empresaId) || p.empresaId < 1) throw new RangeError("empresaId inválido");
  if (!p.chave) throw new RangeError("chave obrigatória");
  await garantirTabelasCredito();
  return tx(async (c) => {
    await c.query(`INSERT INTO msg_carteira (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING`, [p.empresaId]);
    const w = (await c.query(`SELECT * FROM msg_carteira WHERE empresa_id = $1 FOR UPDATE`, [p.empresaId])).rows[0];
    const saldo = Number(w.saldo_centavos);
    const ja = await c.query(`SELECT valor_centavos, isento, sem_tarifa FROM msg_extrato WHERE empresa_id = $1 AND chave = $2`, [p.empresaId, p.chave]);
    if (ja.rows[0]) {
      return { ok: true, situacao: "ja_registrado", valorCobradoCentavos: Number(ja.rows[0].valor_centavos), isento: ja.rows[0].isento, semTarifa: ja.rows[0].sem_tarifa, saldoCentavos: saldo } as ResultadoEvento;
    }
    const t = await tarifaVigente(c, p.empresaId, p.tipo);
    const tabela = t?.valor ?? 0;
    const isento: boolean = w.isento === true;
    const semTarifa = !t;
    const devidoTabela = isento || semTarifa ? 0 : tabela;
    // Franquia mensal do contrato vigente: usada ANTES do crédito comprado, só para tarifa elegível, sem acumular.
    const fr = devidoTabela > 0 ? await franquiaDisponivel(c, p.empresaId, p.tipo) : null;
    const abatido = fr ? Math.min(fr.restante, devidoTabela) : 0;
    const cobrar = devidoTabela - abatido;
    if (cobrar > saldo) {
      await c.query(
        `INSERT INTO msg_eventos_pendentes (empresa_id, tipo_evento, chave, conversa_ref, inbox_message_id, descricao)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (empresa_id, chave) DO NOTHING`,
        [p.empresaId, p.tipo, p.chave, p.conversaRef ?? null, p.inboxMessageId ?? null, p.descricao ?? null]);
      let avisoSemSaldo = false;
      if (!w.pausado || !w.aviso_sem_saldo_em) {
        await c.query(`UPDATE msg_carteira SET pausado = TRUE, aviso_sem_saldo_em = NOW() WHERE empresa_id = $1`, [p.empresaId]);
        await c.query(`INSERT INTO msg_avisos (empresa_id, tipo) VALUES ($1,'sem_saldo')`, [p.empresaId]);
        avisoSemSaldo = !w.aviso_sem_saldo_em;
      }
      return { ok: false, situacao: "saldo_insuficiente", valorCobradoCentavos: 0, isento: false, semTarifa: false, saldoCentavos: saldo, avisoSemSaldo } as ResultadoEvento;
    }
    const novo = saldo - cobrar;
    await c.query(
      `INSERT INTO msg_extrato (empresa_id, natureza, tipo_evento, conversa_ref, chave, valor_centavos, valor_tabela_centavos,
         isento, sem_tarifa, tarifa_id, saldo_apos_centavos, descricao, franquia_abatida_centavos)
       VALUES ($1,'consumo',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [p.empresaId, p.tipo, p.conversaRef ?? null, p.chave, cobrar, t ? tabela : null, isento, semTarifa, t?.id ?? null, novo, p.descricao ?? null, abatido]);
    if (abatido > 0 && fr) {
      await c.query(`INSERT INTO msg_franquia_uso (empresa_id, mes, usado_centavos) VALUES ($1,$2,$3)
                     ON CONFLICT (empresa_id, mes) DO UPDATE SET usado_centavos = msg_franquia_uso.usado_centavos + EXCLUDED.usado_centavos`, [p.empresaId, fr.mes, abatido]);
    }
    if (cobrar > 0) await c.query(`UPDATE msg_carteira SET saldo_centavos = $2 WHERE empresa_id = $1`, [p.empresaId, novo]);
    await c.query(`UPDATE msg_eventos_pendentes SET status = 'cobrado' WHERE empresa_id = $1 AND chave = $2`, [p.empresaId, p.chave]);
    let avisoSaldoBaixo = false;
    const lim = w.limite_aviso_centavos == null ? null : Number(w.limite_aviso_centavos);
    if (!isento && lim !== null && novo <= lim) {
      const recente = w.aviso_baixo_em && Date.now() - new Date(w.aviso_baixo_em).getTime() < 24 * 3600 * 1000;
      if (!recente) {
        await c.query(`UPDATE msg_carteira SET aviso_baixo_em = NOW() WHERE empresa_id = $1`, [p.empresaId]);
        await c.query(`INSERT INTO msg_avisos (empresa_id, tipo) VALUES ($1,'saldo_baixo')`, [p.empresaId]);
        avisoSaldoBaixo = true;
      }
    }
    return { ok: true, situacao: "registrado", valorCobradoCentavos: cobrar, isento, semTarifa, saldoCentavos: novo, avisoSaldoBaixo } as ResultadoEvento;
  });
}

/** Pode a clínica receber novas respostas automáticas/envios tarifados agora? (não cobra nada). */
export async function podeAtenderAutomatico(empresaId: number): Promise<{ pode: boolean; motivo?: "sem_saldo" }> {
  await garantirTabelasCredito();
  const r = await pool.query(`SELECT saldo_centavos, isento, pausado FROM msg_carteira WHERE empresa_id = $1`, [empresaId]);
  const w = r.rows[0];
  if (!w) return { pode: false, motivo: "sem_saldo" }; // sem carteira = sem crédito
  if (w.isento) return { pode: true };
  if (w.pausado) return { pode: false, motivo: "sem_saldo" };
  const t = await pool.query(
    `SELECT valor_centavos, ativo FROM msg_tarifas WHERE tipo_evento = 'enviada' AND (empresa_id = $1 OR empresa_id IS NULL)
      ORDER BY (empresa_id IS NULL), vigente_desde DESC, id DESC LIMIT 1`, [empresaId]);
  const custo = t.rows[0]?.ativo ? Number(t.rows[0].valor_centavos) : 0;
  const saldo = Number(w.saldo_centavos);
  // Com tarifa de envio ativa, precisa caber ao menos um envio; sem tarifa, só vale a pausa.
  return custo > 0 && saldo < custo ? { pode: false, motivo: "sem_saldo" } : { pode: true };
}

/** Estorno auditável: devolve o valor de um consumo, uma única vez, com motivo e autor. */
export async function estornarConsumo(empresaId: number, extratoId: number, motivo: string, por: string): Promise<{ ok: boolean; erro?: string; saldoCentavos?: number }> {
  if (!motivo.trim()) return { ok: false, erro: "motivo_obrigatorio" };
  await garantirTabelasCredito();
  return tx(async (c) => {
    const w = (await c.query(`SELECT saldo_centavos FROM msg_carteira WHERE empresa_id = $1 FOR UPDATE`, [empresaId])).rows[0];
    if (!w) return { ok: false, erro: "carteira_inexistente" };
    const o = (await c.query(`SELECT * FROM msg_extrato WHERE id = $1 AND empresa_id = $2`, [extratoId, empresaId])).rows[0];
    if (!o || o.natureza !== "consumo") return { ok: false, erro: "consumo_nao_encontrado" };
    if (Number(o.valor_centavos) <= 0) return { ok: false, erro: "nada_a_estornar" };
    const jaEstornado = await c.query(`SELECT 1 FROM msg_extrato WHERE estorno_de = $1`, [extratoId]);
    if (jaEstornado.rows.length) return { ok: false, erro: "ja_estornado" };
    const novo = Number(w.saldo_centavos) + Number(o.valor_centavos);
    await c.query(
      `INSERT INTO msg_extrato (empresa_id, natureza, tipo_evento, conversa_ref, chave, valor_centavos, saldo_apos_centavos, estorno_de, descricao)
       VALUES ($1,'estorno',$2,$3,$4,$5,$6,$7,$8)`,
      [empresaId, o.tipo_evento, o.conversa_ref, `estorno:${extratoId}`, o.valor_centavos, novo, extratoId, `Estorno por ${por}: ${motivo.trim()}`]);
    await c.query(`UPDATE msg_carteira SET saldo_centavos = $2 WHERE empresa_id = $1`, [empresaId, novo]);
    return { ok: true, saldoCentavos: novo };
  });
}

export async function solicitarRecarga(empresaId: number, valorCentavos: number, por: string, ambiente: "real" | "teste" = "real", provedorRef?: string) {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) throw new RangeError("valor inválido");
  await garantirTabelasCredito();
  const r = await pool.query(
    `INSERT INTO msg_recargas (empresa_id, valor_centavos, ambiente, provedor_ref, solicitada_por) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [empresaId, valorCentavos, ambiente, provedorRef ?? null, por]);
  await pool.query(`INSERT INTO msg_avisos (empresa_id, tipo) VALUES ($1,'recarga_solicitada')`, [empresaId]);
  return { id: Number(r.rows[0].id) };
}

/**
 * Confirma o pagamento de uma recarga. SÓ aqui o saldo aumenta; idempotente (a 2ª confirmação não soma de novo).
 * O ambiente da confirmação precisa ser o da recarga: confirmação de teste nunca vale para recarga real.
 */
export async function confirmarRecarga(recargaId: number, ambiente: "real" | "teste"): Promise<{ ok: boolean; erro?: string; jaConfirmada?: boolean; saldoCentavos?: number }> {
  await garantirTabelasCredito();
  const res = await tx(async (c) => {
    const rec = (await c.query(`SELECT * FROM msg_recargas WHERE id = $1 FOR UPDATE`, [recargaId])).rows[0];
    if (!rec) return { ok: false, erro: "recarga_inexistente" };
    if (rec.ambiente !== ambiente) return { ok: false, erro: "ambiente_diferente" };
    if (rec.status === "cancelada") return { ok: false, erro: "recarga_cancelada" };
    await c.query(`INSERT INTO msg_carteira (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING`, [rec.empresa_id]);
    const w = (await c.query(`SELECT saldo_centavos FROM msg_carteira WHERE empresa_id = $1 FOR UPDATE`, [rec.empresa_id])).rows[0];
    if (rec.status === "confirmada") return { ok: true, jaConfirmada: true, saldoCentavos: Number(w.saldo_centavos), empresaId: rec.empresa_id };
    const novo = Number(w.saldo_centavos) + Number(rec.valor_centavos);
    await c.query(`UPDATE msg_recargas SET status = 'confirmada', confirmada_em = NOW() WHERE id = $1`, [recargaId]);
    await c.query(
      `INSERT INTO msg_extrato (empresa_id, natureza, chave, valor_centavos, saldo_apos_centavos, descricao)
       VALUES ($1,'credito',$2,$3,$4,$5)`,
      [rec.empresa_id, `recarga:${recargaId}`, rec.valor_centavos, novo, rec.ambiente === "teste" ? "Recarga (AMBIENTE DE TESTE, sem pagamento real)" : "Recarga confirmada"]);
    await c.query(`UPDATE msg_carteira SET saldo_centavos = $2, pausado = FALSE, aviso_baixo_em = NULL, aviso_sem_saldo_em = NULL WHERE empresa_id = $1`, [rec.empresa_id, novo]);
    return { ok: true, saldoCentavos: novo, empresaId: rec.empresa_id };
  });
  if (res.ok && !res.jaConfirmada) {
    try { await retomarAposRecarga((res as any).empresaId); } catch (e) { logger.warn({ err: (e as Error).message }, "[credito] retomada após recarga falhou"); }
  }
  return res;
}

/**
 * Retomada: cobra, em ordem, os eventos que ficaram aguardando saldo (enquanto couber) e devolve à fila de
 * atendimento as mensagens de clientes que estavam preservadas sem resposta automática.
 */
export async function retomarAposRecarga(empresaId: number): Promise<{ cobrados: number; reenfileirados: number }> {
  await garantirTabelasCredito();
  const pend = await pool.query(
    `SELECT tipo_evento, chave, conversa_ref, inbox_message_id, descricao FROM msg_eventos_pendentes
      WHERE empresa_id = $1 AND status = 'aguardando_saldo' ORDER BY id`, [empresaId]);
  let cobrados = 0; const ids: number[] = [];
  for (const p of pend.rows) {
    const r = await registrarEvento({ empresaId, tipo: p.tipo_evento, chave: p.chave, conversaRef: p.conversa_ref ?? undefined, descricao: p.descricao ?? undefined });
    if (!r.ok) break; // acabou o saldo de novo: o restante continua preservado
    cobrados++;
    if (p.inbox_message_id) ids.push(Number(p.inbox_message_id));
  }
  let reenfileirados = 0;
  if (ids.length) {
    try {
      const u = await pool.query(
        `UPDATE telegram_atendimento_respostas SET estado = 'pendente', desfecho = NULL, fechado_em = NULL, proxima_tentativa_em = NOW()
          WHERE inbox_message_id = ANY($1::bigint[]) AND desfecho = 'desligado_ou_fora_da_lista'`, [ids]);
      reenfileirados = u.rowCount ?? 0;
    } catch { /* tabela do atendimento pode não existir neste ambiente */ }
  }
  return { cobrados, reenfileirados };
}

export async function registrarCustoProvedor(p: {
  empresaId: number; chave: string; etapa: string; provedor: string; modelo: string;
  inputTokens?: number | null; outputTokens?: number | null; custoInformado?: number | null; moeda?: string | null;
}): Promise<void> {
  try {
    await garantirTabelasCredito();
    await pool.query(
      `INSERT INTO msg_custos_provedor (empresa_id, chave, etapa, provedor, modelo, input_tokens, output_tokens, custo_informado, moeda)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (empresa_id, chave) DO NOTHING`,
      [p.empresaId, p.chave, p.etapa, p.provedor, p.modelo, p.inputTokens ?? null, p.outputTokens ?? null, p.custoInformado ?? null, p.moeda ?? null]);
  } catch (e) {
    logger.error({ err: (e as Error).message, empresaId: p.empresaId }, "[credito] custo de provedor NÃO gravado");
  }
}

/** Visão da clínica: tudo escopado pela própria empresa. */
export async function visaoCredito(empresaId: number, limite = 100) {
  await garantirTabelasCredito();
  await pool.query(`INSERT INTO msg_carteira (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING`, [empresaId]);
  const [w, tar, ext, rec, av, cus, pend] = await Promise.all([
    pool.query(`SELECT saldo_centavos, limite_aviso_centavos, pausado, isento, isento_motivo FROM msg_carteira WHERE empresa_id = $1`, [empresaId]),
    pool.query(`SELECT DISTINCT ON (tipo_evento) tipo_evento, valor_centavos, ativo, unidade, criterio, empresa_id IS NULL AS padrao, vigente_desde
                  FROM msg_tarifas WHERE empresa_id = $1 OR empresa_id IS NULL
                  ORDER BY tipo_evento, (empresa_id IS NULL), vigente_desde DESC, id DESC`, [empresaId]),
    pool.query(`SELECT id, natureza, tipo_evento, conversa_ref, valor_centavos, valor_tabela_centavos, isento, sem_tarifa,
                       saldo_apos_centavos, estorno_de, descricao, criado_em FROM msg_extrato WHERE empresa_id = $1 ORDER BY id DESC LIMIT $2`, [empresaId, limite]),
    pool.query(`SELECT id, valor_centavos, status, ambiente, solicitada_em, confirmada_em FROM msg_recargas WHERE empresa_id = $1 ORDER BY id DESC LIMIT 50`, [empresaId]),
    pool.query(`SELECT tipo, criado_em FROM msg_avisos WHERE empresa_id = $1 ORDER BY id DESC LIMIT 10`, [empresaId]),
    pool.query(`SELECT etapa, provedor, modelo, input_tokens, output_tokens, custo_informado, moeda, criado_em
                  FROM msg_custos_provedor WHERE empresa_id = $1 ORDER BY id DESC LIMIT 50`, [empresaId]),
    pool.query(`SELECT COUNT(*)::int AS n FROM msg_eventos_pendentes WHERE empresa_id = $1 AND status = 'aguardando_saldo'`, [empresaId]),
  ]);
  const por = new Map<string, Set<string>>();
  for (const l of ext.rows) if (l.natureza === "consumo" && l.conversa_ref) {
    if (!por.has(l.conversa_ref)) por.set(l.conversa_ref, new Set());
    por.get(l.conversa_ref)!.add(l.tipo_evento);
  }
  const extrato = ext.rows.map((l) => ({
    ...l,
    saldo_apos_centavos: Number(l.saldo_apos_centavos), valor_centavos: Number(l.valor_centavos),
    valor_tabela_centavos: l.valor_tabela_centavos == null ? null : Number(l.valor_tabela_centavos),
    /** Verdadeiro quando esta conversa gerou mais de um tipo de evento cobrado (ex.: recebida + enviada + solucionada). */
    eventosDistintosNaConversa: l.conversa_ref ? (por.get(l.conversa_ref)?.size ?? 0) > 1 : false,
  }));
  const wx = w.rows[0];
  return {
    saldoCentavos: Number(wx.saldo_centavos),
    limiteAvisoCentavos: wx.limite_aviso_centavos == null ? null : Number(wx.limite_aviso_centavos),
    pausadoPorSaldo: wx.pausado, isento: wx.isento, isentoMotivo: wx.isento_motivo,
    tarifas: tar.rows.map((t) => ({ ...t, valor_centavos: Number(t.valor_centavos) })),
    extrato, recargas: rec.rows.map((r) => ({ ...r, valor_centavos: Number(r.valor_centavos) })), avisos: av.rows,
    custosProvedor: cus.rows,
    observacaoCustoProvedor: "Custo do provedor de IA é cobrado à conta que contratou o provedor e não entra neste saldo. Vazio = provedor não informou valor.",
    mensagensAguardandoSaldo: pend.rows[0].n,
  };
}

/** Nova tarifa = nova linha (histórico preservado). */
export async function definirTarifa(p: { empresaId: number | null; tipo: TipoEvento; valorCentavos: number; ativo: boolean; unidade?: string; criterio?: string; por: string }) {
  if (!Number.isSafeInteger(p.valorCentavos) || p.valorCentavos < 0) throw new RangeError("valor inválido");
  if (!TIPOS_EVENTO.includes(p.tipo)) throw new RangeError("tipo inválido");
  if (p.tipo === "tempo" && p.ativo && (!p.unidade || !p.criterio)) throw new RangeError("cobrança por tempo exige unidade e critério");
  await garantirTabelasCredito();
  await pool.query(
    `INSERT INTO msg_tarifas (empresa_id, tipo_evento, valor_centavos, ativo, unidade, criterio, definido_por) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [p.empresaId, p.tipo, p.valorCentavos, p.ativo, p.unidade ?? null, p.criterio ?? null, p.por]);
}

export async function definirIsencao(empresaId: number, isento: boolean, motivo: string, por: string) {
  if (!motivo.trim()) throw new RangeError("motivo obrigatório");
  await garantirTabelasCredito();
  await pool.query(`INSERT INTO msg_carteira (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING`, [empresaId]);
  await pool.query(`UPDATE msg_carteira SET isento = $2, isento_motivo = $3, isento_por = $4, isento_em = NOW() WHERE empresa_id = $1`, [empresaId, isento, motivo.trim(), por]);
}
