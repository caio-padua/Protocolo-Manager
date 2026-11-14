/**
 * Painel operacional do Telegram dentro da Central de Auditoria (tela existente, sem tela nova).
 * Estados honestos: conectado (visto agora no sistema), parcial, documentado (só escrito em spec/relato),
 * não comprovado (nunca testado) e pendente (falta fazer ou não encontrado).
 * Nunca mostra token, segredo, URL do webhook, chat id nem texto de mensagem.
 */
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { BlockTitle, BASE } from "./_shared";
import { getCollabToken } from "@/lib/collab-auth";

type Estado = "conectado" | "parcial" | "documentado" | "nao_comprovado" | "pendente";
const ROTULO: Record<Estado, string> = {
  conectado: "Conectado", parcial: "Parcial", documentado: "Documentado", nao_comprovado: "Não comprovado", pendente: "Pendente",
};
const COR: Record<Estado, string> = {
  conectado: "#2e7d4f", parcial: "#b8924d", documentado: "#4a6fa5", nao_comprovado: "#8a6d3b", pendente: "#a13d3d",
};

function Selo({ e }: { e: Estado }) {
  return (
    <span className="concave-3d inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: COR[e] }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: COR[e] }} />{ROTULO[e]}
    </span>
  );
}

interface Painel {
  token: { definido: boolean; origem: string | null } | null;
  segredoWebhook: { definido: boolean } | null;
  canalAtivo: boolean | null;
  webhook: { consultado: boolean; saudavel: boolean; pendentes: number; ultimoErro: string | null; verificadoEm: string } | null;
  vinculados: number | null;
  mensagens: Array<{ direcao: string; n: number; ultima: string }> | null;
  atendimento: Array<{ estado: string; n: number }> | null;
  humano: number | null;
  orientacoes: Array<{ status: string; n: number }> | null;
  pedidos: { novos: number; total: number } | null;
  modos: { atendimentoIa: string; lembretes: string; atendimentoLista: number; lembretesLista: number };
}

const n = (v: number | null | undefined) => (v == null ? "indisponível" : v.toLocaleString("pt-BR"));

function Linha({ item, estado, detalhe }: { item: string; estado: Estado; detalhe: string }) {
  return (
    <tr className="border-t border-border/40 align-top">
      <td className="px-2 py-2 text-[12px] font-semibold">{item}</td>
      <td className="px-2 py-2"><Selo e={estado} /></td>
      <td className="px-2 py-2 text-[12px] text-muted-foreground leading-relaxed">{detalhe}</td>
    </tr>
  );
}

function Tabela({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="concave-3d overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <caption className="bevel-3d px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">{titulo}</caption>
        <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
          <th className="px-2 py-1">Item</th><th className="px-2 py-1">Estado</th><th className="px-2 py-1">Evidência e limite</th>
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function PainelOperacionalTelegram() {
  const [p, setP] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const t = getCollabToken();
    fetch(`${BASE}/api/telegram-inbox/painel-operacional`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Sem acesso. Entre novamente com a conta de colaborador." : "O servidor respondeu com erro."); setP(await r.json()); })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível consultar o painel."));
  }, []);

  const msg = (d: string) => p?.mensagens?.find((m) => m.direcao === d)?.n ?? 0;
  const atend = (e: string) => p?.atendimento?.find((a) => a.estado === e)?.n ?? 0;
  const orient = (s: string) => p?.orientacoes?.find((o) => o.status === s)?.n ?? 0;
  const falhasAtend = atend("falhou") + atend("esgotado") + atend("incerto");

  const estToken: Estado = !p ? "pendente" : p.token == null ? "nao_comprovado" : p.token.definido ? "conectado" : "pendente";
  const estSegredo: Estado = !p ? "pendente" : p.segredoWebhook == null ? "nao_comprovado" : p.segredoWebhook.definido ? "conectado" : "pendente";
  const wh = p?.webhook;
  const estWebhook: Estado = !p ? "pendente" : !wh || !wh.consultado ? "nao_comprovado" : wh.saudavel ? (wh.pendentes > 0 ? "parcial" : "conectado") : "pendente";

  return (
    <section className="panel-3d overflow-hidden" data-testid="painel-operacional-telegram">
      <div className="bevel-3d flex items-center gap-3 px-5 py-3" style={{ borderLeft: "4px solid #b8924d" }}>
        <Bot className="h-5 w-5 text-[#b8924d]" />
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide">Painel operacional do Telegram</p>
          <p className="text-[10px] text-muted-foreground">PAXMED · Clinical Intelligence System · estados honestos, sem valores secretos</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {erro && <p role="alert" className="concave-3d p-3 text-[12px] text-rose-700 dark:text-rose-400">{erro} Os itens abaixo marcados como lidos do sistema aparecem como pendentes até a consulta funcionar.</p>}

        <Tabela titulo="1. Lido agora do sistema (esta clínica, ambiente em uso)">
          <Linha item="Token do bot" estado={estToken} detalhe={p?.token?.definido ? `Definido (origem: ${p.token.origem === "vault" ? "cofre" : "ambiente"}). Valor nunca exibido.` : "Não definido ou não consultado."} />
          <Linha item="Segredo do webhook" estado={estSegredo} detalhe={p?.segredoWebhook?.definido ? "Definido. Valor nunca exibido." : "Não definido ou não consultado."} />
          <Linha item="Canal ativado" estado={!p || p.canalAtivo == null ? "nao_comprovado" : p.canalAtivo ? "conectado" : "pendente"} detalhe={p?.canalAtivo == null ? "Configuração não lida." : p.canalAtivo ? "Canal marcado como ativo em Configurações." : "Canal desativado em Configurações."} />
          <Linha item="Webhook" estado={estWebhook} detalhe={wh ? (wh.consultado ? `Consulta ao Telegram feita agora. Pendentes: ${wh.pendentes}. Último erro: ${wh.ultimoErro ?? "nenhum"}.` : "O Telegram não pôde ser consultado agora (sem token ou rede).") : "Não consultado."} />
          <Linha item="Histórico de mensagens" estado={!p || p.mensagens == null ? "nao_comprovado" : msg("entrada") + msg("saida") > 0 ? "conectado" : "pendente"} detalhe={`Recebidas: ${n(msg("entrada"))} · Enviadas: ${n(msg("saida"))}. São registros do banco; aceite do Telegram não é confirmação visual no aparelho.`} />
          <Linha item="Vínculo paciente ↔ conversa" estado={!p || p.vinculados == null ? "nao_comprovado" : p.vinculados > 0 ? "parcial" : "pendente"} detalhe={`${n(p?.vinculados)} cliente(s) com Telegram vinculado. O vínculo é individual (um chat por cliente; colisão nunca vincula). Parcial: poucos vínculos reais, só contatos de teste.`} />
          <Linha item="Orientações aprovadas" estado={!p || p.orientacoes == null ? "nao_comprovado" : orient("aprovada") > 0 ? "conectado" : "pendente"} detalhe={`Aprovadas: ${n(orient("aprovada"))} · Rascunhos: ${n(orient("rascunho"))} · Inativas: ${n(orient("inativa"))}. Sem aprovada, dúvidas vão para a equipe.`} />
          <Linha item="Atendimento humano" estado={!p || p.humano == null ? "nao_comprovado" : "conectado"} detalhe={`${n(p?.humano)} conversa(s) com a assistente pausada para a equipe. Mensagem humana no Cockpit pausa a assistente daquele cliente.`} />
          <Linha item="Falhas do atendimento" estado={!p || p.atendimento == null ? "nao_comprovado" : falhasAtend > 0 ? "parcial" : "conectado"} detalhe={`Concluídas: ${n(atend("concluido"))} · Pendentes: ${n(atend("pendente") + atend("processando"))} · Com falha, esgotadas ou incertas: ${n(falhasAtend)}.`} />
          <Linha item="Pedidos de quem não é cliente" estado={!p || p.pedidos == null ? "nao_comprovado" : "conectado"} detalhe={`Novos: ${n(p?.pedidos?.novos)} · Total: ${n(p?.pedidos?.total)}. Nunca viram reserva sozinhos.`} />
          <Linha item="Assistente de dúvidas e agendamento" estado={!p ? "pendente" : p.modos.atendimentoIa === "desligado" ? "pendente" : "parcial"} detalhe={`Modo: ${p?.modos.atendimentoIa ?? "—"}${p && p.modos.atendimentoIa === "lista" ? ` (${p.modos.atendimentoLista} cliente(s) autorizados)` : ""}. Lembretes por Telegram: ${p?.modos.lembretes ?? "—"}${p && p.modos.lembretes === "lista" ? ` (${p.modos.lembretesLista} autorizados)` : ""}.`} />
        </Tabela>

        <Tabela titulo="2. Prova real de ida e volta (desenvolvimento, 14/11/2026, registrada)">
          <Linha item="Mensagem real do contato pessoal" estado="conectado" detalhe="Pedido de consulta recebido e gravado; Dr. Caio relatou o horário local (23h) e conferiu no aparelho." />
          <Linha item="Resposta da assistente" estado="conectado" detalhe="Perguntas, lista de horários e confirmação, todas com aceite do Telegram e cópia de saída no histórico. Houve 3 respostas repetidas na 1ª rodada (corrigido; não reproduzido depois) e uma demora de cerca de 5 minutos por falha do serviço (corrigida)." />
          <Linha item="Auditoria" estado="conectado" detalhe="Registros de entrada e saída por cliente e estados do atendimento conferidos no banco." />
          <Linha item="Reserva de teste" estado="conectado" detalhe="Escolhida pela pessoa (opção 1), gravada, conferida (única, agenda online do médico principal) e depois cancelada; horário liberado. Outra reserva antiga de teste de outro contato segue ativa, aguardando ordem para cancelar." />
          <Linha item="Contato da clínica" estado="nao_comprovado" detalhe="Sem conversa real de ida e volta nesta rodada." />
          <Linha item="Produção" estado="nao_comprovado" detalhe="Nada foi testado nem publicado em produção. O endereço publicado ainda responde erro 404." />
        </Tabela>

        <Tabela titulo="3. Matriz de permissões da conversa (o que a assistente pode fazer)">
          <Linha item="Perguntas sobre tratamento (queixa, dose, sintoma)" estado="conectado" detalhe="Comprovado por testes: nunca recebe resposta automática de IA; a equipe é avisada com prioridade. Só orientação aprovada por médico pode responder dúvida geral." />
          <Linha item="Dúvida geral com orientação aprovada" estado="parcial" detalhe="Mecanismo testado, mas a biblioteca não tem nenhuma orientação aprovada; sem aprovada, encaminha à equipe." />
          <Linha item="Agendamento de consulta (cliente)" estado="conectado" detalhe="Comprovado em desenvolvimento com reserva real, só de horários livres da agenda e só após gravar." />
          <Linha item="Agendamento (quem não é cliente)" estado="parcial" detalhe="Gera pedido para a equipe; testado com transporte simulado, não com pessoa real." />
          <Linha item="Próxima consulta (consulta de agenda do cliente)" estado="pendente" detalhe="Não encontrei no código a leitura da agenda do próprio cliente para responder “quando é minha consulta”. Não existe." />
          <Linha item="Cancelar ou remarcar" estado="parcial" detalhe="A assistente só encaminha à equipe; não cancela nem remarca sozinha." />
          <Linha item="RAS, RASP e prescrição perdida (reenvio pela conversa)" estado="pendente" detalhe="Reenvio de documentos pela conversa não foi encontrado. A especificação funcional desses fluxos não foi localizada. Nenhuma ação foi inferida." />
          <Linha item="Envio de documentos por Telegram (fora da conversa)" estado="documentado" detalhe="Existe em specs e rotas de envio da equipe; não é um pedido iniciado pelo paciente na conversa." />
        </Tabela>

        <BlockTitle icon={Bot}>Etapas reproduzíveis da evolução</BlockTitle>
        <ol className="concave-3d space-y-2 p-3 text-[12px] leading-relaxed" data-testid="etapas-telegram">
          <li><strong>Etapa 1 · Telegram → Cockpit e retorno.</strong> Receber, gravar no Cockpit, responder pela equipe ou pela assistente. Estado: comprovada em desenvolvimento com o contato pessoal; falta o contato da clínica e a prova em produção (só após o comando de 100%).</li>
          <li><strong>Etapa 2 · Vínculo do paciente.</strong> Link individual ou senha de validação já existem; colisão nunca vincula. Falta a tela para resolver vínculos ambíguos.</li>
          <li><strong>Etapa 3 · Orientações aprovadas.</strong> Biblioteca com prévia fiel e aprovação médica. Falta o conteúdo aprovado pelo Dr. Caio.</li>
          <li><strong>Etapa 4 · Documentos e agenda.</strong> Só depois das anteriores: consulta da própria agenda e reenvio de RAS, RASP e prescrição. Cada uma exige especificação, revisão e teste antes de ligar.</li>
        </ol>
      </div>
    </section>
  );
}
