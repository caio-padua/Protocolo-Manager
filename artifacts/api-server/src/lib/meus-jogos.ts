import { createHash, randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { detectarTipoComprovante, sha256Hex, BOLOES_COMPROVANTE_MAX_BYTES } from "./boloes";
import { brtISODate } from "./brt";
import { getJsonSetting, setJsonSetting } from "./secure-settings";
import { asaasCreateCharge, asaasGetCharge, asaasGetPixQrCode } from "./asaas";
import { proximoConcurso, ensureMeusJogosResultadosTables, lerConferencia } from "./meus-jogos-resultados";
import { ensureMeusJogosCalendarioTables, lerEstadoCalendario, verificarVendaCalendario } from "./meus-jogos-calendario-store";
import type { OpcaoConcurso } from "./meus-jogos-calendario";
import {
  MODALIDADES, REGRAS, situacaoDaFonte, validarAposta, type Modalidade, type SituacaoFonte,
} from "./meus-jogos-regras";
import { roboAtual, type EstadoRobo, type RoboLoterias } from "./meus-jogos-robo";

/**
 * MEUS JOGOS (jogos individuais). Separado de boloes (Conexao Milionaria): tabelas, rotas e logs proprios.
 * Regras que este arquivo preserva (ver specs/meus-jogos-area-cliente.md):
 * - Cliente e clinica vem sempre do cadastro do cliente autenticado; nada vem do corpo da requisicao.
 * - "Pago" so com consulta direta ao Asaas (status, valor e referencia conferidos). "Efetivado" so com comprovante anexado.
 * - Sem robo disponivel nao se cria pedido. Resultado incerto nunca devolve nem repete sozinho.
 */

const rows = (r: unknown): any[] => (r as { rows: any[] }).rows;

// ---------------------------------------------------------------- tabelas
export async function ensureMeusJogosTables(): Promise<void> {
  await ensureMeusJogosResultadosTables();
  await ensureMeusJogosCalendarioTables();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meus_jogos_favoritos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      modalidade TEXT NOT NULL CHECK (modalidade IN ('megasena','lotofacil','quina','lotomania')),
      dezenas INTEGER[] NOT NULL,
      apelido TEXT CHECK (apelido IS NULL OR length(apelido) <= 40),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT meus_jogos_favoritos_unico UNIQUE (client_id, modalidade, dezenas)
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meus_jogos_pedidos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      modalidade TEXT NOT NULL CHECK (modalidade IN ('megasena','lotofacil','quina','lotomania')),
      concurso INTEGER NOT NULL CHECK (concurso > 0),
      data_sorteio DATE NOT NULL,
      qtd_jogos INTEGER NOT NULL CHECK (qtd_jogos BETWEEN 1 AND 20),
      total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
      status TEXT NOT NULL CHECK (status IN ('aguardando_pagamento','pago_na_fila','processando','efetivado','falha_em_conferencia','devolucao_pendente','devolvido','expirado','cancelado')),
      idempotency_key TEXT NOT NULL,
      hash_jogos TEXT NOT NULL,
      asaas_charge_id TEXT,
      asaas_invoice_url TEXT,
      fechamento_oficial_em TIMESTAMPTZ NOT NULL,
      limite_interno_em TIMESTAMPTZ NOT NULL,
      pago_em TIMESTAMPTZ,
      meta_efetivacao_em TIMESTAMPTZ,
      robo_ref TEXT,
      despachado_em TIMESTAMPTZ,
      suspenso_motivo TEXT,
      suspenso_em TIMESTAMPTZ,
      despacho_claim TEXT,
      despacho_claimed_at TIMESTAMPTZ,
      motivo TEXT CHECK (motivo IS NULL OR length(motivo) <= 300),
      devolucao_ref TEXT,
      devolvido_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT meus_jogos_pedidos_chave UNIQUE (client_id, idempotency_key)
    )`);
  await db.execute(sql`ALTER TABLE meus_jogos_pedidos ADD COLUMN IF NOT EXISTS despachado_em TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE meus_jogos_pedidos ADD COLUMN IF NOT EXISTS suspenso_motivo TEXT`);
  await db.execute(sql`ALTER TABLE meus_jogos_pedidos ADD COLUMN IF NOT EXISTS suspenso_em TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE meus_jogos_pedidos ADD COLUMN IF NOT EXISTS despacho_claim TEXT`);
  await db.execute(sql`ALTER TABLE meus_jogos_pedidos ADD COLUMN IF NOT EXISTS despacho_claimed_at TIMESTAMPTZ`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_meus_jogos_pedido_ativo
      ON meus_jogos_pedidos (client_id, modalidade, concurso, hash_jogos)
      WHERE status IN ('aguardando_pagamento','pago_na_fila','processando','efetivado','falha_em_conferencia')`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_meus_jogos_pedido_cobranca ON meus_jogos_pedidos (empresa_id, asaas_charge_id) WHERE asaas_charge_id IS NOT NULL`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_meus_jogos_pedidos_fila ON meus_jogos_pedidos (status, fechamento_oficial_em)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meus_jogos_pedido_jogos (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES meus_jogos_pedidos(id),
      ordem INTEGER NOT NULL CHECK (ordem >= 1),
      dezenas INTEGER[] NOT NULL,
      preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0),
      CONSTRAINT meus_jogos_pedido_jogos_ordem UNIQUE (pedido_id, ordem)
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meus_jogos_comprovantes (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      pedido_id INTEGER NOT NULL REFERENCES meus_jogos_pedidos(id),
      mime TEXT NOT NULL CHECK (mime IN ('application/pdf','image/png','image/jpeg')),
      bytes INTEGER NOT NULL CHECK (bytes > 0),
      sha256 TEXT NOT NULL,
      storage_key TEXT NOT NULL CHECK (length(storage_key) <= 200),
      origem TEXT NOT NULL CHECK (length(origem) <= 60),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revogado_em TIMESTAMPTZ
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_meus_jogos_comprovante_vivo ON meus_jogos_comprovantes (pedido_id) WHERE revogado_em IS NULL`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meus_jogos_eventos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER,
      client_id INTEGER,
      pedido_id INTEGER,
      evento TEXT NOT NULL,
      de TEXT,
      para TEXT,
      ator TEXT NOT NULL,
      detalhe TEXT CHECK (detalhe IS NULL OR length(detalhe) <= 300),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

async function evento(tx: Pick<typeof db, "execute">, e: { empresaId: number | null; clientId: number | null; pedidoId: number | null; evento: string; de?: string | null; para?: string | null; ator: string; detalhe?: string }) {
  await tx.execute(sql`
    INSERT INTO meus_jogos_eventos (empresa_id, client_id, pedido_id, evento, de, para, ator, detalhe)
    VALUES (${e.empresaId}, ${e.clientId}, ${e.pedidoId}, ${e.evento}, ${e.de ?? null}, ${e.para ?? null}, ${e.ator}, ${e.detalhe ? e.detalhe.slice(0, 300) : null})`);
}

async function clienteBasico(tx: Pick<typeof db, "execute">, clientId: number): Promise<{ id: number; empresaId: number; asaasCustomerId: string | null } | null> {
  const r = rows(await tx.execute(sql`SELECT id, empresa_id, asaas_customer_id FROM clients WHERE id = ${clientId} AND deleted_at IS NULL`))[0];
  return r && r.empresa_id != null ? { id: r.id, empresaId: r.empresa_id, asaasCustomerId: r.asaas_customer_id ?? null } : null;
}

async function ehMembroAtivo(tx: Pick<typeof db, "execute">, empresaId: number, clientId: number): Promise<boolean> {
  return rows(await tx.execute(sql`SELECT 1 FROM grupo_vip_membros WHERE empresa_id = ${empresaId} AND client_id = ${clientId} AND status = 'ativo'`)).length > 0;
}

// ---------------------------------------------------------------- configuracao por clinica
export interface ConfigMeusJogos {
  margemMinutos: number; metaMinutos: number; tetoPedidoCentavos: number;
  fechamentoOficial: Partial<Record<Modalidade, string>>; fonteFechamento: string | null;
}
export const CONFIG_PADRAO: ConfigMeusJogos = { margemMinutos: 240, metaMinutos: 30, tetoPedidoCentavos: 50_000, fechamentoOficial: {}, fonteFechamento: null };
const kConfig = (empresaId: number) => `meus_jogos.config.${empresaId}`;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function lerConfig(empresaId: number): Promise<ConfigMeusJogos> {
  const c = await getJsonSetting<Partial<ConfigMeusJogos>>(kConfig(empresaId));
  return { ...CONFIG_PADRAO, ...(c ?? {}), fechamentoOficial: { ...(c?.fechamentoOficial ?? {}) } };
}

export type ResultadoConfig = { ok: true; config: ConfigMeusJogos } | { ok: false; erro: string };
export async function gravarConfig(empresaId: number, entrada: unknown, ator: string): Promise<ResultadoConfig> {
  const e = entrada as Partial<ConfigMeusJogos> | null;
  if (!e || typeof e !== "object") return { ok: false, erro: "Configuração inválida." };
  const atual = await lerConfig(empresaId);
  const prox: ConfigMeusJogos = { ...atual };
  if (e.margemMinutos !== undefined) {
    if (!Number.isInteger(e.margemMinutos) || e.margemMinutos < 0 || e.margemMinutos > 1440) return { ok: false, erro: "A margem deve ficar entre 0 e 1440 minutos." };
    prox.margemMinutos = e.margemMinutos;
  }
  if (e.metaMinutos !== undefined) {
    if (!Number.isInteger(e.metaMinutos) || e.metaMinutos < 5 || e.metaMinutos > 240) return { ok: false, erro: "A meta deve ficar entre 5 e 240 minutos." };
    prox.metaMinutos = e.metaMinutos;
  }
  if (e.tetoPedidoCentavos !== undefined) {
    if (!Number.isInteger(e.tetoPedidoCentavos) || e.tetoPedidoCentavos < 100 || e.tetoPedidoCentavos > 1_000_000) return { ok: false, erro: "O teto por pedido deve ficar entre R$ 1,00 e R$ 10.000,00." };
    prox.tetoPedidoCentavos = e.tetoPedidoCentavos;
  }
  if (e.fechamentoOficial !== undefined) {
    const f: Partial<Record<Modalidade, string>> = {};
    for (const [k, v] of Object.entries(e.fechamentoOficial ?? {})) {
      if (!(MODALIDADES as readonly string[]).includes(k) || typeof v !== "string" || !HHMM.test(v)) return { ok: false, erro: "Horário de fechamento inválido (use HH:MM)." };
      f[k as Modalidade] = v;
    }
    prox.fechamentoOficial = f;
  }
  if (e.fonteFechamento !== undefined) {
    if (e.fonteFechamento !== null && (typeof e.fonteFechamento !== "string" || e.fonteFechamento.trim().length < 5 || e.fonteFechamento.length > 200)) return { ok: false, erro: "Informe a fonte oficial do horário de fechamento (5 a 200 caracteres)." };
    prox.fonteFechamento = e.fonteFechamento === null ? null : e.fonteFechamento.trim();
  }
  if (Object.keys(prox.fechamentoOficial).length > 0 && !prox.fonteFechamento) return { ok: false, erro: "Horário de fechamento exige a fonte oficial informada." };
  await setJsonSetting(kConfig(empresaId), prox);
  await evento(db, { empresaId, clientId: null, pedidoId: null, evento: "config_alterada", ator });
  return { ok: true, config: prox };
}

// ---------------------------------------------------------------- disponibilidade (fonte unica da regra de bloqueio)
export type MotivoIndisponivel = "execucao_indisponivel" | "regras_desatualizadas" | "concurso_desconhecido" | "fechamento_nao_informado" | "fora_do_prazo" | "calendario_indisponivel" | "calendario_desatualizado" | "dados_divergentes" | "proximo_indisponivel" | "precos_indisponiveis" | "precos_divergentes" | "concurso_nao_selecionado" | "concurso_especial";
const MSG_INDISPONIVEL: Record<MotivoIndisponivel, string> = {
  execucao_indisponivel: "O registro automático dos jogos ainda não está conectado a um canal autorizado. Você pode montar e salvar seus jogos, mas ainda não é possível confirmar pedidos.",
  regras_desatualizadas: "Os preços e regras desta modalidade precisam ser conferidos com a CAIXA antes de aceitar pedidos.",
  concurso_desconhecido: "O próximo concurso oficial ainda não foi identificado.",
  fechamento_nao_informado: "O horário oficial de fechamento desta modalidade ainda não foi informado pela clínica.",
  fora_do_prazo: "O prazo para novos pedidos deste concurso já passou. Nenhum valor é cobrado.",
  calendario_indisponivel: "O calendário oficial da CAIXA ainda não foi confirmado. Nenhum pedido pode ser criado.",
  calendario_desatualizado: "O calendário oficial venceu e precisa ser atualizado antes de aceitar pedidos.",
  dados_divergentes: "A data ou o número do concurso diverge entre a API e o cronograma oficial. Nenhum pedido pode ser criado.",
  proximo_indisponivel: "A CAIXA não confirmou o próximo concurso nos últimos dez minutos. Nenhum pedido pode ser criado.",
  precos_indisponiveis: "Preço e regras não foram confirmados na fonte oficial nos últimos dez minutos. Nenhum pedido pode ser criado.",
  precos_divergentes: "O preço ou as regras da modalidade divergiram da fonte oficial. Nenhum pedido pode ser criado.",
  concurso_nao_selecionado: "O prazo deste concurso terminou. Escolha explicitamente um próximo concurso antes de continuar.",
  concurso_especial: "Este concurso especial ainda não tem preço e regras de venda confirmados. Nenhum pedido é aceito.",
};
export const mensagemIndisponivel = (m: MotivoIndisponivel) => MSG_INDISPONIVEL[m];

export interface Prazos { fechamentoOficialEm: string; limiteInternoEm: string }
export interface Disponibilidade {
  modalidade: Modalidade; aberto: boolean; motivo: MotivoIndisponivel | null; mensagem: string | null;
  concurso: { numero: number; data: string } | null; prazos: Prazos | null; fonte: SituacaoFonte;
  opcoesConcurso: OpcaoConcurso[];
}

export function calcularPrazos(dataSorteioOuInstante: string, hhmmOuMargem: string | number, margemMinutos?: number): Prazos {
  const fechamento = typeof hhmmOuMargem === "number"
    ? new Date(dataSorteioOuInstante)
    : new Date(`${dataSorteioOuInstante}T${hhmmOuMargem}:00-03:00`);
  const margem = typeof hhmmOuMargem === "number" ? hhmmOuMargem : margemMinutos ?? 0;
  if (!Number.isFinite(fechamento.getTime()) || !Number.isInteger(margem) || margem < 0 || margem > 1440) throw new Error("Prazo oficial ou margem inválida.");
  return { fechamentoOficialEm: fechamento.toISOString(), limiteInternoEm: new Date(fechamento.getTime() - margem * 60_000).toISOString() };
}

export async function disponibilidade(m: Modalidade, empresaId: number, agora: Date, robo: RoboLoterias = roboAtual(), concursoSelecionado?: number): Promise<Disponibilidade> {
  const prox = await proximoConcurso(m);
  const cfg = await lerConfig(empresaId);
  const estadoRobo = await robo.estado().catch(() => ({ disponivel: false, motivo: "Estado indisponível.", ambiente: "nenhum" as const }));
  const verificacao = await verificarVendaCalendario(
    m, agora, cfg.margemMinutos,
    estadoRobo.disponivel && estadoRobo.ambiente !== "simulado",
    estadoRobo.disponivel && estadoRobo.ambiente !== "simulado",
  );
  const fonte = situacaoDaFonte(m, agora, await lerConferencia(m));
  const opcaoAtual = prox ? verificacao.opcoes.find((o) => o.concurso === prox.concurso && o.data === prox.data) : undefined;
  const selecionada = concursoSelecionado === undefined ? opcaoAtual : verificacao.opcoes.find((o) => o.concurso === concursoSelecionado);
  const concurso = selecionada ? { numero: selecionada.concurso, data: selecionada.data } : null;
  const prazos = selecionada?.canais.aposta_simples
    ? { fechamentoOficialEm: selecionada.canais.aposta_simples.oficialEm, limiteInternoEm: selecionada.canais.aposta_simples.internoEm }
    : null;
  let motivo: MotivoIndisponivel | null = null;
  if (!estadoRobo.disponivel) motivo = "execucao_indisponivel";
  else if (fonte.desatualizado) motivo = "regras_desatualizadas";
  else if (!verificacao.ok) motivo = verificacao.motivo ?? "calendario_indisponivel";
  else if (concursoSelecionado !== undefined && !selecionada) motivo = "concurso_desconhecido";
  else if (selecionada?.especial) motivo = "concurso_especial";
  else if (selecionada && !selecionada.aberto && selecionada.motivo === "fora_do_prazo" && concursoSelecionado === undefined) motivo = "concurso_nao_selecionado";
  else if (prox && !opcaoAtual && concursoSelecionado === undefined) motivo = "concurso_desconhecido";
  else if (!selecionada && !prox) motivo = "concurso_desconhecido";
  else if (!prazos) motivo = "fechamento_nao_informado";
  else if (!selecionada?.aberto) motivo = selecionada?.motivo === "fora_do_prazo" ? "fora_do_prazo" : "fechamento_nao_informado";
  return {
    modalidade: m, aberto: motivo === null, motivo,
    mensagem: motivo ? (verificacao.detalhe && ["calendario_indisponivel", "calendario_desatualizado", "dados_divergentes", "proximo_indisponivel", "precos_indisponiveis", "precos_divergentes"].includes(motivo) ? `${MSG_INDISPONIVEL[motivo]} ${verificacao.detalhe}` : MSG_INDISPONIVEL[motivo]) : null,
    concurso, prazos, fonte, opcoesConcurso: verificacao.opcoes,
  };
}

// ---------------------------------------------------------------- catalogo do portal
export async function catalogoDoPortal(clientId: number, agora: Date = new Date(), robo: RoboLoterias = roboAtual()) {
  const cl = await clienteBasico(db, clientId);
  if (!cl) return null;
  const membro = await ehMembroAtivo(db, cl.empresaId, cl.id);
  const cfg = await lerConfig(cl.empresaId);
  const execucao = await robo.estado().catch(() => ({ disponivel: false, motivo: "Estado da execução indisponível.", ambiente: "nenhum" } as EstadoRobo));
  const modalidades = [];
  for (const m of MODALIDADES) {
    const r = REGRAS[m];
    modalidades.push({
      chave: m, nome: r.nome, dezenaMin: r.dezenaMin, dezenaMax: r.dezenaMax, dezenasMin: r.dezenasMin, dezenasMax: r.dezenasMax,
      precos: Object.entries(r.precosCentavos).map(([q, p]) => ({ quantidade: Number(q), precoCentavos: p })),
      sorteios: r.sorteios, fonteUrl: r.fonteUrl, disponibilidade: await disponibilidade(m, cl.empresaId, agora, robo),
    });
  }
  return {
    membro, execucao: { disponivel: execucao.disponivel, motivo: execucao.motivo },
    tetoPedidoCentavos: cfg.tetoPedidoCentavos, margemMinutos: cfg.margemMinutos, metaMinutos: cfg.metaMinutos,
    calendario: await lerEstadoCalendario(agora), modalidades,
  };
}

// ---------------------------------------------------------------- favoritos
export interface Favorito { id: number; modalidade: Modalidade; dezenas: number[]; apelido: string | null; criadoEm: string }
const LIMITE_FAVORITOS = 30;

export async function listarFavoritos(clientId: number): Promise<Favorito[]> {
  return rows(await db.execute(sql`
    SELECT f.id, f.modalidade, f.dezenas, f.apelido, f.criado_em FROM meus_jogos_favoritos f
      JOIN clients c ON c.id = f.client_id AND c.empresa_id = f.empresa_id
     WHERE f.client_id = ${clientId} AND c.deleted_at IS NULL ORDER BY f.criado_em DESC, f.id DESC LIMIT 200`))
    .map((x) => ({ id: x.id, modalidade: x.modalidade, dezenas: x.dezenas, apelido: x.apelido ?? null, criadoEm: new Date(x.criado_em).toISOString() }));
}

export type ResultadoFavorito = { ok: true; id: number; jaExistia: boolean } | { ok: false; motivo: "sem_cadastro" | "nao_membro" | "aposta_invalida" | "limite" | "apelido_invalido" };
export async function salvarFavorito(p: { clientId: number; modalidade: Modalidade; dezenas: unknown; apelido?: string | null }): Promise<ResultadoFavorito> {
  const cl = await clienteBasico(db, p.clientId);
  if (!cl) return { ok: false, motivo: "sem_cadastro" };
  if (!(await ehMembroAtivo(db, cl.empresaId, cl.id))) return { ok: false, motivo: "nao_membro" };
  const v = validarAposta(p.modalidade, p.dezenas);
  if (!v.ok) return { ok: false, motivo: "aposta_invalida" };
  const apelido = p.apelido == null || p.apelido === "" ? null : String(p.apelido).trim();
  if (apelido !== null && (apelido.length === 0 || apelido.length > 40)) return { ok: false, motivo: "apelido_invalido" };
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`mjfav:${cl.id}`}))`);
    const arr = `{${v.dezenas.join(",")}}`;
    const ja = rows(await tx.execute(sql`SELECT id FROM meus_jogos_favoritos WHERE client_id = ${cl.id} AND modalidade = ${p.modalidade} AND dezenas = ${arr}::int[]`))[0];
    if (ja) return { ok: true, id: ja.id as number, jaExistia: true } as const;
    const n = Number(rows(await tx.execute(sql`SELECT COUNT(*) AS n FROM meus_jogos_favoritos WHERE client_id = ${cl.id} AND modalidade = ${p.modalidade}`))[0].n);
    if (n >= LIMITE_FAVORITOS) return { ok: false, motivo: "limite" } as const;
    const ins = rows(await tx.execute(sql`
      INSERT INTO meus_jogos_favoritos (empresa_id, client_id, modalidade, dezenas, apelido) VALUES (${cl.empresaId}, ${cl.id}, ${p.modalidade}, ${arr}::int[], ${apelido}) RETURNING id`))[0];
    await evento(tx, { empresaId: cl.empresaId, clientId: cl.id, pedidoId: null, evento: "favorito_salvo", ator: `cliente:${cl.id}`, detalhe: p.modalidade });
    return { ok: true, id: ins.id as number, jaExistia: false } as const;
  });
}

export async function removerFavorito(clientId: number, id: number): Promise<boolean> {
  const r = rows(await db.execute(sql`DELETE FROM meus_jogos_favoritos WHERE id = ${id} AND client_id = ${clientId} RETURNING id, empresa_id`))[0];
  if (r) await evento(db, { empresaId: r.empresa_id, clientId, pedidoId: null, evento: "favorito_removido", ator: `cliente:${clientId}` });
  return Boolean(r);
}

// ---------------------------------------------------------------- pedido: estados
export type StatusPedido = "aguardando_pagamento" | "pago_na_fila" | "processando" | "efetivado" | "falha_em_conferencia" | "devolucao_pendente" | "devolvido" | "expirado" | "cancelado";
const TRANSICOES: Record<StatusPedido, readonly StatusPedido[]> = {
  aguardando_pagamento: ["pago_na_fila", "devolucao_pendente", "expirado", "cancelado"],
  pago_na_fila: ["processando", "devolucao_pendente"],
  processando: ["efetivado", "falha_em_conferencia", "devolucao_pendente"],
  falha_em_conferencia: ["efetivado", "devolucao_pendente"],
  devolucao_pendente: ["devolvido"],
  efetivado: [], devolvido: [], expirado: [], cancelado: [],
};
export const transicaoPermitida = (de: StatusPedido, para: StatusPedido) => TRANSICOES[de].includes(para);

/** Unica porta de mudanca de estado: transicao valida + estado de origem conferido no UPDATE (nunca "ultimo a escrever vence"). */
async function mover(tx: Pick<typeof db, "execute">, p: { id: number; de: StatusPedido; para: StatusPedido; ator: string; detalhe?: string; motivo?: string | null; extra?: ReturnType<typeof sql> }): Promise<any | null> {
  if (!transicaoPermitida(p.de, p.para)) throw new Error(`transicao proibida ${p.de} -> ${p.para}`);
  const r = rows(await tx.execute(sql`
    UPDATE meus_jogos_pedidos SET status = ${p.para}, atualizado_em = NOW(), motivo = COALESCE(${p.motivo ?? null}::text, motivo) ${p.extra ? sql`, ${p.extra}` : sql``}
     WHERE id = ${p.id} AND status = ${p.de} RETURNING *`))[0];
  if (!r) return null;
  await evento(tx, { empresaId: r.empresa_id, clientId: r.client_id, pedidoId: r.id, evento: "estado", de: p.de, para: p.para, ator: p.ator, detalhe: p.detalhe ?? p.motivo ?? undefined });
  return r;
}

const ROTULO: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento", pago_na_fila: "Pago, na fila de registro", processando: "Registrando os jogos",
  efetivado: "Registrado, com comprovante", falha_em_conferencia: "Em conferência (resultado incerto)", devolucao_pendente: "Devolução pendente",
  devolvido: "Valor devolvido", expirado: "Expirado, nada foi cobrado", cancelado: "Cancelado",
};
const TEXTO_MOTIVO: Record<string, string> = {
  pagamento_apos_limite: "O pagamento foi confirmado depois do prazo interno. Nenhuma aposta foi feita e o valor será devolvido.",
  nao_processado_ate_fechamento: "O pedido não foi registrado até o fechamento oficial. Nenhuma aposta foi feita e o valor será devolvido.",
  robo_recusou_sem_aposta: "O canal de registro recusou o pedido sem fazer aposta. O valor será devolvido.",
  robo_resultado_incerto: "Não foi possível confirmar se a aposta foi registrada. A equipe está conferindo; não pague de novo.",
  atestado_sem_aposta: "A equipe confirmou que nenhuma aposta foi feita. O valor será devolvido.",
  prazo_sem_pagamento: "O prazo terminou sem pagamento confirmado. Nada foi cobrado.",
};

// ---------------------------------------------------------------- pedido: criacao
export interface JogoPedido { ordem: number; dezenas: number[]; precoCentavos: number }
const hashJogos = (jogos: number[][]) => createHash("sha256").update(JSON.stringify(jogos.map((j) => j.join(",")).sort())).digest("hex");

export type MotivoPedido = MotivoIndisponivel | "sem_cadastro" | "nao_membro" | "jogos_invalidos" | "chave_invalida" | "chave_reutilizada" | "pedido_duplicado" | "acima_do_teto" | "quantidade_jogos" | "jogo_repetido";
export type ResultadoPedido = { ok: true; id: number; repetido: boolean } | { ok: false; motivo: MotivoPedido; mensagem?: string; pedidoId?: number; opcoesConcurso?: OpcaoConcurso[] };

export async function criarPedido(p: { clientId: number; modalidade: Modalidade; jogos: unknown; idempotencyKey: unknown; concurso?: number; agora?: Date; robo?: RoboLoterias }): Promise<ResultadoPedido> {
  const agora = p.agora ?? new Date();
  if (typeof p.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(p.idempotencyKey)) return { ok: false, motivo: "chave_invalida" };
  const cl = await clienteBasico(db, p.clientId);
  if (!cl) return { ok: false, motivo: "sem_cadastro" };
  if (!(await ehMembroAtivo(db, cl.empresaId, cl.id))) return { ok: false, motivo: "nao_membro" };
  if (!Array.isArray(p.jogos) || p.jogos.length < 1 || p.jogos.length > 20) return { ok: false, motivo: "quantidade_jogos" };
  const jogos: number[][] = []; const precos: number[] = [];
  for (const j of p.jogos) {
    const v = validarAposta(p.modalidade, j);
    if (!v.ok) return { ok: false, motivo: "jogos_invalidos", mensagem: v.motivo };
    jogos.push(v.dezenas); precos.push(v.precoCentavos);
  }
  if (new Set(jogos.map((j) => j.join(","))).size !== jogos.length) return { ok: false, motivo: "jogo_repetido" };
  const disp = await disponibilidade(p.modalidade, cl.empresaId, agora, p.robo, p.concurso);
  if (!disp.aberto || !disp.concurso || !disp.prazos) return {
    ok: false, motivo: disp.motivo ?? "concurso_desconhecido", mensagem: disp.mensagem ?? undefined,
    ...(disp.opcoesConcurso.length ? { opcoesConcurso: disp.opcoesConcurso } : {}),
  };
  const total = precos.reduce((a, b) => a + b, 0);
  const cfg = await lerConfig(cl.empresaId);
  if (total > cfg.tetoPedidoCentavos) return { ok: false, motivo: "acima_do_teto" };
  const hash = hashJogos(jogos);

  try {
    return await db.transaction(async (tx): Promise<ResultadoPedido> => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`mjped:${cl.id}`}))`);
      const porChave = rows(await tx.execute(sql`SELECT id, hash_jogos, modalidade, concurso FROM meus_jogos_pedidos WHERE client_id = ${cl.id} AND idempotency_key = ${p.idempotencyKey as string}`))[0];
      if (porChave) {
        return porChave.hash_jogos === hash && porChave.modalidade === p.modalidade
          ? { ok: true, id: porChave.id, repetido: true } : { ok: false, motivo: "chave_reutilizada" };
      }
      const dup = rows(await tx.execute(sql`
        SELECT id FROM meus_jogos_pedidos WHERE client_id = ${cl.id} AND modalidade = ${p.modalidade} AND concurso = ${disp.concurso!.numero} AND hash_jogos = ${hash}
           AND status IN ('aguardando_pagamento','pago_na_fila','processando','efetivado','falha_em_conferencia')`))[0];
      if (dup) return { ok: false, motivo: "pedido_duplicado", pedidoId: dup.id };
      const ins = rows(await tx.execute(sql`
        INSERT INTO meus_jogos_pedidos (empresa_id, client_id, modalidade, concurso, data_sorteio, qtd_jogos, total_centavos, status, idempotency_key, hash_jogos, fechamento_oficial_em, limite_interno_em)
        VALUES (${cl.empresaId}, ${cl.id}, ${p.modalidade}, ${disp.concurso!.numero}, ${disp.concurso!.data}, ${jogos.length}, ${total}, 'aguardando_pagamento', ${p.idempotencyKey as string}, ${hash},
                ${disp.prazos!.fechamentoOficialEm}, ${disp.prazos!.limiteInternoEm}) RETURNING id`))[0];
      for (let i = 0; i < jogos.length; i++) {
        await tx.execute(sql`INSERT INTO meus_jogos_pedido_jogos (pedido_id, ordem, dezenas, preco_centavos) VALUES (${ins.id}, ${i + 1}, ${`{${jogos[i]!.join(",")}}`}::int[], ${precos[i]!})`);
      }
      await evento(tx, { empresaId: cl.empresaId, clientId: cl.id, pedidoId: ins.id, evento: "pedido_criado", para: "aguardando_pagamento", ator: `cliente:${cl.id}`, detalhe: `${p.modalidade} concurso ${disp.concurso!.numero}, ${jogos.length} jogo(s)` });
      return { ok: true, id: ins.id as number, repetido: false };
    });
  } catch (e) {
    if ((e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") return { ok: false, motivo: "pedido_duplicado" };
    throw e;
  }
}

// ---------------------------------------------------------------- pagamento (Asaas)
export interface DepsAsaas {
  criarCobranca(i: { customerId: string; valueReais: number; dueDate: string; description: string; externalReference: string }): Promise<{ id: string; invoiceUrl: string | null }>;
  consultarCobranca(id: string): Promise<{ status: string; valueReais: number; externalReference: string | null; deleted: boolean }>;
  obterPix?(id: string): Promise<{ payload: string; encodedImage: string } | null>;
}

export const asaasReal: DepsAsaas = {
  async criarCobranca(i) {
    const c: any = await asaasCreateCharge({ customerId: i.customerId, billingType: "PIX", value: i.valueReais, dueDate: i.dueDate, description: i.description, externalReference: i.externalReference } as any);
    return { id: String(c.id), invoiceUrl: c.invoiceUrl ?? null };
  },
  async consultarCobranca(id) {
    const c: any = await asaasGetCharge(id);
    return { status: String(c.status), valueReais: Number(c.value), externalReference: c.externalReference ?? null, deleted: c.deleted === true };
  },
  async obterPix(id) {
    const q = await asaasGetPixQrCode(id);
    return q.payload ? { payload: q.payload, encodedImage: q.encodedImage } : null;
  },
};

export type ResultadoPagar =
  | { ok: true; invoiceUrl: string | null; pix: { payload: string; encodedImage: string } | null }
  | { ok: false; motivo: "inexistente" | "estado_invalido" | "cliente_sem_cadastro_pagamento" | "execucao_indisponivel" | "fora_do_prazo" | "asaas_indisponivel" | "calendario_indisponivel" | "calendario_desatualizado" | "dados_divergentes" | "proximo_indisponivel" | "precos_indisponiveis" | "precos_divergentes" | "concurso_desconhecido" | "concurso_especial" };

/** Cria a cobranca PIX do pedido (uma so; repetir devolve a mesma). Exige robo disponivel e cadastro do cliente no Asaas. */
export async function iniciarPagamento(p: { clientId: number; pedidoId: number; deps?: DepsAsaas; agora?: Date; robo?: RoboLoterias }): Promise<ResultadoPagar> {
  const deps = p.deps ?? asaasReal; const agora = p.agora ?? new Date();
  const cl = await clienteBasico(db, p.clientId);
  if (!cl) return { ok: false, motivo: "inexistente" };
  const robo = p.robo ?? roboAtual();
  const estadoRobo = await robo.estado().catch(() => ({ disponivel: false, motivo: "Estado indisponível.", ambiente: "nenhum" as const }));
  if (!estadoRobo.disponivel) return { ok: false, motivo: "execucao_indisponivel" };
  const prePedido = rows(await db.execute(sql`
    SELECT modalidade, concurso, data_sorteio, status FROM meus_jogos_pedidos
     WHERE id = ${p.pedidoId} AND client_id = ${cl.id} AND empresa_id = ${cl.empresaId}`))[0];
  if (!prePedido) return { ok: false, motivo: "inexistente" };
  const verificacao = await verificarVendaCalendario(
    prePedido.modalidade as Modalidade, agora, (await lerConfig(cl.empresaId)).margemMinutos,
    estadoRobo.ambiente !== "simulado", estadoRobo.ambiente !== "simulado",
  );
  if (!verificacao.ok) return { ok: false, motivo: verificacao.motivo ?? "calendario_indisponivel" };
  const concursoAtual = verificacao.opcoes.find((o) => o.concurso === Number(prePedido.concurso) && o.data === String(prePedido.data_sorteio).slice(0, 10));
  if (!concursoAtual) return { ok: false, motivo: "concurso_desconhecido" };
  if (concursoAtual.especial) return { ok: false, motivo: "concurso_especial" };
  if (!concursoAtual.aberto) return { ok: false, motivo: "fora_do_prazo" };
  try {
    return await db.transaction(async (tx): Promise<ResultadoPagar> => {
      const ped = rows(await tx.execute(sql`SELECT * FROM meus_jogos_pedidos WHERE id = ${p.pedidoId} AND client_id = ${cl.id} AND empresa_id = ${cl.empresaId} FOR UPDATE`))[0];
      if (!ped) return { ok: false, motivo: "inexistente" };
      if (ped.status !== "aguardando_pagamento") return { ok: false, motivo: "estado_invalido" };
      if (agora.getTime() >= new Date(ped.limite_interno_em).getTime()) return { ok: false, motivo: "fora_do_prazo" };
      let invoiceUrl: string | null = ped.asaas_invoice_url ?? null; let chargeId: string | null = ped.asaas_charge_id ?? null;
      if (!chargeId) {
        if (!cl.asaasCustomerId) return { ok: false, motivo: "cliente_sem_cadastro_pagamento" };
        const c = await deps.criarCobranca({
          customerId: cl.asaasCustomerId, valueReais: ped.total_centavos / 100, dueDate: brtISODate(agora),
          description: `Meus Jogos - pedido ${ped.id}`, externalReference: `meusjogos:${ped.id}`,
        });
        chargeId = c.id; invoiceUrl = c.invoiceUrl;
        await tx.execute(sql`UPDATE meus_jogos_pedidos SET asaas_charge_id = ${chargeId}, asaas_invoice_url = ${invoiceUrl}, atualizado_em = NOW() WHERE id = ${ped.id}`);
        await evento(tx, { empresaId: cl.empresaId, clientId: cl.id, pedidoId: ped.id, evento: "cobranca_criada", ator: `cliente:${cl.id}`, detalhe: `cobranca ${chargeId}` });
      }
      const pix = deps.obterPix ? await deps.obterPix(chargeId).catch(() => null) : null;
      return { ok: true, invoiceUrl, pix };
    });
  } catch { return { ok: false, motivo: "asaas_indisponivel" }; }
}

const PAGO = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);

/**
 * Atualiza o pedido a partir do Asaas (consulta direta, somente leitura). Pagamento so conta se status, valor e
 * referencia externa conferem. Consulta que falha NUNCA expira nem devolve nada.
 */
export async function sincronizarPagamento(pedidoId: number, deps: DepsAsaas = asaasReal, agora: Date = new Date()): Promise<void> {
  const ped = rows(await db.execute(sql`SELECT * FROM meus_jogos_pedidos WHERE id = ${pedidoId}`))[0];
  if (!ped || ped.status !== "aguardando_pagamento") return;
  const vencido = agora.getTime() >= new Date(ped.limite_interno_em).getTime();
  if (!ped.asaas_charge_id) {
    if (vencido) await db.transaction(async (tx) => { await mover(tx, { id: ped.id, de: "aguardando_pagamento", para: "expirado", ator: "sistema", motivo: "prazo_sem_pagamento" }); });
    return;
  }
  let c: Awaited<ReturnType<DepsAsaas["consultarCobranca"]>>;
  try { c = await deps.consultarCobranca(ped.asaas_charge_id); } catch { return; }
  if (!c) return;
  if (PAGO.has(c.status) && !c.deleted) {
    if (c.externalReference !== `meusjogos:${ped.id}` || Math.round(c.valueReais * 100) !== ped.total_centavos) {
      await evento(db, { empresaId: ped.empresa_id, clientId: ped.client_id, pedidoId: ped.id, evento: "pagamento_divergente", ator: "sistema", detalhe: "valor ou referencia nao conferem; nada foi aceito" });
      return;
    }
    const meta = new Date(agora.getTime() + (await lerConfig(ped.empresa_id)).metaMinutos * 60_000).toISOString();
    await db.transaction(async (tx) => {
      if (vencido) {
        await mover(tx, { id: ped.id, de: "aguardando_pagamento", para: "devolucao_pendente", ator: "sistema", motivo: "pagamento_apos_limite", extra: sql`pago_em = ${agora.toISOString()}` });
      } else {
        await mover(tx, { id: ped.id, de: "aguardando_pagamento", para: "pago_na_fila", ator: "sistema", detalhe: "pagamento confirmado no Asaas", extra: sql`pago_em = ${agora.toISOString()}, meta_efetivacao_em = ${meta}` });
      }
    });
    return;
  }
  if (vencido) {
    await db.transaction(async (tx) => { await mover(tx, { id: ped.id, de: "aguardando_pagamento", para: "expirado", ator: "sistema", motivo: "prazo_sem_pagamento" }); });
  }
}

export async function cancelarPedido(clientId: number, pedidoId: number): Promise<"ok" | "inexistente" | "estado_invalido"> {
  return db.transaction(async (tx) => {
    const ped = rows(await tx.execute(sql`SELECT id, status, asaas_charge_id FROM meus_jogos_pedidos WHERE id = ${pedidoId} AND client_id = ${clientId} FOR UPDATE`))[0];
    if (!ped) return "inexistente";
    // Com cobranca criada o pagamento pode estar a caminho: cancelar so antes da cobranca existir.
    if (ped.status !== "aguardando_pagamento" || ped.asaas_charge_id) return "estado_invalido";
    return (await mover(tx, { id: ped.id, de: "aguardando_pagamento", para: "cancelado", ator: `cliente:${clientId}` })) ? "ok" : "estado_invalido";
  });
}

// ---------------------------------------------------------------- fila, robo, comprovante, reconciliacao
let _storage: ObjectStorageService | null = null;
const storage = () => (_storage ??= new ObjectStorageService());

export type ResultadoComprovante = { ok: true } | { ok: false; motivo: "inexistente" | "estado_invalido" | "arquivo_invalido" | "arquivo_grande" };

/** UNICA porta para "efetivado": comprovante valido (bytes conferidos) gravado e estado alterado na MESMA transacao. */
export async function anexarComprovante(p: { pedidoId: number; empresaId: number | null; bytes: Buffer; origem: string; ator: string }): Promise<ResultadoComprovante> {
  const tipo = detectarTipoComprovante(p.bytes);
  if (!tipo) return { ok: false, motivo: "arquivo_invalido" };
  if (p.bytes.length > BOLOES_COMPROVANTE_MAX_BYTES) return { ok: false, motivo: "arquivo_grande" };
  const previo = rows(await db.execute(sql`SELECT empresa_id, status FROM meus_jogos_pedidos WHERE id = ${p.pedidoId} ${p.empresaId !== null ? sql`AND empresa_id = ${p.empresaId}` : sql``}`))[0];
  if (!previo) return { ok: false, motivo: "inexistente" };
  if (previo.status !== "processando" && previo.status !== "falha_em_conferencia") return { ok: false, motivo: "estado_invalido" };
  // Os bytes ficam no armazenamento privado (App Storage); o banco guarda so a chave e a impressao digital.
  const hash = sha256Hex(p.bytes);
  const chaveObj = `meus-jogos/comprovantes/${previo.empresa_id}/${p.pedidoId}-${hash.slice(0, 16)}.${tipo.ext}`;
  await storage().savePrivateObject(chaveObj, p.bytes, tipo.mime);
  try {
    return await db.transaction(async (tx): Promise<ResultadoComprovante> => {
      const ped = rows(await tx.execute(sql`SELECT id, empresa_id, client_id, status FROM meus_jogos_pedidos WHERE id = ${p.pedidoId} AND empresa_id = ${previo.empresa_id} FOR UPDATE`))[0];
      if (!ped) return { ok: false, motivo: "inexistente" };
      if (ped.status !== "processando" && ped.status !== "falha_em_conferencia") return { ok: false, motivo: "estado_invalido" };
      await tx.execute(sql`
        INSERT INTO meus_jogos_comprovantes (empresa_id, pedido_id, mime, bytes, sha256, storage_key, origem)
        VALUES (${ped.empresa_id}, ${ped.id}, ${tipo.mime}, ${p.bytes.length}, ${hash}, ${chaveObj}, ${p.origem.slice(0, 60)})`);
      const ok = await mover(tx, { id: ped.id, de: ped.status, para: "efetivado", ator: p.ator, detalhe: "comprovante oficial anexado" });
      if (!ok) throw new Error("estado mudou durante a efetivacao");
      return { ok: true };
    });
  } catch (e) {
    await storage().deletePrivateObject(chaveObj).catch(() => undefined);
    throw e;
  }
}

export interface ResumoFila { robotIndisponivel: boolean; enviados: number; incertos: number; efetivados: number; devolucaoPendente: number; suspensos: number }

/** Processa a fila com o robo informado. Sem robo disponivel nao toca em nenhum pedido. Resultado incerto vai para conferencia (nunca repete). */
export async function processarFila(robo: RoboLoterias = roboAtual(), agora: Date = new Date(), limite = 10): Promise<ResumoFila> {
  const resumo: ResumoFila = { robotIndisponivel: false, enviados: 0, incertos: 0, efetivados: 0, devolucaoPendente: 0, suspensos: 0 };
  const est = await robo.estado().catch(() => ({ disponivel: false } as EstadoRobo));
  if (!est.disponivel) { resumo.robotIndisponivel = true; return resumo; }
  const bloqueadosNestaExecucao: number[] = [];
  for (let i = 0; i < limite; i++) {
    const claim = randomUUID();
    const excluirBloqueados = bloqueadosNestaExecucao.length
      ? sql`AND id NOT IN (${sql.join(bloqueadosNestaExecucao.map((id) => sql`${id}`), sql`, `)})`
      : sql``;
    const ped = await db.transaction(async (tx) => {
      const alvo = rows(await tx.execute(sql`
        SELECT * FROM meus_jogos_pedidos
         WHERE status = 'pago_na_fila'
           AND (despacho_claim IS NULL OR despacho_claimed_at < ${new Date(agora.getTime() - 5 * 60_000).toISOString()})
           ${excluirBloqueados}
         ORDER BY pago_em, id FOR UPDATE SKIP LOCKED LIMIT 1`))[0];
      if (!alvo) return null;
      return rows(await tx.execute(sql`
        UPDATE meus_jogos_pedidos SET despacho_claim = ${claim}, despacho_claimed_at = ${agora.toISOString()}
         WHERE id = ${alvo.id} AND status = 'pago_na_fila' RETURNING *`))[0] ?? null;
    });
    if (!ped) break;
    const verificacao = await verificarVendaCalendario(
      ped.modalidade as Modalidade, agora, (await lerConfig(Number(ped.empresa_id))).margemMinutos,
      est.ambiente !== "simulado", est.ambiente !== "simulado",
    );
    const escolhido = verificacao.ok
      ? verificacao.opcoes.find((o) => o.concurso === Number(ped.concurso) && o.data === String(ped.data_sorteio).slice(0, 10))
      : undefined;
    const suspensao = !verificacao.ok
      ? `${verificacao.motivo}: ${verificacao.detalhe ?? "fonte oficial não validada"}`
      : !escolhido
        ? "concurso não consta entre as opções futuras do calendário validado"
        : escolhido.especial || !escolhido.canais.aposta_simples
          ? "concurso especial ou fechamento oficial ausente"
          : null;
    if (suspensao) {
      await db.transaction(async (tx) => {
        const atual = rows(await tx.execute(sql`
          SELECT suspenso_motivo FROM meus_jogos_pedidos
           WHERE id = ${ped.id} AND status = 'pago_na_fila' AND despacho_claim = ${claim} FOR UPDATE`))[0];
        if (!atual) return;
        await tx.execute(sql`UPDATE meus_jogos_pedidos
          SET suspenso_motivo = ${suspensao.slice(0, 300)}, suspenso_em = ${agora.toISOString()},
              despacho_claim = NULL, despacho_claimed_at = NULL, atualizado_em = NOW()
          WHERE id = ${ped.id} AND despacho_claim = ${claim}`);
        if (atual.suspenso_motivo !== suspensao.slice(0, 300)) {
          await evento(tx, { empresaId: ped.empresa_id, clientId: ped.client_id, pedidoId: ped.id, evento: "despacho_suspenso", ator: "sistema", detalhe: suspensao });
        }
      });
      bloqueadosNestaExecucao.push(Number(ped.id));
      resumo.suspensos++;
      continue;
    }
    const fechamentoAtual = new Date(escolhido!.canais.aposta_simples!.oficialEm);
    if (!Number.isFinite(fechamentoAtual.getTime())) {
      bloqueadosNestaExecucao.push(Number(ped.id));
      resumo.suspensos++;
      continue;
    }
    if (agora.getTime() >= fechamentoAtual.getTime()) {
      const devolvido = await db.transaction(async (tx) => {
        const atual = rows(await tx.execute(sql`
          SELECT id, status FROM meus_jogos_pedidos
           WHERE id = ${ped.id} AND status = 'pago_na_fila' AND despacho_claim = ${claim} FOR UPDATE`))[0];
        if (!atual) return null;
        await tx.execute(sql`UPDATE meus_jogos_pedidos SET despacho_claim = NULL, despacho_claimed_at = NULL WHERE id = ${ped.id}`);
        return mover(tx, { id: ped.id, de: "pago_na_fila", para: "devolucao_pendente", ator: "sistema", motivo: "nao_processado_ate_fechamento", detalhe: "fonte oficial confirmou que o fechamento já passou" });
      });
      if (devolvido) resumo.devolucaoPendente++;
      continue;
    }
    const fechamentoAnterior = new Date(ped.fechamento_oficial_em).toISOString();
    const fechamentoNovo = fechamentoAtual.toISOString();
    const margem = (await lerConfig(Number(ped.empresa_id))).margemMinutos;
    const limiteNovo = new Date(fechamentoAtual.getTime() - margem * 60_000).toISOString();
    const jogos = rows(await db.execute(sql`SELECT dezenas FROM meus_jogos_pedido_jogos WHERE pedido_id = ${ped.id} ORDER BY ordem`)).map((r) => r.dezenas as number[]);
    const pronto = await db.transaction(async (tx) => {
      const atual = rows(await tx.execute(sql`
        SELECT id FROM meus_jogos_pedidos
         WHERE id = ${ped.id} AND status = 'pago_na_fila' AND despacho_claim = ${claim} FOR UPDATE`))[0];
      if (!atual) return null;
      if (fechamentoAnterior !== fechamentoNovo) {
        await tx.execute(sql`UPDATE meus_jogos_pedidos SET fechamento_oficial_em = ${fechamentoNovo}, limite_interno_em = ${limiteNovo} WHERE id = ${ped.id}`);
        await evento(tx, { empresaId: ped.empresa_id, clientId: ped.client_id, pedidoId: ped.id, evento: "fechamento_atualizado", ator: "sistema", detalhe: `novo fechamento oficial ${fechamentoNovo}` });
      }
      if (ped.suspenso_motivo) await evento(tx, { empresaId: ped.empresa_id, clientId: ped.client_id, pedidoId: ped.id, evento: "despacho_retomado", ator: "sistema", detalhe: "fontes oficiais novamente validadas" });
      return mover(tx, {
        id: ped.id, de: "pago_na_fila", para: "processando", ator: "gestor",
        detalhe: "envio manual autorizado após nova conferência oficial",
        extra: sql`fechamento_oficial_em = ${fechamentoNovo}, limite_interno_em = ${limiteNovo},
          despacho_claim = NULL, despacho_claimed_at = NULL, suspenso_motivo = NULL, suspenso_em = NULL`,
      });
    });
    if (!pronto) continue;
    try {
      const { ref } = await robo.registrarJogos({ pedidoId: ped.id, chave: `mj-${ped.id}`, modalidade: ped.modalidade, concurso: ped.concurso, jogos });
      await db.execute(sql`UPDATE meus_jogos_pedidos SET robo_ref = ${String(ref).slice(0, 120)}, despachado_em = NOW(), atualizado_em = NOW() WHERE id = ${ped.id}`);
      resumo.enviados++;
    } catch (e) {
      await db.transaction(async (tx) => { await mover(tx, { id: ped.id, de: "processando", para: "falha_em_conferencia", ator: "robo", motivo: "robo_resultado_incerto", detalhe: String((e as Error).message ?? e).slice(0, 120) }); });
      resumo.incertos++;
    }
  }
  const emCurso = rows(await db.execute(sql`SELECT id, robo_ref FROM meus_jogos_pedidos WHERE status = 'processando' AND robo_ref IS NOT NULL ORDER BY id LIMIT 50`));
  for (const ped of emCurso) {
    let r;
    try { r = await robo.consultarEstado(ped.robo_ref); } catch { continue; }
    if (r.estado === "registrado") {
      const a = await anexarComprovante({ pedidoId: ped.id, empresaId: null, bytes: r.comprovante.bytes, origem: r.comprovante.origem, ator: "robo" });
      if (a.ok) resumo.efetivados++;
      else await db.transaction(async (tx) => { await mover(tx, { id: ped.id, de: "processando", para: "falha_em_conferencia", ator: "robo", motivo: "robo_resultado_incerto", detalhe: `comprovante recusado: ${a.motivo}` }); });
    } else if (r.estado === "recusado_sem_aposta") {
      await db.transaction(async (tx) => { await mover(tx, { id: ped.id, de: "processando", para: "devolucao_pendente", ator: "robo", motivo: "robo_recusou_sem_aposta", detalhe: r.motivo }); });
      resumo.devolucaoPendente++;
    } else if (r.estado === "incerto") {
      await db.transaction(async (tx) => { await mover(tx, { id: ped.id, de: "processando", para: "falha_em_conferencia", ator: "robo", motivo: "robo_resultado_incerto", detalhe: r.motivo }); });
      resumo.incertos++;
    }
  }
  return resumo;
}

/**
 * Reconciliacao de prazos: pago e nunca enviado ao robo ate o fechamento oficial => nenhuma aposta existe => devolucao pendente.
 * (Pedido ja enviado ao robo nunca entra aqui: so conferencia humana ou comprovante resolvem.)
 */
export async function reconciliarPrazos(agora: Date = new Date(), deps: DepsAsaas = asaasReal): Promise<{ devolucaoPendente: number; aguardandoConferidos: number }> {
  let devolucaoPendente = 0;
  const pagos = rows(await db.execute(sql`SELECT id FROM meus_jogos_pedidos WHERE status = 'pago_na_fila' AND fechamento_oficial_em <= ${agora.toISOString()} ORDER BY id LIMIT 200`));
  for (const x of pagos) {
    const ok = await db.transaction(async (tx) => mover(tx, { id: x.id, de: "pago_na_fila", para: "devolucao_pendente", ator: "sistema", motivo: "nao_processado_ate_fechamento" }));
    if (ok) devolucaoPendente++;
  }
  const aguardando = rows(await db.execute(sql`SELECT id FROM meus_jogos_pedidos WHERE status = 'aguardando_pagamento' AND limite_interno_em <= ${agora.toISOString()} ORDER BY id LIMIT 200`));
  for (const x of aguardando) await sincronizarPagamento(x.id, deps, agora);
  return { devolucaoPendente, aguardandoConferidos: aguardando.length };
}

// ---------------------------------------------------------------- gestor: falha e devolucao (atos humanos, sempre registrados)
export type ResultadoGestor = { ok: true } | { ok: false; motivo: "inexistente" | "estado_invalido" | "texto_invalido" };

/** O gestor atesta, por escrito, que NAO houve aposta (so a partir de falha em conferencia). Abre a devolucao; nao devolve nada. */
export async function atestarSemAposta(p: { empresaId: number; pedidoId: number; nota: unknown; ator: string }): Promise<ResultadoGestor> {
  const nota = typeof p.nota === "string" ? p.nota.trim() : "";
  if (nota.length < 10 || nota.length > 250) return { ok: false, motivo: "texto_invalido" };
  return db.transaction(async (tx): Promise<ResultadoGestor> => {
    const ped = rows(await tx.execute(sql`SELECT id, status FROM meus_jogos_pedidos WHERE id = ${p.pedidoId} AND empresa_id = ${p.empresaId} FOR UPDATE`))[0];
    if (!ped) return { ok: false, motivo: "inexistente" };
    if (ped.status !== "falha_em_conferencia") return { ok: false, motivo: "estado_invalido" };
    await mover(tx, { id: ped.id, de: "falha_em_conferencia", para: "devolucao_pendente", ator: p.ator, motivo: "atestado_sem_aposta", detalhe: `atestado: ${nota}`.slice(0, 300) });
    return { ok: true };
  });
}

/** Registra que o valor foi devolvido (ato humano fora do sistema; referencia obrigatoria). Nao movimenta dinheiro. */
export async function registrarDevolucao(p: { empresaId: number; pedidoId: number; referencia: unknown; ator: string }): Promise<ResultadoGestor> {
  const ref = typeof p.referencia === "string" ? p.referencia.trim() : "";
  if (ref.length < 3 || ref.length > 80) return { ok: false, motivo: "texto_invalido" };
  return db.transaction(async (tx): Promise<ResultadoGestor> => {
    const ped = rows(await tx.execute(sql`SELECT id, status FROM meus_jogos_pedidos WHERE id = ${p.pedidoId} AND empresa_id = ${p.empresaId} FOR UPDATE`))[0];
    if (!ped) return { ok: false, motivo: "inexistente" };
    if (ped.status !== "devolucao_pendente") return { ok: false, motivo: "estado_invalido" };
    await mover(tx, { id: ped.id, de: "devolucao_pendente", para: "devolvido", ator: p.ator, detalhe: "devolucao registrada", extra: sql`devolucao_ref = ${ref}, devolvido_em = NOW()` });
    return { ok: true };
  });
}

// ---------------------------------------------------------------- leitura de pedidos
type PassoEstado = "feito" | "atual" | "pendente" | "falhou" | "em_conferencia";
export interface PassoLinha { chave: "solicitado" | "pago" | "despachado" | "registro" | "comprovante"; rotulo: string; estado: PassoEstado }

function linhaDoTempo(status: StatusPedido, pagoEm: string | null, despachadoEm: string | null, temComprovante: boolean): PassoLinha[] {
  const P = (chave: PassoLinha["chave"], rotulo: string, estado: PassoEstado): PassoLinha => ({ chave, rotulo, estado });
  const terminado = status === "efetivado" && temComprovante;
  const solicitado = P("solicitado", "Solicitado", "feito");
  const pago = P("pago", "Pago", pagoEm ? "feito" : status === "aguardando_pagamento" ? "atual" : ["cancelado", "expirado"].includes(status) ? "falhou" : "pendente");
  const despachado = P("despachado", "Despachado",
    despachadoEm ? "feito" : status === "pago_na_fila" ? "atual" :
      status === "falha_em_conferencia" ? "em_conferencia" :
        status === "devolucao_pendente" || status === "devolvido" ? "falhou" : "pendente");
  const registro = P("registro", "Registro",
    terminado ? "feito" : status === "processando" ? "atual" :
      status === "falha_em_conferencia" ? "em_conferencia" :
        status === "devolucao_pendente" || status === "devolvido" ? "falhou" : "pendente");
  const comprovante = P("comprovante", "Comprovante", temComprovante ? "feito" :
    status === "falha_em_conferencia" ? "em_conferencia" : "pendente");
  return [solicitado, pago, despachado, registro, comprovante];
}

export interface PedidoVisto {
  id: number; modalidade: Modalidade; nome: string; concurso: number; dataSorteio: string; totalCentavos: number;
  status: StatusPedido; rotulo: string; jogos: JogoPedido[]; linhaDoTempo: PassoLinha[];
  prazos: { fechamentoOficialEm: string; limiteInternoEm: string; metaEfetivacaoEm: string | null };
  pagoEm: string | null; criadoEm: string; invoiceUrl: string | null; comprovante: { id: number; mime: string; bytes: number; codigo: string; criadoEm: string } | null;
  falha: { texto: string } | null; atrasadoNaMeta: boolean; podePagar: boolean; podeCancelar: boolean;
}

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

async function montar(r: any, agora: Date): Promise<PedidoVisto> {
  const jogos = rows(await db.execute(sql`SELECT ordem, dezenas, preco_centavos FROM meus_jogos_pedido_jogos WHERE pedido_id = ${r.id} ORDER BY ordem`))
    .map((j) => ({ ordem: j.ordem, dezenas: j.dezenas, precoCentavos: j.preco_centavos }));
  const comp = rows(await db.execute(sql`SELECT id, mime, bytes, left(sha256, 12) AS codigo, criado_em FROM meus_jogos_comprovantes WHERE pedido_id = ${r.id} AND revogado_em IS NULL`))[0];
  const status = r.status as StatusPedido;
  const metaEm = iso(r.meta_efetivacao_em);
  const textoFalha = status === "falha_em_conferencia" || status === "devolucao_pendente" || status === "devolvido" || status === "expirado"
    ? (TEXTO_MOTIVO[String(r.motivo ?? "")] ?? ROTULO[status]) : null;
  return {
    id: r.id, modalidade: r.modalidade, nome: REGRAS[r.modalidade as Modalidade].nome, concurso: r.concurso, dataSorteio: new Date(r.data_sorteio).toISOString().slice(0, 10),
    totalCentavos: r.total_centavos, status, rotulo: ROTULO[status], jogos, linhaDoTempo: linhaDoTempo(status, iso(r.pago_em), iso(r.despachado_em), Boolean(comp)),
    prazos: { fechamentoOficialEm: iso(r.fechamento_oficial_em)!, limiteInternoEm: iso(r.limite_interno_em)!, metaEfetivacaoEm: metaEm },
    pagoEm: iso(r.pago_em), criadoEm: iso(r.criado_em)!, invoiceUrl: r.asaas_invoice_url ?? null,
    comprovante: comp ? { id: comp.id, mime: comp.mime, bytes: comp.bytes, codigo: comp.codigo, criadoEm: iso(comp.criado_em)! } : null,
    falha: textoFalha ? { texto: textoFalha } : null,
    atrasadoNaMeta: Boolean(metaEm) && (status === "pago_na_fila" || status === "processando") && agora.getTime() > new Date(metaEm!).getTime(),
    podePagar: status === "aguardando_pagamento" && agora.getTime() < new Date(r.limite_interno_em).getTime(),
    podeCancelar: status === "aguardando_pagamento" && !r.asaas_charge_id,
  };
}

export async function listarPedidos(clientId: number, agora: Date = new Date()): Promise<PedidoVisto[]> {
  const rs = rows(await db.execute(sql`
    SELECT p.* FROM meus_jogos_pedidos p JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id
     WHERE p.client_id = ${clientId} AND c.deleted_at IS NULL ORDER BY p.criado_em DESC, p.id DESC LIMIT 50`));
  return Promise.all(rs.map((r) => montar(r, agora)));
}

export async function obterPedido(clientId: number, id: number, agora: Date = new Date()): Promise<PedidoVisto | null> {
  const r = rows(await db.execute(sql`
    SELECT p.* FROM meus_jogos_pedidos p JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id
     WHERE p.id = ${id} AND p.client_id = ${clientId} AND c.deleted_at IS NULL`))[0];
  return r ? montar(r, agora) : null;
}

/** Visao do gestor: SOMENTE da clinica dele, e de um cliente escolhido na tela. */
export async function listarPedidosGestor(empresaId: number, clientId: number, agora: Date = new Date()) {
  const cl = rows(await db.execute(sql`SELECT id, name FROM clients WHERE id = ${clientId} AND empresa_id = ${empresaId} AND deleted_at IS NULL`))[0];
  if (!cl) return null;
  const rs = rows(await db.execute(sql`SELECT * FROM meus_jogos_pedidos WHERE empresa_id = ${empresaId} AND client_id = ${clientId} ORDER BY criado_em DESC, id DESC LIMIT 100`));
  const pedidos = await Promise.all(rs.map(async (r) => ({ ...(await montar(r, agora)), motivoInterno: (r.motivo ?? null) as string | null, devolucaoRef: (r.devolucao_ref ?? null) as string | null })));
  const fav = Number(rows(await db.execute(sql`SELECT COUNT(*) AS n FROM meus_jogos_favoritos WHERE empresa_id = ${empresaId} AND client_id = ${clientId}`))[0].n);
  const membro = await ehMembroAtivo(db, empresaId, clientId);
  return { cliente: { id: cl.id as number, nome: (cl.name ?? "") as string }, membroAtivo: membro, favoritos: fav, pedidos };
}

export async function baixarComprovante(clientId: number | null, empresaId: number | null, pedidoId: number): Promise<{ mime: string; ext: string; bytes: Buffer } | null> {
  const r = rows(await db.execute(sql`
    SELECT co.storage_key, co.sha256 FROM meus_jogos_comprovantes co JOIN meus_jogos_pedidos p ON p.id = co.pedido_id
     WHERE co.pedido_id = ${pedidoId} AND co.revogado_em IS NULL AND p.status = 'efetivado'
       ${clientId !== null ? sql`AND p.client_id = ${clientId}` : sql``} ${empresaId !== null ? sql`AND p.empresa_id = ${empresaId}` : sql``}`))[0];
  if (!r) return null;
  let buf: Buffer;
  try { buf = await storage().readPrivateObject(r.storage_key); } catch { return null; }
  if (sha256Hex(buf) !== r.sha256) return null; // arquivo alterado no armazenamento: nunca entregar
  const t = detectarTipoComprovante(buf);
  return t ? { mime: t.mime, ext: t.ext, bytes: buf } : null;
}
