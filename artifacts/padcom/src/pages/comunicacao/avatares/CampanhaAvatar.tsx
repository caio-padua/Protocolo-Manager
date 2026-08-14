/**
 * CampanhaAvatar.tsx — Painel de Campanha em Massa de Avatares.
 *
 * Permite selecionar múltiplos clientes, escrever um script e disparar
 * para todos via campanha persistida no banco (retomada após restart).
 * Mostra barra de progresso em tempo real por polling no GET de campanha.
 */
import { useState, useEffect, useRef } from "react";
import { tituloProprio } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Search, Send, Loader2, CheckCircle2, XCircle,
  Mic, Video, BarChart3, RefreshCw, User, X, RotateCcw,
} from "lucide-react";

interface Avatar { id: number; nomeExibido: string; status: string; nivel?: string; }
interface Cliente { id: number; name: string; phone: string | null; }

interface CampanhaProgresso {
  id:          string;
  canal:       string;
  total:       number;
  enviados:    number;
  erros:       number;
  pendentes:   number;
  status:      string;
  criadoAt:    string;
  concluidoAt: string | null;
}

interface Props {
  avatares: Avatar[];
  apiBase:  string;
}

export function CampanhaAvatar({ avatares, apiBase }: Props) {
  const [avatarId,    setAvatarId]    = useState<number | null>(null);
  const [canal,       setCanal]       = useState<"VOICE" | "VIDEO">("VOICE");
  const [texto,       setTexto]       = useState("");
  const [busca,       setBusca]       = useState("");
  const [resultsBusca, setResultsBusca] = useState<Cliente[]>([]);
  const [selecionados, setSelecionados] = useState<Cliente[]>([]);
  const [enviando,      setEnviando]      = useState(false);
  const [campaignId,    setCampaignId]    = useState<string | null>(null);
  const [erro,          setErro]          = useState<string | null>(null);
  const [reenviando,    setReenviando]    = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Busca de clientes com debounce
  useEffect(() => {
    if (busca.length < 2) { setResultsBusca([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `${apiBase}/api/clients?search=${encodeURIComponent(busca)}&limit=20`,
          { credentials: "include" },
        );
        const d = await r.json();
        setResultsBusca(Array.isArray(d) ? d : (d.clients ?? d.data ?? []));
      } catch { setResultsBusca([]); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  function adicionarCliente(c: Cliente) {
    if (!selecionados.find(s => s.id === c.id)) {
      setSelecionados(prev => [...prev, c]);
    }
    setBusca(""); setResultsBusca([]);
  }

  function removerCliente(id: number) {
    setSelecionados(prev => prev.filter(c => c.id !== id));
  }

  // Polling do progresso (a cada 5s quando campanha ativa)
  const { data: progresso, refetch: refetchProgresso } = useQuery<CampanhaProgresso>({
    queryKey:       ["campanha-progresso", campaignId],
    queryFn:        () =>
      fetch(`${apiBase}/api/avatares/campanha/${campaignId}`, { credentials: "include" })
        .then(r => r.json()),
    enabled:        !!campaignId,
    refetchInterval: (query) => {
      // Para de fazer polling quando a campanha termina
      // react-query v5: refetchInterval recebe o Query object (não os dados diretamente)
      const progresso = (query as any)?.state?.data as { status?: string } | undefined;
      if (!progresso) return 5_000;
      return progresso.status === "concluida" ? false : 5_000;
    },
    staleTime: 0,
  });

  async function dispararCampanha() {
    if (!avatarId || selecionados.length === 0 || !texto.trim()) return;
    setEnviando(true);
    setErro(null);
    setCampaignId(null);
    try {
      const r = await fetch(`${apiBase}/api/avatares/campanha`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          avatarId,
          canal,
          texto,
          clienteIds: selecionados.map(c => c.id),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.error ?? "Erro ao criar campanha"); return; }
      setCampaignId(d.campaignId);
      // Limpa seleção após disparo
      setSelecionados([]);
      setTexto("");
    } catch (e: any) {
      setErro(e?.message ?? "Erro de rede");
    } finally {
      setEnviando(false);
    }
  }

  async function reenviarFalhos(srcCampaignId: string) {
    setReenviando(true);
    setErro(null);
    try {
      const r = await fetch(`${apiBase}/api/avatares/campanha/${srcCampaignId}/reenviar-erros`, {
        method:      "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.error ?? "Erro ao reenviar falhas"); return; }
      // Aponta o painel de progresso para a nova campanha
      setCampaignId(d.campaignId);
    } catch (e: any) {
      setErro(e?.message ?? "Erro de rede");
    } finally {
      setReenviando(false);
    }
  }

  const podeCriar = !!avatarId && selecionados.length > 0 && texto.trim().length > 0 && !enviando;

  // Percentual de conclusão
  const pct = progresso && progresso.total > 0
    ? Math.round(((progresso.enviados + progresso.erros) / progresso.total) * 100)
    : 0;

  return (
    <div className="panel-3d-sub rounded-xl p-5 space-y-5">
      <h3 className="text-sm font-semibold text-gold uppercase tracking-widest flex items-center gap-2">
        <Users className="w-4 h-4" />
        Campanha em Massa
      </h3>

      <p className="text-xs text-white/40 leading-relaxed">
        Selecione múltiplos clientes, escreva o script e dispare para todos de uma vez.
        Os envios são persistidos no banco — o worker retoma automaticamente mesmo após restart do servidor.
      </p>

      {/* 1. Selecionar Avatar */}
      <div>
        <label className="block text-xs text-sky-300/70 mb-2">1. Avatar</label>
        <div className="grid grid-cols-1 gap-2">
          {avatares.filter(a => a.status === "ativo").map(a => (
            <button
              key={a.id}
              onClick={() => setAvatarId(a.id)}
              className={`text-left px-3 py-2 rounded-lg border transition-all text-sm ${
                avatarId === a.id
                  ? "border-gold/60 bg-gold/10 text-gold"
                  : "border-white/10 text-white/70 hover:border-white/30"
              }`}
            >
              <span className="font-medium">{a.nomeExibido}</span>
              <span className="ml-2 text-xs opacity-60">{a.nivel ?? "texto"}</span>
            </button>
          ))}
          {avatares.filter(a => a.status === "ativo").length === 0 && (
            <p className="text-xs text-white/40">Nenhum avatar ativo.</p>
          )}
        </div>
      </div>

      {/* 2. Canal */}
      <div>
        <label className="block text-xs text-sky-300/70 mb-2">2. Canal</label>
        <div className="flex gap-2">
          {(["VOICE", "VIDEO"] as const).map(c => {
            const Icon = c === "VOICE" ? Mic : Video;
            return (
              <button
                key={c}
                onClick={() => setCanal(c)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  canal === c
                    ? "border-gold/60 bg-gold/10 text-gold"
                    : "border-white/10 text-white/50 hover:border-white/20"
                }`}
              >
                <Icon className="w-3 h-3" />
                {c === "VOICE" ? "Voz (áudio)" : "Vídeo (HeyGen)"}
              </button>
            );
          })}
        </div>
        {canal === "VIDEO" && (
          <p className="text-xs text-amber-300/60 mt-1">
            Vídeo é assíncrono — o worker HeyGen entrega o link quando pronto (≈2–5 min por cliente).
          </p>
        )}
      </div>

      {/* 3. Selecionar Clientes */}
      <div>
        <label className="block text-xs text-sky-300/70 mb-2">
          3. Clientes ({selecionados.length} selecionado{selecionados.length !== 1 ? "s" : ""})
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente por nome..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40"
          />
        </div>
        {resultsBusca.length > 0 && (
          <ul className="mt-1 border border-white/10 rounded-lg bg-[#0a1628] divide-y divide-white/5 max-h-40 overflow-y-auto">
            {resultsBusca
              .filter(c => !selecionados.find(s => s.id === c.id))
              .map(c => (
                <li key={c.id}>
                  <button
                    onClick={() => adicionarCliente(c)}
                    className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                  >
                    <User className="inline w-3 h-3 mr-1.5 opacity-50" />
                    {tituloProprio(c.name)}
                    {c.phone && (
                      <span className="ml-2 text-xs text-white/40">
                        {c.phone.replace(/\d(?=\d{4})/g, "*")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        )}

        {/* Lista de selecionados */}
        {selecionados.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {selecionados.map(c => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                           bg-sky-900/40 border border-sky-700/40 text-sky-300"
              >
                {c.name.split(" ").slice(0, 2).join(" ")}
                <button onClick={() => removerCliente(c.id)} className="ml-0.5 hover:text-red-300">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 4. Texto / Script */}
      <div>
        <label className="block text-xs text-sky-300/70 mb-2">4. Texto / Script</label>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={4}
          maxLength={3000}
          placeholder="Digite o texto que o avatar vai falar para todos os clientes..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                     placeholder-white/30 focus:outline-none focus:border-gold/40 resize-none"
        />
        <p className="text-right text-xs text-white/30 mt-0.5">{texto.length}/3000</p>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-start gap-2 p-3 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-300">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {erro}
        </div>
      )}

      {/* Botão Disparar */}
      <button
        onClick={dispararCampanha}
        disabled={!podeCriar}
        className="bevel-3d w-full py-2.5 text-sm font-semibold text-gold flex items-center
                   justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {enviando
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando campanha…</>
          : <><Send className="w-4 h-4" /> Disparar para {selecionados.length} cliente{selecionados.length !== 1 ? "s" : ""}</>
        }
      </button>

      {/* ── Painel de Progresso da Campanha ───────────────────────────────── */}
      {campaignId && (
        <div className="panel-3d rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-white/60 font-medium">
              <BarChart3 className="w-4 h-4 text-sky-400" />
              Progresso da Campanha
              <span className="text-white/30 font-mono">{campaignId}</span>
            </div>
            <button
              onClick={() => refetchProgresso()}
              className="text-white/30 hover:text-white/60 transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {!progresso ? (
            <div className="flex items-center gap-2 text-xs text-white/40">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Carregando progresso…
            </div>
          ) : (
            <>
              {/* Barra de progresso */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-white/50">
                  <span>{progresso.enviados + progresso.erros} de {progresso.total} processados</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      progresso.status === "concluida"
                        ? (progresso.erros === 0 ? "bg-emerald-500" : "bg-amber-500")
                        : "bg-sky-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Contadores */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Enviados",  valor: progresso.enviados,  cor: "text-emerald-400" },
                  { label: "Erros",     valor: progresso.erros,     cor: "text-red-400"     },
                  { label: "Pendentes", valor: progresso.pendentes,  cor: "text-sky-400"    },
                ].map(s => (
                  <div key={s.label} className="bevel-3d p-2 rounded text-center">
                    <div className={`text-lg font-bold leading-tight ${s.cor}`}>{s.valor}</div>
                    <div className="text-white/40 text-xs">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Status final */}
              {progresso.status === "concluida" && (
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                    progresso.erros === 0
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                  }`}>
                    {progresso.erros === 0
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                      : <XCircle className="w-4 h-4 shrink-0" />
                    }
                    {progresso.erros === 0
                      ? `Campanha concluída — ${progresso.enviados} envio${progresso.enviados !== 1 ? "s" : ""} realizados com sucesso.`
                      : `Campanha concluída — ${progresso.enviados} enviados, ${progresso.erros} com erro.`
                    }
                  </div>

                  {/* Botão reenviar falhos — só aparece quando há erros */}
                  {progresso.erros > 0 && (
                    <button
                      onClick={() => reenviarFalhos(progresso.id)}
                      disabled={reenviando}
                      className="bevel-3d w-full py-2 text-xs font-semibold text-amber-300 flex
                                 items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {reenviando
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Criando reenvio…</>
                        : <><RotateCcw className="w-3.5 h-3.5" /> Reenviar falhos ({progresso.erros})</>
                      }
                    </button>
                  )}
                </div>
              )}

              {/* Pulsando enquanto em andamento */}
              {progresso.status === "em_andamento" && (
                <div className="flex items-center gap-2 text-xs text-sky-400/70">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Worker processando… atualiza a cada 5 segundos automaticamente.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
