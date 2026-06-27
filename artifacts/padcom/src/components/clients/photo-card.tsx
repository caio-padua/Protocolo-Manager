import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Mail, Upload, Link2, Check } from "lucide-react";
import { toast } from "sonner";

const apiBase = import.meta.env.VITE_API_URL || "/api";

interface PhotoCardProps {
  clientId?: number;
  photoUrl: string | null | undefined;
  clientEmail?: string | null;
  onUpdated: () => void;
}

export function ClientPhotoCard({ clientId, photoUrl, clientEmail, onUpdated }: PhotoCardProps) {
  const ready = Number.isInteger(clientId) && (clientId as number) > 0;
  const [sending, setSending] = useState(false);
  const [sendingReg, setSendingReg] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sendLink = async () => {
    setSending(true);
    try {
      const res = await fetch(`${apiBase}/client-photo/send-link/${clientId}`, { method: "POST" });
      if (!res.ok) {
        toast.error("Não foi possível gerar o link.");
        return;
      }
      const data = await res.json();
      setLastLink(data.link);
      if (data.emailSent) {
        toast.success("Link de foto enviado por e-mail ao cliente.");
      } else {
        toast.message("Link de foto gerado. Cliente sem e-mail — copie e envie pelo WhatsApp.");
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
    try {
      const res = await fetch(`${apiBase}/client-registration/send-link/${clientId}`, { method: "POST" });
      if (!res.ok) {
        toast.error("Não foi possível gerar o link de cadastro.");
        return;
      }
      const data = await res.json();
      setLastLink(data.link);
      if (data.emailSent) {
        toast.success("Link de cadastro enviado por e-mail ao cliente.");
      } else {
        toast.message("Link de cadastro gerado. Cliente sem e-mail — copie e envie pelo WhatsApp.");
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

  return (
    <div className="panel-3d-sub p-5 space-y-5 relative overflow-visible">
      <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
        <Camera className="h-3 w-3 text-primary" /> Foto do Cliente
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
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

          {lastLink && (
            <div className="concave-3d p-2 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate flex-1">{lastLink}</span>
              <Button type="button" size="sm" onClick={copyLink} className="btn-3d h-7 px-2">
                <Check className="w-3 h-3 mr-1" /> COPIAR
              </Button>
            </div>
          )}

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
