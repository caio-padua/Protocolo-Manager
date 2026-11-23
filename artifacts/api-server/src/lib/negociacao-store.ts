/**
 * Ligação da negociação extraordinária com o atendimento real (planejador, worker e rota de aprovação).
 * O motor decide em lib/budget-negociacao.ts (aritmética inteira); aqui só se lê dados, grava e envia.
 * Telegram nunca recebe cadência automática: o pedido vai sempre para decisão humana (sem envio assíncrono por esse canal).
 */
import { pool } from "@workspace/db";
import type { EntradaAtendimento, PlanoAtendimento } from "./atendimento-telegram";
import { avaliarNegociacao, lerPedido, primeiroNome, type ResultadoNegociacao } from "./budget-negociacao";
import { custosDosItens, lerPoliticaClinica, orcamentoAprovadoDoCliente } from "./comercial-politica";
import { garantirComercial } from "./comercial-migracao";
import {
  abrirNegociacao, interromperNegociacao, negociacaoAtivaDoCliente, type DepsCadencia, type NegociacaoLinha,
} from "./negociacao-cadencia";
// Importação dinâmica de atendimento-whatsapp-store evita ciclo (aquele arquivo chama este).
const opsDe = async (e: EntradaAtendimento) => (await import("./atendimento-whatsapp-store")).depsOperacionaisWhatsapp(e);
import { decidirControle } from "./atendimento-controle";
import { enviarTextoEvolution } from "./evolution";
import { depsReaisAtendimento } from "./atendimento-telegram-store";

const MENSAGEM_LIMITE = 300;

/** Cliente escreveu enquanto havia cadência: pausa as etapas e entrega ao humano. Sem envio de cadência. */
export async function planoSeNegociacaoAtiva(e: EntradaAtendimento): Promise<PlanoAtendimento | null> {
  if (e.simulacao) return null;
  await garantirComercial(pool);
  const n = await negociacaoAtivaDoCliente(pool, e.empresaId, e.clienteId);
  if (!n || n.estado !== "cadencia_ativa") return null;
  const pausada = await interromperNegociacao(pool, e.empresaId, e.clienteId, "cliente_escreveu");
  if (!pausada) return null;
  const ops = await opsDe(e);
  return {
    resposta: await ops.frase("negociacao_pausada_cliente"), desfecho: "encaminhado_humano", caminhoResolucao: "equipe",
    pausa: "negociacao_cliente_escreveu", orientacaoId: null, faqId: null,
    alerta: `${e.canal === "telegram" ? "Telegram" : "WhatsApp"}: cliente #${e.clienteId} escreveu durante a negociação #${pausada.id}; cadência pausada. Abra a conversa protegida.`,
    fonteOperacional: { chave: "negociacao_pausada_cliente" },
  } as PlanoAtendimento;
}

export interface AvaliacaoDoPedido {
  budgetId: number; resultado: ResultadoNegociacao; gerente: string; cadenciaAtiva: boolean;
  pedido: ReturnType<typeof lerPedido>;
}

export async function avaliarPedidoDoCliente(e: EntradaAtendimento, texto: string): Promise<AvaliacaoDoPedido | null> {
  await garantirComercial(pool);
  const b = await orcamentoAprovadoDoCliente(pool, e.empresaId, e.clienteId);
  if (!b) return null;
  const politica = await lerPoliticaClinica(pool, e.empresaId);
  const pedido = lerPedido(texto);
  const custos = await custosDosItens(pool, b.itens);
  const resultado = avaliarNegociacao(b.totalCents, custos, pedido, politica);
  return { budgetId: b.id, resultado, gerente: politica.nomeGerenteFinanceiro, cadenciaAtiva: politica.negociacaoCadenciadaAtiva, pedido };
}

/** Cliente pediu condição melhor: abre Caminho A (cadência) ou B (humano). null = não há orçamento aceito; segue o fluxo antigo. */
export async function negociarComCliente(e: EntradaAtendimento, texto: string): Promise<PlanoAtendimento | null> {
  if (e.simulacao) return null;
  const av = await avaliarPedidoDoCliente(e, texto);
  if (!av) return null;
  const ops = await opsDe(e);
  const r = av.resultado;
  const canalTelegram = e.canal === "telegram";
  const agora = new Date(); // relógio real só aqui; a cadência recebe `agora` explícito
  const automatico = r.decisao === "permitida" && r.caminho === "A_automatico" && !canalTelegram;
  const contato = e.chatId;
  const abrir = await abrirNegociacao(pool, {
    empresaId: e.empresaId, clienteId: e.clienteId, budgetId: av.budgetId, canal: e.canal === "telegram" ? "telegram" : "whatsapp", contato,
    caminho: automatico ? "A_automatico" : "B_humano",
    oferta: { condicoes: r.decisao === "permitida" ? r.condicoes : [], gerente: av.gerente, pedido: { descontoPedidoPct: av.pedido.descontoPedidoPct ?? null, forma: av.pedido.forma ?? null },
      motivoHumano: r.decisao === "humano" ? r.motivo : (canalTelegram ? "canal_telegram" : r.motivoCaminho) },
    motivo: r.decisao === "humano" ? r.motivo : (canalTelegram ? "canal_telegram" : r.motivoCaminho),
    mensagemOrigem: texto.slice(0, MENSAGEM_LIMITE), agora,
  });
  if (!abrir) return null; // já existe negociação ativa: o fluxo antigo (equipe) trata a repetição
  if (automatico) {
    // A primeira etapa (minuto 0) é a própria resposta deste plano: marca como enviada para não duplicar.
    await pool.query(`UPDATE negotiation_cadence_jobs SET estado='enviado', enviado_em=$2 WHERE negociacao_id=$1 AND etapa=0`, [abrir.id, agora]);
    const vars = { gerente: av.gerente };
    return {
      resposta: await ops.frase("negociacao_inicio", vars), desfecho: "operacional_enviada", caminhoResolucao: "regra", pausa: null, alerta: null,
      orientacaoId: null, faqId: null, fonteOperacional: { chave: "negociacao_inicio", variaveis: vars },
    } as PlanoAtendimento;
  }
  return {
    resposta: await ops.frase("negociacao_aguarda_gestao"), desfecho: "encaminhado_humano", caminhoResolucao: "equipe", pausa: "negociacao_aguarda_gestao",
    orientacaoId: null, faqId: null,
    alerta: `Negociação #${abrir.id} aguarda decisão humana (cliente #${e.clienteId}, orçamento #${av.budgetId}). Aprove ou recuse em Orçamentos, Negociações.`,
    fonteOperacional: { chave: "negociacao_aguarda_gestao" },
  } as PlanoAtendimento;
}

// --- Dependências reais da cadência (worker e rota de aprovação) ---------------------------------------------------
async function nomeCliente(n: NegociacaoLinha): Promise<string> {
  const r = await pool.query("SELECT name FROM clients WHERE id=$1 AND empresa_id=$2", [n.clienteId, n.empresaId]);
  return primeiroNome(r.rows[0]?.name as string | undefined);
}
const entradaDe = async (n: NegociacaoLinha): Promise<EntradaAtendimento> => ({
  inboxMessageId: 0, empresaId: n.empresaId, clienteId: n.clienteId, clienteNome: await nomeCliente(n), chatId: n.contato, texto: "", canal: n.canal,
});

export function depsCadenciaReais(): DepsCadencia {
  return {
    agora: () => new Date(),
    frase: async (n, chave, vars) => (await opsDe(await entradaDe(n))).frase(chave, vars),
    enviar: async (n, texto, chave) => {
      if (n.canal !== "whatsapp") return false; // sem envio assíncrono por Telegram
      const r = await enviarTextoEvolution(n.empresaId, n.contato, texto, `negociacao:${chave}`, null);
      return r.accepted === true;
    },
    podeEnviar: async (n) => {
      const cfg = await pool.query("SELECT motor_ativo FROM evolution_homologacao_config WHERE empresa_id=$1", [n.empresaId]);
      if (!cfg.rows[0]?.motor_ativo) return { ok: false, motivo: "motor_desligado" };
      const modo = await depsReaisAtendimento(n.empresaId).lerConfig();
      if (!(modo.modo === "ligado" || (modo.modo === "lista" && modo.permitidos.has(n.clienteId)))) return { ok: false, motivo: "fora_da_lista_de_homologacao" };
      const d = await decidirControle({ empresaId: n.empresaId, canal: n.canal, clienteId: n.clienteId });
      if (d.acao !== "automatico") return { ok: false, motivo: d.motivo ?? "controle_bloqueado" };
      const pol = await lerPoliticaClinica(pool, n.empresaId);
      if (n.caminho === "A_automatico" && !pol.negociacaoCadenciadaAtiva) return { ok: false, motivo: "cadencia_desligada_na_politica" };
      return { ok: true };
    },
  };
}

/** Passada única da cadência (o worker chama a cada minuto). Sem condição ligada na política da clínica, nada é enviado. */
export async function executarCadenciaNegociacao(): Promise<{ enviados: number; pausados: number; falhas: number }> {
  await garantirComercial(pool);
  const { processarCadencia } = await import("./negociacao-cadencia");
  return processarCadencia(pool, depsCadenciaReais());
}
