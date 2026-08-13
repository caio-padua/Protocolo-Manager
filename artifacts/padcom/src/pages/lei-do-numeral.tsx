/* ══════════════════════════════════════════════════════════════════════════════
   A LEI DO NUMERAL — "O MOSTRADOR"
   Tela-argumento: mostra o defeito real do Painel de Controle, disseca a anatomia
   do numero, prova por que a gaveta de numerais nunca vai resolver sozinha, e
   apresenta os tres moldes possiveis para o CEO escolher com os olhos.
   Rota: /lei-do-numeral
   ══════════════════════════════════════════════════════════════════════════════ */
import { Valor, Percentual, Numeral, Medida, type Molde } from "@/components/numeral/Numeral";
import { Activity, Calendar as CalendarIcon, CheckCircle2, TrendingUp } from "lucide-react";
import { useState } from "react";

const OURO = "hsl(39, 41%, 51%)";
const NAVY = "hsl(214, 54%, 19%)";
const VERMELHO = "hsl(0, 72%, 51%)";
const VERDE = "hsl(142, 71%, 45%)";

/* ---------- pecas de casca ---------- */

function Selo({ children, cor = OURO }: { children: React.ReactNode; cor?: string }) {
  return (
    <div
      className="bevel-3d inline-block rounded-[3px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
      style={{ color: cor }}
    >
      {children}
    </div>
  );
}

function Zona({
  n,
  titulo,
  linhaFina,
  children,
}: {
  n: string;
  titulo: string;
  linhaFina: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-3d rounded-[6px] p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div
          className="concave-3d flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px]"
          style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, color: OURO }}
        >
          {n}
        </div>
        <div className="min-w-0">
          <h2
            className="text-xl leading-tight text-primary"
            style={{ fontFamily: "var(--app-font-display)", fontWeight: 700 }}
          >
            {titulo}
          </h2>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{linhaFina}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Reproduz o card de KPI exatamente como o Painel de Controle desenha hoje. */
function CardKpi({
  label,
  sub,
  cor,
  icone: Icone,
  children,
  moldura,
}: {
  label: string;
  sub: string;
  cor: string;
  icone: React.ElementType;
  children: React.ReactNode;
  moldura?: string;
}) {
  return (
    <div
      className="panel-3d flex overflow-hidden rounded-[6px]"
      style={moldura ? { outline: `1px solid ${moldura}`, outlineOffset: 2 } : undefined}
    >
      <div className="w-1 shrink-0" style={{ backgroundColor: cor }} />
      <div className="flex-1">
        <div className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
          <div className="bevel-3d rounded-[3px] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {label}
          </div>
          <Icone className="h-4 w-4" style={{ color: cor }} />
        </div>
        <div className="p-3 pt-0">
          <div className="screen-3d flex flex-col items-center justify-center rounded-[4px] p-3">
            <div className="text-2xl font-extrabold tracking-tight text-primary">{children}</div>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
              {sub}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Peca da dissecacao: o pedaco do numero + a etiqueta embaixo, ligada por um traco. */
function PecaAnatomia({
  amostra,
  nome,
  regra,
  cor,
}: {
  amostra: React.ReactNode;
  nome: string;
  regra: string;
  cor: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="text-primary" style={{ fontSize: 44, lineHeight: 1 }}>
        {amostra}
      </div>
      <div className="h-4 w-px" style={{ backgroundColor: cor }} />
      <div className="bevel-3d rounded-[3px] px-2 py-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: cor }}>
          {nome}
        </div>
      </div>
      <p className="max-w-[150px] text-[10px] leading-snug text-muted-foreground">{regra}</p>
    </div>
  );
}

/* ---------- a tela ---------- */

export default function LeiDoNumeral() {
  const [molde, setMolde] = useState<Molde>("pleno");

  const moldes: { id: Molde; nome: string; carater: string; quando: string; padrao?: boolean }[] = [
    {
      id: "pleno",
      nome: "A · Mostrador Pleno",
      carater: "Centavos do mesmo corpo, so mais discretos",
      quando: "Leitura rapida. Painel, lista, cobranca.",
      padrao: true,
    },
    {
      id: "alto",
      nome: "B · Mostrador Alto",
      carater: "Centavos elevados, como relojoaria fina",
      quando: "Peca de vitrine. Carta, proposta, capa de PDF.",
    },
    {
      id: "engenharia",
      nome: "C · Mostrador Tecnico",
      carater: "Tudo na linha de base, sobrio, sem elevacao",
      quando: "Planilha densa, relatorio contabil, extrato.",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5">
      {/* ══ CABECALHO ══ */}
      <header className="panel-3d rounded-[6px] p-6">
        <Selo>Proposta de padrao · 13 de agosto de 2026</Selo>
        <h1
          className="mt-3 text-4xl leading-none text-primary"
          style={{ fontFamily: "var(--app-font-display)", fontWeight: 800 }}
        >
          A Lei do Numeral
        </h1>
        <p
          className="mt-1 text-lg italic text-muted-foreground"
          style={{ fontFamily: "var(--app-font-display)", fontWeight: 500 }}
        >
          conceito: <span style={{ color: OURO }}>o Mostrador</span>
        </p>
        <div className="mt-4 max-w-3xl space-y-2 text-[13px] leading-relaxed text-muted-foreground">
          <p>
            Um mostrador de relogio fino nao mistura materiais. O ponteiro, o indice e o algarismo
            saem do mesmo metal, cortados com a mesma luz. Se um unico indice for de outro material,
            o relogio inteiro vira bijuteria — e o olho percebe antes da razao.
          </p>
          <p className="text-primary">
            No sistema, hoje, o cifrao e de um material e o algarismo e de outro.
          </p>
        </div>
      </header>

      {/* ══ ZONA 1 — O DEFEITO ══ */}
      <Zona
        n="1"
        titulo="O defeito, lado a lado"
        linhaFina="Os dois cards abaixo sao reais e estao vivos nesta tela. O da esquerda usa a regra de hoje."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Selo cor={VERMELHO}>Como esta hoje</Selo>
            <CardKpi
              label="Receita do Mes"
              sub="9 pagamentos pendentes"
              cor={OURO}
              icone={TrendingUp}
              moldura={VERMELHO}
            >
              {/* a pilha SANS: a gaveta serifa so os digitos, o "R$" fica em Inter */}
              <span style={{ fontFamily: "var(--app-font-sans)" }}>R$&nbsp;3.385,00</span>
            </CardKpi>
            <ul className="space-y-1 pl-1 text-[11px] leading-snug text-muted-foreground">
              <li>
                <span style={{ color: VERMELHO }}>&#9679;</span> O <strong>R$</strong> e Inter; o{" "}
                <strong>3.385</strong> e EB Garamond. Dois materiais na mesma peca.
              </li>
              <li>
                <span style={{ color: VERMELHO }}>&#9679;</span> O cifrao encosta na base do numero,
                do tamanho cheio, disputando atencao com o valor.
              </li>
              <li>
                <span style={{ color: VERMELHO }}>&#9679;</span> Os centavos tem o mesmo peso dos
                reais — <strong>o zero grita igual ao milhar</strong>.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <Selo cor={VERDE}>Como deve ser</Selo>
            <CardKpi
              label="Receita do Mes"
              sub="9 pagamentos pendentes"
              cor={OURO}
              icone={TrendingUp}
              moldura={VERDE}
            >
              <Valor valor={3385} molde={molde} />
            </CardKpi>
            <ul className="space-y-1 pl-1 text-[11px] leading-snug text-muted-foreground">
              <li>
                <span style={{ color: VERDE }}>&#9679;</span> Uma unica fonte na peca inteira.
              </li>
              <li>
                <span style={{ color: VERDE }}>&#9679;</span> Cifrao recuado e elevado ao topo do
                algarismo — anuncia, nao compete.
              </li>
              <li>
                <span style={{ color: VERDE }}>&#9679;</span> Centavos rebaixados: o olho pousa no
                valor, nao no troco.
              </li>
            </ul>
          </div>
        </div>
      </Zona>

      {/* ══ ZONA 2 — ANATOMIA ══ */}
      <Zona
        n="2"
        titulo="Anatomia de um numero"
        linhaFina="O erro nasce de tratar numero como digito. Numero e uma expressao com quatro partes."
      >
        <div className="screen-3d rounded-[5px] p-6">
          <div className="flex flex-wrap items-start justify-center gap-8">
            <PecaAnatomia
              cor={OURO}
              amostra={
                <span
                  style={{
                    fontFamily: "var(--app-font-display)",
                    fontWeight: 500,
                    fontSize: "0.56em",
                    opacity: 0.62,
                  }}
                >
                  R$
                </span>
              }
              nome="Simbolo"
              regra="56% do corpo · peso 500 · 62% de opacidade · alinhado ao TOPO do algarismo"
            />
            <PecaAnatomia
              cor={NAVY}
              amostra={<Numeral>3.385</Numeral>}
              nome="Inteiro"
              regra="corpo cheio · peso 700 · largura fixa · ponto de milhar"
            />
            <PecaAnatomia
              cor={NAVY}
              amostra={
                <span style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, opacity: 0.82 }}>
                  ,
                </span>
              }
              nome="Separador"
              regra="virgula, sempre. Nunca ponto — padrao brasileiro"
            />
            <PecaAnatomia
              cor={OURO}
              amostra={
                <span
                  style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, opacity: 0.82 }}
                >
                  00
                </span>
              }
              nome="Centavos"
              regra="rebaixados em opacidade (e em corpo, no molde B)"
            />
          </div>
          <div className="mt-6 border-t pt-5 text-center" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              As quatro partes remontadas
            </p>
            <div className="text-primary" style={{ fontSize: 56, lineHeight: 1.1 }}>
              <Valor valor={3385} molde={molde} />
            </div>
          </div>
        </div>
      </Zona>

      {/* ══ ZONA 3 — POR QUE A GAVETA NAO SALVA ══ */}
      <Zona
        n="3"
        titulo="Por que a solucao atual nunca vai consertar isso"
        linhaFina="Nao e falta de capricho. E um limite duro da tecnica que esta em uso hoje."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="panel-3d-sub space-y-3 rounded-[5px] p-4">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Hoje existe uma <strong className="text-primary">gaveta</strong> no sistema: uma regra
              que diz &quot;quando aparecer um algarismo dentro de texto comum, desenhe com EB
              Garamond&quot;. Ela cobre exatamente dez caracteres:
            </p>
            <div className="concave-3d rounded-[4px] p-3 text-center">
              <span
                className="text-primary"
                style={{ fontFamily: "var(--app-font-display)", fontWeight: 700, fontSize: 30, letterSpacing: "0.12em" }}
              >
                0123456789
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              O <strong className="text-primary">R</strong> de &quot;R$&quot; e{" "}
              <strong className="text-primary">letra</strong>. Se eu colocasse letra na gaveta, toda
              palavra do sistema viraria serifada — o menu, os botoes, as tabelas. A gaveta chega ao
              limite dela exatamente no cifrao.
            </p>
          </div>
          <div className="panel-3d-sub space-y-3 rounded-[5px] p-4">
            <Selo cor={VERDE}>A saida</Selo>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Parar de remendar a fonte e{" "}
              <strong className="text-primary">dar corpo ao numero</strong>. Toda expressao numerica
              da tela passa a nascer de uma peca unica, que ja sabe as regras de cor, tamanho,
              alinhamento e padrao brasileiro.
            </p>
            <div className="concave-3d rounded-[4px] p-3">
              <code className="text-[11px] leading-relaxed text-primary">
                &lt;Valor valor=&#123;3385&#125; /&gt;
                <br />
                &lt;Percentual valor=&#123;17&#125; /&gt;
                <br />
                &lt;Medida valor=&#123;250&#125; unidade=&quot;mg&quot; /&gt;
              </code>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              A gaveta continua existindo — como{" "}
              <strong className="text-primary">rede de seguranca</strong>, para o numero solto que
              escapar. Ela deixa de ser a lei e passa a ser o corrimao.
            </p>
          </div>
        </div>
      </Zona>

      {/* ══ ZONA 4 — OS TRES MOLDES ══ */}
      <Zona
        n="4"
        titulo="Os tres moldes — escolha com os olhos"
        linhaFina="Clique num molde: a tela inteira se reescreve nele, inclusive os cards das zonas 1, 2 e 5."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {moldes.map((m) => {
            const ativo = molde === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMolde(m.id)}
                className={`panel-3d-sub rounded-[5px] p-4 text-left transition-all ${
                  ativo ? "paxter-alert" : "opacity-80 hover:opacity-100"
                }`}
                style={ativo ? { outline: `1px solid ${OURO}`, outlineOffset: 2 } : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: ativo ? OURO : undefined }}
                  >
                    {m.nome}
                  </span>
                  {m.padrao && (
                    <span
                      className="bevel-3d rounded-[3px] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: VERDE }}
                    >
                      Recomendado
                    </span>
                  )}
                </div>
                <div className="screen-3d mt-3 flex items-center justify-center rounded-[4px] p-4">
                  <span className="text-primary" style={{ fontSize: 38, lineHeight: 1 }}>
                    <Valor valor={3385} molde={m.id} />
                  </span>
                </div>
                <p className="mt-3 text-[11px] leading-snug text-primary">{m.carater}</p>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{m.quando}</p>
              </button>
            );
          })}
        </div>
      </Zona>

      {/* ══ ZONA 5 — EM CONTEXTO ══ */}
      <Zona
        n="5"
        titulo="O painel inteiro sob a lei"
        linhaFina="Os quatro cards do Painel de Controle, com a taxa ja em virgula brasileira."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <CardKpi label="Sessoes Hoje" sub="12 esta semana" cor={OURO} icone={CalendarIcon}>
            <Numeral>3</Numeral>
          </CardKpi>
          <CardKpi label="Protocolos Ativos" sub="3684 clientes no total" cor={NAVY} icone={Activity}>
            <Numeral>30</Numeral>
          </CardKpi>
          <CardKpi label="Receita do Mes" sub="9 pagamentos pendentes" cor={OURO} icone={TrendingUp}>
            <Valor valor={3385} molde={molde} />
          </CardKpi>
          <CardKpi label="Taxa de Conclusao" sub="1 faltas recentes" cor={VERMELHO} icone={CheckCircle2}>
            <Percentual valor={17} molde={molde} />
          </CardKpi>
        </div>
        <div className="panel-3d-sub rounded-[5px] p-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Repare no quarto card: hoje ele escreve{" "}
            <span style={{ fontFamily: "var(--app-font-sans)", color: VERMELHO }}>17.0%</span> com
            ponto, que e notacao americana. Sob a lei ele escreve{" "}
            <span style={{ color: VERDE }}>
              <Percentual valor={17} molde={molde} peso={600} />
            </span>{" "}
            com virgula, e o sinal de porcentagem vira parte da peca.
          </p>
        </div>
      </Zona>

      {/* ══ ZONA 6 — A PROVA DA COLUNA ══ */}
      <Zona
        n="6"
        titulo="A prova da coluna"
        linhaFina="O motivo tecnico de tudo isto: numero de sistema tem de empilhar em coluna perfeita."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="panel-3d-sub rounded-[5px] p-4">
            <Selo cor={VERMELHO}>Sem a lei · fonte de interface</Selo>
            <div
              className="screen-3d mt-3 space-y-1 rounded-[4px] p-4 text-right"
              style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 700 }}
            >
              <div>R$ 1.111,00</div>
              <div>R$ 3.385,00</div>
              <div>R$ 47.900,00</div>
              <div>R$ 8,50</div>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              As casas nao se alinham: o algarismo 1 e mais estreito que o 4, entao a coluna
              serpenteia.
            </p>
          </div>
          <div className="panel-3d-sub rounded-[5px] p-4">
            <Selo cor={VERDE}>Sob a lei · EB Garamond de largura fixa</Selo>
            <div className="screen-3d mt-3 space-y-1 rounded-[4px] p-4 text-right text-primary" style={{ fontSize: 22 }}>
              <div>
                <Valor valor={1111} molde={molde} />
              </div>
              <div>
                <Valor valor={3385} molde={molde} />
              </div>
              <div>
                <Valor valor={47900} molde={molde} />
              </div>
              <div>
                <Valor valor={8.5} molde={molde} />
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              Todos os dez algarismos tem a mesma largura, medida no arquivo da fonte: variacao
              0,0000. A coluna fica a prumo.
            </p>
          </div>
        </div>
      </Zona>

      {/* ══ ZONA 7 — ALEM DO DINHEIRO ══ */}
      <Zona
        n="7"
        titulo="A lei nao e so sobre dinheiro"
        linhaFina="Toda unidade grudada num numero e parte da peca: dose, volume, tempo, contagem."
      >
        <div className="screen-3d flex flex-wrap items-end justify-center gap-x-10 gap-y-6 rounded-[5px] p-6 text-primary">
          {[
            { el: <Medida valor={250} unidade="mg" molde={molde} />, nome: "Dose" },
            { el: <Medida valor={2.5} unidade="ml" molde={molde} casas={1} />, nome: "Volume" },
            { el: <Percentual valor={17} molde={molde} />, nome: "Taxa" },
            { el: <Valor valor={3385} molde={molde} />, nome: "Dinheiro" },
            { el: <Numeral>30</Numeral>, nome: "Contagem" },
            { el: <Valor valor={null} molde={molde} />, nome: "Sem dado" },
          ].map((p) => (
            <div key={p.nome} className="flex flex-col items-center gap-2">
              <span style={{ fontSize: 34, lineHeight: 1 }}>{p.el}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {p.nome}
              </span>
            </div>
          ))}
        </div>
      </Zona>

      {/* ══ ZONA 8 — O QUE FALTA ══ */}
      <Zona
        n="8"
        titulo="O que eu proponho executar"
        linhaFina="A peca ja existe e ja esta aplicada no Painel de Controle. O resto e varredura."
      >
        <div className="overflow-hidden rounded-[5px]" style={{ border: "1px solid rgba(0,0,0,0.08)" }}>
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr style={{ backgroundColor: "hsl(39, 41%, 51%, 0.12)" }}>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.1em]">Etapa</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.1em]">O que acontece</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.1em]">Estado</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {[
                ["1", "Criar a peca unica do numeral (o molde)", "FEITO"],
                ["2", "Aplicar no Painel de Controle — os 4 cards", "FEITO"],
                ["3", "Varrer todas as telas de dinheiro (orcamento, financeiro, cobranca)", "AGUARDA ORDEM"],
                ["4", "Levar a mesma lei para os PDFs (carta, receituario, dossie)", "AGUARDA ORDEM"],
                ["5", "Gravar a lei na skill de layout, para nunca mais divergir", "AGUARDA ORDEM"],
              ].map(([n, o, e]) => (
                <tr key={n} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td className="px-3 py-2" style={{ fontFamily: "var(--app-font-display)", fontWeight: 700 }}>
                    {n}
                  </td>
                  <td className="px-3 py-2">{o}</td>
                  <td className="px-3 py-2">
                    <span
                      className="bevel-3d inline-block rounded-[3px] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: e === "FEITO" ? VERDE : OURO }}
                    >
                      {e}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Zona>
    </div>
  );
}
