/**
 * DisparadorAvatar.tsx — Tela "Disparar Avatar" do PADCOM.
 *
 * Permite ao CEO selecionar um avatar, escolher um cliente, digitar/editar
 * o texto, pré-visualizar a voz via player inline e confirmar o envio.
 *
 * Suporta canal VOICE (áudio ElevenLabs) e VIDEO (vídeo HeyGen, assíncrono).
 */
import { useState, useRef, useEffect } from "react";
import { Mic, Video, Search, Send, Loader2, CheckCircle2, XCircle, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Avatar { id: number; nomeExibido: string; tipo: number; status: string; nivel?: string; }
interface Cliente { id: number; name: string; phone: string | null; }

type Canal = "VOICE" | "VIDEO";

interface Props {
  avatares: Avatar[];
  apiBase: string;
}

const NIVEL_LABEL: Record<string, string> = {
  texto: "Texto",
  voz:   "Voz",
  video: "Vídeo",
};

export function DisparadorAvatar({ avatares, apiBase }: Props) {
  const [avatarId,   setAvatarId]   = useState<number | null>(null);
  const [canal,      setCanal]      = useState<Canal>("VOICE");
  const [busca,      setBusca]      = useState("");
  const [clientes,   setClientes]   = useState<Cliente[]>([]);
  const [clienteId,  setClienteId]  = useState<number | null>(null);
  const [texto,      setTexto]      = useState("");
  const [preview,    setPreview]    = useState<string | null>(null); // blob URL do áudio
  const [carregando, setCarregando] = useState(false);
  const [resultado,  setResultado]  = useState<{ ok: boolean; msg: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Buscar lista de clientes quando digitar
  useEffect(() => {
    if (busca.length < 2) { setClientes([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${apiBase}/api/clients?search=${encodeURIComponent(busca)}&limit=10`);
        const d = await r.json();
        setClientes(Array.isArray(d) ? d : (d.clients ?? d.data ?? []));
      } catch { setClientes([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Pré-visualizar voz (gera MP3 e toca inline)
  async function preVisualizarVoz() {
    if (!avatarId || !texto.trim()) return;
    setCarregando(true);
    try {
      const r = await fetch(`${apiBase}/api/avatares/voz/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId, texto }),
      });
      if (!r.ok) { setResultado({ ok: false, msg: "Falha ao gerar prévia" }); return; }
      const blob = await r.blob();
      if (preview) URL.revokeObjectURL(preview);
      const url = URL.createObjectURL(blob);
      setPreview(url);
      setTimeout(() => audioRef.current?.play(), 100);
    } catch (e: any) {
      setResultado({ ok: false, msg: e?.message ?? "Erro ao gerar prévia" });
    } finally { setCarregando(false); }
  }

  // Enviar para o cliente
  async function enviar() {
    if (!avatarId || !clienteId || !texto.trim()) return;
    setCarregando(true);
    setResultado(null);
    try {
      const r = await fetch(`${apiBase}/api/avatares/${avatarId}/disparar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, texto, canal }),
      });
      const d = await r.json();
      if (d.ok) {
        setResultado({
          ok: true,
          msg: canal === "VOICE"
            ? `Áudio enviado com sucesso para ${d.cliente?.nome ?? "cliente"}.`
            : `Vídeo enfileirado. Será entregue quando o HeyGen terminar de gerar (≈2–5 min).`,
        });
        setTexto(""); setClienteId(null); setBusca(""); setPreview(null);
      } else {
        const erro = d.resultado?.[0]?.error ?? d.error ?? "Falha no envio";
        setResultado({ ok: false, msg: erro });
      }
    } catch (e: any) {
      setResultado({ ok: false, msg: e?.message ?? "Erro de rede" });
    } finally { setCarregando(false); }
  }

  const avatarSelecionado = avatares.find(a => a.id === avatarId);
  const clienteSelecionado = clientes.find(c => c.id === clienteId);

  return (
    <div className="panel-3d-sub rounded-xl p-5 space-y-5">
      <h3 className="text-sm font-semibold text-gold uppercase tracking-widest">
        Disparar Avatar
      </h3>

      {/* Selecionar Avatar */}
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
              <span className="ml-2 text-xs opacity-60">{NIVEL_LABEL[a.nivel ?? "texto"]}</span>
            </button>
          ))}
          {avatares.filter(a => a.status === "ativo").length === 0 && (
            <p className="text-xs text-white/40">Nenhum avatar ativo. Ative um avatar no painel acima.</p>
          )}
        </div>
      </div>

      {/* Canal */}
      <div>
        <label className="block text-xs text-sky-300/70 mb-2">2. Canal</label>
        <div className="flex gap-2">
          {(["VOICE", "VIDEO"] as Canal[]).map(c => {
            const Icon: LucideIcon = c === "VOICE" ? Mic : Video;
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
            Vídeo é assíncrono — entregue em ≈2–5 minutos pelo worker automático.
          </p>
        )}
      </div>

      {/* Selecionar Cliente */}
      <div>
        <label className="block text-xs text-sky-300/70 mb-2">3. Cliente</label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={clienteSelecionado ? clienteSelecionado.name : busca}
            onChange={e => { setBusca(e.target.value); setClienteId(null); }}
            placeholder="Buscar por nome..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40"
          />
        </div>
        {clientes.length > 0 && !clienteId && (
          <ul className="mt-1 border border-white/10 rounded-lg bg-[#0a1628] divide-y divide-white/5 max-h-40 overflow-y-auto">
            {clientes.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => { setClienteId(c.id); setBusca(""); setClientes([]); }}
                  className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                >
                  <User className="inline w-3 h-3 mr-1.5 opacity-50" />
                  {c.name}
                  {c.phone && <span className="ml-2 text-xs text-white/40">{c.phone.replace(/\d(?=\d{4})/g, "*")}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Texto / Script */}
      <div>
        <label className="block text-xs text-sky-300/70 mb-2">4. Texto / Script</label>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={4}
          maxLength={3000}
          placeholder="Digite o texto que o avatar vai falar..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 resize-none"
        />
        <p className="text-right text-xs text-white/30 mt-0.5">{texto.length}/3000</p>
      </div>

      {/* Player de prévia de voz */}
      {canal === "VOICE" && (
        <div className="flex items-center gap-2">
          <button
            onClick={preVisualizarVoz}
            disabled={!avatarId || !texto.trim() || carregando}
            className="btn-3d-soft text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
          >
            <Mic className="w-3 h-3" />
            Pré-visualizar voz
          </button>
          {preview && (
            <audio ref={audioRef} controls src={preview} className="h-7 rounded" />
          )}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
          resultado.ok ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                       : "bg-red-500/10 border border-red-500/20 text-red-300"
        }`}>
          {resultado.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                        : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          {resultado.msg}
        </div>
      )}

      {/* Botão Enviar */}
      <button
        onClick={enviar}
        disabled={!avatarId || !clienteId || !texto.trim() || carregando}
        className="bevel-3d w-full py-2.5 text-sm font-semibold text-gold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {carregando
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
          : <><Send className="w-4 h-4" /> Enviar {canal === "VOICE" ? "Áudio" : "Vídeo"}</>
        }
      </button>
    </div>
  );
}
