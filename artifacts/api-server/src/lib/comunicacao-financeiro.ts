/**
 * Tres trilhas financeiras SEPARADAS, cada uma com estados proprios e independentes:
 *   1. tarifaMensagem  - custo de mensagem cobrado da CLINICA (msg_extrato / msg_tarifas)
 *   2. cobrancaServico - cobranca de servico ao CLIENTE (asaas_cobrancas_teste: criada, link enviado)
 *   3. asaas           - pagamento e conciliacao no Asaas (asaas_cobranca_financeiro + log)
 * Regras: so le (nunca cria cobranca, nunca muda tarifa); envio de link nao prova pagamento;
 * sem dado = "nao_informado"; teste e producao nunca somam juntos; sempre limitado a clinica.
 */
import type { Pool } from "pg";

export type EstadoInformado = "informado" | "nao_informado";
const f = <T>(v: T | null | undefined): EstadoInformado => (v == null || v === "" ? "nao_informado" : "informado");

export interface TarifaMensagemResumo {
  tarifasAtivas: number; tarifasCadastradas: number;
  porAmbiente: { ambiente: string; mensagens: number; cobradas: number; isentas: number; semTarifa: number; valorCobradoCentavos: number }[];
}

export async function trilhaTarifaMensagem(db: Pool, empresaId: number): Promise<TarifaMensagemResumo> {
  const t = await db.query(
    `SELECT count(*) FILTER (WHERE ativo)::int AS ativas, count(*)::int AS total
       FROM msg_tarifas WHERE empresa_id IS NULL OR empresa_id = $1`, [empresaId]);
  const e = await db.query(
    `SELECT ambiente, count(*)::int AS mensagens,
            count(*) FILTER (WHERE NOT isento AND NOT sem_tarifa AND valor_centavos > 0)::int AS cobradas,
            count(*) FILTER (WHERE isento)::int AS isentas,
            count(*) FILTER (WHERE sem_tarifa)::int AS sem_tarifa,
            COALESCE(sum(valor_centavos) FILTER (WHERE NOT isento AND NOT sem_tarifa), 0)::bigint AS valor
       FROM msg_extrato WHERE empresa_id = $1 AND natureza = 'consumo' GROUP BY ambiente ORDER BY ambiente`, [empresaId]);
  return {
    tarifasAtivas: t.rows[0].ativas, tarifasCadastradas: t.rows[0].total,
    porAmbiente: e.rows.map((x) => ({
      ambiente: String(x.ambiente), mensagens: x.mensagens, cobradas: x.cobradas, isentas: x.isentas,
      semTarifa: x.sem_tarifa, valorCobradoCentavos: Number(x.valor),
    })),
  };
}

export interface EtapaFin { chave: string; rotulo: string; estado: EstadoInformado | string; quando: string | null; nota: string }

export interface CobrancaServico {
  id: number; clienteId: number; clienteNome: string | null; descricao: string | null; valorCentavos: number;
  ambiente: "teste"; estadoLocal: string; chargeId: string | null;
  etapas: EtapaFin[];
}

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export async function trilhaCobrancaServico(db: Pool, empresaId: number): Promise<CobrancaServico[]> {
  const r = await db.query(
    `SELECT a.*, c.name AS cliente_nome FROM asaas_cobrancas_teste a
       JOIN clients c ON c.id = a.client_id
      WHERE c.empresa_id = $1 ORDER BY a.id DESC LIMIT 100`, [empresaId]);
  return r.rows.map((x) => ({
    id: x.id, clienteId: x.client_id, clienteNome: x.cliente_nome ?? null, descricao: x.descricao ?? null,
    valorCentavos: x.valor_centavos, ambiente: "teste" as const, estadoLocal: x.estado, chargeId: x.asaas_charge_id ?? null,
    etapas: [
      { chave: "criada", rotulo: "Cobrança criada", estado: x.asaas_charge_id ? "criada" : x.estado === "recusada" ? "recusada" : "nao_informado",
        quando: iso(x.criado_em), nota: x.erro ? `Motivo registrado: ${x.erro}` : "Registro local da cobrança" },
      { chave: "link_email", rotulo: "Link enviado por e-mail", estado: f(x.link_email_em), quando: iso(x.link_email_em), nota: "Envio não prova que o cliente abriu ou pagou" },
      { chave: "link_telegram", rotulo: "Link enviado por Telegram", estado: f(x.link_telegram_em), quando: iso(x.link_telegram_em), nota: "Envio não prova que o cliente abriu ou pagou" },
    ],
  }));
}

export interface PagamentoAsaas {
  chargeId: string; origem: string; origemId: number | null; rotulo: string | null; ambiente: "teste" | "nao_informado";
  statusAsaas: string | null; brutoCentavos: number | null; recebidoExtratoCentavos: number | null;
  etapas: EtapaFin[];
  conciliacao: { acao: string; quando: string; causa: string | null }[];
}

export async function trilhaAsaas(db: Pool, empresaId: number): Promise<{ itens: PagamentoAsaas[]; foraDaVisaoSemClinica: number }> {
  const r = await db.query(
    `SELECT f.* FROM asaas_cobranca_financeiro f
      WHERE f.deletada IS NOT TRUE AND (
        f.empresa_id = $1
        OR (f.origem_tabela = 'teste' AND EXISTS (
              SELECT 1 FROM asaas_cobrancas_teste a JOIN clients c ON c.id = a.client_id
               WHERE a.id = f.origem_id AND c.empresa_id = $1)))
      ORDER BY f.consultado_em DESC NULLS LAST LIMIT 100`, [empresaId]);
  const ids = r.rows.map((x) => x.charge_id);
  const log = ids.length
    ? await db.query(`SELECT charge_id, acao, causa, criado_em FROM asaas_conciliacao_log WHERE charge_id = ANY($1) ORDER BY id DESC`, [ids])
    : { rows: [] as Record<string, any>[] };
  const sem = await db.query(
    `SELECT count(*)::int AS n FROM asaas_cobranca_financeiro WHERE deletada IS NOT TRUE AND empresa_id IS NULL AND origem_tabela <> 'teste'`);
  const itens = r.rows.map((x): PagamentoAsaas => {
    const pago = x.status_asaas === "RECEIVED" || x.status_asaas === "CONFIRMED" || x.status_asaas === "RECEIVED_IN_CASH";
    const conc = x.extrato_recebido_centavos != null && x.extrato_data_credito;
    return {
      chargeId: x.charge_id, origem: x.origem_tabela, origemId: x.origem_id ?? null, rotulo: x.rotulo ?? null,
      ambiente: x.origem_tabela === "teste" ? "teste" : "nao_informado",
      statusAsaas: x.status_asaas ?? null, brutoCentavos: x.bruto_centavos ?? null, recebidoExtratoCentavos: x.extrato_recebido_centavos ?? null,
      etapas: [
        { chave: "status", rotulo: "Situação no Asaas", estado: x.status_asaas ?? "nao_informado", quando: iso(x.consultado_em), nota: "Última consulta de leitura ao Asaas" },
        { chave: "pagamento", rotulo: "Pagamento", estado: pago ? "pago" : x.status_asaas ? "nao_pago" : "nao_informado", quando: x.data_pagamento ?? null, nota: "Vem do status do Asaas, nunca de mensagem enviada" },
        { chave: "conciliacao", rotulo: "Conciliação (extrato)", estado: conc ? "conciliado" : pago ? "aguardando_extrato" : "nao_informado", quando: x.extrato_data_credito ?? null, nota: "Exige lançamento no extrato real" },
      ],
      conciliacao: log.rows.filter((l) => l.charge_id === x.charge_id).slice(0, 5)
        .map((l) => ({ acao: String(l.acao), quando: new Date(l.criado_em).toISOString(), causa: l.causa ?? null })),
    };
  });
  return { itens, foraDaVisaoSemClinica: sem.rows[0].n };
}

export async function financeiroDaClinica(db: Pool, empresaId: number) {
  const [tarifaMensagem, cobrancaServico, asaas] = await Promise.all([
    trilhaTarifaMensagem(db, empresaId), trilhaCobrancaServico(db, empresaId), trilhaAsaas(db, empresaId),
  ]);
  return { tarifaMensagem, cobrancaServico, asaas };
}
