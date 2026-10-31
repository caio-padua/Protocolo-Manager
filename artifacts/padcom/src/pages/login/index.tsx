import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  // Se já tem sessão válida, redireciona sem mostrar o formulário.
  useEffect(() => {
    const t = getCollabToken();
    if (!t) return;
    fetch("/api/collaborator/me", { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => {
        const dest = getReturnTo();
        navigate(dest, { replace: true });
      })
      .catch(() => clearCollabSession());
  }, [navigate]);

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
        res = await postJson("/api/collaborator/login", { identifier: username, password });
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
              {isBootstrap ? "Primeiro acesso" : "Acesso ao sistema"}
            </h1>
            <p className="text-xs text-[#16284a]/65 mt-0.5 dark:text-slate-300">
              {isBootstrap
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
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus={!isBootstrap}
                  data-testid="input-username"
                  placeholder={isBootstrap ? "Crie seu usuário inicial" : "E-mail, CPF ou usuário atual"}
                  className="border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] placeholder:text-slate-500 focus-visible:ring-[#c2a05a]/50 dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8] dark:placeholder:text-slate-400"
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
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isBootstrap ? "new-password" : "current-password"}
                  data-testid="input-password"
                  className="border-[#16284a]/30 bg-[#fffdf8] text-[#16284a] focus-visible:ring-[#c2a05a]/50 dark:border-[#c2a05a]/40 dark:bg-[#0b1d35] dark:text-[#f4e2a8]"
                />
              </div>

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

            {!isBootstrap && status && clerkPublishableKey ? (
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
