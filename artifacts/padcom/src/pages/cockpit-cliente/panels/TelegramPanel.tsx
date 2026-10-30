import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: number;
  texto: string;
  recebidaEm: string;
  lida: boolean;
  direcao?: string;
}
interface InboxPage {
  mensagens: Message[];
  naoLidas: number;
  temMais: boolean;
}

const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const headers = () => ({ Authorization: `Bearer ${getCollabToken() ?? ""}` });

export default function TelegramPanel({ clientId }: { clientId: number }) {
  const [text, setText] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [direction, setDirection] = useState("todas");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = ["telegram-inbox", clientId, pageSize, direction];
  const inbox = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 1,
    retry: false,
    queryFn: async ({ pageParam, signal }): Promise<InboxPage> => {
      const response = await fetch(`${api}/cockpit/${clientId}/telegram-inbox?pagina=${pageParam}&quantidade=${pageSize}&direcao=${direction}`, {
        signal, headers: headers(),
      });
      if (!response.ok) throw new Error("Não foi possível carregar as mensagens.");
      return response.json();
    },
    getNextPageParam: (page, _pages, pageNumber) => page.temMais ? pageNumber + 1 : undefined,
    refetchInterval: 15_000,
    gcTime: 0,
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
  useEffect(() => { markRead.mutate(); }, [clientId]);

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

  return (
    <section className="panel-3d-sub p-4 space-y-3" aria-label="Histórico Telegram">
      <div className="flex justify-between items-center gap-3">
        <h2 className="font-bold flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Telegram</h2>
        <Button className="btn-3d-soft" onClick={() => markRead.mutate()} disabled={markRead.isPending}>
          Marcar lidas
        </Button>
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
