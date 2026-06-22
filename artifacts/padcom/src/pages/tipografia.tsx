const SANS = '"Archivo", sans-serif';
const BODY = '"Inter", sans-serif';

type Serif = {
  id: string;
  nome: string;
  familia: string;
  carater: string;
};

const SERIFS: Serif[] = [
  {
    id: "cormorant",
    nome: "Cormorant Garamond",
    familia: '"Cormorant Garamond", Georgia, serif',
    carater: "Couture discreta · Hermès",
  },
  {
    id: "playfair",
    nome: "Playfair Display",
    familia: '"Playfair Display", Georgia, serif',
    carater: "Editorial de luxo · Vogue / Dior",
  },
  {
    id: "ebgaramond",
    nome: "EB Garamond",
    familia: '"EB Garamond", Georgia, serif',
    carater: "Clássica de livro · atemporal",
  },
  {
    id: "marcellus",
    nome: "Marcellus",
    familia: '"Marcellus", Georgia, serif',
    carater: "Capitular romana · joalheria / Cartier",
  },
];

function Amostra({ serif }: { serif: Serif }) {
  return (
    <div className="space-y-3">
      {/* selo da fonte */}
      <div className="bevel-3d px-3 py-2 rounded-[4px]">
        <div style={{ fontFamily: serif.familia }} className="text-xl text-primary leading-tight">
          {serif.nome}
        </div>
        <div
          style={{ fontFamily: SANS }}
          className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mt-0.5"
        >
          {serif.carater}
        </div>
      </div>

      {/* amostra de tela real */}
      <div className="panel-3d p-4 space-y-4 rounded-[6px]">
        <div>
          <h2
            style={{ fontFamily: serif.familia }}
            className="text-2xl font-semibold tracking-tight text-primary leading-tight"
          >
            Painel de Controle
          </h2>
          <p style={{ fontFamily: BODY }} className="text-[11px] text-muted-foreground mt-0.5">
            Visão geral operacional — Paxter
          </p>
        </div>

        {/* KPI */}
        <div className="panel-3d-sub p-3 rounded-[5px]">
          <div
            style={{ fontFamily: SANS }}
            className="bevel-3d inline-block px-2 py-1 rounded-[3px] text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground"
          >
            Sessões Hoje
          </div>
          <div className="screen-3d mt-2 p-3 rounded-[4px] flex flex-col items-center">
            <div style={{ fontFamily: BODY }} className="text-3xl font-black tracking-tight text-primary tabular-nums">
              1
            </div>
            <div
              style={{ fontFamily: SANS }}
              className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70 mt-0.5"
            >
              8 esta semana
            </div>
          </div>
        </div>

        {/* card de cliente */}
        <div className="panel-3d-sub p-4 rounded-[5px] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span
              style={{ fontFamily: serif.familia }}
              className="text-lg font-semibold tracking-tight text-primary leading-tight"
            >
              MARIANA COSTA OLIVEIRA
            </span>
            <span
              style={{ fontFamily: SANS }}
              className="concave-3d shrink-0 px-2 py-0.5 rounded-[3px] text-[9px] font-bold uppercase tracking-wide text-green-600"
            >
              Ativo
            </span>
          </div>
          <div style={{ fontFamily: BODY }} className="text-[13px] text-muted-foreground tabular-nums">
            (11) 98222-3344
          </div>
          <div style={{ fontFamily: BODY }} className="text-[13px] text-muted-foreground">
            mariana.oliveira@email.com
          </div>
          <button
            style={{ fontFamily: SANS }}
            className="btn-3d px-3 py-1.5 rounded-[4px] text-[11px] font-bold uppercase tracking-wider"
          >
            Visualizar
          </button>
        </div>

        {/* botão primário */}
        <button
          style={{ fontFamily: SANS }}
          className="btn-3d w-full px-4 py-2 rounded-[4px] text-xs font-bold uppercase tracking-widest"
        >
          + Novo Cliente
        </button>
      </div>
    </div>
  );
}

export default function TipografiaDemo() {
  return (
    <div className="pw-home min-h-screen p-6 md:p-10 space-y-8">
      <header className="space-y-1">
        <h1 style={{ fontFamily: SANS }} className="text-2xl font-black uppercase tracking-tight text-primary">
          Comparativo de Serifadas — Identidade de Grife
        </h1>
        <p style={{ fontFamily: BODY }} className="text-sm text-muted-foreground max-w-3xl">
          Mesma amostra de tela real, no acabamento creme/dourado clássico. A serifada muda só nos NOMES e TÍTULOS;
          botões e rótulos seguem em Archivo (instrumento) e os dados em Inter. Escolha pelo caráter das letras.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {SERIFS.map((s) => (
          <Amostra key={s.id} serif={s} />
        ))}
      </div>
    </div>
  );
}
