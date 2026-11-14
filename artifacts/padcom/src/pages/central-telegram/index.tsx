import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle, Search } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";
import TelegramPanel from "@/pages/cockpit-cliente/panels/TelegramPanel";

interface Conversa {
  clienteId: number; nome: string; naoLidas: number; total: number;
  ultimaEm: string; ultimaTexto: string; ultimaDirecao: string;
}
const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CentralTelegram() {
  const [busca, setBusca] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [aberta, setAberta] = useState<Conversa | null>(null);
  const lista = useQuery<{ conversas: Conversa[] }>({
    queryKey: ["central-telegram", busca, soNaoLidas],
    retry: false,
    refetchInterval: 15_000,
    queryFn: async ({ signal }) => {
      const q = new URLSearchParams();
      if (busca.trim()) q.set("busca", busca.trim());
      if (soNaoLidas) q.set("naoLidas", "1");
      const r = await fetch(`${api}/telegram-inbox/conversas?${q}`, { signal, headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` } });
      if (!r.ok) throw new Error("Não foi possível carregar as conversas.");
      return r.json();
    },
  });
  const conversas = lista.data?.conversas ?? [];
  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      <header>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Comunicação oficial da clínica</p>
        <h1 className="text-2xl font-black">Central Telegram</h1>
        <p className="text-sm text-muted-foreground">Todas as conversas dos clientes com o bot. Escolha uma para ler e responder; a resposta vai somente para o chat daquele cliente.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="panel-3d-sub p-3" aria-label="Conversas">
          <label className="field-engraved mb-2 flex items-center gap-2 px-2 py-1.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <label className="mb-2 flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={soNaoLidas} onChange={(e) => setSoNaoLidas(e.target.checked)} /> Só não lidas
          </label>
          {lista.isLoading && <p className="flex items-center gap-2 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
          {lista.isError && <p role="alert" className="p-3 text-sm font-semibold text-red-700">Não foi possível carregar as conversas. Tente novamente.</p>}
          {!lista.isLoading && !lista.isError && conversas.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nenhuma conversa{busca || soNaoLidas ? " com este filtro" : " ainda"}.</p>
          )}
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
            {conversas.map((c) => (
              <li key={c.clienteId}>
                <button type="button" onClick={() => setAberta(c)} aria-pressed={aberta?.clienteId === c.clienteId}
                  className={`${aberta?.clienteId === c.clienteId ? "bevel-3d" : "btn-3d-soft"} w-full px-3 py-2 text-left`}>
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
          {aberta ? (
            <>
              <h2 className="mb-2 text-lg font-black">{aberta.nome}</h2>
              <TelegramPanel key={aberta.clienteId} clientId={aberta.clienteId} />
            </>
          ) : (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><MessageCircle className="h-4 w-4" /> Escolha uma conversa na lista.</p>
          )}
        </section>
      </div>
    </div>
  );
}
