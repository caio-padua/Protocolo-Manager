import { useRef, useState } from "react";
import { useGetCertificateStatus } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Upload, FileKey, BadgeCheck } from "lucide-react";
import { ConsoleShell, IntegrationCard, ExplainRow } from "@/pages/comunicacao/_shared";
import { getCollabToken } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Certificado A1 (ICP-Brasil, .pfx/.p12) — caso ESPECIAL (upload + senha, nao e
// chave/valor revelavel), mas reformatado na moldura Padrao 18 para igualar as
// demais telas de credencial. Status real do servidor; senha nunca volta.
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
  const configured = !!st?.isSet;

  return (
    <ConsoleShell
      icon={ShieldCheck}
      title="Certificados Digitais"
      subtitle="Certificado A1 (ICP-Brasil) usado para assinar os PDFs com selo verde. Guardado cifrado, nunca exposto."
    >
      {status.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <IntegrationCard
            icon={ShieldCheck}
            name="Certificado A1 Atual"
            accent="text-emerald-600"
            on={configured}
            pending={status.isLoading}
            error={status.isError}
            labelOn="Configurado"
            labelOff="Ausente"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="concave-3d px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Situação</div>
                <div className="mt-1 text-sm font-semibold">{configured ? "Configurado" : "Ausente"}</div>
              </div>
              <div className="concave-3d px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Arquivo</div>
                <div className="mt-1 truncate text-sm font-medium">{st?.fileName || "—"}</div>
              </div>
              <div className="concave-3d px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">CPF do titular</div>
                <div className="mt-1 text-sm font-medium">{st?.cpf || "—"}</div>
              </div>
            </div>
            {configured && (
              <div className="inline-flex items-center gap-2 text-[13px] text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="h-4 w-4" />
                Senha {st?.hasPassword ? "armazenada com segurança" : "não informada"}.
              </div>
            )}
          </IntegrationCard>

          <IntegrationCard
            icon={Upload}
            name="Enviar / Substituir"
            accent="text-cyan-600"
            on={false}
            pending={false}
            error={false}
            labelOn="Pronto"
            labelOff="Aguardando arquivo"
          >
            <ExplainRow noLed>
              O arquivo <strong>.pfx/.p12</strong> é validado com a senha antes de ser salvo. Máximo
              5&nbsp;MB. Extraímos o CPF do titular automaticamente.
            </ExplainRow>
            <form
              className="concave-3d space-y-3 px-3 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                upload();
              }}
            >
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Arquivo do certificado (.pfx ou .p12)
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pfx,.p12,application/x-pkcs12"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="field-engraved w-full text-sm file:mr-3 file:rounded-[4px] file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Senha do certificado
                </label>
                <Input
                  className="field-engraved"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha do arquivo .pfx"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <FileKey className="h-4 w-4" /> Validamos a senha no envio.
                </span>
                <Button type="submit" className="btn-3d" disabled={uploading}>
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? "Enviando..." : "Enviar"}
                </Button>
              </div>
            </form>
          </IntegrationCard>
        </section>
      )}
    </ConsoleShell>
  );
}
