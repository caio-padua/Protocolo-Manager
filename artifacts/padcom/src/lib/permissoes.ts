import { useEffect, useState } from "react";
import { podeUsar, type Matriz, type PapelId } from "@workspace/governanca";
import { getCollabToken, COLLAB_EVENT } from "./collab-auth";

// Fonte unica de permissoes no FRONT. O hook busca:
//   1. /collaborator/me      — o papel (category) e se e o CEO (isPrimaryDoctor)
//   2. /settings/governanca  — a matriz atual (quem pode o que), semeada no back
// e devolve `pode(ferramentaId)` que a tela e o menu consultam.
//
// Regras de fallback (sempre a favor de nao travar o operador legitimo):
//   - sem token de colaborador  -> acesso TOTAL (ambiente single-tenant/proxy)
//   - CEO (isPrimaryDoctor)      -> acesso TOTAL (ve e faz tudo)
//   - demais                     -> podeUsar(matriz, ferramenta, category)

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface Me {
  id: number;
  name: string;
  role: string;
  category: string;
  isPrimaryDoctor: boolean;
  cpf: string | null;
  googleLinked: boolean;
}

export interface Permissoes {
  loading: boolean;
  me: Me | null;
  matriz: Matriz | null;
  isCeo: boolean;
  /** acesso total: sem sessao de colaborador ou CEO */
  acessoTotal: boolean;
  pode: (ferramentaId: string) => boolean;
  refetch: () => void;
}

async function authGet<T>(path: string): Promise<T | null> {
  const token = getCollabToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function usePermissoes(): Permissoes {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [matriz, setMatriz] = useState<Matriz | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener(COLLAB_EVENT, onChange);
    return () => window.removeEventListener(COLLAB_EVENT, onChange);
  }, []);

  useEffect(() => {
    let alive = true;
    const token = getCollabToken();
    // Sem token: acesso total, nem chama a rede.
    if (!token) {
      setMe(null);
      setMatriz(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      authGet<{ professional: Me }>("/api/collaborator/me"),
      authGet<{ matriz: Matriz }>("/api/settings/governanca"),
    ])
      .then(([meRes, govRes]) => {
        if (!alive) return;
        setMe(meRes?.professional ?? null);
        setMatriz(govRes?.matriz ?? null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const isCeo = Boolean(me?.isPrimaryDoctor);
  // Sem colaborador identificado (me === null) => acesso total.
  const acessoTotal = me === null || isCeo;

  const pode = (ferramentaId: string): boolean => {
    if (acessoTotal) return true;
    return podeUsar(matriz, ferramentaId, me?.category as PapelId);
  };

  return { loading, me, matriz, isCeo, acessoTotal, pode, refetch };
}
