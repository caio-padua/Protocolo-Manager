import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

  // A faixa do colaborador sobe para o canto superior direito (a barra azul do topo, #aba-acoes).
  // Sem essa barra (celular), ela fica no lugar de antes.
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById("aba-acoes");
    const larga = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches;
    setAlvo(el && larga ? el : null);
  }, [location]);

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

  const faixaTopo = alvo !== null;
  const faixa = (
    <div
      className={faixaTopo
        ? "flex items-center gap-3 pt-1 text-[11px] text-[#16284a]"
        : "mb-4 flex items-center justify-between rounded-md border border-[#16284a]/30 bg-[#16284a]/5 px-4 py-2"}
      data-testid="faixa-colaborador"
    >
      <div className={faixaTopo ? "tracking-wide" : "text-sm"}>
        <span className={`font-semibold uppercase tracking-wide ${"text-[#16284a]"}`}>
          Colaborador
        </span>{" "}
        <span className={faixaTopo ? "font-semibold text-[#16284a]" : "text-foreground"}>{prof?.name ?? "—"}</span>
        {prof?.role ? (
          <span className={`ml-2 text-xs uppercase tracking-wide ${faixaTopo ? "text-[#5d6a85]" : "text-muted-foreground"}`}>
            {prof.role}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Link href="/cadastros/auditoria">
          <Button variant="outline" size={faixaTopo ? "sm" : "sm"} className={faixaTopo ? "h-6 rounded-[4px] border-[#16284a]/45 bg-white/60 px-3 text-[11px] font-semibold text-[#16284a] hover:bg-[#16284a]/10 hover:text-[#16284a]" : ""} data-testid="link-auditoria">
            Auditoria
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className={faixaTopo ? "h-6 rounded-[4px] px-3 text-[11px] font-semibold text-[#16284a] hover:bg-[#16284a]/10 hover:text-[#16284a]" : ""}
          data-testid="button-logout-colaborador"
          onClick={() => clearCollabSession()}
        >
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      {alvo ? createPortal(faixa, alvo) : faixa}
      {children}
    </div>
  );
}
