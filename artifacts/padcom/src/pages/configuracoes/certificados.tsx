import { useRef, useState } from "react";
import { useGetCertificateStatus } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Upload, FileKey, BadgeCheck } from "lucide-react";
import { SettingsPanel, FieldRow } from "@/components/settings/SettingsUI";
import { getCollabToken } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ConfigCertificados() {
  const { toast } = useToast();
  const status = useGetCertificateStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!file) {
      toast({ title: "Selecione o arquivo .pfx/.p12", variant: "destructive" });
      return;
    }
    if (!password) {
      toast({ title: "Informe a senha do certificado", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", password);
      const token = getCollabToken();
      const resp = await fetch(`${BASE}/api/settings/certificate`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; cpf?: string | null };
      if (!resp.ok) {
        toast({ title: json.error || "Falha ao enviar certificado", variant: "destructive" });
        return;
      }
      toast({ title: "Certificado salvo", description: json.cpf ? `CPF do titular: ${json.cpf}` : undefined });
      setFile(null);
      setPassword("");
      if (fileRef.current) fileRef.current.value = "";
      status.refetch();
    } catch {
      toast({ title: "Erro de rede ao enviar certificado", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const st = status.data;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Certificados Digitais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Certificado A1 (ICP-Brasil, arquivo .pfx/.p12) usado para assinar os PDFs com selo verde. Guardado
          cifrado no armazenamento privado — nunca exposto na web.
        </p>
      </header>

      {status.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <SettingsPanel icon={ShieldCheck} title="Certificado A1 Atual" color="emerald">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="screen-3d p-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Situacao</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`paxter-led ${st?.isSet ? "paxter-led-green" : "paxter-led-off"}`} aria-hidden />
                <span className="text-sm font-semibold">{st?.isSet ? "Configurado" : "Ausente"}</span>
              </div>
            </div>
            <div className="screen-3d p-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Arquivo</div>
              <div className="mt-1 text-sm font-medium truncate">{st?.fileName || "—"}</div>
            </div>
            <div className="screen-3d p-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">CPF do titular</div>
              <div className="mt-1 text-sm font-medium">{st?.cpf || "—"}</div>
            </div>
          </div>
          {st?.isSet && (
            <div className="mt-3 inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[13px]">
              <BadgeCheck className="w-4 h-4" />
              Senha {st.hasPassword ? "armazenada com seguranca" : "nao informada"}.
            </div>
          )}
        </SettingsPanel>
      )}

      <SettingsPanel icon={Upload} title="Enviar / Substituir Certificado">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            upload();
          }}
        >
          <FieldRow label="Arquivo do certificado (.pfx ou .p12)" hint="O arquivo e validado com a senha antes de ser salvo.">
            <input
              ref={fileRef}
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="field-engraved w-full text-sm file:mr-3 file:rounded-[4px] file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:text-sm"
            />
          </FieldRow>
          <FieldRow label="Senha do certificado">
            <Input
              className="field-engraved"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha do arquivo .pfx"
            />
          </FieldRow>
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
              <FileKey className="w-4 h-4" /> Maximo 5 MB. Validamos a senha e extraimos o CPF do titular.
            </div>
            <Button type="submit" className="btn-3d" disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Enviando..." : "Enviar Certificado"}
            </Button>
          </div>
        </form>
      </SettingsPanel>
    </div>
  );
}
