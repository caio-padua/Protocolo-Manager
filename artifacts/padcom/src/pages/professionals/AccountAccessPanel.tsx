import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { History, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import {
  clearCollabSession,
  getCollabToken,
  setCollabSession,
  type CollabProfessional,
} from "@/lib/collab-auth";

interface OwnProfessional {
  id: number;
  email: string | null;
  cpf: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
}

interface AccountHistoryEvent {
  id: number;
  label: string;
  createdAt: string;
  changes: { field: string; before: string; after: string }[];
}

interface AccountAccessPanelProps {
  professionalId: number;
  onIdentityUpdated: (identity: { email: string | null; cpf: string | null }) => void;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<AccountHistoryEvent[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

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
        cpf: result.professional.cpf,
      } : current);
      setEmail(result.professional.email ?? "");
      setCpf(result.professional.cpf ?? "");
      setIdentityPassword("");
      onIdentityUpdated({
        email: result.professional.email,
        cpf: result.professional.cpf,
      });
      setIdentityMessage("Identificadores atualizados. As outras sessões foram encerradas.");
      setHistoryLoaded(false);
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
    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError("Use uma senha entre 12 e 128 caracteres.");
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
      setHistoryLoaded(false);
    } catch {
      setPasswordError("Erro de conexão. Verifique a rede e tente novamente.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function toggleHistory(checked: boolean) {
    setHistoryOpen(checked);
    if (!checked || historyLoaded) return;
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const token = getCollabToken();
      const response = await fetch("/api/collaborator/me/history", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readError(response, "Não foi possível consultar o histórico."));
      const result = await response.json() as { events?: AccountHistoryEvent[] };
      setHistory(Array.isArray(result.events) ? result.events : []);
      setHistoryLoaded(true);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Falha ao consultar o histórico.");
    } finally {
      setHistoryLoading(false);
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
          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> E-mail e Cadastro de Pessoas Físicas
        </h4>
        <form className="space-y-3" onSubmit={submitIdentity}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="own-account-email">E-mail para entrar e recuperar a senha</Label>
              <Input id="own-account-email" type="email" autoComplete="email" maxLength={254}
                value={email} onChange={(event) => setEmail(event.target.value)} className="field-engraved" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="own-account-cpf">Cadastro de Pessoas Físicas (CPF)</Label>
              <Input id="own-account-cpf" inputMode="numeric" autoComplete="off" maxLength={18}
                value={cpf} onChange={(event) => setCpf(event.target.value)}
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
            {identityBusy ? "Salvando…" : "Salvar e-mail ou CPF"}
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
              Esta conta ainda não tem senha. Crie uma com pelo menos 12 caracteres.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="own-new-password">Nova senha</Label>
              <PasswordInput id="own-new-password" autoComplete="new-password"
                value={newPassword} onChange={(event) => setNewPassword(event.target.value)}
                required minLength={12} maxLength={128} visibilityLabel="nova senha"
                visibilityTestId="toggle-own-new-password" className="field-engraved" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="own-confirm-password">Confirmar nova senha</Label>
              <PasswordInput id="own-confirm-password" autoComplete="new-password"
                value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}
                required minLength={12} maxLength={128} visibilityLabel="confirmação da nova senha"
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

      <section className="concave-3d space-y-3 p-4" aria-labelledby="account-history-title">
        <div className="flex items-center gap-3">
          <History className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <Label htmlFor="own-account-history" id="account-history-title" className="flex-1 text-sm font-semibold">
            Mostrar histórico da conta
          </Label>
          <Switch id="own-account-history" checked={historyOpen} onCheckedChange={toggleHistory} />
        </div>
        {historyOpen ? (
          <div className="space-y-3 border-t border-border/50 pt-3">
            <p className="text-xs text-muted-foreground">
              O histórico não pode ser apagado nesta tela. Senhas e identificadores completos não são exibidos.
            </p>
            {historyLoading ? <p className="text-sm text-muted-foreground" role="status">Carregando histórico…</p> : null}
            {historyError ? (
              <div className="space-y-2" role="alert">
                <p className="text-sm text-destructive">{historyError}</p>
                <Button type="button" variant="outline" className="btn-3d-soft"
                  onClick={() => { setHistoryLoaded(false); void toggleHistory(true); }}>
                  Tentar novamente
                </Button>
              </div>
            ) : null}
            {historyLoaded && !history.length ? (
              <div className="concave-3d p-3 text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</div>
            ) : null}
            {history.length ? (
              <ol className="space-y-3">
                {history.map((event) => (
                  <li key={event.id} className="panel-3d-sub space-y-2 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-semibold">{event.label}</span>
                      <time className="text-xs text-muted-foreground">{formatHistoryDate(event.createdAt)}</time>
                    </div>
                    {event.changes.map((change) => (
                      <div key={`${event.id}-${change.field}`} className="grid gap-2 border-t border-border/40 pt-2 sm:grid-cols-[minmax(8rem,0.35fr)_1fr_1fr]">
                        <span className="text-xs font-semibold text-muted-foreground">{change.field}</span>
                        <span className="min-w-0 break-words text-xs">Anterior: {change.before}</span>
                        <span className="min-w-0 break-words text-xs">Atual: {change.after}</span>
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </section>

      {profile.googleLinked ? (
        <p className="text-xs text-muted-foreground">Acesso Google vinculado a esta conta.</p>
      ) : (
        <div className="concave-3d p-4">
          <p className="text-xs text-muted-foreground">
            O acesso Google ainda não está vinculado. Para mantê-lo, use o fluxo de vínculo da sessão.
          </p>
          <Button type="button" variant="outline" className="btn-3d-soft mt-3"
            onClick={() => navigate(`/sign-in?intent=link&returnTo=${encodeURIComponent("/professionals?selfAccess=1")}`)}>
            Vincular conta Google
          </Button>
        </div>
      )}
    </section>
  );
}
