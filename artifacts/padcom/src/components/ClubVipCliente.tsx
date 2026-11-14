import { useEffect, useState } from "react";
import { Crown, HeartHandshake, Loader2, Sparkles, Ticket } from "lucide-react";
import { PALETA_NIVEL, ehNivelCliente, fundoNivel, type NivelCliente } from "@/lib/nivel-cliente";
import {
  AREAS_BENEFICIO, BENEFICIOS_NOTA, CLUB_VIP_SUBTITULO, CLUB_VIP_TITULO, CONVITE_BOLOES,
} from "@/lib/club-vip-catalogo";

// CLUB VIP (Área do Cliente). Separado do prontuário: lê SÓ o nível do cliente autenticado
// (GET /area-paciente/club-vip, cliente vindo do token) e nada clínico.
// O convite para bolões é opcional e apenas NAVEGA para a tela já existente "Meus Bolões":
// não envia mensagem, não cobra, não vende cota e não liga nada a consulta, plano ou desconto.

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; nivel: NivelCliente | null }
  | { fase: "erro"; msg: string };

function useNivel(token: string): Estado {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  useEffect(() => {
    let vivo = true;
    setEstado({ fase: "carregando" });
    fetch(`${API_BASE}/api/area-paciente/club-vip`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar seu nível agora.");
        return res.json() as Promise<{ nivel?: unknown }>;
      })
      // Nível só vale se for um dos quatro existentes; qualquer outra coisa vira "sem nível".
      .then((d) => { if (vivo) setEstado({ fase: "pronto", nivel: ehNivelCliente(d?.nivel) ? d.nivel : null }); })
      .catch((e: Error) => { if (vivo) setEstado({ fase: "erro", msg: e.message }); });
    return () => { vivo = false; };
  }, [token]);
  return estado;
}

function CartaoNivel({ estado }: { estado: Estado }) {
  const nivel = estado.fase === "pronto" ? estado.nivel : null;
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label="Seu nível de relacionamento" data-testid="club-vip-nivel-card">
      <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
        <Crown className="w-4 h-4 text-accent" aria-hidden="true" />
        <h3 className="text-primary text-xs font-black uppercase tracking-widest">Seu nível de relacionamento</h3>
      </div>
      <div className="p-4">
        {estado.fase === "carregando" && (
          <div className="concave-3d rounded-lg px-4 py-5 flex items-center justify-center gap-2 text-muted-foreground text-sm" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando…
          </div>
        )}
        {nivel && (
          <div
            data-testid="club-vip-nivel"
            data-nivel={nivel}
            className="rounded-md px-4 py-5 flex items-center gap-3"
            style={{
              background: fundoNivel(nivel),
              color: PALETA_NIVEL[nivel].texto,
              boxShadow: "0 3px 8px rgba(15,28,53,0.22), inset 0 1.5px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(0,0,0,0.18)",
            }}
          >
            <Crown className="w-7 h-7 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest opacity-80">Nível</p>
              <p className="font-black text-2xl uppercase tracking-wide leading-tight" style={{ fontFamily: "'EB Garamond', serif" }}>
                {PALETA_NIVEL[nivel].nome}
              </p>
            </div>
          </div>
        )}
        {estado.fase === "pronto" && !nivel && (
          <p className="concave-3d rounded-lg px-4 py-4 text-muted-foreground text-xs leading-relaxed text-center" data-testid="club-vip-sem-nivel">
            Seu nível de relacionamento ainda não está disponível. Assim que o Instituto o confirmar, ele aparecerá aqui.
          </p>
        )}
        {estado.fase === "erro" && (
          <p className="concave-3d rounded-lg px-4 py-4 text-destructive text-xs leading-relaxed text-center" role="alert" data-testid="club-vip-nivel-erro">
            {estado.msg}
          </p>
        )}
      </div>
    </section>
  );
}

function SecaoBeneficios() {
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label="Benefícios e experiências" data-testid="club-vip-beneficios">
      <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
        <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
        <h3 className="text-primary text-xs font-black uppercase tracking-widest">Benefícios e experiências</h3>
      </div>
      <div className="p-3 space-y-2">
        {AREAS_BENEFICIO.map((a) => (
          <article key={a.chave} className="panel-3d-sub rounded-xl p-3 space-y-2" data-testid="club-vip-area" data-area={a.chave}>
            <div className="min-w-0">
              <h4 className="text-primary font-black text-[13px] uppercase tracking-wide">{a.titulo}</h4>
              <p className="text-muted-foreground text-xs leading-snug mt-0.5">{a.descricao}</p>
            </div>
            {a.itens.length === 0 ? (
              <p className="concave-3d rounded-lg px-3 py-2 text-accent text-[10px] font-black uppercase tracking-widest text-center" data-testid="club-vip-em-configuracao">
                Em configuração
              </p>
            ) : (
              <ul className="space-y-1.5">
                {a.itens.map((i) => (
                  <li key={i.titulo} className="concave-3d rounded-lg px-3 py-2">
                    <p className="text-primary text-xs font-black">{i.titulo}</p>
                    <p className="text-muted-foreground text-xs leading-snug">{i.descricao}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
        <p className="text-muted-foreground text-[11px] leading-snug text-center px-2 pt-1">{BENEFICIOS_NOTA}</p>
      </div>
    </section>
  );
}

function ConviteBoloes({ onAbrirBoloes }: { onAbrirBoloes: () => void }) {
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label={CONVITE_BOLOES.titulo} data-testid="club-vip-convite-boloes">
      <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
        <HeartHandshake className="w-4 h-4 text-accent" aria-hidden="true" />
        <h3 className="text-primary text-xs font-black uppercase tracking-widest">{CONVITE_BOLOES.titulo}</h3>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-primary text-sm leading-relaxed" style={{ fontFamily: "'EB Garamond', serif", fontSize: 16 }}>
          {CONVITE_BOLOES.narrativa}
        </p>
        <p className="concave-3d rounded-lg px-3 py-2.5 text-muted-foreground text-xs leading-relaxed" data-testid="convite-independencia">
          {CONVITE_BOLOES.independencia}
        </p>
        <button
          type="button"
          onClick={onAbrirBoloes}
          data-testid="club-vip-cta-boloes"
          className="btn-3d-soft w-full flex items-center justify-center gap-2 min-h-[48px] px-3 text-xs font-black uppercase tracking-wider"
        >
          <Ticket className="w-4 h-4" aria-hidden="true" /> {CONVITE_BOLOES.cta}
        </button>
        <p className="text-muted-foreground text-[11px] leading-snug text-center">{CONVITE_BOLOES.aviso}</p>
      </div>
    </section>
  );
}

export default function ClubVipCliente({ token, onAbrirBoloes }: { token: string; onAbrirBoloes: () => void }) {
  const estado = useNivel(token);
  return (
    <div className="space-y-4" data-testid="club-vip">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">Instituto Pádua</p>
          <h2 className="text-primary font-black text-2xl mt-0.5 tracking-wide" style={{ fontFamily: "'EB Garamond', serif" }}>
            {CLUB_VIP_TITULO}
          </h2>
          <p className="text-muted-foreground text-xs leading-snug mt-1">{CLUB_VIP_SUBTITULO}</p>
        </div>
      </header>
      <CartaoNivel estado={estado} />
      <SecaoBeneficios />
      <ConviteBoloes onAbrirBoloes={onAbrirBoloes} />
    </div>
  );
}
