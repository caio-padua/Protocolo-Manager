import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import {
  getCollabToken,
  getCollabProfessional,
  clearCollabSession,
  COLLAB_EVENT,
  type CollabProfessional,
} from "@/lib/collab-auth";

// Portao do Colaborador (Onda 8.2). Envolve as telas da Central de Cadastro.
// Sem token valido -> redireciona para /login com returnTo=<rota atual>.
// Com token -> mostra uma faixa com o colaborador logado, auditoria e "Sair".
export function CollaboratorGate({ children }: { children: ReactNode }) {
  const [location] = useLocation();
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
    const returnTo = encodeURIComponent(location);
    return <Redirect to={`/login?returnTo=${returnTo}`} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-md border border-[#16284a]/30 bg-[#16284a]/5 px-4 py-2">
        <div className="text-sm">
          <span className="font-semibold uppercase tracking-wide text-[#16284a]">
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
