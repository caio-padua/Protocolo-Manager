import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { formatCpfInput } from "@/lib/cpf";
import {
  clearCollabSession,
  getCollabToken,
  setCollabSession,
  type CollabProfessional,
} from "@/lib/collab-auth";

interface OwnProfessional {
  id: number;
  email: string | null;
  secondaryEmail: string | null;
  cpf: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
}

interface AccountAccessPanelProps {
  professionalId: number;
  onIdentityUpdated: (identity: {
    email: string | null;
    secondaryEmail: string | null;
    cpf: string | null;
  }) => void;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export default function AccountAccessPanel({
  professionalId,
  onIdentityUpdated,
}: AccountAccessPanelProps) {
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<OwnProfessional | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [secondaryEmail, setSecondaryEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [identityPassword, setIdentityPassword] = useState("");
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<
    "loading" | "not_linked" | "verified" | "email_mismatch" | "unverified_or_not_google" | "unavailable"
  >("loading");
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const token = getCollabToken();
    if (!token) {
      setLoadError("Sua sessão não foi encontrada. Entre novamente.");
      setLoading(false);
      return () => { mounted = false; };
    }
    void fetch("/api/collaborator/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401) {
          clearCollabSession();
          throw new Error("Sua sessão expirou. Entre novamente.");
        }
        if (!response.ok) throw new Error("Não foi possível validar a identidade desta sessão.");
        const result = await response.json() as {
          professional?: OwnProfessional & CollabProfessional;
        };
        if (!result.professional) throw new Error("O cadastro da sessão não foi localizado.");
        if (!mounted) return;
        if (result.professional.id !== professionalId) {
          setProfile(null);
          return;
        }
        setProfile(result.professional);
        setEmail(result.professional.email ?? "");
        setSecondaryEmail(result.professional.secondaryEmail ?? "");
        setCpf(result.professional.cpf ?? "");
      })
      .catch((error: unknown) => {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : "Falha ao consultar a conta.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [professionalId]);

  useEffect(() => {
    if (!profile?.googleLinked) {
      setGoogleStatus("not_linked");
      setGoogleEmail(null);
      return;
    }
    let mounted = true;
    const token = getCollabToken();
    void fetch("/api/collaborator/me/google-status", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as {
          status?: "verified" | "email_mismatch" | "unverified_or_not_google" | "unavailable";
          googleEmail?: string | null;
        };
        if (!response.ok) throw new Error("google-status");
        if (!mounted) return;
        setGoogleStatus(result.status ?? "unavailable");
        setGoogleEmail(result.googleEmail ?? null);
      })
      .catch(() => {
        if (mounted) setGoogleStatus("unavailable");
      });
    return () => { mounted = false; };
  }, [profile?.googleLinked]);

  async function submitIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIdentityError(null);
    setIdentityMessage(null);
    setIdentityBusy(true);
    const token = getCollabToken();
    try {
      const response = await fetch("/api/collaborator/me/identity", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: email.trim(),
          secondaryEmail: secondaryEmail.trim(),
          cpf: cpf.trim(),
          currentPassword: identityPassword,
        }),
      });
      if (!response.ok) {
        setIdentityError(await readError(response, "Não foi possível atualizar os identificadores."));
        return;
      }
      const result = await response.json() as {
        token: string;
        professional: OwnProfessional & CollabProfessional;
      };
      setCollabSession(result.token, result.professional, { notify: false });
      setProfile((current) => current ? {
        ...current,
        email: result.professional.email,
        secondaryEmail: result.professional.secondaryEmail,
        cpf: result.professional.cpf,
      } : current);
      setEmail(result.professional.email ?? "");
      setSecondaryEmail(result.professional.secondaryEmail ?? "");
      setCpf(result.professional.cpf ?? "");
      setIdentityPassword("");
      onIdentityUpdated({
        email: result.professional.email,
        secondaryEmail: result.professional.secondaryEmail,
        cpf: result.professional.cpf,
      });
      setIdentityMessage("Identificadores atualizados. As outras sessões foram encerradas.");
    } catch {
      setIdentityError("Erro de conexão. Verifique a rede e tente novamente.");
    } finally {
      setIdentityBusy(false);
    }
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (
      newPassword.length < 10 ||
      newPassword.length > 128 ||
      !/^\p{Lu}/u.test(newPassword) ||
      !/[\p{P}\p{S}]/u.test(newPassword)
    ) {
      setPasswordError("Use pelo menos 10 caracteres, comece com letra maiúscula e inclua um caractere especial.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem.");
      return;
    }
    if (profile?.hasPassword && currentPassword === newPassword) {
      setPasswordError("Escolha uma senha diferente da atual.");
      return;
    }

    setPasswordBusy(true);
    const token = getCollabToken();
    try {
      const response = await fetch(
        profile?.hasPassword
          ? "/api/collaborator/change-password"
          : "/api/collaborator/initial-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            ...(profile?.hasPassword ? { currentPassword } : {}),
            newPassword,
          }),
        },
      );
      if (!response.ok) {
        setPasswordError(await readError(response, "Não foi possível salvar a senha."));
        return;
      }
      const result = await response.json() as {
        token: string;
        professional: CollabProfessional;
      };
      setCollabSession(result.token, result.professional, { notify: false });
      setProfile((current) => current ? { ...current, hasPassword: true } : current);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Senha atualizada. As outras sessões foram encerradas.");
    } catch {
      setPasswordError("Erro de conexão. Verifique a rede e tente novamente.");
    } finally {
      setPasswordBusy(false);
    }
  }

  if (loading) {
    return <div className="panel-3d-sub p-4 text-sm text-muted-foreground" role="status">Validando a conta da sessão…</div>;
  }
  if (profile === null) {
    if (loadError) {
      return <div className="panel-3d-sub p-4 text-sm text-destructive" role="alert">{loadError}</div>;
    }
    return null;
  }

  return (
    <section className="panel-3d-sub mt-6 space-y-5 p-4 sm:p-5" aria-labelledby="account-access-title">
      <div className="bevel-3d flex items-center gap-2 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 id="account-access-title" className="text-[10px] font-black uppercase tracking-[0.16em]">
          Acesso à própria conta
        </h3>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Estes controles só aparecem na ficha da pessoa autenticada. A senha nunca é exibida.
      </p>

      <section className="concave-3d space-y-4 p-4" aria-labelledby="identity-title">
        <h4 id="identity-title" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Identificadores de acesso
        </h4>
        <form className="space-y-3" onSubmit={submitIdentity}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="own-account-email">E-mail principal — login, recuperação e Google</Label>
              <Input id="own-account-email" type="email" autoComplete="email" maxLength={254}
                value={email} onChange={(event) => setEmail(event.target.value)} className="field-engraved" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="own-account-secondary-email">E-mail secundário — contato opcional</Label>
              <Input id="own-account-secondary-email" type="email" autoComplete="email" maxLength={254}
                value={secondaryEmail} onChange={(event) => setSecondaryEmail(event.target.value)}
                className="field-engraved" />
              <p className="text-xs text-muted-foreground">Não permite entrar nem recuperar senha.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="own-account-cpf">Cadastro de Pessoas Físicas (CPF)</Label>
              <Input id="own-account-cpf" inputMode="numeric" autoComplete="off" maxLength={14}
                value={cpf} onChange={(event) => setCpf(formatCpfInput(event.target.value))}
                placeholder="000.000.000-00" className="field-engraved" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            O link de recuperação será enviado somente ao e-mail salvo aqui. A alteração exige sua senha atual.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="own-identity-password">Confirme com sua senha atual</Label>
            <PasswordInput id="own-identity-password" autoComplete="current-password"
              value={identityPassword} onChange={(event) => setIdentityPassword(event.target.value)}
              required maxLength={512} visibilityLabel="senha atual"
              visibilityTestId="toggle-own-identity-password" className="field-engraved" />
          </div>
          {identityError ? <p className="text-sm text-destructive" role="alert">{identityError}</p> : null}
          {identityMessage ? <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{identityMessage}</p> : null}
          <Button type="submit" className="btn-3d-soft" disabled={identityBusy}>
            {identityBusy ? "Salvando…" : "Salvar dados de acesso"}
          </Button>
        </form>
      </section>

      <section className="concave-3d space-y-4 p-4" aria-labelledby="password-title">
        <h4 id="password-title" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <KeyRound className="h-3.5 w-3.5 text-primary" />
          {profile.hasPassword ? "Alterar senha" : "Cadastrar primeira senha"}
        </h4>
        <form className="space-y-3" onSubmit={submitPassword}>
          {profile.hasPassword ? (
            <div className="space-y-1.5">
              <Label htmlFor="own-current-password">Senha atual</Label>
              <PasswordInput id="own-current-password" autoComplete="current-password"
                value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}
                required maxLength={512} visibilityLabel="senha atual"
                visibilityTestId="toggle-own-current-password" className="field-engraved" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Esta conta ainda não tem senha. Crie uma com pelo menos 10 caracteres, começando com maiúscula e contendo um caractere especial.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="own-new-password">Nova senha</Label>
              <PasswordInput id="own-new-password" autoComplete="new-password"
                value={newPassword} onChange={(event) => setNewPassword(event.target.value)}
                required minLength={10} maxLength={128} visibilityLabel="nova senha"
                visibilityTestId="toggle-own-new-password" className="field-engraved" />
              <p className="text-xs text-muted-foreground">
                Pelo menos 10 caracteres, começa com letra maiúscula e inclui um caractere especial.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="own-confirm-password">Confirmar nova senha</Label>
              <PasswordInput id="own-confirm-password" autoComplete="new-password"
                value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}
                required minLength={10} maxLength={128} visibilityLabel="confirmação da nova senha"
                visibilityTestId="toggle-own-confirm-password" className="field-engraved" />
            </div>
          </div>
          {passwordError ? <p className="text-sm text-destructive" role="alert">{passwordError}</p> : null}
          {passwordMessage ? <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{passwordMessage}</p> : null}
          <Button type="submit" className="btn-3d-gold" disabled={passwordBusy}>
            {passwordBusy ? "Salvando…" : profile.hasPassword ? "Alterar minha senha" : "Criar primeira senha"}
          </Button>
        </form>
      </section>

      {profile.googleLinked ? (
        <div className="concave-3d space-y-2 p-4" aria-live="polite">
          <p className="text-sm font-semibold">Conta Google vinculada</p>
          {googleStatus === "loading" ? (
            <p className="text-xs text-muted-foreground">Confirmando o e-mail Google…</p>
          ) : null}
          {googleStatus === "verified" ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              E-mail Google confirmado: <strong>{googleEmail}</strong>
            </p>
          ) : null}
          {googleStatus === "email_mismatch" ? (
            <p className="text-sm text-destructive" role="alert">
              O e-mail Google confirmado (<strong>{googleEmail}</strong>) não corresponde ao e-mail principal
              (<strong>{email || "não informado"}</strong>). A conta não poderá ser usada para entrar até corrigir a divergência.
            </p>
          ) : null}
          {googleStatus === "unverified_or_not_google" ? (
            <p className="text-sm text-destructive" role="alert">
              A conta vinculada não apresentou um e-mail Google confirmado.
            </p>
          ) : null}
          {googleStatus === "unavailable" ? (
            <p className="text-xs text-muted-foreground">
              Não foi possível confirmar o e-mail Google agora. Tente novamente mais tarde.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="concave-3d p-4">
          <p className="text-xs text-muted-foreground">
            O e-mail confirmado da conta Google deve ser igual ao e-mail principal deste cadastro.
          </p>
          <Button type="button" variant="outline" className="btn-3d-soft mt-3"
            disabled={!email.trim()}
            onClick={() => navigate(`/sign-in?intent=link&returnTo=${encodeURIComponent("/professionals?selfAccess=1")}`)}>
            Vincular conta Google
          </Button>
          {!email.trim() ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Cadastre primeiro o e-mail principal na seção acima.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
