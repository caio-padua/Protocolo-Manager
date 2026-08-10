import { useRef, useState } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

const apiBase = import.meta.env.VITE_API_URL || "/api";

// Tipos do resultado por canal devolvido pelo Motor Único (Art. 66).
interface CanalResultado {
  canal: string;
  sent: boolean;
  skipped?: boolean;
  link?: string;   // wa.me de fallback (WhatsApp)
  error?: string;
}

interface SendLinkResponse {
  link: string;
  emailSent: boolean;
  emailError?: string;
  resultados?: CanalResultado[];
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

export function ClientPhotoCard({ clientId, photoUrl, clientEmail, onUpdated }: PhotoCardProps) {
  const ready = Number.isInteger(clientId) && (clientId as number) > 0;
  const [sending, setSending] = useState(false);
  const [sendingReg, setSendingReg] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  // Resultados por canal do último envio de link (foto OU cadastro).
  const [lastResultados, setLastResultados] = useState<CanalResultado[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const sendLink = async () => {
    setSending(true);
    setLastResultados([]);
    try {
      const res = await fetch(`${apiBase}/client-photo/send-link/${clientId}`, { method: "POST" });
      if (!res.ok) {
        toast.error("Não foi possível gerar o link.");
        return;
      }
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

  // Link do CADASTRO COMPLETO (dados + foto, com preenchimento por voz). Gêmeo do
  // link de foto, mas aponta para a tela pública /cadastro.
  const sendRegistrationLink = async () => {
    setSendingReg(true);
    setLastResultados([]);
    try {
      const res = await fetch(`${apiBase}/client-registration/send-link/${clientId}`, { method: "POST" });
      if (!res.ok) {
        toast.error("Não foi possível gerar o link de cadastro.");
        return;
      }
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
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/client-photo/admin-upload/${clientId}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        toast.error("Falha ao enviar a foto.");
        return;
      }
      toast.success("Foto atualizada.");
      onUpdated();
    } catch {
      toast.error("Erro ao enviar a foto.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Seção de status de canais (Req. 1-9 da spec captacao-status-canais.md) ──
  // Só renderiza canais que PARTICIPARAM (não filtra pelo nome — canais desconhecidos
  // são omitidos silenciosamente conforme spec, caso extremo 2).
  const canaisConhecidos = lastResultados.filter((r) => CANAL_LABEL[r.canal]);

  return (
    <div className="panel-3d-sub p-5 space-y-5 relative overflow-visible">
      <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
        <Camera className="h-3 w-3 text-primary" /> Foto do Cliente
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
        {/* Foto atual */}
        <div className="concave-3d rounded-[10px] p-1.5 shrink-0">
          <div className="w-28 h-28 rounded-[6px] overflow-hidden bg-muted flex items-center justify-center">
            {photoUrl ? (
              <img src={photoUrl} alt="Foto do cliente" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-10 h-10 text-muted-foreground/50" />
            )}
          </div>
        </div>

        <div className="flex-1 w-full space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {ready
              ? "Envie um link para o cliente subir a foto pelo próprio celular, ou anexe uma foto agora pelo computador."
              : "Salve o cadastro primeiro. Depois de criado, abra o cliente em EDITAR para enviar o link da foto ou anexar a foto."}
          </p>

          {/* Botões de ação */}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={sendRegistrationLink} disabled={!ready || sendingReg} className="btn-3d">
              {sendingReg ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              ENVIAR LINK DE CADASTRO
            </Button>

            <Button type="button" onClick={sendLink} disabled={!ready || sending} className="btn-3d">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              ENVIAR LINK DE FOTO
            </Button>

            <Button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!ready || uploading}
              className="btn-3d"
            >
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              ENVIAR FOTO AGORA
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />
          </div>

          {/* Bloco do link copiável */}
          {lastLink && (
            <div className="concave-3d p-2 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate flex-1">{lastLink}</span>
              <Button type="button" size="sm" onClick={copyLink} className="btn-3d h-7 px-2">
                <Check className="w-3 h-3 mr-1" /> COPIAR
              </Button>
            </div>
          )}

          {/* ── Status de canais (Spec Task #84) ──────────────────────────────
              Aparece logo abaixo do bloco de link, acima do e-mail do cliente.
              Só aparece quando há resultados (ao menos 1 canal tentado). */}
          {canaisConhecidos.length > 0 && (
            <div className="bevel-3d p-3 space-y-1.5">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">
                Canais de entrega
              </p>
              {canaisConhecidos.map((r) => {
                const label = CANAL_LABEL[r.canal];
                // Ícone próprio do canal (Req. 2): Mail=e-mail, Phone=WhatsApp, Send=Telegram
                const CanalIcon = CANAL_ICON[r.canal] ?? Mail;

                if (r.sent && !r.skipped) {
                  // ✓ Enviado — verde
                  return (
                    <div key={r.canal} className="flex items-center gap-2">
                      <CanalIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-[11px] text-emerald-400 font-semibold">{label}</span>
                      <span className="text-[10px] text-muted-foreground">Enviado</span>
                    </div>
                  );
                }
                if (r.skipped) {
                  // — Não vinculado — cinza
                  return (
                    <div key={r.canal} className="flex items-center gap-2">
                      <CanalIcon className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                      <MinusCircle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <span className="text-[10px] text-muted-foreground/60">Não vinculado</span>
                    </div>
                  );
                }
                // ✗ Falhou — âmbar + rótulo "Falhou" + botão wa.me se disponível (Req. 2 e 4)
                return (
                  <div key={r.canal} className="flex flex-wrap items-center gap-2">
                    <CanalIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[11px] text-amber-400 font-semibold">{label}</span>
                    <span className="text-[10px] text-amber-400/80">Falhou</span>
                    {r.error && (
                      <span className="text-[10px] text-muted-foreground">
                        — {truncarErro(r.error)}
                      </span>
                    )}
                    {r.canal === "WHATSAPP" && r.link && (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-3d-soft inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-[6px]"
                      >
                        <ExternalLink className="w-3 h-3" /> Abrir WhatsApp
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* E-mail do cliente */}
          {clientEmail ? (
            <p className="text-[10px] text-muted-foreground/70">
              E-mail do cliente: <span className="font-semibold">{clientEmail}</span>
            </p>
          ) : (
            <p className="text-[10px] text-amber-600">
              Cliente sem e-mail cadastrado — use o link copiado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
