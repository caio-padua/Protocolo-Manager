import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
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
  getCollabProfessional,
  setCollabSession,
  clearCollabSession,
  COLLAB_EVENT,
  type CollabProfessional,
} from "@/lib/collab-auth";

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

// Portao do Colaborador (Onda 8.2). Envolve as telas da Central de Cadastro.
// Sem token valido -> tela de entrada (login ou primeiro acesso). Com token ->
// mostra uma faixa com o colaborador logado, atalho de auditoria e "Sair".
export function CollaboratorGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getCollabToken());
  const [prof, setProf] = useState<CollabProfessional | null>(getCollabProfessional());
  // "checking" enquanto valida o token no servidor; "valid"/"invalid" depois.
  const [phase, setPhase] = useState<"checking" | "valid" | "invalid">(
    getCollabToken() ? "checking" : "invalid",
  );

  useEffect(() => {
    const onChange = () => {
      const t = getCollabToken();
      setToken(t);
      setProf(getCollabProfessional());
      setPhase(t ? "checking" : "invalid");
    };
    window.addEventListener(COLLAB_EVENT, onChange);
    return () => window.removeEventListener(COLLAB_EVENT, onChange);
  }, []);

  // Valida a sessao no servidor sempre que houver token "checking". Token
  // arbitrario no localStorage nao libera nada: o backend (GET /me) rejeita.
  useEffect(() => {
    if (phase !== "checking") return;
    const t = getCollabToken();
    if (!t) {
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    fetch("/api/collaborator/me", { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then((d: { professional: CollabProfessional }) => {
        if (cancelled) return;
        setProf(d.professional);
        setPhase("valid");
      })
      .catch(() => {
        if (cancelled) return;
        clearCollabSession();
        setPhase("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [phase, token]);

  if (phase === "checking") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Verificando acesso…
      </div>
    );
  }

  if (phase === "invalid") {
    return <LoginScreen />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-md border border-[#3D7A7A]/30 bg-[#3D7A7A]/5 px-4 py-2">
        <div className="text-sm">
          <span className="font-semibold uppercase tracking-wide text-[#3D7A7A]">
            Colaborador
          </span>{" "}
          <span className="text-foreground">{prof?.name ?? "—"}</span>
          {prof?.role ? (
            <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
              {prof.role}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cadastros/auditoria">
            <Button variant="outline" size="sm" data-testid="link-auditoria">
              Auditoria
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            data-testid="button-logout-colaborador"
            onClick={() => clearCollabSession()}
          >
            Sair
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

function LoginScreen() {
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [professionalId, setProfessionalId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/collaborator/bootstrap-status")
      .then((r) => r.json())
      .then((d: BootstrapStatus) => setStatus(d))
      .catch(() => setStatus({ needsBootstrap: false, staff: [] }));
  }, []);

  const isBootstrap = status?.needsBootstrap === true;
  // MODO TESTE (apenas ambiente de desenvolvimento): atalho de 1 clique que
  // entra com o acesso do dono (00000000000) sem precisar digitar nada. NUNCA
  // aparece no app publicado (import.meta.env.DEV e falso em producao).
  const modoTeste = import.meta.env.DEV && !isBootstrap;

  async function quickEnter() {
    setError(null);
    setBusy(true);
    try {
      const res = await postJson("/api/collaborator/login", {
        username: "00000000000",
        password: "4000",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Falha ao entrar.");
        setBusy(false);
        return;
      }
      setCollabSession(data.token, data.professional);
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
        if (!professionalId) {
          setError("Escolha o profissional.");
          setBusy(false);
          return;
        }
        res = await postJson("/api/collaborator/bootstrap", {
          professionalId: Number(professionalId),
          username,
          password,
        });
      } else {
        res = await postJson("/api/collaborator/login", { username, password });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Falha ao entrar.");
        setBusy(false);
        return;
      }
      setCollabSession(data.token, data.professional);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md border-l-4 border-l-[#3D7A7A] p-6">
        <h1 className="mb-1 text-lg font-bold uppercase tracking-wide text-[#3D7A7A]">
          {isBootstrap ? "Primeiro acesso" : "Portão do Colaborador"}
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          {isBootstrap
            ? "Nenhum acesso configurado ainda. Crie a primeira credencial escolhendo um profissional e definindo usuário e senha."
            : "Entre com seu usuário e senha para acessar a Central de Cadastro."}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isBootstrap ? (
            <div className="space-y-1.5">
              <Label htmlFor="prof">Profissional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger id="prof" data-testid="select-profissional">
                  <SelectValue placeholder="Escolha o profissional" />
                </SelectTrigger>
                <SelectContent>
                  {(status?.staff ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              data-testid="input-username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha {isBootstrap ? "(mínimo 6 caracteres)" : ""}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isBootstrap ? "new-password" : "current-password"}
              data-testid="input-password"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600" data-testid="text-error">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="w-full bg-[#3D7A7A] hover:bg-[#326565]"
            disabled={busy}
            data-testid="button-entrar"
          >
            {busy ? "Entrando…" : isBootstrap ? "Criar acesso" : "Entrar"}
          </Button>
        </form>
        {modoTeste ? (
          <div className="mt-5 border-t border-dashed border-amber-400/60 pt-4">
            <div className="mb-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
              Modo Teste
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full border-amber-500 text-amber-700 hover:bg-amber-50"
              disabled={busy}
              onClick={quickEnter}
              data-testid="button-entrar-sem-senha"
            >
              {busy ? "Entrando…" : "ENTRAR SEM SENHA (1 clique)"}
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Atalho só do ambiente de teste. Entra como o dono, sem digitar nada.
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
