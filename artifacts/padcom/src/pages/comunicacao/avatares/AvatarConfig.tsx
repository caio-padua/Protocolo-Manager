/**
 * AvatarConfig — Modal/drawer de configuração de um avatar.
 *
 * Permite:
 *  - Editar nome de exibição e descrição
 *  - Escolher voz ElevenLabs (lista da conta)
 *  - Colar ID do avatar HeyGen
 *  - Ativar/desativar o avatar
 *  - Testar a voz com texto livre (player de áudio inline)
 *  - Gerar vídeo de preview (HeyGen assíncrono com polling)
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Mic, Video, Play, Loader2, CheckCircle2, Volume2 } from "lucide-react";


// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ClinicAvatar {
  id:                number;
  tipo:              number;
  nomeExibido:       string;
  descricao:         string | null;
  elevenLabsVoiceId: string | null;
  heygenAvatarId:    string | null;
  status:            "ativo" | "inativo";
}

interface ElevenLabsVoz {
  voice_id:    string;
  name:        string;
  category:    string;
  description: string | null;
  preview_url: string | null;
}

interface HeyGenAvatar {
  avatar_id:         string;
  avatar_name:       string;
  gender:            string | null;
  preview_image_url: string | null;
}

interface Props {
  avatar:   ClinicAvatar;
  onClose:  () => void;
  onSaved:  () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AvatarConfig({ avatar, onClose, onSaved }: Props) {
  // Formulário
  const [nomeExibido,       setNomeExibido]       = useState(avatar.nomeExibido);
  const [descricao,         setDescricao]         = useState(avatar.descricao ?? "");
  const [voiceId,           setVoiceId]           = useState(avatar.elevenLabsVoiceId ?? "");
  const [heygenAvatarId,    setHeygenAvatarId]    = useState(avatar.heygenAvatarId ?? "");
  const [status,            setStatus]            = useState<"ativo" | "inativo">(avatar.status);

  // Teste de voz
  const [textoTeste,        setTextoTeste]        = useState("Olá, aqui é o Instituto Pádua. Sua saúde é nossa prioridade.");
  const [audioUrl,          setAudioUrl]          = useState<string | null>(null);
  const [gerindoVoz,        setGerindoVoz]        = useState(false);
  const [erroVoz,           setErroVoz]           = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Teste de vídeo
  const [videoId,           setVideoId]           = useState<string | null>(null);
  const [videoStatus,       setVideoStatus]       = useState<string | null>(null);
  const [videoUrl,          setVideoUrl]          = useState<string | null>(null);
  const [gerindoVideo,      setGerindoVideo]      = useState(false);
  const [erroVideo,         setErroVideo]         = useState<string | null>(null);

  // Salvar
  const [salvando, setSalvando] = useState(false);
  const [salvoOk,  setSalvoOk]  = useState(false);

  // ─── Fetch vozes ElevenLabs ────────────────────────────────────────────────

  const { data: vozesData, isLoading: loadingVozes, error: erroFetchVozes } = useQuery<{ vozes: ElevenLabsVoz[] }>({
    queryKey: ["elevenlabs-vozes"],
    queryFn:  () => fetch("/api/avatares/vozes", { credentials: "include" }).then(r => r.json()),
    staleTime: 300_000,
  });

  // ─── Fetch avatares HeyGen ─────────────────────────────────────────────────

  const { data: hgData, isLoading: loadingHg } = useQuery<{ avatares: HeyGenAvatar[] }>({
    queryKey: ["heygen-avatares"],
    queryFn:  () => fetch("/api/avatares/hg-avatars", { credentials: "include" }).then(r => r.json()),
    staleTime: 300_000,
  });

  const vozes   = vozesData?.vozes   ?? [];
  const hgAvatares = hgData?.avatares ?? [];

  // ─── Polling de status do vídeo ───────────────────────────────────────────

  useEffect(() => {
    if (!videoId || videoStatus === "completed" || videoStatus === "failed") return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/avatares/video/${videoId}/status`, { credentials: "include" });
        const d = await r.json();
        setVideoStatus(d.status ?? null);
        if (d.videoUrl) setVideoUrl(d.videoUrl);
        if (d.status === "completed" || d.status === "failed") {
          clearInterval(timer);
          setGerindoVideo(false);
        }
      } catch { /* ignora erros de polling */ }
    }, 4000);
    return () => clearInterval(timer);
  }, [videoId, videoStatus]);

  // ─── Ações ─────────────────────────────────────────────────────────────────

  async function handleTestarVoz() {
    if (!voiceId) { setErroVoz("Selecione uma voz primeiro."); return; }
    if (!textoTeste.trim()) { setErroVoz("Digite um texto para testar."); return; }
    setGerindoVoz(true);
    setErroVoz(null);
    setAudioUrl(null);
    try {
      const r = await fetch("/api/avatares/voz/gerar", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ texto: textoTeste, voiceId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Erro ${r.status}`);
      }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      setAudioUrl(url);
      setTimeout(() => audioRef.current?.play(), 100);
    } catch (e: any) {
      setErroVoz(e?.message ?? "Erro ao gerar áudio");
    } finally {
      setGerindoVoz(false);
    }
  }

  async function handleGerarVideo() {
    if (!heygenAvatarId) { setErroVideo("Configure o ID do avatar HeyGen primeiro."); return; }
    setGerindoVideo(true);
    setErroVideo(null);
    setVideoId(null);
    setVideoStatus(null);
    setVideoUrl(null);
    try {
      const r = await fetch("/api/avatares/video/gerar", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ avatarId: heygenAvatarId, texto: textoTeste, voiceId: voiceId || undefined }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Erro ${r.status}`);
      }
      const d = await r.json();
      setVideoId(d.videoId);
      setVideoStatus("pending");
    } catch (e: any) {
      setErroVideo(e?.message ?? "Erro ao gerar vídeo");
      setGerindoVideo(false);
    }
  }

  async function handleSalvar() {
    setSalvando(true);
    setSalvoOk(false);
    try {
      const r = await fetch(`/api/avatares/${avatar.id}`, {
        method:      "PUT",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          nomeExibido:       nomeExibido.trim() || avatar.nomeExibido,
          descricao:         descricao.trim() || null,
          elevenLabsVoiceId: voiceId || null,
          heygenAvatarId:    heygenAvatarId || null,
          status,
        }),
      });
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      setSalvoOk(true);
      setTimeout(onSaved, 800);
    } catch (e: any) {
      alert(`Erro ao salvar: ${e?.message}`);
    } finally {
      setSalvando(false);
    }
  }

  // ─── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="panel-3d w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col gap-5 p-6">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white/90 text-lg">Configurar Avatar</h2>
          <button onClick={onClose} className="btn-3d-soft p-1.5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nome e descrição */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 font-medium block mb-1.5">Nome de exibição</label>
            <input
              className="field-engraved w-full rounded px-3 py-2 text-sm"
              value={nomeExibido}
              onChange={e => setNomeExibido(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-white/50 font-medium block mb-1.5">Descrição (opcional)</label>
            <textarea
              className="field-engraved w-full rounded px-3 py-2 text-sm resize-none"
              rows={2}
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
            />
          </div>
        </div>

        {/* Voz ElevenLabs */}
        <div className="panel-3d-sub p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <Mic className="w-4 h-4" /> ElevenLabs — Voz
          </div>
          {loadingVozes ? (
            <p className="text-xs text-white/40">Carregando vozes…</p>
          ) : erroFetchVozes || vozes.length === 0 ? (
            <p className="text-xs text-red-400">
              {erroFetchVozes ? "API ElevenLabs não configurada — configure em Integrações." : "Nenhuma voz disponível."}
            </p>
          ) : (
            <select
              className="field-engraved w-full rounded px-3 py-2 text-sm"
              value={voiceId}
              onChange={e => setVoiceId(e.target.value)}
            >
              <option value="">Selecione uma voz…</option>
              {vozes.map(v => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name} ({v.category})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Avatar HeyGen */}
        <div className="panel-3d-sub p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
            <Video className="w-4 h-4" /> HeyGen — Avatar em Vídeo
          </div>
          {loadingHg ? (
            <p className="text-xs text-white/40">Carregando avatares HeyGen…</p>
          ) : hgAvatares.length > 0 ? (
            <select
              className="field-engraved w-full rounded px-3 py-2 text-sm"
              value={heygenAvatarId}
              onChange={e => setHeygenAvatarId(e.target.value)}
            >
              <option value="">Selecione um avatar…</option>
              {hgAvatares.map(a => (
                <option key={a.avatar_id} value={a.avatar_id}>
                  {a.avatar_name} {a.gender ? `(${a.gender})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <div>
              <label className="text-xs text-white/50 font-medium block mb-1.5">
                ID do avatar HeyGen (cole manualmente)
              </label>
              <input
                className="field-engraved w-full rounded px-3 py-2 text-sm"
                placeholder="ex.: AvatarVideoFrontV20240807-7je83…"
                value={heygenAvatarId}
                onChange={e => setHeygenAvatarId(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Área de teste */}
        <div className="panel-3d-sub p-4 space-y-3">
          <div className="text-xs font-semibold text-white/60">Texto de teste</div>
          <textarea
            className="field-engraved w-full rounded px-3 py-2 text-sm resize-none"
            rows={3}
            placeholder="Digite o texto que o avatar vai falar…"
            value={textoTeste}
            onChange={e => setTextoTeste(e.target.value)}
          />

          {/* Botões de teste */}
          <div className="flex gap-3 flex-wrap">
            <button
              className="btn-3d-soft flex items-center gap-2 text-xs px-4 py-2"
              onClick={handleTestarVoz}
              disabled={gerindoVoz || !voiceId}
            >
              {gerindoVoz
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Volume2 className="w-3.5 h-3.5" />
              }
              Testar Voz
            </button>

            <button
              className="btn-3d-soft flex items-center gap-2 text-xs px-4 py-2"
              onClick={handleGerarVideo}
              disabled={gerindoVideo || !heygenAvatarId}
            >
              {gerindoVideo
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />
              }
              Gerar Vídeo Preview
            </button>
          </div>

          {/* Player de áudio */}
          {audioUrl && (
            <div className="concave-3d rounded p-3 flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <audio ref={audioRef} controls src={audioUrl} className="w-full h-8" />
            </div>
          )}
          {erroVoz && (
            <p className="text-xs text-red-400">{erroVoz}</p>
          )}

          {/* Status do vídeo */}
          {videoId && (
            <div className="concave-3d rounded p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 text-white/60">
                {videoStatus === "completed"
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  : <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                }
                <span>
                  Vídeo: <strong>{videoStatus ?? "aguardando…"}</strong>
                </span>
              </div>
              {videoUrl && (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline underline-offset-2"
                >
                  Abrir vídeo pronto →
                </a>
              )}
            </div>
          )}
          {erroVideo && <p className="text-xs text-red-400">{erroVideo}</p>}
        </div>

        {/* Status do avatar */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 font-medium">Status do avatar</span>
          <button
            onClick={() => setStatus(s => s === "ativo" ? "inativo" : "ativo")}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${status === "ativo" ? "bg-emerald-600" : "bg-white/20"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                ${status === "ativo" ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
          <span className={`text-xs font-semibold ${status === "ativo" ? "text-emerald-400" : "text-white/30"}`}>
            {status === "ativo" ? "Ativo" : "Inativo"}
          </span>
        </div>

        {/* Ações finais */}
        <div className="flex gap-3 pt-2 border-t border-white/10">
          <button className="btn-3d-soft flex-1 py-2 text-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-3d flex-1 py-2 text-sm flex items-center justify-center gap-2"
            onClick={handleSalvar}
            disabled={salvando}
          >
            {salvando
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : salvoOk
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : null
            }
            {salvoOk ? "Salvo!" : "Salvar configuração"}
          </button>
        </div>

      </div>
    </div>
  );
}
