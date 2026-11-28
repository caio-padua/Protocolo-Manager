import { useWatch, type Control } from "react-hook-form";
import { PlacaSecao } from "@/components/ui/placa-secao";
import { PlacaTitulo } from "@/components/ui/placa-titulo";

/**
 * Aba "Classificação" do cadastro da empresa (Padrão 38 da skill-layout-paxter).
 * Nada é digitado: cada eixo é uma coluna de botões Salientes (um sobre o outro) e, ao lado, a explicação
 * de cada opção. O botão escolhido fica AFUNDADO em ouro. Fonte: estudo de classificação do CEO (11/11/2026):
 * 1) fiscal/CNAE, 2) assistencial (CNES/Anvisa), 3) grau de complexidade (Anvisa).
 * Os valores de `classificacaoAssistencial` e `grauComplexidade` são espelhados no servidor (routes/empresas.ts).
 */
export type CampoClassificacao = "tipoUnidade" | "classificacaoAssistencial" | "grauComplexidade" | "cnae";

export interface OpcaoClassificacao {
  valor: string;
  rotulo: string;
  explicacao: string;
  /** Só para o eixo CNAE: descrição oficial gravada junto com o código. */
  descricao?: string;
}
export interface EixoClassificacao {
  campo: CampoClassificacao;
  titulo: string;
  dica: string;
  /** CNAE é obrigatório para emitir nota; os demais podem ser desmarcados clicando de novo. */
  obrigatorio: boolean;
  opcoes: OpcaoClassificacao[];
}

export const EIXOS_CLASSIFICACAO: EixoClassificacao[] = [
  {
    campo: "tipoUnidade", titulo: "Categoria", dica: "o que a empresa é", obrigatorio: false,
    opcoes: [
      { valor: "CLINICA", rotulo: "Clínica", explicacao: "Atende pessoas: consultas, procedimentos e acompanhamento." },
      { valor: "LABORATORIO", rotulo: "Laboratório", explicacao: "Coleta e analisa exames. Pode ter posto de coleta que só recolhe o material e envia para análise." },
      { valor: "OUTRO", rotulo: "Outro", explicacao: "Empresa clínica que não se encaixa nas duas anteriores. Escolha só se tiver certeza." },
    ],
  },
  {
    campo: "classificacaoAssistencial", titulo: "Porte assistencial", dica: "CNES e Anvisa", obrigatorio: false,
    opcoes: [
      { valor: "consultorio_isolado", rotulo: "Consultório isolado", explicacao: "Espaço com um só profissional ou atendimento básico." },
      { valor: "clinica_especializada", rotulo: "Clínica especializada", explicacao: "Equipe multiprofissional ou várias especialidades médicas." },
      { valor: "policlinica", rotulo: "Policlínica", explicacao: "Várias especialidades médicas com apoio diagnóstico integrado na própria estrutura." },
    ],
  },
  {
    campo: "grauComplexidade", titulo: "Grau de complexidade", dica: "risco dos procedimentos (Anvisa)", obrigatorio: false,
    opcoes: [
      { valor: "I", rotulo: "Tipo I — Básico", explicacao: "Só consultas clínicas e exames físicos simples, sem procedimento invasivo." },
      { valor: "II", rotulo: "Tipo II — Não invasivo", explicacao: "Exames como ultrassonografia, eletrocardiograma ou coleta simples de sangue." },
      { valor: "III_IV", rotulo: "Tipo III e IV — Invasivo ou sedação", explicacao: "Exames com contraste, endoscopias, biópsias ou cirurgias ambulatoriais com anestesia." },
    ],
  },
  {
    campo: "cnae", titulo: "Atividade fiscal (CNAE)", dica: "CNAE principal: define impostos e alvarás", obrigatorio: true,
    opcoes: [
      { valor: "86.30-5/03", rotulo: "Consultas médicas", descricao: "Atividade médica ambulatorial restrita a consultas", explicacao: "Foco em consultas, sem procedimentos invasivos." },
      { valor: "86.30-5/01", rotulo: "Procedimentos cirúrgicos", descricao: "Atividade médica ambulatorial com recursos para realização de procedimentos cirúrgicos", explicacao: "Clínica que faz pequenos procedimentos cirúrgicos." },
      { valor: "86.30-5/02", rotulo: "Exames complementares", descricao: "Atividade médica ambulatorial com recursos para realização de exames complementares", explicacao: "Clínica que realiza exames complementares próprios." },
      { valor: "86.40-2/02", rotulo: "Laboratório clínico", descricao: "Laboratórios clínicos", explicacao: "Processa exames e também vale para postos de coleta que enviam o material para análise." },
      { valor: "86.40-2/05", rotulo: "Imagem com radiação", descricao: "Serviços de diagnóstico por imagem com uso de radiação ionizante, exceto tomografia", explicacao: "Raio-X e mamografia." },
      { valor: "86.40-2/04", rotulo: "Tomografia", descricao: "Serviços de tomografia", explicacao: "Exclusivo para tomografia." },
      { valor: "86.40-2/06", rotulo: "Ressonância magnética", descricao: "Serviços de ressonância magnética", explicacao: "Imagem sem radiação ionizante, por ressonância." },
      { valor: "86.40-2/07", rotulo: "Ultrassonografia", descricao: "Serviços de diagnóstico por imagem sem uso de radiação ionizante, exceto ressonância magnética", explicacao: "Imagem sem radiação ionizante, por ultrassom." },
    ],
  },
];

export type ValoresClassificacao = Partial<Record<CampoClassificacao, string | null | undefined>>;

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

function igual(campo: CampoClassificacao, a: string | null | undefined, b: string): boolean {
  return campo === "cnae" ? soDigitos(a) === soDigitos(b) && soDigitos(a) !== "" : (a ?? "") === b;
}

export function rotuloEscolhido(eixo: EixoClassificacao, valor: string | null | undefined): string | null {
  if (!valor) return null;
  const op = eixo.opcoes.find((o) => igual(eixo.campo, valor, o.valor));
  if (op) return eixo.campo === "cnae" ? `${op.valor} · ${op.rotulo}` : op.rotulo;
  return eixo.campo === "cnae" ? `${valor} · outro CNAE` : valor;
}

type ControlQualquer = Control<any>;

/** Faixa de papel: Gênesis é o espelho do Instituto Pádua, nunca um tipo de clínica. */
function FaixaPapel({ espelho }: { espelho: boolean }) {
  return (
    <div className="concave-3d flex items-center gap-3 p-2.5" data-testid="classificacao-papel" data-espelho={espelho ? "sim" : "nao"}>
      <PlacaTitulo titulo="Papel no sistema" />
      {espelho ? (
        <p className="text-[12px] leading-snug">
          <strong className="uppercase">Espelho do Instituto Pádua (Gênesis).</strong>{" "}
          Não é um tipo de clínica e não recebe classificação própria: acompanha o Pádua. Nada aqui é alterado.
        </p>
      ) : (
        <p className="text-[12px] leading-snug">
          <strong className="uppercase">Empresa clínica independente.</strong> Recebe classificação própria, escolhida abaixo.
        </p>
      )}
    </div>
  );
}

export function ClassificacaoEmpresa({ control, onEscolher, espelho }: {
  control: ControlQualquer;
  onEscolher: (campo: CampoClassificacao, valor: string, extras?: Record<string, string>) => void;
  espelho: boolean;
}) {
  const valores = useWatch({ control }) as ValoresClassificacao;
  return (
    <div className="space-y-4" data-testid="classificacao-aba">
      <div className="sticky top-0 z-10 bg-background pb-2 pt-0.5">
        <FaixaPapel espelho={espelho} />
      </div>

      {EIXOS_CLASSIFICACAO.map((eixo) => {
        const atual = espelho ? null : valores[eixo.campo];
        const conhecido = eixo.opcoes.some((o) => igual(eixo.campo, atual, o.valor));
        const temOutro = !!atual && !conhecido;
        return (
          <section key={eixo.campo} className="space-y-2" data-testid={`classificacao-eixo-${eixo.campo}`}>
            <PlacaSecao titulo={eixo.titulo} dica={eixo.dica} />
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-[15.5rem_minmax(0,1fr)]">
              {eixo.opcoes.map((op) => {
                const escolhida = igual(eixo.campo, atual, op.valor);
                return (
                  <div key={op.valor} className="contents">
                    <button
                      type="button"
                      disabled={espelho}
                      aria-pressed={escolhida}
                      data-testid={`classificacao-${eixo.campo}-${op.valor}`}
                      onClick={() => {
                        if (escolhida) {
                          if (!eixo.obrigatorio) onEscolher(eixo.campo, "");
                          return;
                        }
                        onEscolher(eixo.campo, op.valor, op.descricao ? { cnaeDescricao: op.descricao } : undefined);
                      }}
                      className="bevel-3d pax-escolha flex min-h-12 w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] font-black uppercase leading-tight tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1">{op.rotulo}</span>
                      {eixo.campo === "cnae" && <span className="shrink-0 font-mono text-[9px] font-bold normal-case opacity-70">{op.valor}</span>}
                    </button>
                    <p
                      className={`concave-3d flex min-h-12 items-center border-l-4 px-3 py-1.5 text-[12px] leading-snug ${
                        escolhida ? "border-l-[#b8892b] font-semibold text-foreground" : "border-l-transparent text-muted-foreground"
                      }`}
                    >
                      {op.explicacao}
                    </p>
                  </div>
                );
              })}
              {temOutro && (
                <div className="contents">
                  <div className="bevel-3d pax-escolha flex min-h-12 items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide" aria-pressed data-testid={`classificacao-${eixo.campo}-outro`}>
                    <span className="min-w-0 flex-1 break-all">Outro: {atual}</span>
                  </div>
                  <p className="concave-3d flex min-h-12 items-center border-l-4 border-l-[#b8892b] px-3 py-1.5 text-[12px] font-semibold leading-snug">
                    {eixo.campo === "cnae"
                      ? "Código informado antes, fora desta lista. Escolha um item da lista para trocar."
                      : "Valor anterior fora desta lista. Escolha um item da lista para trocar."}
                  </p>
                </div>
              )}
            </div>
          </section>
        );
      })}
      <p className="text-[10px] text-muted-foreground">
        As escolhas só valem depois de clicar em SALVAR EMPRESA. Clique de novo num botão escolhido para desmarcar (o CNAE não desmarca).
      </p>
    </div>
  );
}

/** Resumo somente leitura da classificação, usado na aba Dados no lugar dos antigos campos Tipo e Categoria. */
export function ResumoClassificacao({ control, espelho, onAbrir }: { control: ControlQualquer; espelho: boolean; onAbrir: () => void }) {
  const valores = useWatch({ control }) as ValoresClassificacao;
  const partes = EIXOS_CLASSIFICACAO.map((e) => rotuloEscolhido(e, valores[e.campo])).filter(Boolean) as string[];
  return (
    <div className="md:col-span-2" data-testid="dados-resumo-classificacao">
      <span className="lbl">Classificação</span>
      <div className="mt-1 flex items-stretch gap-2">
        <p className="concave-3d flex min-h-10 min-w-0 flex-1 items-center px-3 py-1.5 text-[12px] font-semibold leading-snug">
          {espelho ? "Espelho do Instituto Pádua (Gênesis): sem classificação própria."
            : partes.length ? partes.join(" · ") : <span className="text-amber-700 dark:text-amber-400">Nada escolhido ainda.</span>}
        </p>
        <button type="button" onClick={onAbrir} data-testid="dados-abrir-classificacao"
          className="btn-3d-soft shrink-0 px-3 text-[10px] font-black uppercase tracking-widest">
          Abrir classificação
        </button>
      </div>
    </div>
  );
}
