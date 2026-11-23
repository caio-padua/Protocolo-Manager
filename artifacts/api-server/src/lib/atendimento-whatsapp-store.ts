import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { EntradaAtendimento, PlanoAtendimento } from "./atendimento-telegram";
import type { DepsOperacionaisWhatsapp, IntencaoWhatsapp } from "./atendimento-whatsapp";
import { carregarFrases, type ChaveFrase } from "./telegram-frases";
import { planejarAgendamentoCliente } from "./telegram-agendamento-store";
import { classificarIntencaoComIA, registrarPerguntaInedita } from "./atendimento-aprendizado-whatsapp";
import { consultarIntencaoGlobal } from "./base-global-intencoes";
import { brtISODate } from "./brt";
import { modeloTexto, renderTexto, type CategoriaOperacional } from "./comunicacao-padrao";
import { getNomeAssistenteAtendimento } from "./atendimento-ia-config";

/** Somente leituras do cliente/clínica resolvidos pelo webhook; reserva exige revalidação adicional. */
export function depsOperacionaisWhatsapp(
  e: EntradaAtendimento, autorizarAcao?: () => Promise<boolean>,
): DepsOperacionaisWhatsapp {
  return {
    menuAtivo: async () => {
      const r = await pool.query(`SELECT i.plano_atendimento->>'intencao' AS intencao,i.processamento,
          EXISTS(SELECT 1 FROM evolution_mensagens s WHERE s.empresa_id=i.empresa_id
            AND s.mensagem_origem_id=i.id AND s.contato=i.contato AND s.status IN ('entregue','lido')) AS entregue
        FROM evolution_mensagens i
        WHERE i.empresa_id=$1 AND i.cliente_id=$2 AND i.contato=$3 AND i.direcao='entrada'
          AND i.id<>$4 AND i.criado_em>NOW()-interval '30 minutes'
        ORDER BY i.id DESC LIMIT 1`, [e.empresaId,e.clienteId,e.chatId,e.inboxMessageId - 1_000_000_000_000]);
      return r.rows[0]?.intencao === "menu" && r.rows[0]?.processamento === "concluido" && r.rows[0]?.entregue === true;
    },
    frase: async (chave, vars) => {
      // Modelo sobrescrito pela própria clínica prevalece; padrão continua
      // vindo da tela Frases do Assistente, sem congelar edições posteriores.
      const modelo = chave === "atendimento_endereco"
        ? { origem: "padrao" as const, texto: "" }
        : await modeloTexto(e.empresaId, chave as CategoriaOperacional);
      if (modelo.origem === "clinica") {
        const r = await db.execute(sql`SELECT nome FROM empresas WHERE id=${e.empresaId}`);
        const clinica = (r.rows[0] as {nome?:string}|undefined)?.nome;
        if (!clinica) throw new Error("clinica_nao_encontrada");
        const assistente = await getNomeAssistenteAtendimento(e.empresaId);
        if (!assistente && modelo.texto.includes("{assistente}")) throw new Error("assistente_nao_configurada");
        return renderTexto(modelo.texto,{...vars,nome:e.clienteNome,clinica,assistente:assistente ?? ""});
      }
      return (await carregarFrases())(chave as ChaveFrase, vars);
    },
    endereco: async () => {
      const r = await db.execute(sql`SELECT endereco,bairro,cidade,estado,cep FROM empresas WHERE id=${e.empresaId}`);
      const x = r.rows[0] as {endereco?:string|null;bairro?:string|null;cidade?:string|null;estado?:string|null;cep?:string|null}|undefined;
      if (!x?.endereco?.trim()) return null;
      const cidade = [x.cidade?.trim(), x.estado?.trim()].filter(Boolean).join("/");
      return [x.endereco.trim(), x.bairro?.trim(), cidade, x.cep?.trim() ? `CEP ${x.cep.trim()}` : ""].filter(Boolean).join(", ");
    },
    consultarRetorno: async () => {
      const r = await db.execute(sql`SELECT s.scheduled_date,s.scheduled_time FROM sessions s
        JOIN clients c ON c.id=s.client_id AND c.empresa_id=${e.empresaId}
        WHERE s.empresa_id=${e.empresaId} AND s.client_id=${e.clienteId} AND s.protocol_id IS NULL
          AND s.status IN ('scheduled','confirmed') AND NOT s.agenda_archived
          AND s.scheduled_date>=${brtISODate()}
        ORDER BY s.scheduled_date,s.scheduled_time LIMIT 5`);
      const dados = r.rows as {scheduled_date:string;scheduled_time:string}[];
      if (!dados.length) return null;
      return dados.map(x => `${x.scheduled_date.split("-").reverse().join("/")} às ${x.scheduled_time.slice(0,5)}`).join("\n");
    },
    classificarGlobal: e.simulacao ? undefined : async (texto) => {
      const g = await consultarIntencaoGlobal(e.empresaId, texto);
      const mapa: Record<string, IntencaoWhatsapp> = { "agendamento:marcar": "agendar", "agendamento:consultar": "retorno", "agendamento:remarcar": "agendar",
        "financeiro:orcamento": "orcamento", "receitas_exames:receitas": "documentos", "receitas_exames:exames": "exames", "receitas_exames:segunda_via": "documentos",
        "triagem_clinica:equipe": "humano", "recepcao:menu": "menu" };
      return g ? (mapa[`${g.tronco}:${g.ramo}`] ?? null) : null;
    },
    classificarIA: e.simulacao ? undefined : async (texto) => {
      const r = await classificarIntencaoComIA(texto, e.empresaId, String(e.inboxMessageId));
      return r === "outra" ? null : r;
    },
    registrarInedita: async (texto, intencao, origem) => {
      if (e.simulacao) return;
      await registrarPerguntaInedita({ empresaId: e.empresaId, canal: "whatsapp", texto, intencao, origemIntencao: origem });
    },
    agendar: async (texto) => {
      const ag = await planejarAgendamentoCliente({
        empresaId:e.empresaId,clienteId:e.clienteId,inboxMessageId:e.inboxMessageId,texto,
        canal:"whatsapp",somenteLeitura:Boolean(e.simulacao),semIA:true,autorizarAcao,
      });
      if (!ag.tratada) return null;
      return {
        resposta:ag.resposta,pausa:ag.pausa,alerta:ag.alerta,desfecho:"agendamento_conduzido",
        caminhoResolucao:ag.caminhoResolucao,orientacaoId:null,faqId:null,
        interpreteChamado:false,conferenteChamado:false,aprendizChamado:false,
      } satisfies PlanoAtendimento;
    },
  };
}
