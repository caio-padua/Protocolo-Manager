import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import { useListClients } from "@workspace/api-client-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { getCollabToken } from "@/lib/collab-auth";
import PortaEntrada from "./PortaEntrada";
import TelegramPanel from "@/pages/cockpit-cliente/panels/TelegramPanel";

interface Conversa {
  clienteId: number; nome: string; naoLidas: number; total: number;
  ultimaEm: string; ultimaTexto: string; ultimaDirecao: string;
}
interface VisitantesResp {
  pedidos: Array<{ id: number; nome: string; telefone: string; modalidade: string | null; oferta: { data: string; hora: string } | null; status: string; criadoEm: string }>;
  conversas: Array<{ final: string; ultimaDirecao: string; ultimaTexto: string; ultimaEm: string; total: number }>;
}
const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CentralTelegram() {
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [abertaId, setAbertaId] = useState<number | null>(null);
  const { data: clientes } = useListClients();
  const opcoes = useMemo(
    () => (clientes ?? []).map((c) => ({ id: c.id, name: c.name, cpf: c.cpf, phone: c.phone, photoUrl: c.photoUrl })),
    [clientes],
  );
  const lista = useQuery<{ conversas: Conversa[] }>({
    queryKey: ["central-telegram", soNaoLidas],
    retry: false,
    refetchInterval: 15_000,
    queryFn: async ({ signal }) => {
      const q = new URLSearchParams();
      if (soNaoLidas) q.set("naoLidas", "1");
      const r = await fetch(`${api}/telegram-inbox/conversas?${q}`, { signal, headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` } });
      if (!r.ok) throw new Error("Não foi possível carregar as conversas.");
      return r.json();
    },
  });
  const conversas = lista.data?.conversas ?? [];
  // Nome sempre da leitura mais recente (lista de conversas ou cadastro), nunca de uma cópia antiga.
  const abertaNome = abertaId === null ? null
    : (conversas.find((c) => c.clienteId === abertaId)?.nome ?? opcoes.find((o) => o.id === abertaId)?.name ?? `Cliente ${abertaId}`);
  const visitantes = useQuery<VisitantesResp>({
    queryKey: ["central-telegram-visitantes"],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const r = await fetch(`${api}/telegram-inbox/visitantes`, { signal, headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` } });
      if (!r.ok) throw new Error("Não foi possível carregar os visitantes.");
      return r.json();
    },
  });
  const pedidos = visitantes.data?.pedidos ?? [];
  const convVisitantes = visitantes.data?.conversas ?? [];
  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      <header>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Comunicação oficial da clínica</p>
        <h1 className="text-2xl font-black">Central Telegram</h1>
        <p className="text-sm text-muted-foreground">Todas as conversas dos clientes com o bot. Escolha uma para ler e responder; a resposta vai somente para o chat daquele cliente.</p>
      </header>
      <PortaEntrada />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="panel-3d-sub p-3" aria-label="Conversas">
          <div className="mb-2" data-testid="central-seletor-cliente">
            <PaxterClientSelector clientes={opcoes} value={abertaId} onChange={setAbertaId} />
          </div>
          <label className="mb-2 flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={soNaoLidas} onChange={(e) => setSoNaoLidas(e.target.checked)} /> Só não lidas
          </label>
          {lista.isLoading && <p className="flex items-center gap-2 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
          {lista.isError && <p role="alert" className="p-3 text-sm font-semibold text-red-700">Não foi possível carregar as conversas. Tente novamente.</p>}
          {!lista.isLoading && !lista.isError && conversas.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nenhuma conversa{soNaoLidas ? " com este filtro" : " ainda"}.</p>
          )}
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
            {conversas.map((c) => (
              <li key={c.clienteId}>
                <button type="button" onClick={() => setAbertaId(c.clienteId)} aria-pressed={abertaId === c.clienteId}
                  className={`${abertaId === c.clienteId ? "bevel-3d" : "btn-3d-soft"} w-full px-3 py-2 text-left`}>
                  <span className="flex items-center justify-between gap-2">
                    <strong className="truncate text-sm">{c.nome}</strong>
                    {c.naoLidas > 0 && <span className="rounded-full bg-[#b8924d] px-2 text-[10px] font-black text-white">{c.naoLidas}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{c.ultimaDirecao === "saida" ? "Equipe: " : ""}{c.ultimaTexto}</span>
                  <span className="block text-[10px] text-muted-foreground">{quando(c.ultimaEm)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel-3d-sub min-h-[320px] p-3" aria-label="Conversa aberta">
          {abertaId !== null ? (
            <>
              <h2 className="mb-2 text-lg font-black" data-testid="central-conversa-titulo">{abertaNome}</h2>
              <TelegramPanel key={abertaId} clientId={abertaId} />
            </>
          ) : (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><MessageCircle className="h-4 w-4" /> Escolha uma conversa na lista.</p>
          )}
        </section>
      </div>
      <section className="panel-3d-sub p-3" aria-label="Quem ainda não é cliente">
        <h2 className="mb-1 text-lg font-black">Quem ainda não é cliente</h2>
        <p className="mb-2 text-xs text-muted-foreground">Pedidos de agendamento feitos pelo Telegram. O horário citado NÃO está reservado: a equipe confirma com a pessoa.</p>
        {pedidos.length === 0 && convVisitantes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido ou conversa de visitante até agora.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <ul className="space-y-2">
              {pedidos.map((p) => (
                <li key={p.id} className="concave-3d rounded-lg px-3 py-2 text-sm">
                  <strong>{p.nome}</strong> <span className="text-xs">(telefone {p.telefone})</span>
                  <span className="block text-xs text-muted-foreground">
                    Pedido {p.id} · {p.status === "novo" ? "aguardando a equipe" : p.status} · {p.modalidade ?? "modalidade não informada"}
                    {p.oferta ? ` · ${p.oferta.data.slice(8, 10)}/${p.oferta.data.slice(5, 7)} às ${p.oferta.hora}` : ""} · {quando(p.criadoEm)}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              {convVisitantes.map((c) => (
                <li key={c.final + c.ultimaEm} className="concave-3d rounded-lg px-3 py-2 text-xs">
                  <strong>Chat final {c.final}</strong> · {c.total} mensagens · {quando(c.ultimaEm)}
                  <span className="block truncate text-muted-foreground">{c.ultimaDirecao === "saida" ? "Assistente: " : "Pessoa: "}{c.ultimaTexto}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
