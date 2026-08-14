/* ══════════════════════════════════════════════════════════════════════════════
   O MOSTRADOR — molde unico do numeral Paxter
   ------------------------------------------------------------------------------
   CONCEITO (proposto ao CEO em 13/08/2026):
   Numero nao e digito. Numero e uma EXPRESSAO com anatomia — simbolo de moeda,
   parte inteira, separador, centavos, unidade. Um mostrador de relogio fino nao
   mistura materiais: ponteiro, indice e algarismo saem do mesmo metal, cortados
   com a mesma luz. Aqui e igual.

   O DEFEITO QUE ORIGINOU ISTO: no Painel de Controle o valor saia "R$ 3.385,00"
   com o "R$" em Inter e os digitos em EB Garamond — dois materiais na mesma peca.

   POR QUE A GAVETA "PaxmedNum" NAO CONSERTA ISSO, NUNCA:
   a gaveta troca por EB Garamond apenas os caracteres U+0030-0039, ou seja, so os
   dez algarismos. O "R" de "R$" e LETRA. Botar letra na gaveta serifaria todas as
   palavras do sistema. Logo a gaveta e REDE DE SEGURANCA, nao lei. A lei e este
   componente: toda expressao numerica visivel nasce daqui.

   REGRA DE OURO DESTE ARQUIVO: nao usar a gaveta aqui. A pilha display JA E o
   EB Garamond nativo — meter a gaveta (size-adjust 115,1%) deixaria o digito
   cerca de 15% maior que o simbolo ao lado dele.

   DUAS TRAVAS DE HONESTIDADE (revisao de codigo de 13/08/2026):
   1. Dado ausente NAO vira zero. Se a API mandar null, undefined, NaN ou infinito,
      a peca mostra um travessao — nunca "R$ 0,00", que seria mentira contabil.
   2. O espaco entre o simbolo e o numero e um espaco DE VERDADE (caractere
      inquebravel), nao so margem de CSS. Sem isso, copiar a tela dava "R$3.385,00"
      grudado e a busca do navegador (Ctrl+F) por "R$ 3.385" nao achava nada.
   ══════════════════════════════════════════════════════════════════════════════ */
import type { CSSProperties, ReactNode } from "react";

/** EB Garamond nativo, sem a gaveta de numerais. */
const SERIF = "var(--app-font-display)";

/** Espaco inquebravel de verdade — sobrevive ao copiar e ao Ctrl+F. */
const ESPACO = "\u00A0";

/**
 * Os tres moldes possiveis do numeral.
 * - pleno       : centavos do mesmo corpo do inteiro. Leitura mais direta.
 * - alto        : centavos elevados e menores, como mostrador de relojoaria.
 * - engenharia  : simbolo e centavos na linha de base, sobrios, sem elevacao.
 */
export type Molde = "pleno" | "alto" | "engenharia";

/**
 * ESCOLHA TRAVADA PELO CEO EM 14/08/2026: opcao "C" ajustada por ele —
 * simbolo a 80% do corpo (0,8 em) com elevacao cortada para 0,2 em.
 * Essa e agora a REGRA VIGENTE (estiloSimbolo abaixo). As opcoes "A" e "B"
 * ficam de pe apenas para a tela de comparacao Lei do Numeral; nenhuma tela
 * de producao passa a prop `cifrao`.
 *
 * Historico do defeito: o simbolo a 0,56 em subindo 0,52 em virava "sinalzinho
 * pendurado" no topo do digito.
 * - "A": simbolo maior (0,72 em) com elevacao pequena (-0,14 em).
 * - "B": simbolo alinhado pela linha de base, sem elevacao alguma.
 * - "C": a escolhida — 0,8 em com elevacao de -0,2 em.
 */
export type Cifrao = "A" | "B" | "C";

function estiloCifrao(cifrao: Cifrao): CSSProperties {
  const comum: CSSProperties = { fontWeight: 500, letterSpacing: "0.04em" };
  if (cifrao === "A") {
    return { ...comum, fontSize: "0.72em", opacity: 0.66, transform: "translateY(-0.14em)" };
  }
  if (cifrao === "B") {
    return { ...comum, fontSize: "0.62em", opacity: 0.6 };
  }
  // "C" espelha exatamente a regra vigente travada pelo CEO.
  return { ...comum, fontSize: "0.8em", opacity: 0.62, transform: "translateY(-0.2em)" };
}

const BASE: CSSProperties = {
  fontFamily: SERIF,
  fontVariantNumeric: "tabular-nums lining-nums",
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
  display: "inline-flex",
  alignItems: "baseline",
  whiteSpace: "nowrap",
  letterSpacing: "-0.005em",
};

/**
 * Simbolo (R$, %, mg) — REGRA VIGENTE, travada pelo CEO em 14/08/2026:
 * corpo a 80% do algarismo, elevacao de 0,2 em.
 *
 * O que mudou e por que: antes o simbolo era pequeno (0,56 em) E subia ate o
 * topo do digito (0,52 em) — duas causas somadas que o deixavam com cara de
 * sinalzinho pendurado. Agora ele tem presenca (80%) e sobe pouco (0,2 em):
 * anuncia o valor sem competir com ele. A opacidade continua em 0,62 para o
 * olho pousar no numero, nao no simbolo.
 *
 * O molde "engenharia" segue com regra propria (linha de base, sem elevacao):
 * ele existe para planilha densa e relatorio contabil, onde nada sobe.
 */
function estiloSimbolo(molde: Molde): CSSProperties {
  if (molde === "engenharia") {
    return { fontSize: "0.62em", fontWeight: 500, opacity: 0.55, letterSpacing: "0.02em" };
  }
  return {
    fontSize: "0.8em",
    fontWeight: 500,
    opacity: 0.62,
    letterSpacing: "0.04em",
    transform: "translateY(-0.2em)",
  };
}

function estiloCentavos(molde: Molde): CSSProperties {
  if (molde === "alto") {
    return { fontSize: "0.56em", fontWeight: 600, opacity: 0.78, transform: "translateY(-0.52em)", marginLeft: "0.05em" };
  }
  if (molde === "engenharia") {
    return { fontSize: "0.62em", fontWeight: 600, opacity: 0.6 };
  }
  return { fontSize: "1em", fontWeight: "inherit", opacity: 0.82 };
}

/** Dado ausente nunca vira zero: mostra travessao e diz que esta indisponivel. */
function Ausente({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      className={className}
      title="Valor indisponivel"
      aria-label="Valor indisponivel"
      style={{ ...BASE, fontWeight: 500, opacity: 0.4, ...style }}
    >
      &mdash;
    </span>
  );
}

/** Verdadeiro so para numero real e finito. null, undefined, NaN e infinito reprovam. */
function valido(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function partir(valor: number, casas: number): [string, string | undefined] {
  const texto = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
  const [inteiro, decimal] = texto.split(",");
  return [inteiro, decimal];
}

type Comum = {
  /** peso do corpo principal. 800 e o maximo REAL do EB Garamond — nunca 900. */
  peso?: number;
  molde?: Molde;
  className?: string;
  style?: CSSProperties;
};

/** Algarismo puro: contagem, quantidade, identificador. Sem simbolo, sem unidade. */
export function Numeral({
  children,
  peso = 700,
  className = "",
  style,
}: Comum & { children: ReactNode }) {
  return (
    <span className={className} style={{ ...BASE, fontWeight: peso, ...style }}>
      {children}
    </span>
  );
}

/** Dinheiro. Sempre padrao brasileiro: ponto de milhar e virgula decimal. */
export function Valor({
  valor,
  moeda = "R$",
  semCentavos = false,
  molde = "pleno",
  peso = 700,
  className = "",
  style,
  cifrao,
}: Comum & {
  valor: number | null | undefined;
  moeda?: string;
  semCentavos?: boolean;
  /** opcao experimental de cifrao (comparacao para o CEO); ausente = regra vigente. */
  cifrao?: Cifrao;
}) {
  if (!valido(valor)) return <Ausente className={className} style={style} />;

  const negativo = valor < 0;
  const [inteiro, centavos] = partir(Math.abs(valor), 2);
  const legivel = `${negativo ? "-" : ""}${moeda} ${inteiro}${semCentavos ? "" : `,${centavos}`}`;

  return (
    <span className={className} aria-label={legivel} style={{ ...BASE, fontWeight: peso, ...style }}>
      {negativo && <span>&minus;</span>}
      <span style={cifrao ? estiloCifrao(cifrao) : estiloSimbolo(molde)}>
        {moeda}
        {ESPACO}
      </span>
      <span>{inteiro}</span>
      {!semCentavos && <span style={estiloCentavos(molde)}>,{centavos}</span>}
    </span>
  );
}

/**
 * Percentual. Virgula decimal, nunca ponto — "17,0%" e nao "17.0%".
 * Sem espaco antes do sinal: e a forma usada no Brasil.
 */
export function Percentual({
  valor,
  casas = 1,
  molde = "pleno",
  peso = 700,
  className = "",
  style,
}: Comum & { valor: number | null | undefined; casas?: number }) {
  if (!valido(valor)) return <Ausente className={className} style={style} />;

  const [inteiro, decimal] = partir(valor, casas);
  const legivel = `${inteiro}${decimal !== undefined ? `,${decimal}` : ""}%`;

  return (
    <span className={className} aria-label={legivel} style={{ ...BASE, fontWeight: peso, ...style }}>
      <span>{inteiro}</span>
      {decimal !== undefined && <span style={estiloCentavos(molde)}>,{decimal}</span>}
      <span style={{ ...estiloSimbolo(molde), marginLeft: "0.06em" }}>%</span>
    </span>
  );
}

/**
 * Medida clinica: dose, volume, massa. A unidade e parte da peca, nao texto solto.
 * Com espaco de verdade antes da unidade, como manda a notacao cientifica: "250 mg".
 */
export function Medida({
  valor,
  unidade,
  casas = 0,
  molde = "pleno",
  peso = 700,
  className = "",
  style,
}: Comum & { valor: number | null | undefined; unidade: string; casas?: number }) {
  if (!valido(valor)) return <Ausente className={className} style={style} />;

  const [inteiro, decimal] = partir(valor, casas);
  const legivel = `${inteiro}${decimal !== undefined ? `,${decimal}` : ""} ${unidade}`;

  return (
    <span className={className} aria-label={legivel} style={{ ...BASE, fontWeight: peso, ...style }}>
      <span>{inteiro}</span>
      {decimal !== undefined && <span style={estiloCentavos(molde)}>,{decimal}</span>}
      <span style={estiloSimbolo(molde)}>
        {ESPACO}
        {unidade}
      </span>
    </span>
  );
}
