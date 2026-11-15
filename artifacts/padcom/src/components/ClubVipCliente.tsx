import { HeartHandshake, MailCheck, Sparkles, Ticket } from "lucide-react";
import { GrupoVipAdesao } from "@/components/GrupoVipConexao";
import {
  AREAS_BENEFICIO, BENEFICIOS_NOTA, CLUB_VIP_COMO_FUNCIONA, CLUB_VIP_SUBTITULO, CLUB_VIP_TITULO,
  CONEXAO_MILIONARIA, CONVITES_ESPECIAIS_DESCRICAO, CONVITES_ESPECIAIS_TITULO,
} from "@/lib/club-vip-catalogo";

// GRUPO VIP (Área do Cliente): programa POR CONVITE, de aceite voluntário. NÃO lê nem exibe a categoria comercial
// (Prata, Ouro, Platinum, Diamond), que vive na aba MINHA CATEGORIA: a única leitura é a da própria adesão (/area-paciente/grupo-vip).
// O convite CONEXÃO MILIONÁRIA é opcional e apenas NAVEGA para a tela já existente "Meus Bolões":
// não envia mensagem, não cobra, não aposta, não emite bilhete e não liga nada a consulta, plano ou desconto.

function ComoFunciona() {
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label={CLUB_VIP_COMO_FUNCIONA.titulo} data-testid="club-vip-como-funciona">
      <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
        <MailCheck className="w-4 h-4 text-accent" aria-hidden="true" />
        <h3 className="text-primary text-xs font-black uppercase tracking-widest">{CLUB_VIP_COMO_FUNCIONA.titulo}</h3>
      </div>
      <p className="p-4 text-muted-foreground text-xs leading-relaxed">{CLUB_VIP_COMO_FUNCIONA.texto}</p>
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

function ConvitesEspeciais({ onAbrirBoloes }: { onAbrirBoloes: () => void }) {
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label={CONVITES_ESPECIAIS_TITULO} data-testid="club-vip-convites-especiais">
      <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
        <HeartHandshake className="w-4 h-4 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-primary text-xs font-black uppercase tracking-widest">{CONVITES_ESPECIAIS_TITULO}</h3>
          <p className="text-muted-foreground text-[11px] leading-snug mt-0.5">{CONVITES_ESPECIAIS_DESCRICAO}</p>
        </div>
      </div>
      <div className="p-3">
        <article className="panel-3d-sub rounded-xl p-4 space-y-3" aria-label={CONEXAO_MILIONARIA.titulo} data-testid="club-vip-convite-boloes">
          <div className="min-w-0">
            <h4 className="text-primary font-black text-lg uppercase tracking-wide" style={{ fontFamily: "'EB Garamond', serif" }}>
              {CONEXAO_MILIONARIA.titulo}
            </h4>
            <p className="text-accent text-[10px] font-black uppercase tracking-widest">{CONEXAO_MILIONARIA.chamada}</p>
          </div>
          <p className="text-primary leading-relaxed" style={{ fontFamily: "'EB Garamond', serif", fontSize: 16 }}>
            {CONEXAO_MILIONARIA.narrativa}
          </p>
          <p className="concave-3d rounded-lg px-3 py-2.5 text-muted-foreground text-xs leading-relaxed" data-testid="convite-independencia">
            {CONEXAO_MILIONARIA.independencia}
          </p>
          <button
            type="button"
            onClick={onAbrirBoloes}
            data-testid="club-vip-cta-boloes"
            className="btn-3d-soft w-full flex items-center justify-center gap-2 min-h-[48px] px-3 text-xs font-black uppercase tracking-wider"
          >
            <Ticket className="w-4 h-4" aria-hidden="true" /> {CONEXAO_MILIONARIA.cta}
          </button>
          <p className="text-muted-foreground text-[11px] leading-snug text-center">{CONEXAO_MILIONARIA.aviso}</p>
        </article>
      </div>
    </section>
  );
}

export default function ClubVipCliente({ onAbrirBoloes, token }: { onAbrirBoloes: () => void; token: string }) {
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
      <ComoFunciona />
      <GrupoVipAdesao token={token} />
      <SecaoBeneficios />
      <ConvitesEspeciais onAbrirBoloes={onAbrirBoloes} />
    </div>
  );
}
