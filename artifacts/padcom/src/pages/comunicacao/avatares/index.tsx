/**
 * AvatarManager — Tela de gestão dos Avatares de Voz e Vídeo.
 *
 * TIER SYSTEM (3 níveis — cada nível requer módulo contratado):
 *   Nível 1 — Texto   : mensagem escrita (padrão, sempre disponível)
 *   Nível 2 — Voz     : + áudio MP3 do médico via ElevenLabs
 *   Nível 3 — Avatar  : + vídeo do avatar falando via HeyGen
 *
 * Sistema visual Paxter 3D: panel-3d, bevel-3d, LED de status.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mic, Video, MessageSquare, Settings, Zap,
  AlertCircle, CheckCircle2, XCircle, BarChart3, Send,
} from "lucide-react";
import AvatarConfig from "./AvatarConfig";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ClinicAvatar {
  id:                number;
  empresaId:         number;
  tipo:              number;
  nomeExibido:       string;
  descricao:         string | null;
  elevenLabsVoiceId: string | null;
  heygenAvatarId:    string | null;
  status:            "ativo" | "inativo";
  nivel:             "texto" | "voz" | "video";
  createdAt:         string;
  updatedAt:         string;
}

interface StatusResult {
  elevenlabs?: { ok: boolean; vozes?: number; erro?: string } | null;
  heygen?:     { ok: boolean; avatares?: number; erro?: string } | null;
  todasOk?:   boolean;
}

interface UsoMes {
  totalVoz:      number;
  totalVideo:    number;
  charsVoz:      number;
  segundosVideo: number;
  erros:         number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<number, string> = { 1: "Médico", 2: "Secretária", 3: "Livre" };
const TIPO_ICON:  Record<number, string> = { 1: "👨‍⚕️", 2: "👩‍💼", 3: "✨" };

const NIVEL_CONFIG = {
  texto: {
    label: "Texto",
    Icon:  MessageSquare,
    color: "text-sky-400",
    bg:    "bg-sky-900/30 border-sky-700/50",
    descr: "Mensagem escrita",
  },
  voz: {
    label: "Voz",
    Icon:  Mic,
    color: "text-violet-400",
    bg:    "bg-violet-900/30 border-violet-700/50",
    descr: "Texto + áudio MP3 (ElevenLabs)",
  },
  video: {
    label: "Avatar",
    Icon:  Video,
    color: "text-amber-400",
    bg:    "bg-amber-900/20 border-amber-700/50",
    descr: "Texto + vídeo falando (HeyGen)",
  },
} as const;

// ─── Componentes utilitários ─────────────────────────────────────────────────

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
      ${ok
        ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/60"
        : "bg-red-900/40 text-red-300 border-red-700/60"
      }`}
    >
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function NivelBadge({ nivel }: { nivel: "texto" | "voz" | "video" }) {
  const cfg = NIVEL_CONFIG[nivel] ?? NIVEL_CONFIG.texto;
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Painel de Status das APIs ────────────────────────────────────────────────

function StatusPanel({ status }: { status: Required<StatusResult> }) {
  const el = status.elevenlabs;
  const hg = status.heygen;
  if (!el || !hg) return null;
  return (
    <div className="panel-3d-sub p-4 flex flex-wrap gap-4 items-center">
      <div className="flex items-center gap-2 text-xs text-white/60 font-medium">
        <Zap className="w-4 h-4 text-amber-400" />
        Status das APIs
      </div>
      <StatusChip
        ok={el.ok}
        label={el.ok ? `ElevenLabs — ${el.vozes ?? 0} vozes` : `ElevenLabs — ${el.erro ?? "Erro"}`}
      />
      <StatusChip
        ok={hg.ok}
        label={hg.ok ? `HeyGen — ${hg.avatares ?? 0} avatares` : `HeyGen — ${hg.erro ?? "Erro"}`}
      />
      {!status.todasOk && (
        <p className="w-full text-xs text-amber-400 flex items-center gap-1 mt-1">
          <AlertCircle className="w-3.5 h-3.5" />
          Configure as chaves em <strong className="ml-1">Integrações → ElevenLabs / HeyGen</strong>
        </p>
      )}
    </div>
  );
}

// ─── Painel de Uso (Metering) ────────────────────────────────────────────────

function UsoPanel({ uso }: { uso: UsoMes }) {
  const stats = [
    { label: "Áudios gerados (mês)", valor: String(uso.totalVoz   ?? 0),                           icon: Mic,       color: "text-violet-400" },
    { label: "Vídeos gerados (mês)", valor: String(uso.totalVideo ?? 0),                           icon: Video,     color: "text-amber-400" },
    { label: "Caracteres (TTS)",     valor: Number(uso.charsVoz   ?? 0).toLocaleString("pt-BR"),   icon: BarChart3, color: "text-sky-400" },
    { label: "Segundos de vídeo",    valor: Number(uso.segundosVideo ?? 0).toFixed(1),             icon: BarChart3, color: "text-sky-400" },
  ];
  return (
    <div className="panel-3d-sub p-4">
      <div className="flex items-center gap-2 text-xs text-white/60 font-medium mb-3">
        <BarChart3 className="w-4 h-4 text-sky-400" />
        Uso do Mês Corrente — Instituto Pádua (piloto)
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bevel-3d p-3 rounded flex flex-col gap-1">
              <Icon className={`w-4 h-4 ${s.color}`} />
              <div className="text-white font-bold text-lg leading-tight">{s.valor}</div>
              <div className="text-white/40 text-xs leading-tight">{s.label}</div>
            </div>
          );
        })}
      </div>
      {uso.erros > 0 && (
        <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {uso.erros} erro(s) registrado(s) no mês
        </p>
      )}
    </div>
  );
}

// ─── Painel de Tiers — descrição dos 3 módulos ───────────────────────────────

function TiersPanel() {
  return (
    <div className="panel-3d-sub p-4">
      <div className="flex items-center gap-2 text-xs text-white/60 font-medium mb-3">
        <Zap className="w-4 h-4 text-amber-400" />
        Módulos Disponíveis — Upgrade por Clínica
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["texto", "voz", "video"] as const).map(nivel => {
          const cfg = NIVEL_CONFIG[nivel];
          const { Icon } = cfg;
          return (
            <div key={nivel} className={`rounded border p-3 flex flex-col gap-2 ${cfg.bg}`}>
              <div className={`flex items-center gap-2 font-semibold text-sm ${cfg.color}`}>
                <Icon className="w-4 h-4" />
                Módulo {nivel === "texto" ? "1" : nivel === "voz" ? "2" : "3"} — {cfg.label}
              </div>
              <p className="text-white/50 text-xs leading-snug">{cfg.descr}</p>
              {nivel === "texto" && (
                <span className="text-xs text-emerald-400 font-semibold">Incluso — sem custo adicional</span>
              )}
              {nivel === "voz" && (
                <span className="text-xs text-violet-300 font-semibold">Pay-per-use ou Módulo Full</span>
              )}
              {nivel === "video" && (
                <span className="text-xs text-amber-300 font-semibold">Pay-per-use ou Módulo Full</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card de Avatar ───────────────────────────────────────────────────────────

function AvatarCard({
  avatar,
  onConfig,
}: {
  avatar:   ClinicAvatar;
  onConfig: (av: ClinicAvatar) => void;
}) {
  const isAtivo  = avatar.status === "ativo";
  const temVoz   = Boolean(avatar.elevenLabsVoiceId);
  const temVideo = Boolean(avatar.heygenAvatarId);
  const nivel    = avatar.nivel ?? "texto";

  return (
    <div className="panel-3d p-5 flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{TIPO_ICON[avatar.tipo] ?? "🤖"}</span>
          <div className="flex flex-col gap-1">
            <div className="bevel-3d inline-block px-2 py-0.5 text-xs font-bold tracking-wider text-amber-300">
              {TIPO_LABEL[avatar.tipo] ?? `TIPO ${avatar.tipo}`}
            </div>
            <h3 className="font-semibold text-white/90 leading-tight text-sm">
              {avatar.nomeExibido}
            </h3>
          </div>
        </div>
        {/* LED de status */}
        <span
          className={`paxter-led shrink-0 mt-1 ${isAtivo ? "paxter-led-on" : "paxter-led-off"}`}
          title={isAtivo ? "Ativo" : "Inativo"}
        />
      </div>

      {/* Badge de Nível (tier) */}
      <NivelBadge nivel={nivel as "texto" | "voz" | "video"} />

      {/* Capacidades configuradas */}
      <div className="flex flex-col gap-1.5">
        <CapBadge ok={true}    label="Texto WhatsApp"   Icon={MessageSquare} />
        <CapBadge ok={temVoz}  label="Voz ElevenLabs"  Icon={Mic} />
        <CapBadge ok={temVideo} label="Vídeo HeyGen"    Icon={Video} />
      </div>

      {avatar.descricao && (
        <p className="text-white/40 text-xs leading-snug">{avatar.descricao}</p>
      )}

      {/* Botões */}
      <button
        onClick={() => onConfig(avatar)}
        className="btn-3d-soft flex items-center gap-2 text-xs justify-center"
      >
        <Settings className="w-3.5 h-3.5" />
        Configurar
      </button>
    </div>
  );
}

function CapBadge({ ok, label, Icon }: { ok: boolean; label: string; Icon: React.ElementType }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? "text-white/80" : "text-white/25"}`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 ${ok ? "text-emerald-400" : "text-white/20"}`} />
      {label}
      {ok ? (
        <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />
      ) : (
        <span className="ml-auto text-white/20 text-xs">não configurado</span>
      )}
    </div>
  );
}

// ─── Disparador Manual de Voz ─────────────────────────────────────────────────

function DisparadorVoz({ avatares }: { avatares: ClinicAvatar[] }) {
  const [telefone, setTelefone] = useState("");
  const [texto, setTexto] = useState("");
  const [avatarId, setAvatarId] = useState<number | undefined>();
  const [resultado, setResultado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const avatresComVoz = avatares.filter(a => a.elevenLabsVoiceId && a.status === "ativo");

  async function enviar() {
    if (!telefone.trim() || !texto.trim()) return;
    setEnviando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/avatares/enviar-voz", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ telefone: telefone.trim(), texto, avatarId }),
      });
      const d = await r.json();
      if (d.sent) {
        setResultado(`✅ Áudio enviado para ${d.telefone ?? "o cliente"}`);
      } else {
        setResultado(`⚠️ ${d.error ?? (d.skipped ? "Avatar não configurado" : "Falha no envio")}`);
      }
    } catch (e: any) {
      setResultado(`❌ Erro: ${e?.message}`);
    } finally {
      setEnviando(false);
    }
  }

  if (avatresComVoz.length === 0) return null;

  return (
    <div className="panel-3d-sub p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-white/60 font-medium">
        <Send className="w-4 h-4 text-violet-400" />
        Disparar Voz Manualmente
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Telefone (+5511...)</label>
          <input
            value={telefone}
            onChange={e => setTelefone(e.target.value)}
            placeholder="+5511999999999"
            className="bevel-3d bg-transparent text-white/90 text-sm px-3 py-2 rounded outline-none
              border border-white/10 focus:border-violet-500/60 placeholder-white/25"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Avatar (opcional)</label>
          <select
            value={avatarId ?? ""}
            onChange={e => setAvatarId(e.target.value ? Number(e.target.value) : undefined)}
            className="bevel-3d bg-[#0e1628] text-white/90 text-sm px-3 py-2 rounded
              border border-white/10 focus:border-violet-500/60"
          >
            <option value="">Auto (prioritário)</option>
            {avatresComVoz.map(a => (
              <option key={a.id} value={a.id}>{a.nomeExibido}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/50">Texto para o avatar falar</label>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={3}
          placeholder="Olá, este é um lembrete do Instituto Pádua…"
          className="bevel-3d bg-transparent text-white/90 text-sm px-3 py-2 rounded outline-none
            border border-white/10 focus:border-violet-500/60 resize-none placeholder-white/25"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={enviar}
          disabled={enviando || !telefone.trim() || !texto.trim()}
          className="btn-3d flex items-center gap-2 text-xs disabled:opacity-40"
        >
          <Mic className="w-3.5 h-3.5" />
          {enviando ? "Gerando áudio…" : "Enviar Voz via WhatsApp"}
        </button>
        {resultado && (
          <span className="text-xs text-white/70 leading-snug">{resultado}</span>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AvatarManager() {
  const queryClient = useQueryClient();
  const [configAvatar, setConfigAvatar] = useState<ClinicAvatar | null>(null);

  const { data: avatarData, isLoading: loadingAvatares } = useQuery<{ avatares: ClinicAvatar[] }>({
    queryKey: ["avatares"],
    queryFn:  () => fetch("/api/avatares", { credentials: "include" }).then(r => r.json()),
  });

  const { data: statusData } = useQuery<StatusResult>({
    queryKey:  ["avatares-status"],
    queryFn:   () => fetch("/api/avatares/status", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
    retry:     false,
  });

  const { data: usoData } = useQuery<UsoMes>({
    queryKey:  ["avatares-uso"],
    queryFn:   () => fetch("/api/avatares/uso", { credentials: "include" }).then(r => r.json()),
    staleTime: 120_000,
    retry:     false,
  });

  const avatares = avatarData?.avatares ?? [];

  // Guarda defensivo: status só renderiza se vier com a estrutura correta
  const statusOk =
    statusData != null &&
    typeof statusData === "object" &&
    "elevenlabs" in statusData &&
    "heygen" in statusData &&
    statusData.elevenlabs != null &&
    statusData.heygen != null;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/90 tracking-tight">
            Avatares de Voz e Vídeo
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            Instituto Pádua — piloto ElevenLabs + HeyGen
          </p>
        </div>
      </div>

      {/* Tier cards — módulos disponíveis */}
      <TiersPanel />

      {/* Status das APIs — só renderiza com estrutura válida */}
      {statusOk && <StatusPanel status={statusData as Required<StatusResult>} />}

      {/* Metering — uso do mês */}
      {usoData && typeof usoData.totalVoz === "number" && <UsoPanel uso={usoData} />}

      {/* Grid de avatares */}
      {loadingAvatares ? (
        <div className="text-white/40 text-sm py-8 text-center">Carregando avatares…</div>
      ) : !avatarData?.avatares ? (
        <div className="panel-3d p-6 text-center text-amber-400/80 text-sm">
          <AlertCircle className="w-5 h-5 mx-auto mb-2" />
          Faça login para visualizar os avatares.
        </div>
      ) : avatares.length === 0 ? (
        <div className="panel-3d p-8 text-center text-white/40 text-sm">
          Nenhum avatar encontrado. Os 3 avatares do Instituto Pádua são criados no boot do servidor.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {avatares.map(av => (
            <AvatarCard key={av.id} avatar={av} onConfig={setConfigAvatar} />
          ))}
        </div>
      )}

      {/* Disparador manual de voz */}
      {avatares.length > 0 && <DisparadorVoz avatares={avatares} />}

      {/* Modal de configuração */}
      {configAvatar && (
        <AvatarConfig
          avatar={configAvatar}
          onClose={() => setConfigAvatar(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["avatares"] });
            setConfigAvatar(null);
          }}
        />
      )}
    </div>
  );
}
