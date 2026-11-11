import { useWatch, type Control } from "react-hook-form";
import {
  Stethoscope, FlaskConical, Shapes, User, Users, Hospital, Gauge, Activity, Syringe, Scissors,
  ClipboardList, ScanLine, Radiation, Waves, Microscope, Lock, ShieldCheck, Tags, Building2,
  type LucideIcon,
} from "lucide-react";
import { PlacaSecao } from "@/components/ui/placa-secao";

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
  icone: LucideIcon;
  explicacao: string;
  /** Só para o eixo CNAE: descrição oficial gravada junto com o código. */
  descricao?: string;
}
export interface EixoClassificacao {
  campo: CampoClassificacao;
  titulo: string;
  dica: string;
  icone: LucideIcon;
  /** CNAE é obrigatório para emitir nota; os demais podem ser desmarcados clicando de novo. */
  obrigatorio: boolean;
  opcoes: OpcaoClassificacao[];
}

export const EIXOS_CLASSIFICACAO: EixoClassificacao[] = [
  {
    campo: "tipoUnidade", titulo: "Categoria", dica: "o que a empresa é", icone: Shapes, obrigatorio: false,
    opcoes: [
      { valor: "CLINICA", rotulo: "Clínica", icone: Stethoscope, explicacao: "Atende pessoas: consultas, procedimentos e acompanhamento." },
      { valor: "LABORATORIO", rotulo: "Laboratório", icone: FlaskConical, explicacao: "Coleta e analisa exames. Pode ter posto de coleta que só recolhe o material e envia para análise." },
      { valor: "OUTRO", rotulo: "Outro", icone: Shapes, explicacao: "Empresa clínica que não se encaixa nas duas anteriores. Escolha só se tiver certeza." },
    ],
  },
  {
    campo: "classificacaoAssistencial", titulo: "Porte assistencial", dica: "CNES e Anvisa", icone: Hospital, obrigatorio: false,
    opcoes: [
      { valor: "consultorio_isolado", rotulo: "Consultório isolado", icone: User, explicacao: "Espaço com um só profissional ou atendimento básico." },
      { valor: "clinica_especializada", rotulo: "Clínica especializada", icone: Users, explicacao: "Equipe multiprofissional ou várias especialidades médicas." },
      { valor: "policlinica", rotulo: "Policlínica", icone: Hospital, explicacao: "Várias especialidades médicas com apoio diagnóstico integrado na própria estrutura." },
    ],
  },
  {
    campo: "grauComplexidade", titulo: "Grau de complexidade", dica: "risco dos procedimentos (Anvisa)", icone: Gauge, obrigatorio: false,
    opcoes: [
      { valor: "I", rotulo: "Tipo I — Básico", icone: Stethoscope, explicacao: "Só consultas clínicas e exames físicos simples, sem procedimento invasivo." },
      { valor: "II", rotulo: "Tipo II — Não invasivo", icone: Activity, explicacao: "Exames como ultrassonografia, eletrocardiograma ou coleta simples de sangue." },
      { valor: "III_IV", rotulo: "Tipo III e IV — Invasivo ou sedação", icone: Syringe, explicacao: "Exames com contraste, endoscopias, biópsias ou cirurgias ambulatoriais com anestesia." },
    ],
  },
  {
    campo: "cnae", titulo: "Atividade fiscal (CNAE principal)", dica: "define impostos e alvarás", icone: ClipboardList, obrigatorio: true,
    opcoes: [
      { valor: "86.30-5/03", rotulo: "Consultas médicas", icone: Stethoscope, descricao: "Atividade médica ambulatorial restrita a consultas", explicacao: "Foco em consultas, sem procedimentos invasivos." },
      { valor: "86.30-5/01", rotulo: "Procedimentos cirúrgicos", icone: Scissors, descricao: "Atividade médica ambulatorial com recursos para realização de procedimentos cirúrgicos", explicacao: "Clínica que faz pequenos procedimentos cirúrgicos." },
      { valor: "86.30-5/02", rotulo: "Exames complementares", icone: ClipboardList, descricao: "Atividade médica ambulatorial com recursos para realização de exames complementares", explicacao: "Clínica que realiza exames complementares próprios." },
      { valor: "86.40-2/02", rotulo: "Laboratório clínico", icone: FlaskConical, descricao: "Laboratórios clínicos", explicacao: "Processa exames e também vale para postos de coleta que enviam o material para análise." },
      { valor: "86.40-2/05", rotulo: "Imagem com radiação", icone: Radiation, descricao: "Serviços de diagnóstico por imagem com uso de radiação ionizante, exceto tomografia", explicacao: "Raio-X e mamografia." },
      { valor: "86.40-2/04", rotulo: "Tomografia", icone: ScanLine, descricao: "Serviços de tomografia", explicacao: "Exclusivo para tomografia." },
      { valor: "86.40-2/06", rotulo: "Ressonância magnética", icone: Waves, descricao: "Serviços de ressonância magnética", explicacao: "Imagem sem radiação ionizante, por ressonância." },
      { valor: "86.40-2/07", rotulo: "Ultrassonografia", icone: Microscope, descricao: "Serviços de diagnóstico por imagem sem uso de radiação ionizante, exceto ressonância magnética", explicacao: "Imagem sem radiação ionizante, por ultrassom." },
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
      <span className="bevel-3d inline-flex h-7 shrink-0 items-center gap-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
        {espelho ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Building2 className="h-3.5 w-3.5" aria-hidden />}
        Papel no sistema
      </span>
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

/** Quatro chips com a escolha atual de cada eixo: dá para ler a classificação inteira sem rolar. */
function ResumoEixos({ valores, bloqueado }: { valores: ValoresClassificacao; bloqueado: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="classificacao-resumo">
      {EIXOS_CLASSIFICACAO.map((eixo) => {
        const escolhido = bloqueado ? null : rotuloEscolhido(eixo, valores[eixo.campo]);
        return (
          <div key={eixo.campo} className="concave-3d flex h-12 min-w-0 flex-col justify-center px-2.5" data-testid={`classificacao-resumo-${eixo.campo}`}>
            <span className="truncate text-[9px] font-black uppercase tracking-widest text-muted-foreground">{eixo.titulo.replace(/ \(.*\)/, "")}</span>
            <span className={`truncate text-[11px] font-bold ${escolhido ? "text-foreground" : "text-amber-700 dark:text-amber-400"}`}>
              {bloqueado ? "—" : escolhido ?? "não escolhido"}
            </span>
          </div>
        );
      })}
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
      <div className="sticky top-0 z-10 space-y-2 bg-background pb-2 pt-0.5">
        <FaixaPapel espelho={espelho} />
        <ResumoEixos valores={valores} bloqueado={espelho} />
      </div>

      {EIXOS_CLASSIFICACAO.map((eixo) => {
        const atual = espelho ? null : valores[eixo.campo];
        const conhecido = eixo.opcoes.some((o) => igual(eixo.campo, atual, o.valor));
        const temOutro = !!atual && !conhecido;
        return (
          <section key={eixo.campo} className="space-y-2" data-testid={`classificacao-eixo-${eixo.campo}`}>
            <PlacaSecao icone={eixo.icone} titulo={eixo.titulo} dica={eixo.dica} total={1} preenchidos={atual ? 1 : 0} />
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-[15.5rem_minmax(0,1fr)]">
              {eixo.opcoes.map((op) => {
                const escolhida = igual(eixo.campo, atual, op.valor);
                const Icone = op.icone;
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
                      <Icone className="h-4 w-4 shrink-0" aria-hidden />
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
                    <Tags className="h-4 w-4 shrink-0" aria-hidden />
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
      <p className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
        <span className="bevel-3d inline-flex shrink-0 items-center gap-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
          <Tags className="h-3.5 w-3.5" aria-hidden /> {espelho ? "Espelho" : "Escolhida"}
        </span>
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
