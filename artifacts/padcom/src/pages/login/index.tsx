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

  function getReturnTo(): string {
    try {
      const params = new URLSearchParams(window.location.search);
      const rt = params.get("returnTo");
      if (rt && rt.startsWith("/") && !rt.startsWith("/login")) return rt;
    } catch { /* */ }
    return "/";
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
    <div className="min-h-screen bg-[#0f1d38] flex flex-col items-center justify-center px-4">

      {/* ── Cabeçalho da marca ── */}
      <div className="flex flex-col items-center gap-3 mb-8 select-none">
        <PaxterSymbolGlass size={64} tone="dark" sharp />
        <div className="text-center">
          <p className="text-[28px] font-bold tracking-[0.18em] text-white uppercase leading-none">
            PADAXOR
          </p>
          <p className="text-[11px] tracking-[0.22em] text-[#c2a05a]/80 uppercase mt-1">
            Motor Clínico · PAWARDS
          </p>
        </div>
      </div>

      {/* ── Card de login ── */}
      <div className="w-full max-w-sm">
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/50">

          {/* Topbar do card */}
          <div className="bg-[#16284a] px-6 py-4 border-b border-white/10">
            <h1 className="text-sm font-semibold uppercase tracking-widest text-[#c2a05a]">
              {isBootstrap ? "Primeiro acesso" : "Acesso ao sistema"}
            </h1>
            <p className="text-xs text-white/50 mt-0.5">
              {isBootstrap
                ? "Crie a primeira credencial de acesso"
                : "Entre com seu usuário e senha"}
            </p>
          </div>

          {/* Corpo do card */}
          <div className="bg-white px-6 py-6">
            <form onSubmit={handleSubmit} className="space-y-4">

              {isBootstrap ? (
                <div className="space-y-1.5">
                  <Label htmlFor="prof" className="text-[#16284a] font-medium text-xs uppercase tracking-wide">
                    Profissional
                  </Label>
                  <Select value={professionalId} onValueChange={setProfessionalId}>
                    <SelectTrigger id="prof" data-testid="select-profissional"
                      className="border-[#16284a]/30 focus:ring-[#c2a05a]/50">
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
                  className="border-[#16284a]/30 focus-visible:ring-[#c2a05a]/50"
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
                  className="border-[#16284a]/30 focus-visible:ring-[#c2a05a]/50"
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
                className="w-full bg-[#16284a] hover:bg-[#0f1d38] text-white font-semibold
                           tracking-wider uppercase text-xs h-11 rounded-lg mt-1
                           shadow-md shadow-[#16284a]/40 transition-all"
              >
                {busy ? "Entrando…" : isBootstrap ? "Criar acesso" : "Entrar"}
              </Button>
            </form>

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
        <p className="text-center text-[10px] text-white/30 mt-6 tracking-wider">
          PADAXOR © {new Date().getFullYear()} · PAWARDS Sistemas
        </p>
      </div>
    </div>
  );
}
