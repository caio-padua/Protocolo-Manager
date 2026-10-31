import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  clearCollabSession,
  getCollabToken,
  setCollabSession,
  type CollabProfessional,
} from "@/lib/collab-auth";
import {
  formatProfessionalCpf,
  formatProfessionalName,
  formatProfessionalRole,
} from "@/lib/format-professional-identity";

interface AccountIdentity {
  name: string;
  role: string;
  category: string;
  cpf: string | null;
  email: string | null;
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [identityPassword, setIdentityPassword] = useState("");
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);

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
        if (mounted) {
          setProfile(result.professional);
          setEmail(result.professional.email ?? "");
          setCpf(result.professional.cpf ?? "");
        }
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

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword.length < 12) {
      setPasswordError("A nova senha precisa ter pelo menos 12 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("A confirmação não corresponde à nova senha.");
      return;
    }
    const token = getCollabToken();
    if (!token) {
      setPasswordError("Sua sessão expirou. Entre novamente antes de alterar a senha.");
      return;
    }

    setPasswordBusy(true);
    try {
      const response = await fetch("/api/collaborator/change-password", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json() as {
        ok?: boolean;
        token?: string;
        professional?: CollabProfessional;
        error?: string;
      };
      if (response.status === 401 && !result.token) {
        clearCollabSession();
        setPasswordError(result.error ?? "A senha atual não confere ou sua sessão expirou.");
        return;
      }
      if (!response.ok || !result.token || !result.professional) {
        setPasswordError(result.error ?? "Não foi possível alterar a senha.");
        return;
      }
      setCollabSession(result.token, result.professional, { notify: false });
      setProfile((current) => current ? { ...current, hasPassword: true } : current);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Senha alterada. As outras sessões foram encerradas.");
    } catch {
      setPasswordError("Falha de conexão. A senha não foi confirmada como alterada.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function initializePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError("A senha precisa ter entre 12 e 128 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("A confirmação não corresponde à nova senha.");
      return;
    }
    const token = getCollabToken();
    if (!token) {
      setPasswordError("Sua sessão expirou. Entre novamente antes de criar a senha.");
      return;
    }

    setPasswordBusy(true);
    try {
      const response = await fetch("/api/collaborator/initial-password", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword }),
      });
      const result = await response.json() as {
        ok?: boolean;
        token?: string;
        professional?: CollabProfessional;
        error?: string;
      };
      if (response.status === 401) {
        clearCollabSession();
        setPasswordError(result.error ?? "Sua sessão expirou. Entre novamente.");
        return;
      }
      if (!response.ok || !result.token || !result.professional) {
        setPasswordError(result.error ?? "Não foi possível criar a primeira senha.");
        return;
      }
      setCollabSession(result.token, result.professional, { notify: false });
      setProfile((current) => current ? { ...current, hasPassword: true } : current);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Primeira senha cadastrada. As outras sessões foram encerradas.");
    } catch {
      setPasswordError("Falha de conexão. A senha não foi confirmada como cadastrada.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function updateLoginIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIdentityError(null);
    setIdentityMessage(null);
    const token = getCollabToken();
    if (!token) {
      setIdentityError("Sua sessão expirou. Entre novamente antes de alterar seus dados.");
      return;
    }

    setIdentityBusy(true);
    try {
      const response = await fetch("/api/collaborator/me/identity", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, cpf, currentPassword: identityPassword }),
      });
      const result = await response.json() as {
        token?: string;
        professional?: CollabProfessional & { email?: string | null; cpf?: string | null };
        error?: string;
      };
      if (!response.ok || !result.token || !result.professional) {
        setIdentityError(result.error ?? "Não foi possível atualizar os dados de acesso.");
        return;
      }
      setCollabSession(result.token, result.professional);
      setProfile((current) => current
        ? {
            ...current,
            email: result.professional?.email ?? current.email,
            cpf: result.professional?.cpf ?? current.cpf,
          }
        : current);
      setEmail(result.professional.email ?? "");
      setCpf(result.professional.cpf ?? "");
      setIdentityPassword("");
      setIdentityMessage("Dados atualizados. As outras sessões foram encerradas.");
    } catch {
      setIdentityError("Falha de conexão. A alteração não foi confirmada.");
    } finally {
      setIdentityBusy(false);
    }
  }

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
                label="Cadastro de Pessoas Físicas (CPF)"
                value={formatProfessionalCpf(profile.cpf, true)}
              />
              <IdentityRow label="E-mail cadastrado" value={profile.email?.trim() || "Não cadastrado"} />
              <IdentityRow
                label="Conselho Regional de Medicina (CRM) ou registro profissional"
                value={registration}
              />
              <IdentityRow label="Usuário de acesso atual" value={profile.loginUsername || "Não configurado"} />
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

              <section className="mt-5 overflow-hidden rounded-[6px] border border-border/70">
                <div className="login-card-topbar flex items-center gap-2 border-b border-border/60 px-4 py-3">
                  <ShieldCheck className="h-4 w-4 text-[#916f32]" aria-hidden="true" />
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                    E-mail e CPF para entrar
                  </h2>
                </div>
                <div className="login-card-body p-4">
                  <form className="space-y-3" onSubmit={updateLoginIdentity}>
                    <p className="text-xs text-muted-foreground">
                      Informe pelo menos um identificador. Depois de cadastrado, o usuário antigo deixa de funcionar.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="account-email">E-mail</Label>
                        <Input
                          id="account-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          maxLength={254}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="account-cpf">Cadastro de Pessoas Físicas (CPF)</Label>
                        <Input
                          id="account-cpf"
                          inputMode="numeric"
                          autoComplete="off"
                          value={cpf}
                          onChange={(event) => setCpf(event.target.value)}
                          maxLength={18}
                          placeholder="000.000.000-00"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="identity-current-password">Confirme com sua senha atual</Label>
                        <PasswordInput
                        id="identity-current-password"
                          data-testid="input-identity-current-password"
                          visibilityLabel="senha atual"
                          visibilityTestId="toggle-password-visibility-identity"
                        autoComplete="current-password"
                        value={identityPassword}
                        onChange={(event) => setIdentityPassword(event.target.value)}
                        required
                        maxLength={512}
                      />
                    </div>
                    {identityError ? (
                      <p className="text-sm text-destructive" role="alert">{identityError}</p>
                    ) : null}
                    {identityMessage ? (
                      <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
                        {identityMessage}
                      </p>
                    ) : null}
                    <Button type="submit" className="btn-3d-soft" disabled={identityBusy}>
                      {identityBusy ? "Atualizando..." : "Salvar e-mail ou CPF"}
                    </Button>
                  </form>
                </div>
              </section>

              <section className="mt-4 overflow-hidden rounded-[6px] border border-border/70">
                <div className="login-card-topbar flex items-center gap-2 border-b border-border/60 px-4 py-3">
                  <KeyRound className="h-4 w-4 text-[#916f32]" aria-hidden="true" />
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                    Alterar minha senha
                  </h2>
                </div>
                <div className="login-card-body p-4">
                  {profile.hasPassword ? (
                    <form className="space-y-3" onSubmit={changePassword}>
                      <div className="space-y-1.5">
                        <Label htmlFor="current-password">Senha atual</Label>
                        <PasswordInput
                          id="current-password"
                          data-testid="input-current-password"
                          visibilityLabel="senha atual"
                          visibilityTestId="toggle-password-visibility-current"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          required
                          maxLength={512}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="new-password">Nova senha</Label>
                          <PasswordInput
                            id="new-password"
                            data-testid="input-new-password"
                            visibilityLabel="nova senha"
                            visibilityTestId="toggle-password-visibility-new"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            required
                            minLength={12}
                            maxLength={128}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                          <PasswordInput
                            id="confirm-password"
                            data-testid="input-confirm-password"
                            visibilityLabel="confirmacao da nova senha"
                            visibilityTestId="toggle-password-visibility-confirm"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            required
                            minLength={12}
                            maxLength={128}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Use pelo menos 12 caracteres. A troca encerra as sessões antigas em outros aparelhos.
                      </p>
                      {passwordError ? (
                        <p className="text-sm text-destructive" role="alert">{passwordError}</p>
                      ) : null}
                      {passwordMessage ? (
                        <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
                          {passwordMessage}
                        </p>
                      ) : null}
                      <Button type="submit" className="btn-3d-gold" disabled={passwordBusy}>
                        {passwordBusy ? "Alterando..." : "Salvar nova senha"}
                      </Button>
                    </form>
                  ) : (
                    <form className="space-y-3" onSubmit={initializePassword}>
                      <p className="text-sm text-muted-foreground">
                        Sua sessão autenticada permite criar uma senha somente porque esta conta ainda não tem uma.
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-password">Criar senha</Label>
                        <PasswordInput
                          id="new-password"
                          data-testid="input-initial-password"
                          visibilityLabel="nova senha"
                          visibilityTestId="toggle-password-visibility-initial"
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          required
                          minLength={12}
                          maxLength={128}
                          disabled={passwordBusy}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirm-password">Confirmar senha</Label>
                        <PasswordInput
                          id="confirm-password"
                          data-testid="input-initial-password-confirm"
                          visibilityLabel="confirmacao da nova senha"
                          visibilityTestId="toggle-password-visibility-initial-confirm"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          required
                          minLength={12}
                          maxLength={128}
                          disabled={passwordBusy}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Use pelo menos 12 caracteres. Ao salvar, as outras sessões serão encerradas.
                      </p>
                      {passwordError ? (
                        <p className="text-sm text-destructive" role="alert">{passwordError}</p>
                      ) : null}
                      {passwordMessage ? (
                        <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
                          {passwordMessage}
                        </p>
                      ) : null}
                      <Button type="submit" className="btn-3d-gold" disabled={passwordBusy}>
                        {passwordBusy ? "Cadastrando..." : "Criar primeira senha"}
                      </Button>
                    </form>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
