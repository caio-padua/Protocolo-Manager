import { useEffect, useState } from "react";
import { Award, Loader2 } from "lucide-react";
import { PALETA_NIVEL, ehNivelCliente, fundoNivel, type NivelCliente } from "@/lib/nivel-cliente";
import { MINHA_CATEGORIA_NOTAS, MINHA_CATEGORIA_SUBTITULO, MINHA_CATEGORIA_TITULO } from "@/lib/minha-categoria-catalogo";

// MINHA CATEGORIA (Área do Cliente). Mostra SÓ o nível comercial já cadastrado (Prata, Ouro, Platinum, Diamond),
// lido por rota própria (GET /area-paciente/minha-categoria, cliente vindo do token). Não mostra benefício,
// preço ou comparativo: nada disso está cadastrado. É independente do Club VIP, que não lê nível algum.

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; nivel: NivelCliente | null }
  | { fase: "erro"; msg: string };

function useCategoria(token: string): Estado {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  useEffect(() => {
    let vivo = true;
    setEstado({ fase: "carregando" });
    fetch(`${API_BASE}/api/area-paciente/minha-categoria`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar sua categoria agora.");
        return res.json() as Promise<{ nivel?: unknown }>;
      })
      // Só vale um dos quatro níveis existentes; qualquer outra coisa vira "sem categoria", nunca um nível inventado.
      .then((d) => { if (vivo) setEstado({ fase: "pronto", nivel: ehNivelCliente(d?.nivel) ? d.nivel : null }); })
      .catch((e: Error) => { if (vivo) setEstado({ fase: "erro", msg: e.message }); });
    return () => { vivo = false; };
  }, [token]);
  return estado;
}

export default function MinhaCategoriaCliente({ token }: { token: string }) {
  const estado = useCategoria(token);
  const nivel = estado.fase === "pronto" ? estado.nivel : null;
  return (
    <div className="space-y-4" data-testid="minha-categoria">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">Instituto Pádua</p>
          <h2 className="text-primary font-black text-2xl mt-0.5 tracking-wide" style={{ fontFamily: "'EB Garamond', serif" }}>
            {MINHA_CATEGORIA_TITULO}
          </h2>
          <p className="text-muted-foreground text-xs leading-snug mt-1">{MINHA_CATEGORIA_SUBTITULO}</p>
        </div>
      </header>

      <section className="panel-3d rounded-xl overflow-hidden" aria-label="Sua categoria">
        <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
          <Award className="w-4 h-4 text-accent" aria-hidden="true" />
          <h3 className="text-primary text-xs font-black uppercase tracking-widest">Sua categoria</h3>
        </div>
        <div className="p-4">
          {estado.fase === "carregando" && (
            <div className="concave-3d rounded-lg px-4 py-5 flex items-center justify-center gap-2 text-muted-foreground text-sm" role="status">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando…
            </div>
          )}
          {nivel && (
            <div
              data-testid="minha-categoria-nivel"
              data-nivel={nivel}
              className="rounded-md px-4 py-5 flex items-center gap-3"
              style={{
                background: fundoNivel(nivel),
                color: PALETA_NIVEL[nivel].texto,
                boxShadow: "0 3px 8px rgba(15,28,53,0.22), inset 0 1.5px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(0,0,0,0.18)",
              }}
            >
              <Award className="w-7 h-7 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-80">Categoria</p>
                <p className="font-black text-2xl uppercase tracking-wide leading-tight" style={{ fontFamily: "'EB Garamond', serif" }}>
                  {PALETA_NIVEL[nivel].nome}
                </p>
              </div>
            </div>
          )}
          {estado.fase === "pronto" && !nivel && (
            <p className="concave-3d rounded-lg px-4 py-4 text-muted-foreground text-xs leading-relaxed text-center" data-testid="minha-categoria-sem-nivel">
              Sua categoria ainda não está disponível nesta área.
            </p>
          )}
          {estado.fase === "erro" && (
            <p className="concave-3d rounded-lg px-4 py-4 text-destructive text-xs leading-relaxed text-center" role="alert" data-testid="minha-categoria-erro">
              {estado.msg}
            </p>
          )}
        </div>
      </section>

      <section className="panel-3d-sub rounded-xl p-4 space-y-2" aria-label="Sobre esta área" data-testid="minha-categoria-notas">
        {MINHA_CATEGORIA_NOTAS.map((n) => (
          <p key={n} className="text-muted-foreground text-xs leading-relaxed">{n}</p>
        ))}
      </section>
    </div>
  );
}
