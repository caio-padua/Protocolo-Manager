import { useCallback, useEffect, useRef, useState } from "react";
import { useGetCertificateStatus } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  ShieldAlert,
  Upload,
  FileKey,
  BadgeCheck,
  CalendarClock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { ConsoleShell, IntegrationCard, ExplainRow } from "@/pages/comunicacao/_shared";
import { COLLAB_EVENT, getCollabProfessional, getCollabToken } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Certificado A1 (ICP-Brasil, .pfx/.p12) — caso ESPECIAL (upload + senha, nao e
// chave/valor revelavel), mas reformatado na moldura Padrao 18 para igualar as
// demais telas de credencial. Status real do servidor; senha nunca volta.

// ---------------------------------------------------------------------------
// Hook: verifica o cert carregado EM TEMPO REAL via /api/protocols/carta-pdf-certcheck
// Retorna subject, issuer, serial, validFrom, validTo quando o cert está ativo.
// ---------------------------------------------------------------------------
interface PadesOk {
  ok: true;
  message: string;
  cert: { issuer: string; serial: string; validFrom: string; validTo: string };
}
interface PadesErr {
  ok: false;
  message: string;
  details?: string;
}
type PadesStatus = PadesOk | PadesErr;

function usePadesStatus() {
  const [data, setData] = useState<PadesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [httpError, setHttpError] = useState(false);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setHttpError(false);
    const token = getCollabToken();
    fetch(`${BASE}/api/protocols/carta-pdf-certcheck`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as PadesStatus | null;
        if (!alive) return;
        if (body) {
          setData(body);
        } else {
          setData({ ok: false, message: "Resposta inválida do servidor.", details: String(r.status) });
        }
        setHttpError(false);
      })
      .catch(() => {
        if (alive) setHttpError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [rev]);

  const refetch = useCallback(() => setRev((v) => v + 1), []);
  return { data, loading, httpError, refetch };
}

// ---------------------------------------------------------------------------
// Formata datas ISO/UTC → DD/MM/AAAA pt-BR legível.
// ---------------------------------------------------------------------------
function fmtDate(raw: string | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Painel de runtime PAdES — consulta a rota que efetivamente CARREGA o cert.
// ---------------------------------------------------------------------------
function PadesCertCard() {
  const { data, loading, httpError, refetch } = usePadesStatus();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    refetch();
    // pequeno delay visual para o spinner não piscar instantâneo
    setTimeout(() => setRefreshing(false), 800);
  }

  const ok = data?.ok === true;
  const certData = ok ? (data as PadesOk).cert : null;

  return (
    <IntegrationCard
      icon={CalendarClock}
      name="Assinatura PAdES — Verificação Ao Vivo"
      accent="text-sky-600"
      on={ok && !loading && !httpError}
      pending={loading}
      error={httpError}
      labelOn="Cert ICP-Brasil: OK"
      labelOff="Cert não configurado"
    >
      {/* Subtítulo */}
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        Fonte:{" "}
        <span className="font-semibold text-foreground/80">
          /api/protocols/carta-pdf-certcheck
        </span>
      </p>

      {/* Grid de dados */}
      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Consultando certificado…
        </div>
      ) : httpError ? (
        <div className="concave-3d flex items-start gap-2 px-3 py-2 text-rose-700 dark:text-rose-400">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[12px]">
            Não foi possível contactar o servidor. Verifique se o serviço está no ar.
          </p>
        </div>
      ) : data?.ok === false ? (
        <div className="concave-3d flex items-start gap-2 px-3 py-2 text-rose-700 dark:text-rose-400">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold">{data.message}</p>
            {data.details && (
              <p className="mt-0.5 break-words font-mono text-[10px] opacity-80">{data.details}</p>
            )}
          </div>
        </div>
      ) : certData ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="concave-3d px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Emissor
            </div>
            <div
              className="mt-1 truncate text-sm font-medium text-emerald-700 dark:text-emerald-400"
              title={certData.issuer}
            >
              {certData.issuer || "—"}
            </div>
          </div>
          <div className="concave-3d px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Válido desde
            </div>
            <div className="mt-1 text-sm font-semibold">{fmtDate(certData.validFrom)}</div>
          </div>
          <div className="concave-3d px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Vence em
            </div>
            <div className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {fmtDate(certData.validTo)}
            </div>
          </div>
        </div>
      ) : null}

      {/* Mensagem de sucesso */}
      {ok && !loading && data?.message && (
        <div className="inline-flex items-center gap-2 text-[13px] text-emerald-600 dark:text-emerald-400">
          <BadgeCheck className="h-4 w-4" />
          {data.message}
        </div>
      )}

      {/* Botão de re-verificação */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={loading || refreshing}
        className="gap-2 self-start"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshing ? "animate-spin" : ""}`} />
        Re-verificar
      </Button>
    </IntegrationCard>
  );
}

export default function ConfigCertificados() {
  const { toast } = useToast();
  const [professionalId, setProfessionalId] = useState(() => getCollabProfessional()?.id ?? null);
  useEffect(() => {
    const changed = () => setProfessionalId(getCollabProfessional()?.id ?? null);
    window.addEventListener(COLLAB_EVENT, changed);
    return () => window.removeEventListener(COLLAB_EVENT, changed);
  }, []);
  const status = useGetCertificateStatus({ query: {
    queryKey: ["certificate-status", professionalId], enabled: !!professionalId,
    staleTime: 30_000, refetchOnMount: "always",
  } });
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
      subtitle="Certificado A1 pessoal do médico autenticado. CPF e validade conferidos antes de assinar receitas; arquivo privado e senha cifrada."
    >
      {status.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <IntegrationCard
            icon={ShieldCheck}
            name="Meu Certificado A1"
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

      {/* ── Painel de saúde PAdES ao vivo ── */}
      <section className="mt-2">
        <PadesCertCard />
      </section>
    </ConsoleShell>
  );
}
