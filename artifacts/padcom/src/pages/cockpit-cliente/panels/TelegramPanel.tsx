import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: number;
  texto: string;
  recebidaEm: string;
  lida: boolean;
  direcao?: string;
  atendimento?: { estado: string; desfecho: string | null; orientacaoAprovada: boolean };
}
interface AtendimentoStatus {
  vinculado: boolean;
  vinculoUnico: boolean;
  modoGlobal: "desligado" | "lista" | "ligado";
  botConfigurado: boolean;
  canalAtivo: boolean;
  autorizadoIndividualmente: boolean;
  modoPermiteResposta: boolean;
  pausadoParaEquipe: boolean;
  creditoDisponivel: boolean;
  creditoMotivo: string | null;
  respostaAutomaticaAtiva: boolean;
  podeAlterarAutorizacaoIndividual: boolean;
}
interface InboxPage {
  mensagens: Message[];
  naoLidas: number;
  temMais: boolean;
}

const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const headers = () => ({ Authorization: `Bearer ${getCollabToken() ?? ""}` });

export default function TelegramPanel({
  clientId, marcarAoAbrir = true, visivel = true,
}: { clientId: number; marcarAoAbrir?: boolean; visivel?: boolean }) {
  const [text, setText] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [direction, setDirection] = useState("todas");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = ["telegram-inbox", clientId, pageSize, direction];
  const inbox = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 1,
    enabled: visivel,
    retry: false,
    queryFn: async ({ pageParam, signal }): Promise<InboxPage> => {
      const response = await fetch(`${api}/cockpit/${clientId}/telegram-inbox?pagina=${pageParam}&quantidade=${pageSize}&direcao=${direction}`, {
        signal, headers: headers(),
      });
      if (!response.ok) throw new Error("Não foi possível carregar as mensagens.");
      return response.json();
    },
    getNextPageParam: (page, _pages, pageNumber) => page.temMais ? pageNumber + 1 : undefined,
    refetchInterval: visivel ? 15_000 : false,
    gcTime: 0,
  });
  const atendimento = useQuery({
    queryKey: ["telegram-atendimento", clientId],
    enabled: visivel,
    retry: false,
    refetchInterval: visivel ? 15_000 : false,
    queryFn: async ({ signal }): Promise<AtendimentoStatus> => {
      const response = await fetch(`${api}/cockpit/${clientId}/telegram-inbox/atendimento`, {
        signal, headers: headers(),
      });
      if (!response.ok) throw new Error("Não foi possível confirmar a autorização e o estado do atendimento.");
      return response.json();
    },
  });
  const messages = useMemo(() => {
    const unique = new Map<number, Message>();
    for (const page of inbox.data?.pages ?? []) {
      for (const message of page.mensagens) {
        if (!unique.has(message.id)) unique.set(message.id, message);
      }
    }
    return [...unique.values()].sort((a, b) =>
      a.recebidaEm.localeCompare(b.recebidaEm) || a.id - b.id,
    );
  }, [inbox.data]);

  const markRead = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${api}/cockpit/${clientId}/telegram-inbox/marcar-lidas`, {
        method: "POST", headers: headers(),
      });
      if (!response.ok) throw new Error("Não foi possível marcar as mensagens como lidas.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["telegram-inbox-badge"] });
    },
  });
  // Uma visão geral pode montar várias ferramentas. Só a abertura explícita
  // da aba Telegram mantém a marcação automática já existente.
  useEffect(() => {
    if (marcarAoAbrir && visivel) markRead.mutate();
  }, [clientId, marcarAoAbrir, visivel]);

  const send = useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch(`${api}/cockpit/${clientId}/telegram-inbox/enviar`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ texto: message }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível enviar a mensagem.");
    },
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error: Error) => toast({
      title: "Mensagem não enviada", description: error.message, variant: "destructive",
    }),
  });
  const updateAuthorization = useMutation({
    mutationFn: async (autorizado: boolean) => {
      const response = await fetch(`${api}/cockpit/${clientId}/telegram-inbox/atendimento`, {
        method: "PUT",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ autorizado }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível alterar a autorização individual.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["telegram-atendimento", clientId] });
      toast({ title: "Autorização individual atualizada" });
    },
    onError: (error: Error) => {
      toast({ title: "Autorização não alterada", description: error.message, variant: "destructive" });
    },
  });
  const status = atendimento.data;
  const statusMessage = (message: Message) => {
    const state = message.atendimento;
    if (!state) return null;
    if (state.estado === "incerto") return "Resultado incerto; a equipe precisa conferir antes de repetir.";
    if (state.estado === "falhou" || state.estado === "esgotado") return "Não confirmado; requer conferência da equipe.";
    if (state.estado === "pendente" || state.estado === "processando") return "Aguardando resposta.";
    if (state.desfecho === "orientacao_enviada") return state.orientacaoAprovada
      ? "Respondida com orientação aprovada."
      : "Respondida.";
    if (state.desfecho === "clarificacao_documento") return "Aguardando a cliente indicar qual item.";
    if (state.desfecho === "reenvio_receita_ofertado") return "Oferta de segunda via enviada; falta confirmação.";
    if (state.desfecho === "reenvio_receita_confirmado") return "Segunda via confirmada e encaminhada.";
    if (state.desfecho === "reenvio_receita_cancelado") return "Oferta de segunda via cancelada.";
    if (state.desfecho === "encaminhado_humano" || state.desfecho === "queixa_encaminhada") return "Encaminhada à equipe.";
    if (state.desfecho === "desligado_ou_fora_da_lista" || state.desfecho === "desligado" || state.desfecho === "fora_da_lista") return "Resposta automática bloqueada pela configuração.";
    return "Atendimento encerrado.";
  };

  return (
    <section className="panel-3d-sub p-4 space-y-3" aria-label="Histórico Telegram">
      <div className="flex justify-between items-center gap-3">
        <h2 className="font-bold flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Telegram</h2>
        <Button className="btn-3d-soft" onClick={() => markRead.mutate()} disabled={markRead.isPending}>
          Marcar lidas
        </Button>
      </div>
      <div className="concave-3d space-y-3 p-3" aria-label="Estado do atendimento automático">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Atendimento automático deste cliente</p>
            {atendimento.isLoading && <p className="text-xs text-muted-foreground">Verificando vínculo, modo e crédito…</p>}
            {atendimento.isError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">{(atendimento.error as Error).message}</p>}
            {status && <p className="text-xs text-muted-foreground">
              Modo global: <b>{status.modoGlobal}</b> · Telegram: <b>{status.vinculado && status.vinculoUnico ? "vinculado e único" : "não confirmado"}</b> · Canal: <b>{status.canalAtivo && status.botConfigurado ? "ativo" : "inativo ou incompleto"}</b> · Crédito: <b>{status.creditoDisponivel ? "disponível" : "indisponível"}</b>
            </p>}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <Switch
              checked={status?.autorizadoIndividualmente ?? false}
              onCheckedChange={(checked) => updateAuthorization.mutate(checked)}
              disabled={!status || !status.podeAlterarAutorizacaoIndividual || updateAuthorization.isPending ||
                (!status.autorizadoIndividualmente && (!status.vinculado || !status.vinculoUnico))}
              aria-label="Autorizar atendimento automático para este cliente"
            />
            {status?.autorizadoIndividualmente ? "Autorizado" : "Não autorizado"}
          </label>
        </div>
        {status && (
          <p className="text-xs leading-relaxed text-muted-foreground" role="status">
            {status.modoGlobal === "ligado"
              ? "O modo global atende todos os clientes vinculados e ignora a lista individual; por isso, este controle fica bloqueado."
              : status.pausadoParaEquipe
                ? "A equipe assumiu esta conversa. A inteligência artificial permanece pausada."
                : !status.creditoDisponivel
                  ? "Sem crédito disponível para resposta automática. A mensagem permanece registrada para a equipe."
                  : status.modoGlobal === "desligado" && status.autorizadoIndividualmente
                    ? "A autorização fica guardada, mas nenhuma resposta automática sai enquanto o modo global estiver desligado."
                    : status.modoGlobal === "lista" && !status.autorizadoIndividualmente
                      ? "O modo Lista está ativo, mas este cliente ainda não foi autorizado."
                      : status.respostaAutomaticaAtiva
                        ? "A resposta automática está habilitada para esta conversa. Dúvidas clínicas sem orientação aprovada seguem para a equipe."
                        : "A autorização está registrada, mas falta uma condição para responder automaticamente."}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">A autorização individual só pode ser alterada pelo CEO. O servidor valida essa permissão.</p>
        {status?.modoGlobal === "ligado" && <p className="text-xs text-amber-800 dark:text-amber-300">Para limitar respostas a clientes escolhidos, altere o modo global para “lista” na Central de Auditoria.</p>}
      </div>
      <p className="text-xs text-muted-foreground">As mensagens são consultadas por lotes. Nenhuma classificação de gravidade clínica é aplicada.</p>
      {(inbox.isError || markRead.isError) && (
        <div role="alert" className="concave-3d p-3 text-sm">
          <p>{inbox.isError
            ? "Não foi possível atualizar o histórico. As mensagens já carregadas foram preservadas."
            : "Não foi possível marcar as mensagens como lidas."}</p>
          <Button className="btn-3d-soft mt-2" onClick={() => {
            if (inbox.isFetchNextPageError) void inbox.fetchNextPage();
            else if (inbox.isError) void inbox.refetch();
            else markRead.mutate();
          }}>Tentar novamente</Button>
        </div>
      )}
      {inbox.isLoading && <p role="status">Carregando mensagens…</p>}
      {!inbox.isLoading && !inbox.isError && messages.length === 0 && (
        <p className="concave-3d p-4 text-sm">Nenhuma mensagem neste cliente.</p>
      )}
      <div className="space-y-2" aria-label="Mensagens">
        {messages.map(message => (
          <div key={message.id} data-message-id={message.id}
            className={`flex ${message.direcao === "saida" ? "justify-end" : "justify-start"}`}>
            <article className={`${message.direcao === "saida" ? "bevel-3d" : "concave-3d"} p-3 rounded-md max-w-[85%] min-w-0`}>
              <p className="text-sm whitespace-pre-wrap break-words">{message.texto}</p>
              {message.atendimento && <p className="mt-2 text-[10px] font-semibold text-muted-foreground" data-testid={`atendimento-status-${message.id}`}>{statusMessage(message)}</p>}
              <time className="text-xs text-muted-foreground" dateTime={message.recebidaEm}>
                {new Date(message.recebidaEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </time>
            </article>
          </div>
        ))}
      </div>
      <div className="concave-3d p-3 space-y-3" aria-label="Controles do histórico">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs font-medium flex flex-col gap-1">
            Mensagens por lote
            <select className="field-engraved p-2" value={pageSize}
              onChange={event => setPageSize(Number(event.target.value))}>
              <option value={20}>20 mensagens</option>
              <option value={50}>50 mensagens</option>
              <option value={100}>100 mensagens</option>
            </select>
          </label>
          <label className="text-xs font-medium flex flex-col gap-1">
            Tipo de mensagem
            <select className="field-engraved p-2" value={direction}
              onChange={event => setDirection(event.target.value)}>
              <option value="todas">Todas</option>
              <option value="entrada">Recebidas</option>
              <option value="saida">Enviadas</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span role="status" className="text-xs text-muted-foreground">
            {messages.length} {messages.length === 1 ? "mensagem exibida" : "mensagens exibidas"}
            {inbox.hasNextPage ? " · há mensagens mais antigas" : ""}
          </span>
          {inbox.hasNextPage && (
            <Button className="btn-3d-soft" disabled={inbox.isFetching} aria-busy={inbox.isFetchingNextPage}
              onClick={() => { void inbox.fetchNextPage(); }}>
              {inbox.isFetchingNextPage && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ver mais antigas
            </Button>
          )}
        </div>
      </div>
      <form className="flex flex-col sm:flex-row gap-2" onSubmit={event => {
        event.preventDefault();
        if (text.trim() && !send.isPending) send.mutate(text.trim());
      }}>
        <textarea className="concave-3d p-3 text-sm flex-1 min-w-0" aria-label="Mensagem para o cliente"
          value={text} onChange={event => setText(event.target.value)} maxLength={4096} rows={2} />
        <Button className="btn-3d-soft" type="submit" disabled={!text.trim() || send.isPending}>
          {send.isPending ? "Enviando…" : "Enviar"}
        </Button>
      </form>
    </section>
  );
}
