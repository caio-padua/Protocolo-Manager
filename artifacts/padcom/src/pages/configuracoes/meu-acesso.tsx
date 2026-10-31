import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearCollabSession, getCollabToken } from "@/lib/collab-auth";
import {
  formatProfessionalName,
  formatProfessionalRole,
} from "@/lib/format-professional-identity";

interface AccountIdentity {
  name: string;
  role: string;
  category: string;
  crm: string | null;
  registrationCouncil: string | null;
  registrationNumber: string | null;
  loginUsername: string | null;
  hasPassword: boolean;
  active: boolean;
  googleLinked: boolean;
}

interface AccountResponse {
  professional?: AccountIdentity;
  error?: string;
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1.5 border-b border-border/50 py-3 last:border-b-0 sm:grid-cols-[minmax(12rem,0.38fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="concave-3d min-h-10 min-w-0 break-words px-3 py-2 text-sm text-foreground">
        {value}
      </div>
    </div>
  );
}

export default function MeuAcesso() {
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<AccountIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    const token = getCollabToken();
    if (!token) {
      setProfile(null);
      setError("Sua sessão não foi encontrada. Entre novamente para consultar seu acesso.");
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    void fetch("/api/collaborator/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (response.status === 401) {
          clearCollabSession();
          throw new Error("Sua sessão expirou. Entre novamente para consultar seu acesso.");
        }
        if (!response.ok) {
          throw new Error("Não foi possível carregar os dados da sua conta.");
        }
        const result = (await response.json()) as AccountResponse;
        if (!result.professional) {
          throw new Error("O cadastro profissional desta sessão não foi localizado.");
        }
        if (mounted) setProfile(result.professional);
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        setProfile(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha inesperada ao consultar sua conta.",
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [attempt]);

  const registration = profile
    ? [profile.registrationCouncil, profile.registrationNumber]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" ") || profile.crm?.trim() || "—"
    : "—";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="flex items-start gap-3">
        <span className="bevel-3d flex h-11 w-11 shrink-0 items-center justify-center text-sidebar-primary">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Meu Acesso</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Identidade e credenciais do profissional autenticado nesta sessão.
          </p>
        </div>
      </header>

      <section className="panel-3d-sub overflow-hidden">
        <div className="login-card-topbar flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-[#916f32]" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
            Identidade profissional
          </h2>
        </div>

        <div className="login-card-body px-4 py-2 sm:px-5">
          {loading ? (
            <div className="flex min-h-24 items-center gap-2 text-sm text-muted-foreground" role="status">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Consultando a identidade da sessão…
            </div>
          ) : error ? (
            <div className="space-y-3 py-4" role="alert">
              <p className="text-sm text-destructive">{error}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="btn-3d-soft"
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Tentar novamente
                </Button>
                {error.includes("Entre novamente") ? (
                  <Button type="button" onClick={() => navigate("/login")} className="btn-3d-gold">
                    Ir para o acesso
                  </Button>
                ) : null}
              </div>
            </div>
          ) : profile ? (
            <div className="divide-y-0">
              <IdentityRow label="Nome" value={formatProfessionalName(profile.name) || "—"} />
              <IdentityRow
                label="Cargo"
                value={formatProfessionalRole(profile.role, profile.category) || "—"}
              />
              <IdentityRow
                label="Conselho Regional de Medicina (CRM) ou registro profissional"
                value={registration}
              />
              <IdentityRow label="Usuário de acesso" value={profile.loginUsername || "Não configurado"} />
              <IdentityRow label="Conta do profissional" value={profile.active ? "Ativa" : "Inativa"} />
              <IdentityRow
                label="Senha"
                value={
                  profile.hasPassword
                    ? "Cadastrada e protegida; não pode ser consultada"
                    : "Não configurada"
                }
              />
              <IdentityRow
                label="Acesso Google"
                value={profile.googleLinked ? "Vinculado" : "Não vinculado"}
              />

              <div className="mt-4 flex items-start gap-3 rounded-[5px] border border-[#c2a05a]/40 bg-[#c2a05a]/10 p-3 text-sm text-foreground">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#916f32]" aria-hidden="true" />
                <p>
                  Por segurança, o sistema não mostra a senha cadastrada. Ele guarda apenas uma
                  versão protegida e irreversível, que não permite recuperar o texto original.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
