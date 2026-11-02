import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCollabToken,
  setCollabSession,
  clearCollabSession,
  type CollabProfessional,
} from "@/lib/collab-auth";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { clerkPublishableKey } from "@/lib/clerk-app";
import { useScreenTheme } from "@/components/theme/useScreenTheme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface BootstrapStatus {
  needsBootstrap: boolean;
  staff: CollabProfessional[];
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formatLoginIdentifier(value: string): string {
  if (/[a-z@]/i.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length > 11) return value;
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function loginIdentifierForRequest(value: string): string {
  return /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value)
    ? value.replace(/\D/g, "")
    : value;
}

// Página de login dedicada do Padaxor (Item 11 — Onda 8.3).
// Vive em /login, fora do Layout, sem CollaboratorGate.
// Após autenticação, redireciona para `returnTo` (query param) ou para /.
export default function LoginPage() {
  const [, navigate] = useLocation();
  const { theme, toggle } = useScreenTheme("dark", "paxter.login-theme");
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [professionalId, setProfessionalId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devRecoveryChallenge, setDevRecoveryChallenge] = useState<string | null>(null);
  const [devRecoveryPassword, setDevRecoveryPassword] = useState("");
  const [devRecoveryConfirmation, setDevRecoveryConfirmation] = useState("");
  const [devRecoveryError, setDevRecoveryError] = useState<string | null>(null);
  const [recoveryRequestMode, setRecoveryRequestMode] = useState(
    () => new URLSearchParams(window.location.search).get("recover") === "1",
  );
  const [recoveryToken, setRecoveryToken] = useState(
    () => new URLSearchParams(window.location.search).get("recoveryToken") ?? "",
  );
  const [recoveryIdentifier, setRecoveryIdentifier] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirmation, setRecoveryConfirmation] = useState("");

  useEffect(() => {
    if (!recoveryToken) return;
    const currentUrl = new URL(window.location.href);
    if (!currentUrl.searchParams.has("recoveryToken")) return;
    currentUrl.searchParams.delete("recoveryToken");
    window.history.replaceState(
      window.history.state,
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
  }, [recoveryToken]);

  // Se já tem sessão válida, redireciona sem mostrar o formulário.
  useEffect(() => {
    if (recoveryToken || recoveryRequestMode) return;
    const t = getCollabToken();
    if (!t) return;
    fetch("/api/collaborator/me", { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => {
        const dest = getReturnTo();
        navigate(dest, { replace: true });
      })
      .catch(() => clearCollabSession());
  }, [navigate, recoveryRequestMode, recoveryToken]);

  useEffect(() => {
    fetch("/api/collaborator/bootstrap-status")
      .then((r) => r.json())
      .then((d: BootstrapStatus) => setStatus(d))
      .catch(() => setStatus({ needsBootstrap: false, staff: [] }));
  }, []);

  const isBootstrap = status?.needsBootstrap === true;
  const googleStatus = new URLSearchParams(window.location.search).get("google");

  function getReturnTo(): string {
    try {
      const params = new URLSearchParams(window.location.search);
      const rt = params.get("returnTo");
      if (
        rt &&
        rt.startsWith("/") &&
        !rt.startsWith("//") &&
        !rt.includes("\\") &&
        !rt.startsWith("/login")
      ) return rt;
    } catch { /* */ }
    return "/";
  }

  function beginGoogleLogin() {
    const returnTo = getReturnTo();
    navigate(`/sign-in?intent=login&returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function requestPasswordRecovery(e: React.FormEvent) {
    e.preventDefault();
    setRecoveryError(null);
    setRecoveryNotice(null);
    setBusy(true);
    try {
      const res = await postJson("/api/collaborator/password-recovery/request", {
        identifier: loginIdentifierForRequest(recoveryIdentifier.trim()),
      });
      if (!res.ok) {
        setRecoveryError("Não foi possível processar o pedido. Tente novamente.");
        return;
      }
      const data = await res.json() as { message?: string };
      setRecoveryNotice(
        data.message ??
          "Se houver uma conta ativa com esse identificador e e-mail cadastrado, enviaremos as instruções.",
      );
    } catch {
      setRecoveryError("Erro de conexão. Verifique a rede e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function completePasswordRecovery(e: React.FormEvent) {
    e.preventDefault();
    setRecoveryError(null);
    if (recoveryPassword.length < 12 || recoveryPassword.length > 128) {
      setRecoveryError("Use uma senha entre 12 e 128 caracteres.");
      return;
    }
    if (recoveryPassword !== recoveryConfirmation) {
      setRecoveryError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const res = await postJson("/api/collaborator/password-recovery/complete", {
        recoveryToken,
        newPassword: recoveryPassword,
      });
      const data = await res.json();
      if (!res.ok || typeof data?.token !== "string" || !data?.professional) {
        setRecoveryError(data?.error ?? "O link não pode ser usado. Solicite uma nova recuperação.");
        return;
      }
      setCollabSession(data.token, data.professional);
      navigate(getReturnTo(), { replace: true });
    } catch {
      setRecoveryError("Erro de conexão. O link não foi confirmado; tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let res: Response;
      if (isBootstrap) {
        if (!professionalId) { setError("Escolha o profissional."); setBusy(false); return; }
        res = await postJson("/api/collaborator/bootstrap", {
          professionalId: Number(professionalId),
          username,
          password,
        });
      } else {
        res = await postJson("/api/collaborator/login", {
          identifier: loginIdentifierForRequest(username),
          password,
        });
      }
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Credenciais incorretas."); setBusy(false); return; }
      setCollabSession(data.token, data.professional);
      navigate(getReturnTo(), { replace: true });
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setBusy(false);
    }
  }

  async function startDevelopmentRecovery() {
    setBusy(true);
    setDevRecoveryError(null);
    try {
      const res = await postJson("/api/collaborator/dev-primary-recovery/start", {});
      const data = await res.json();
      if (!res.ok || typeof data?.challenge !== "string") {
        setDevRecoveryError(data?.error ?? "Não foi possível iniciar a recuperação.");
        return;
      }
      setDevRecoveryChallenge(data.challenge);
    } catch {
      setDevRecoveryError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function completeDevelopmentRecovery(e: React.FormEvent) {
    e.preventDefault();
    setDevRecoveryError(null);
    if (devRecoveryPassword.length < 12 || devRecoveryPassword.length > 128) {
      setDevRecoveryError("A senha deve ter entre 12 e 128 caracteres.");
      return;
    }
    if (devRecoveryPassword !== devRecoveryConfirmation) {
      setDevRecoveryError("As senhas não coincidem.");
      return;
    }
    if (!devRecoveryChallenge) {
      setDevRecoveryError("A recuperação expirou. Inicie novamente.");
      return;
    }

    setBusy(true);
    try {
      const res = await postJson("/api/collaborator/dev-primary-recovery/complete", {
        challenge: devRecoveryChallenge,
        newPassword: devRecoveryPassword,
      });
      const data = await res.json();
      if (!res.ok || typeof data?.token !== "string" || !data?.professional) {
        setDevRecoveryError(data?.error ?? "Não foi possível concluir a recuperação.");
        if (res.status === 401 || res.status === 409) setDevRecoveryChallenge(null);
        return;
      }
      setCollabSession(data.token, data.professional);
      setDevRecoveryChallenge(null);
      setDevRecoveryPassword("");
      setDevRecoveryConfirmation("");
      navigate(getReturnTo(), { replace: true });
    } catch {
      setDevRecoveryError("Erro de conexão. Inicie novamente se a recuperação tiver expirado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${theme === "dark" ? "dark bg-[#0f2440] text-[#f4e2a8]" : "bg-[#f3ecdd] text-[#16284a]"} relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-8`}>
      <div className="leva-fabric pointer-events-none" aria-hidden="true" />
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle theme={theme} onToggle={toggle} />
      </div>
      <div className="relative z-10 flex w-full flex-col items-center">

      {/* ── Cabeçalho da marca ── */}
      <div className="flex flex-col items-center gap-3 mb-8 select-none">
        <PaxterSymbolGlass size={56} tone="dark" sharp />
        <div className="text-center">
          <p className="text-[28px] font-bold tracking-[0.18em] text-[#16284a] uppercase leading-none dark:text-[#f4e2a8]">
            PADAXOR
          </p>
          <p className="text-[11px] tracking-[0.22em] text-[#916f32] uppercase mt-1 dark:text-[#d9bd78]">
            Motor Clínico · PAWARDS
          </p>
        </div>
      </div>

      {/* ── Card de login ── */}
      <div className="w-full max-w-sm">
        <div className="panel-3d-sub overflow-hidden">

          {/* Topbar do card */}
          <div className="login-card-topbar px-6 py-4 border-b border-border/60">
            <h1 className="text-sm font-semibold uppercase tracking-widest text-[#16284a] dark:text-[#f4e2a8]">
              {recoveryToken
                ? "Criar nova senha"
                : recoveryRequestMode
                  ? "Recuperar acesso"
                  : isBootstrap
                    ? "Primeiro acesso"
                    : "Acesso ao sistema"}
            </h1>
            <p className="text-xs text-[#16284a]/65 mt-0.5 dark:text-slate-300">
              {recoveryToken
                ? "Defina uma senha nova para sua conta profissional"
                : recoveryRequestMode
                  ? "Informe seu e-mail, CPF ou usuário atual"
                  : isBootstrap
                    ? "Crie a primeira credencial de acesso"
                    : "Entre com seu e-mail, CPF ou usuário atual"}
            </p>
          </div>

          {/* Corpo do card */}
          <div className="login-card-body px-6 py-6">
            {googleStatus === "unlinked" ? (
                <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                Esta conta Google ainda não está vinculada ao seu cadastro profissional.
                Entre com seu e-mail, CPF ou usuário atual; depois, no rodapé do menu, escolha “Vincular Google”.
              </div>
            ) : null}
            {googleStatus === "link-session-expired" ? (
                <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                Sua sessão do sistema expirou. Entre com seu e-mail, CPF ou usuário atual antes de vincular o Google.
              </div>
            ) : null}
            {recoveryToken ? (
              <form onSubmit={completePasswordRecovery} className="space-y-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  O link é de uso único. Use uma senha com pelo menos 12 caracteres.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="recovery-password" className="text-[#16284a] font-medium text-xs uppercase tracking-wide dark:text-slate-200">
                    Nova senha
                  </Label>
                  <PasswordInput id="recovery-password" value={recoveryPassword}
                    onChange={(event) => setRecoveryPassword(event.target.value)}
                    autoComplete="new-password" required minLength={12} maxLength={128}
                    visibilityLabel="nova senha" visibilityTestId="toggle-recovery-password"
                    className="border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recovery-confirmation" className="text-[#16284a] font-medium text-xs uppercase tracking-wide dark:text-slate-200">
                    Confirmar nova senha
                  </Label>
                  <PasswordInput id="recovery-confirmation" value={recoveryConfirmation}
                    onChange={(event) => setRecoveryConfirmation(event.target.value)}
                    autoComplete="new-password" required minLength={12} maxLength={128}
                    visibilityLabel="confirmação da nova senha" visibilityTestId="toggle-recovery-confirmation"
                    className="border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8]" />
                </div>
                {recoveryError ? (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-200"
                    role="alert">{recoveryError}</p>
                ) : null}
                <Button type="submit" disabled={busy}
                  className="btn-3d-gold w-full font-semibold tracking-wider uppercase text-xs h-11">
                  {busy ? "Salvando…" : "Salvar nova senha"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy}
                  onClick={() => {
                    setRecoveryToken("");
                    setRecoveryRequestMode(true);
                    setRecoveryError(null);
                    navigate("/login?recover=1", { replace: true });
                  }}
                  className="w-full text-[#16284a] dark:text-slate-200">
                  Solicitar outro link
                </Button>
              </form>
            ) : recoveryRequestMode ? (
              <form onSubmit={requestPasswordRecovery} className="space-y-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Por segurança, a tela não confirma se o cadastro existe. O link só pode ser enviado ao e-mail já salvo no cadastro profissional.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="recovery-identifier" className="text-[#16284a] font-medium text-xs uppercase tracking-wide dark:text-slate-200">
                    E-mail, CPF ou usuário atual
                  </Label>
                  <Input id="recovery-identifier" value={recoveryIdentifier}
                    onChange={(event) => setRecoveryIdentifier(formatLoginIdentifier(event.target.value))}
                    autoComplete="username" required maxLength={254}
                    placeholder="E-mail, CPF ou usuário atual"
                    className="h-10 border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8]" />
                </div>
                {recoveryNotice ? (
                  <p className="rounded-md border border-emerald-700/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                    role="status">{recoveryNotice}</p>
                ) : null}
                {recoveryError ? (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-200"
                    role="alert">{recoveryError}</p>
                ) : null}
                <Button type="submit" disabled={busy}
                  className="btn-3d-gold w-full font-semibold tracking-wider uppercase text-xs h-11">
                  {busy ? "Processando…" : "Enviar instruções"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy}
                  onClick={() => {
                    setRecoveryRequestMode(false);
                    setRecoveryNotice(null);
                    setRecoveryError(null);
                    navigate("/login", { replace: true });
                  }}
                  className="w-full text-[#16284a] dark:text-slate-200">
                  Voltar ao acesso
                </Button>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">

              {isBootstrap ? (
                <div className="space-y-1.5">
                  <Label htmlFor="prof" className="text-[#16284a] font-medium text-xs uppercase tracking-wide dark:text-slate-200">
                    Profissional
                  </Label>
                  <Select value={professionalId} onValueChange={setProfessionalId}>
                    <SelectTrigger id="prof" data-testid="select-profissional"
                  className="border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] focus:ring-[#c2a05a]/50 dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8]">
                      <SelectValue placeholder="Escolha o profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      {(status?.staff ?? []).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="username"
                  className="text-[#16284a] font-medium text-xs uppercase tracking-wide dark:text-slate-200">
                  {isBootstrap ? "Usuário inicial" : "E-mail, CPF ou usuário atual"}
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(formatLoginIdentifier(e.target.value))}
                  autoComplete="username"
                  autoFocus={!isBootstrap}
                  data-testid="input-username"
                  placeholder={isBootstrap ? "Crie seu usuário inicial" : "E-mail, CPF ou usuário atual"}
                  className="h-10 border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] placeholder:text-slate-500 focus-visible:ring-[#c2a05a]/50 dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8] dark:placeholder:text-slate-400"
                />
                {!isBootstrap ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Cadastros ainda sem e-mail ou CPF continuam usando o usuário atual.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password"
                  className="text-[#16284a] font-medium text-xs uppercase tracking-wide dark:text-slate-200">
                  Senha {isBootstrap ? "(mínimo 6 caracteres)" : ""}
                </Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isBootstrap ? "new-password" : "current-password"}
                  data-testid="input-password"
                  visibilityLabel="senha"
                  visibilityTestId="toggle-password-visibility-login"
                  className="border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] focus-visible:ring-[#c2a05a]/50 dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8]"
                />
              </div>

              {!isBootstrap ? (
                <button type="button"
                  onClick={() => {
                    setRecoveryRequestMode(true);
                    setRecoveryNotice(null);
                    setRecoveryError(null);
                  }}
                  className="text-xs font-semibold text-[#916f32] underline underline-offset-4 dark:text-[#e0c77d]">
                  Esqueci minha senha
                </button>
              ) : null}

              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-200"
                  data-testid="text-error">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={busy}
                data-testid="button-entrar"
                className="btn-3d-gold w-full font-semibold tracking-wider uppercase text-xs h-11 mt-1"
              >
                {busy ? "Entrando…" : isBootstrap ? "Criar acesso" : "Entrar"}
              </Button>
            </form>
            )}

            {!recoveryToken && !recoveryRequestMode && !isBootstrap && status && clerkPublishableKey ? (
              <div className="mt-5">
                <div className="mb-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-[#16284a]/45 dark:text-slate-400">
                  <span className="h-px flex-1 bg-[#16284a]/15 dark:bg-white/20" />
                  <span>ou</span>
                  <span className="h-px flex-1 bg-[#16284a]/15 dark:bg-white/20" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={beginGoogleLogin}
                  className="btn-3d-soft w-full h-11 border-[#16284a]/25 text-[#16284a] font-semibold dark:border-[#c2a05a]/35 dark:text-[#f4e2a8]"
                  data-testid="button-entrar-google"
                >
                  <span
                    aria-hidden="true"
                    className="mr-2 flex h-5 w-5 items-center justify-center rounded-full border border-[#16284a]/20 text-xs font-bold dark:border-[#c2a05a]/45"
                  >
                    G
                  </span>
                  Continuar com Google
                </Button>
              </div>
            ) : null}

            {!recoveryToken && !recoveryRequestMode && !isBootstrap && import.meta.env.DEV ? (
              <section className="mt-5 border-t border-[#16284a]/15 pt-4 dark:border-white/15"
                aria-labelledby="dev-recovery-title">
                {!devRecoveryChallenge ? (
                  <>
                    <h2 id="dev-recovery-title"
                      className="text-xs font-semibold uppercase tracking-wide text-[#16284a] dark:text-[#f4e2a8]">
                      Acesso de desenvolvimento
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Recupera somente o cadastro único do médico principal neste ambiente privado.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={startDevelopmentRecovery}
                      className="btn-3d-soft mt-3 w-full border-[#16284a]/25 text-[#16284a] dark:border-[#c2a05a]/35 dark:text-[#f4e2a8]"
                      data-testid="button-recuperar-acesso-medico-principal"
                    >
                      {busy ? "Preparando recuperação…" : "Recuperar acesso do médico principal"}
                    </Button>
                  </>
                ) : (
                  <form onSubmit={completeDevelopmentRecovery} className="space-y-3">
                    <div>
                      <h2 id="dev-recovery-title"
                        className="text-xs font-semibold uppercase tracking-wide text-[#16284a] dark:text-[#f4e2a8]">
                        Defina sua nova senha
                      </h2>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Use de 12 a 128 caracteres. Ao salvar, você entrará no cadastro existente do médico principal.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dev-recovery-password"
                        className="text-xs font-medium uppercase tracking-wide text-[#16284a] dark:text-slate-200">
                        Nova senha
                      </Label>
                      <PasswordInput
                        id="dev-recovery-password"
                        value={devRecoveryPassword}
                        onChange={(e) => setDevRecoveryPassword(e.target.value)}
                        autoComplete="new-password"
                        data-testid="input-dev-recovery-password"
                        visibilityLabel="nova senha"
                        visibilityTestId="toggle-dev-recovery-password"
                        className="border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] focus-visible:ring-[#c2a05a]/50 dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dev-recovery-confirmation"
                        className="text-xs font-medium uppercase tracking-wide text-[#16284a] dark:text-slate-200">
                        Confirme a nova senha
                      </Label>
                      <PasswordInput
                        id="dev-recovery-confirmation"
                        value={devRecoveryConfirmation}
                        onChange={(e) => setDevRecoveryConfirmation(e.target.value)}
                        autoComplete="new-password"
                        data-testid="input-dev-recovery-confirmation"
                        visibilityLabel="confirmação da nova senha"
                        visibilityTestId="toggle-dev-recovery-confirmation"
                        className="border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] focus-visible:ring-[#c2a05a]/50 dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8]"
                      />
                    </div>
                    {devRecoveryError ? (
                      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-200"
                        role="alert" data-testid="text-dev-recovery-error">
                        {devRecoveryError}
                      </p>
                    ) : null}
                    <Button
                      type="submit"
                      disabled={busy}
                      className="btn-3d-gold w-full font-semibold tracking-wider uppercase text-xs h-11"
                      data-testid="button-salvar-nova-senha"
                    >
                      {busy ? "Salvando e entrando…" : "Salvar senha e entrar"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setDevRecoveryChallenge(null);
                        setDevRecoveryPassword("");
                        setDevRecoveryConfirmation("");
                        setDevRecoveryError(null);
                      }}
                      className="w-full text-[#16284a] dark:text-slate-200"
                    >
                      Cancelar
                    </Button>
                  </form>
                )}
                {!devRecoveryChallenge && devRecoveryError ? (
                  <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-200"
                    role="alert" data-testid="text-dev-recovery-error">
                    {devRecoveryError}
                  </p>
                ) : null}
              </section>
            ) : null}

          </div>
        </div>

        {/* Rodapé discreto */}
        <p className="mt-6 text-center text-[10px] tracking-wider text-[#16284a]/55 dark:text-slate-400">
          PADAXOR © {new Date().getFullYear()} · PAWARDS Sistemas
        </p>
      </div>
      </div>
    </div>
  );
}
