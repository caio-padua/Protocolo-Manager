export type CategoriaSinapse =
  | "EXAME"
  | "PRESCRICAO"
  | "INJETAVEL_IM"
  | "INJETAVEL_SC"
  | "INJETAVEL_EV"
  | "IMPLANTE";

export interface PerguntaSinapse {
  perguntaId: string;
  pergunta: string;
}

export interface DestinoSinapse {
  tipo: string;
  id: number;
  nome: string;
  incompleto?: boolean;
}

export interface PropostaSinapseInicial {
  perguntaId: string;
  categoria: CategoriaSinapse;
  destinoTipo: string;
  destinoId: number;
  eixo: string;
  justificativa: string;
}

export interface ResultadoPropostasIniciais {
  propostas: PropostaSinapseInicial[];
  codigosAusentes: string[];
  perguntasIgnoradas: Array<{ perguntaId: string; motivo: string }>;
}

const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

const MATRIZ_EIXOS = [
  {
    nome: "Energia / fadiga",
    perguntas: ["C-GER03", "M-ENE01", "PHQ4"],
    destinos: [
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO BASE INTEGRATIVA", "BLOCO TIREOIDE"] },
      { categoria: "PRESCRICAO", tipo: "formula", regex: /ENERGIA|MITOCONDR/ },
      { categoria: "INJETAVEL_IM", tipo: "injetavel", nomes: ["ACETIL L-CARNITINA", "D-RIBOSE", "L-CARNITINA"] },
      { categoria: "INJETAVEL_EV", tipo: "injetavel", nomes: ["ACETIL L-CARNITINA", "D-RIBOSE", "L-CARNITINA"] },
    ],
  },
  {
    nome: "Sono / adrenal / estresse",
    perguntas: ["F58", "PHQ3", "GAD1", "GAD2", "GAD3", "GAD4", "GAD5", "GAD6", "GAD7", "I-EST01"],
    destinos: [
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO ADRENAL ESPECIFICO", "BLOCO SALIVAR ADRENAL"] },
      { categoria: "PRESCRICAO", tipo: "formula", regex: /SONO|ANSIEDADE/ },
      { categoria: "INJETAVEL_IM", tipo: "injetavel", nomes: ["GABA", "L-GLICINA"] },
      { categoria: "INJETAVEL_EV", tipo: "injetavel", nomes: ["GABA", "L-GLICINA"] },
    ],
  },
  {
    nome: "Hormonal / libido",
    perguntas: ["F20", "F41", "C-REP01", "L-AND01", "M-HOR01", "F28", "F54"],
    destinos: [
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO GONADAL", "BLOCO SALIVAR HORMONAL"] },
      { categoria: "PRESCRICAO", tipo: "formula", nomes: ["FORMULA MODULACAO HORMONAL BASE"] },
      { categoria: "INJETAVEL_IM", tipo: "injetavel", nomes: ["PROGESTERONA"], perguntas: ["F41", "F54"] },
      { categoria: "IMPLANTE", tipo: "implante", regex: /^(ESTRADIOL|PROGESTERONA) PELLET$/, perguntas: ["F41", "F54"] },
      { categoria: "IMPLANTE", tipo: "implante", regex: /^TESTOSTERONA PELLET$/, perguntas: ["F20", "L-AND01", "F28"] },
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO PROSTATA"], perguntas: ["F20", "L-AND01", "F28"] },
    ],
  },
  {
    nome: "Metabólico / peso",
    perguntas: ["Q012", "C-END03", "D02", "J04"],
    destinos: [
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO GLICEMICO INSULINICO", "BLOCO LIPIDICO CARDIOMETABOLICO"] },
      { categoria: "PRESCRICAO", tipo: "formula", nomes: ["FORMULA SUPORTE METABOLICO"] },
      { categoria: "INJETAVEL_SC", tipo: "injetavel", regex: /PEPTIDEO|INCRET|SEMAGLUT|TIRZEPAT|LIRAGLUT|GLP|GIP/ },
    ],
  },
  {
    nome: "Digestivo / hepático / inflamatório",
    perguntas: ["M-DIG01", "C-DIG01", "C-DIG02", "BRISTOL"],
    destinos: [
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO HEPATICO ESPECIFICO", "BLOCO DEFICIENCIA ABSORCAO", "BLOCO AUTOIMUNE"] },
      { categoria: "PRESCRICAO", tipo: "formula", regex: /INTESTINO|MODULACAO INFLAMATORIA/ },
      { categoria: "INJETAVEL_EV", tipo: "injetavel", nomes: ["ALANIL GLUTAMINA", "DRENAGEM INFLAMATORIA"] },
    ],
  },
  {
    nome: "Renal / cardiovascular / osteoarticular",
    perguntas: ["Q013", "C-URO02", "C-CAR01", "C-CAR02", "C-CAR03", "C-OSM01", "C-OSM02"],
    destinos: [
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO RENAL ESPECIFICO"], perguntas: ["Q013", "C-URO02"] },
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO CARDIOLOGICOS DE IMAGEM"], perguntas: ["Q013"] },
      { categoria: "EXAME", tipo: "exame", nomes: ["DENSITOMETRIA ÓSSEA"], perguntas: ["Q013"] },
      { categoria: "EXAME", tipo: "bloco_exames", nomes: ["BLOCO CARDIOLOGICOS DE IMAGEM"], perguntas: ["C-CAR01", "C-CAR02", "C-CAR03"] },
      { categoria: "EXAME", tipo: "exame", nomes: ["DENSITOMETRIA ÓSSEA"], perguntas: ["C-OSM01", "C-OSM02"] },
    ],
  },
] as const;

const CODIGOS_CITADOS = [
  ...MATRIZ_EIXOS.flatMap((eixo) => eixo.perguntas),
  "Q001",
  "Q002",
  "Q003",
  "Q004",
  "Q005",
  "Q006",
  "Q007",
  "Q008",
  "Q009",
  "Q010",
];

export function gerarPropostasSinapsesIniciais(
  perguntas: PerguntaSinapse[],
  destinos: Record<CategoriaSinapse, DestinoSinapse[]>,
  ligacoesAtivas: Array<{
    perguntaId: string;
    categoria: CategoriaSinapse;
    destinoTipo: string;
    destinoId: number;
  }> = [],
): ResultadoPropostasIniciais {
  const perguntasPorCodigo = new Map(perguntas.map((p) => [p.perguntaId, p]));
  const ativas = new Set(
    ligacoesAtivas.map((l) => `${l.perguntaId}|${l.categoria}|${l.destinoTipo}|${l.destinoId}`),
  );
  const propostas = new Map<string, PropostaSinapseInicial>();
  const perguntasIgnoradas: ResultadoPropostasIniciais["perguntasIgnoradas"] = [];

  for (const eixo of MATRIZ_EIXOS) {
    for (const codigoPergunta of eixo.perguntas) {
      const pergunta = perguntasPorCodigo.get(codigoPergunta);
      if (!pergunta) continue;
      for (const regra of eixo.destinos) {
        if (
          "perguntas" in regra &&
          regra.perguntas &&
          !(regra.perguntas as readonly string[]).includes(codigoPergunta)
        ) continue;
        const encontrados = destinos[regra.categoria as CategoriaSinapse].filter((destino) => {
          if (destino.tipo !== regra.tipo || destino.incompleto) return false;
          const nome = normalizar(destino.nome);
          if ("nomes" in regra && regra.nomes) {
            return nomeCombina(regra.nomes, nome);
          }
          return "regex" in regra && regra.regex ? regra.regex.test(nome) : false;
        });
        for (const destino of encontrados) {
          const chave = `${codigoPergunta}|${regra.categoria}|${destino.tipo}|${destino.id}`;
          if (ativas.has(chave)) continue;
          const ampla = codigoPergunta === "Q013";
          propostas.set(chave, {
            perguntaId: pergunta.perguntaId,
            categoria: regra.categoria as CategoriaSinapse,
            destinoTipo: destino.tipo,
            destinoId: destino.id,
            eixo: eixo.nome,
            justificativa: ampla
              ? `Eixo informado pelo Dr. Caio. ${pergunta.pergunta} é uma pergunta ampla; revisar a pertinência do bloco antes de aprovar. Proposta sem efeito clínico até aprovação.`
              : `Eixo informado pelo Dr. Caio; correspondência baseada no código da pergunta e no nome do catálogo. Proposta sem efeito clínico até aprovação.`,
          });
        }
      }
    }
  }

  const perguntasIgnoradasPorCodigo: Record<string, string> = {
    F02: "Reação alérgica grave é um alerta de segurança e não foi associada a tratamento digestivo.",
    Q001: "Identificação pessoal; não é pergunta clínica para conduzir uma saída.",
    Q002: "Documento pessoal; não é pergunta clínica para conduzir uma saída.",
    Q010: "Queixa principal é ampla; exige avaliação humana antes de qualquer ligação automática.",
  };
  for (const [codigo, motivo] of Object.entries(perguntasIgnoradasPorCodigo)) {
    if (perguntasPorCodigo.has(codigo)) {
      perguntasIgnoradas.push({
        perguntaId: codigo,
        motivo,
      });
    }
  }

  return {
    propostas: [...propostas.values()],
    codigosAusentes: [...new Set(CODIGOS_CITADOS.filter((codigo) => !perguntasPorCodigo.has(codigo)))],
    perguntasIgnoradas,
  };
}

function nomeCombina(nomes: readonly string[], nomeNormalizado: string): boolean {
  return nomes.some((nome) => normalizar(nome) === nomeNormalizado);
}
