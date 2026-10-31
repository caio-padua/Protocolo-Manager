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
  const modoTeste = import.meta.env.DEV && !isBootstrap;
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

  async function quickEnter() {
    setError(null);
    setBusy(true);
    try {
      const res = await postJson("/api/collaborator/login", {
        username: "00000000000",
        password: "4000",
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Falha ao entrar."); setBusy(false); return; }
      setCollabSession(data.token, data.professional);
      navigate(getReturnTo(), { replace: true });
    } catch {
      setError("Erro de conexão. Tente novamente.");
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
        res = await postJson("/api/collaborator/login", { username, password });
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
    <div className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#f3ecdd] px-4 py-8">
      <div className="leva-fabric pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 flex w-full flex-col items-center">

      {/* ── Cabeçalho da marca ── */}
      <div className="flex flex-col items-center gap-3 mb-8 select-none">
        <PaxterSymbolGlass size={56} tone="dark" sharp />
        <div className="text-center">
          <p className="text-[28px] font-bold tracking-[0.18em] text-[#16284a] uppercase leading-none">
            PADAXOR
          </p>
          <p className="text-[11px] tracking-[0.22em] text-[#916f32] uppercase mt-1">
            Motor Clínico · PAWARDS
          </p>
        </div>
      </div>

      {/* ── Card de login ── */}
      <div className="w-full max-w-sm">
        <div className="panel-3d-sub overflow-hidden">

          {/* Topbar do card */}
          <div className="login-card-topbar px-6 py-4 border-b border-border/60">
            <h1 className="text-sm font-semibold uppercase tracking-widest text-[#16284a]">
              {isBootstrap ? "Primeiro acesso" : "Acesso ao sistema"}
            </h1>
            <p className="text-xs text-[#16284a]/65 mt-0.5">
              {isBootstrap
                ? "Crie a primeira credencial de acesso"
                : "Entre com seu usuário e senha"}
            </p>
          </div>

          {/* Corpo do card */}
          <div className="login-card-body px-6 py-6">
            {googleStatus === "unlinked" ? (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                Esta conta Google ainda não está vinculada ao seu cadastro profissional.
                Entre com seu usuário e senha; depois, no rodapé do menu, escolha “Vincular Google”.
              </div>
            ) : null}
            {googleStatus === "link-session-expired" ? (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                Sua sessão do sistema expirou. Entre com seu usuário e senha antes de vincular o Google.
              </div>
            ) : null}
            <form onSubmit={handleSubmit} className="space-y-4">

              {isBootstrap ? (
                <div className="space-y-1.5">
                  <Label htmlFor="prof" className="text-[#16284a] font-medium text-xs uppercase tracking-wide">
                    Profissional
                  </Label>
                  <Select value={professionalId} onValueChange={setProfessionalId}>
                    <SelectTrigger id="prof" data-testid="select-profissional"
                  className="border-[#16284a]/30 bg-[#fffdf8] focus:ring-[#c2a05a]/50">
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
                  className="text-[#16284a] font-medium text-xs uppercase tracking-wide">
                  Usuário
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus={!isBootstrap}
                  data-testid="input-username"
                  className="border-[#16284a]/30 bg-[#fffdf8] focus-visible:ring-[#c2a05a]/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password"
                  className="text-[#16284a] font-medium text-xs uppercase tracking-wide">
                  Senha {isBootstrap ? "(mínimo 6 caracteres)" : ""}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isBootstrap ? "new-password" : "current-password"}
                  data-testid="input-password"
                  className="border-[#16284a]/30 bg-[#fffdf8] focus-visible:ring-[#c2a05a]/50"
                />
              </div>

              {error ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2"
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
                <div className="mb-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-[#16284a]/45">
                  <span className="h-px flex-1 bg-[#16284a]/15" />
                  <span>ou</span>
                  <span className="h-px flex-1 bg-[#16284a]/15" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={beginGoogleLogin}
                  className="btn-3d-soft w-full h-11 border-[#16284a]/25 text-[#16284a] font-semibold"
                  data-testid="button-entrar-google"
                >
                  <span
                    aria-hidden="true"
                    className="mr-2 flex h-5 w-5 items-center justify-center rounded-full border border-[#16284a]/20 text-xs font-bold"
                  >
                    G
                  </span>
                  Continuar com Google
                </Button>
              </div>
            ) : null}

            {/* Modo teste: só em DEV */}
            {modoTeste ? (
              <div className="mt-5 border-t border-dashed border-amber-400/60 pt-4">
                <div className="mb-2 inline-block rounded bg-amber-100 px-2 py-0.5
                               text-[10px] font-bold uppercase tracking-widest text-amber-700">
                  Modo Teste
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-amber-500 text-amber-700 hover:bg-amber-50 text-xs"
                  disabled={busy}
                  onClick={quickEnter}
                  data-testid="button-entrar-sem-senha"
                >
                  {busy ? "Entrando…" : "ENTRAR SEM SENHA"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Rodapé discreto */}
        <p className="text-center text-[10px] text-[#16284a]/55 mt-6 tracking-wider">
          PADAXOR © {new Date().getFullYear()} · PAWARDS Sistemas
        </p>
      </div>
      </div>
    </div>
  );
}
