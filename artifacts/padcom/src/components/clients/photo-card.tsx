import { useRef, useState, useEffect } from "react";
import { getCollabToken } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Loader2,
  Mail,
  Upload,
  Link2,
  Check,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ExternalLink,
  Phone,
  Send,
  History,
  X,
  Link as LinkIcon,
  type LucideIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

const apiBase = import.meta.env.VITE_API_URL || "/api";

// Tipos do resultado por canal devolvido pelo Motor Único (Art. 66).
interface CanalResultado {
  canal: string;
  sent: boolean;
  skipped?: boolean;
  link?: string;
  error?: string;
}

interface SendLinkResponse {
  link: string;
  emailSent: boolean;
  emailError?: string;
  resultados?: CanalResultado[];
}

interface PhotoHistory {
  id: number;
  photoUrl: string;
  createdAt: string;
}

interface PhotoCardProps {
  clientId?: number;
  photoUrl: string | null | undefined;
  clientEmail?: string | null;
  onUpdated: () => void;
}

/** Rótulo legível por canal interno. */
const CANAL_LABEL: Record<string, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
};

/** Ícone próprio de cada canal (Req. 2 da spec). */
const CANAL_ICON: Record<string, LucideIcon> = {
  EMAIL: Mail,
  WHATSAPP: Phone,
  TELEGRAM: Send,
};

/** Trunca erro longo para exibição (máx 60 caracteres — spec). */
function truncarErro(msg: string): string {
  return msg.length > 60 ? msg.slice(0, 60) + "…" : msg;
}

/** Resume os canais que enviaram de verdade em texto curto (para o toast). */
function resumoCanais(resultados: CanalResultado[]): string {
  const enviados = resultados
    .filter((r) => r.sent && !r.skipped)
    .map((r) => CANAL_LABEL[r.canal] ?? r.canal);
  if (enviados.length === 0) return "";
  if (enviados.length === 1) return ` via ${enviados[0]}`;
  const last = enviados.pop();
  return ` via ${enviados.join(", ")} e ${last}`;
}

/** Formata ISO date para DD/MM/AAAA HH:MM (BRT display). */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
}

// ── Lightbox simples ─────────────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-[600px] w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bevel-3d rounded-full w-8 h-8 flex items-center justify-center text-white z-10"
        >
          <X className="w-4 h-4" />
        </button>
        <img src={src} alt="Foto ampliada" className="w-full rounded-[6px] object-contain" />
      </div>
    </div>
  );
}

// ── Modal de galeria de histórico ─────────────────────────────────────────────
function HistoryModal({
  photos,
  onClose,
}: {
  photos: PhotoHistory[];
  onClose: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div
        className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="panel-3d w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-widest">Fotos Anteriores</h3>
            </div>
            <button onClick={onClose} className="bevel-3d w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Conteúdo */}
          <div className="overflow-y-auto p-5">
            {photos.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                Nenhuma foto anterior registrada.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="flex flex-col gap-1">
                    <button
                      onClick={() => setLightbox(p.photoUrl)}
                      className="concave-3d rounded-[4px] overflow-hidden w-full aspect-square hover:ring-1 hover:ring-primary transition-all"
                    >
                      <img
                        src={p.photoUrl}
                        alt={`Foto ${p.id}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </button>
                    <p className="text-[9px] text-muted-foreground/70 text-center leading-tight">
                      {formatDate(p.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rodapé */}
          <div className="px-5 pb-4">
            <Button type="button" onClick={onClose} className="bevel-3d w-full h-9 text-xs">
              FECHAR
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function ClientPhotoCard({ clientId, photoUrl, clientEmail, onUpdated }: PhotoCardProps) {
  const ready = Number.isInteger(clientId) && (clientId as number) > 0;
  const [sending, setSending] = useState(false);
  const [sendingReg, setSendingReg] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [lastResultados, setLastResultados] = useState<CanalResultado[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Telegram: estado real do vínculo + link individual de liberação (uso único, 7 dias)
  const [tgVinculado, setTgVinculado] = useState<boolean | null>(null);
  const [tgErro, setTgErro] = useState(false);
  const [tgLink, setTgLink] = useState<{ url: string; expiraEm: string } | null>(null);
  const [tgGerando, setTgGerando] = useState(false);
  const authHeaders = (): Record<string, string> => {
    const t = getCollabToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };
  const carregarTelegram = async () => {
    if (!ready) return;
    try {
      const res = await fetch(`${apiBase}/clients/${clientId as number}/comunicacao`, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { telegram?: { vinculado?: boolean } };
      setTgVinculado(d.telegram?.vinculado === true);
      setTgErro(false);
    } catch {
      setTgVinculado(null);
      setTgErro(true);
    }
  };
  useEffect(() => {
    if (ready) void carregarTelegram();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const liberarTelegram = async () => {
    setTgGerando(true);
    try {
      const res = await fetch(`${apiBase}/clients/${clientId as number}/telegram-link`, { method: "POST", headers: authHeaders() });
      if (res.status === 409) {
        await carregarTelegram();
        toast.message("Este cliente já está com o Telegram liberado ou o cadastro está inativo.");
        return;
      }
      if (!res.ok) { toast.error("Não foi possível gerar o link do Telegram."); return; }
      setTgLink((await res.json()) as { url: string; expiraEm: string });
    } catch {
      toast.error("Erro ao gerar o link do Telegram.");
    } finally {
      setTgGerando(false);
    }
  };

  const copiarTelegram = async () => {
    if (!tgLink) return;
    try { await navigator.clipboard.writeText(tgLink.url); toast.success("Link do Telegram copiado."); }
    catch { toast.error("Não foi possível copiar."); }
  };

  // Histórico de fotos
  const [historyPhotos, setHistoryPhotos] = useState<PhotoHistory[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const fetchHistory = async () => {
    if (!ready) return;
    try {
      const token = getCollabToken();
      const res = await fetch(`${apiBase}/client-photo/history/${clientId as number}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as PhotoHistory[];
        setHistoryPhotos(data);
      }
    } catch {
      // falha silenciosa — botão aparece sem badge
    } finally {
      setHistoryLoaded(true);
    }
  };

  // Carrega histórico ao montar (uma vez)
  useEffect(() => {
    if (ready) void fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const sendLink = async () => {
    setSending(true);
    setLastResultados([]);
    try {
      const res = await fetch(`${apiBase}/client-photo/send-link/${clientId}`, { method: "POST" });
      if (!res.ok) { toast.error("Não foi possível gerar o link."); return; }
      const data = (await res.json()) as SendLinkResponse;
      setLastLink(data.link);
      setLastResultados(data.resultados ?? []);
      const canais = resumoCanais(data.resultados ?? []);
      if (canais) {
        toast.success(`Link de foto enviado${canais}.`);
      } else {
        toast.message("Link de foto gerado. Copie e envie pelo canal preferido do cliente.");
      }
    } catch {
      toast.error("Erro ao gerar link.");
    } finally {
      setSending(false);
    }
  };

  const sendRegistrationLink = async () => {
    setSendingReg(true);
    setLastResultados([]);
    try {
      const res = await fetch(`${apiBase}/client-registration/send-link/${clientId}`, { method: "POST" });
      if (!res.ok) { toast.error("Não foi possível gerar o link de cadastro."); return; }
      const data = (await res.json()) as SendLinkResponse;
      setLastLink(data.link);
      setLastResultados(data.resultados ?? []);
      const canais = resumoCanais(data.resultados ?? []);
      if (canais) {
        toast.success(`Link de cadastro enviado${canais}.`);
      } else {
        toast.message("Link de cadastro gerado. Copie e envie pelo canal preferido do cliente.");
      }
    } catch {
      toast.error("Erro ao gerar link de cadastro.");
    } finally {
      setSendingReg(false);
    }
  };

  const copyLink = async () => {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/client-photo/admin-upload/${clientId}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) { toast.error("Falha ao enviar a foto."); return; }
      toast.success("Foto atualizada.");
      onUpdated();
      // Recarrega histórico para o badge atualizar
      void fetchHistory();
    } catch {
      toast.error("Erro ao enviar a foto.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const resultadoDe = (canal: string) => lastResultados.find((r) => r.canal === canal);
  const historyCount = historyPhotos.length;
  const hasHistory = historyLoaded && historyCount > 0;

  /** Texto + ícone + cor (legíveis no tema claro e no escuro) do último envio de um canal. */
  const estadoEnvio = (canal: string): { texto: string; cor: string; Icone: LucideIcon } | null => {
    const r = resultadoDe(canal);
    if (!r) return null;
    if (r.sent && !r.skipped) return { texto: "Enviado agora", cor: "text-emerald-700 dark:text-emerald-400", Icone: CheckCircle2 };
    if (r.skipped) return { texto: "Sem canal para enviar", cor: "text-muted-foreground", Icone: MinusCircle };
    return { texto: r.error ? `Falhou — ${truncarErro(r.error)}` : "Falhou", cor: "text-amber-700 dark:text-amber-400", Icone: XCircle };
  };

  const linhaCanal = (canal: "EMAIL" | "WHATSAPP" | "TELEGRAM") => {
    const Icone = CANAL_ICON[canal] ?? Mail;
    const envio = estadoEnvio(canal);
    const r = resultadoDe(canal);
    let fixo: string;
    if (canal === "EMAIL") fixo = clientEmail ? clientEmail : "Sem e-mail cadastrado";
    else if (canal === "WHATSAPP") fixo = "Usa o celular do cadastro";
    else fixo = tgErro ? "Não foi possível consultar" : tgVinculado === null ? "Consultando…" : tgVinculado ? "Telegram vinculado" : "Ainda não vinculado";
    return (
      <li key={canal} className="flex flex-col items-start gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3" data-testid={`canal-${canal.toLowerCase()}`}>
        <span className="flex items-center gap-2 w-28 shrink-0 text-xs font-bold">
          <Icone className="w-4 h-4 text-primary" /> {CANAL_LABEL[canal]}
        </span>
        <span className="text-[11px] text-muted-foreground w-full min-w-0 break-all sm:w-auto sm:flex-1">{fixo}</span>
        {envio && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${envio.cor}`}>
            <envio.Icone className="w-3.5 h-3.5 shrink-0" /> {envio.texto}
          </span>
        )}
        {canal === "WHATSAPP" && r && !r.sent && r.link && (
          <a href={r.link} target="_blank" rel="noopener noreferrer" className="btn-3d-soft inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-[6px]">
            <ExternalLink className="w-3 h-3" /> Abrir WhatsApp
          </a>
        )}
        {canal === "TELEGRAM" && ready && tgVinculado === true && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Liberado
          </span>
        )}
        {canal === "TELEGRAM" && ready && tgVinculado === false && (
          <Button type="button" size="sm" onClick={liberarTelegram} disabled={tgGerando} className="btn-3d h-8 px-3 text-[11px]" data-testid="liberar-telegram">
            {tgGerando ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            {tgLink ? "GERAR NOVO LINK" : "LIBERAR TELEGRAM"}
          </Button>
        )}
      </li>
    );
  };

  return (
    <>
      {showHistory && (
        <HistoryModal photos={historyPhotos} onClose={() => setShowHistory(false)} />
      )}

      <div className="panel-3d-sub p-5 pt-7 space-y-5 relative overflow-visible">
        <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
          <Camera className="h-3 w-3 text-primary" /> Foto e Contato do Cliente
        </div>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* Foto atual + histórico */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div className="concave-3d rounded-[10px] p-1.5">
              <div className="w-28 h-28 rounded-[6px] overflow-hidden bg-muted flex items-center justify-center">
                {photoUrl ? (
                  <img src={photoUrl} alt="Foto do cliente" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-10 h-10 text-muted-foreground/50" />
                )}
              </div>
            </div>
            {ready && (
              <div className="relative">
                <Button
                  type="button"
                  onClick={() => setShowHistory(true)}
                  className={`btn-3d-soft h-8 px-3 text-[11px] ${!hasHistory ? "opacity-50" : ""}`}
                  title={!hasHistory ? "Nenhuma foto anterior registrada" : `${historyCount} foto(s) anterior(es)`}
                >
                  <History className="w-3.5 h-3.5 mr-1.5" /> HISTÓRICO
                </Button>
                {hasHistory && (
                  <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-[#C9A227] text-[#0d1830] text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow-md pointer-events-none">
                    {historyCount > 9 ? "9+" : historyCount}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 w-full min-w-0 space-y-4">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {ready
                ? "Envie ao cliente o link para ele mesmo completar o cadastro (dados, foto e rubrica) pelo celular, ou anexe a foto agora pelo computador."
                : "Salve o cadastro primeiro. Depois de criado, abra o cliente em EDITAR para enviar o link ou anexar a foto."}
            </p>

            {/* 1. Ações de envio — três botões do mesmo tamanho */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button type="button" onClick={sendRegistrationLink} disabled={!ready || sendingReg} className="btn-3d h-11 text-[11px] px-2">
                {sendingReg ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                LINK DE CADASTRO
              </Button>
              <Button type="button" onClick={sendLink} disabled={!ready || sending} className="btn-3d h-11 text-[11px] px-2">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                LINK DE FOTO
              </Button>
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={!ready || uploading} className="btn-3d h-11 text-[11px] px-2">
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                FOTO AGORA
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            </div>

            {/* Link gerado (copiável) */}
            {lastLink && (
              <div className="concave-3d p-2 flex items-center gap-2 min-w-0">
                <Link2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-[10px] text-muted-foreground truncate min-w-0 flex-1">{lastLink}</span>
                <Button type="button" size="sm" onClick={copyLink} className="btn-3d h-7 px-2 shrink-0">
                  <Check className="w-3 h-3 mr-1" /> COPIAR
                </Button>
              </div>
            )}

            {/* 2. Canais do cliente — sempre visíveis */}
            {ready && (
              <div className="bevel-3d p-3">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-extrabold mb-2">
                  Canais de contato do cliente
                </p>
                <ul className="divide-y divide-border/30">
                  {(["EMAIL", "WHATSAPP", "TELEGRAM"] as const).map(linhaCanal)}
                </ul>
                {!clientEmail && (
                  <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-400">
                    Cliente sem e-mail cadastrado — use o link copiado.
                  </p>
                )}
              </div>
            )}

            {/* 3. Link individual do Telegram + QR */}
            {ready && tgVinculado === false && tgLink && (
              <div className="concave-3d p-3 flex flex-col sm:flex-row items-center gap-4" data-testid="telegram-link-painel">
                <div className="bg-white p-2 rounded-[6px] shrink-0">
                  <QRCodeSVG value={tgLink.url} size={112} />
                </div>
                <div className="min-w-0 flex-1 space-y-2 w-full">
                  <p className="text-xs font-bold flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5 text-primary" /> Link individual do Telegram</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    O cliente aponta a câmera do celular para o QR ou toca no link, abre o bot e fica vinculado sozinho. Vale para um único toque e expira em {formatDate(tgLink.expiraEm)}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={copiarTelegram} className="btn-3d h-8 px-3 text-[11px]">
                      <Check className="w-3.5 h-3.5 mr-1.5" /> COPIAR LINK
                    </Button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Olá! Para receber seus lembretes e falar com a clínica pelo Telegram, toque neste link e depois em INICIAR: ${tgLink.url}`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="btn-3d-soft inline-flex items-center gap-1.5 px-3 h-8 text-[11px] font-bold rounded-[6px]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> ENVIAR PELO WHATSAPP
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
