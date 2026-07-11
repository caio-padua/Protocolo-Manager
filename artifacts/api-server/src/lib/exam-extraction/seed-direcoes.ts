// ===========================================================================
// SEED de CATEGORIZAÇÃO — direção favorável dos exames reais (curadoria médica).
//   Idempotente (upsert por nome_exame, unique). Chamado no boot do api-server.
//   Fonte: exames que realmente aparecem nos laudos (exam_results) + variações
//   de nome observadas (caixa/hífen/"Dosagem"). O motor casa por nome
//   normalizado (removeDiacritics + upper), então basta 1 entrada por classe
//   normalizada; incluímos as variações que diferem em hífen/vírgula.
//
//   Vocabulário da tabela direcao_favoravel_exame:
//     SUBIR_BOM  -> valores ALTOS são bons  (ex.: vitamina D, B12, HDL)
//     DESCER_BOM -> valores BAIXOS são bons  (ex.: homocisteína, PCR-us, LDL)
//     ALVO       -> melhor no MEIO da faixa  (ex.: hemograma, TSH, ferritina)
//
//   Art.47 (zero fantasia): categoriza os exames FREQUENTES; os demais caem no
//   fallback "alvo" do motor e podem ser cadastrados pela tela de Direção.
// ===========================================================================

import { db, direcaoFavoravelExameTable } from "@workspace/db";

type DirIhe = "SUBIR_BOM" | "DESCER_BOM" | "ALVO";

interface GrupoCuradoria {
  grupo: string;
  direcao: DirIhe;
  nomes: string[];
}

// Curadoria do médico (endocrinologista). Nomes conforme aparecem nos laudos.
const CURADORIA: GrupoCuradoria[] = [
  {
    grupo: "GLICEMICO",
    direcao: "DESCER_BOM",
    nomes: [
      "GLICOSE",
      "GLICOSE JEJUM",
      "GLICEMIA",
      "GLICEMIA DE JEJUM",
      "HB A1C",
      "HBA1C",
      "HEMOGLOBINA GLICADA",
      "HEMOGLOBINA GLICADA (A1C)",
      "HEMOGLOBINA GLICADA - HbA1c",
      "INSULINA",
      "HOMA IR",
      "HOMA-IR",
    ],
  },
  {
    grupo: "LIPIDICO",
    direcao: "DESCER_BOM",
    nomes: [
      "COLESTEROL TOTAL",
      "LDL",
      "LDL-COLESTEROL",
      "COLESTEROL LDL",
      "VLDL",
      "VLDL-COLESTEROL",
      "COLESTEROL VLDL",
      "TRIGLICERIDES",
      "TRIGLICERIDEOS",
      "TRIGLICERÍDES",
      "COLESTEROL NAO-HDL",
    ],
  },
  {
    grupo: "LIPIDICO",
    direcao: "SUBIR_BOM",
    nomes: ["HDL", "HDL-COLESTEROL", "COLESTEROL HDL"],
  },
  {
    grupo: "HEPATICO",
    direcao: "DESCER_BOM",
    nomes: [
      "TGO AST",
      "TGO",
      "AST",
      "TGP ALT",
      "TGP",
      "ALT",
      "GGT",
      "GAMA GT",
      "FOSFATASE ALCALINA",
      "BILIRRUBINA TOTAL",
      "BILIRRUBINA DIRETA",
      "BILIRRUBINA INDIRETA",
    ],
  },
  { grupo: "HEPATICO", direcao: "SUBIR_BOM", nomes: ["ALBUMINA"] },
  {
    grupo: "RENAL",
    direcao: "DESCER_BOM",
    nomes: ["UREIA", "URÉIA", "CREATININA", "ACIDO URICO", "ÁCIDO ÚRICO"],
  },
  {
    grupo: "INFLAMATORIO",
    direcao: "DESCER_BOM",
    nomes: [
      "HOMOCISTEINA",
      "HOMOCISTEÍNA",
      "PCR ULTRA",
      "PCR ULTRA-SENSIVEL",
      "PROTEINA C REATIVA",
      "PROTEÍNA C REATIVA ULTRASSENSÍVEL",
      "VHS",
    ],
  },
  {
    grupo: "VITAMINAS",
    direcao: "SUBIR_BOM",
    nomes: [
      "VITAMINA D",
      "VITAMINA D 25 OH",
      "25 HIDROXI-VITAMINA D",
      "25-HIDROXIVITAMINA D",
      "VITAMINA D 25-HIDROXI",
      "VITAMINA B12",
      "VITAMINA B-12",
      "VITAMINA B-12, Dosagem",
      "COBALAMINA",
      "FOLATO",
      "ACIDO FOLICO",
      "ÁCIDO FÓLICO",
      "VITAMINA C",
      "VITAMINA A",
      "VITAMINA E",
    ],
  },
  {
    grupo: "MINERAIS",
    direcao: "SUBIR_BOM",
    nomes: ["MAGNESIO", "MAGNÉSIO", "ZINCO", "SELENIO", "SELÊNIO", "COENZIMA Q10"],
  },
  {
    grupo: "MINERAIS",
    direcao: "ALVO",
    nomes: [
      "FERRITINA",
      "FERRO",
      "FERRO SERICO",
      "FERRO SÉRICO",
      "TRANSFERRINA",
      "SATURACAO DE TRANSFERRINA",
      "SATURAÇÃO DE TRANSFERRINA",
    ],
  },
  {
    grupo: "HORMONIOS",
    direcao: "SUBIR_BOM",
    nomes: [
      "TESTOSTERONA",
      "TESTOSTERONA TOTAL",
      "TESTOSTERONA LIVRE",
      "TESTOSTERONA LIVRE CALCULADA",
      "TESTOSTERONA BIODISPONIVEL",
      "TESTOSTERONA BIODISPONÍVEL",
      "DHEA",
      "DHEA-S",
      "SULFATO DE DEHIDROEPIANDROSTERONA",
    ],
  },
  {
    grupo: "HORMONIOS",
    direcao: "DESCER_BOM",
    nomes: ["PROLACTINA"],
  },
  {
    grupo: "HORMONIOS",
    direcao: "ALVO",
    nomes: [
      "ESTRADIOL",
      "PROGESTERONA",
      "FSH",
      "LH",
      "SHBG",
      "CORTISOL",
      "IGF-1",
      "IGF 1",
      "SOMATOMEDINA C",
    ],
  },
  {
    grupo: "TIREOIDE",
    direcao: "ALVO",
    nomes: [
      "TSH",
      "HORMONIO TIROESTIMULANTE (TSH)",
      "T4 LIVRE",
      "TIROXINA (T4) LIVRE",
      "T3 LIVRE",
      "T3",
      "T4",
      "TRIIODOTIRONINA",
    ],
  },
  {
    grupo: "AUTOIMUNES",
    direcao: "DESCER_BOM",
    nomes: ["ANTI TPO", "ANTI TIREOGLOBULINA", "ANTI-TIREOPEROXIDASE"],
  },
  {
    grupo: "ONCOLOGICOS",
    direcao: "DESCER_BOM",
    nomes: [
      "PSA TOTAL",
      "PSA LIVRE",
      "PSA Total",
      "PSA Livre",
      "CEA",
      "CA 19-9",
      "CA 19 9",
      "CA 15-3",
      "CA 72-4",
      "CA 125",
      "ALFA-FETOPROTEINA",
      "ALFA FETOPROTEINA",
    ],
  },
  {
    grupo: "ONCOLOGICOS",
    direcao: "SUBIR_BOM",
    nomes: ["RELACAO PSA LIVRE/TOTAL", "RELAÇÃO PSA LIVRE/TOTAL"],
  },
  {
    grupo: "HEMATOLOGIA",
    direcao: "ALVO",
    nomes: [
      "HEMOGLOBINA",
      "HEMATOCRITO",
      "HEMATÓCRITO",
      "HEMACIAS",
      "HEMÁCIAS",
      "ERITROCITOS",
      "ERITRÓCITOS",
      "VCM",
      "VOLUME CORPUSCULAR MEDIO",
      "VOLUME CORPUSCULAR MÉDIO",
      "HCM",
      "HEMOGLOBINA CORPUSCULAR MEDIA",
      "HEMOGLOBINA CORPUSCULAR MÉDIA",
      "CHCM",
      "CONCENTRACAO DE HEMOGLOBINA CORPUSCULAR MEDIA",
      "CONCENTRAÇÃO DE HEMOGLOBINA CORPUSCULAR MÉDIA",
      "RDW",
      "COEFICIENTE DE VARIACAO DO VOLUME ERITROCITARIO (RDW)",
      "VPM",
      "VOLUME PLAQUETARIO MEDIO",
      "VOLUME PLAQUETÁRIO MÉDIO",
      "LEUCOCITOS",
      "LEUCÓCITOS",
      "PLAQUETAS",
      "TOTAL DE PLAQUETAS",
      "NEUTROFILOS",
      "NEUTRÓFILOS",
      "LINFOCITOS",
      "LINFÓCITOS",
      "MONOCITOS",
      "MONÓCITOS",
      "EOSINOFILOS",
      "EOSINÓFILOS",
      "BASOFILOS",
      "BASÓFILOS",
    ],
  },
  {
    grupo: "ELETROLITOS",
    direcao: "ALVO",
    nomes: ["SODIO", "SÓDIO", "POTASSIO", "POTÁSSIO", "CALCIO", "CÁLCIO", "FOSFORO", "FÓSFORO", "CLORO"],
  },
];

/**
 * Upsert idempotente da curadoria de direção. Não trunca; só insere/atualiza
 * por nome (unique). Seguro para rodar a cada boot.
 */
export async function seedDirecoesExames(): Promise<{ inseridos: number; total: number }> {
  let total = 0;
  for (const g of CURADORIA) {
    for (const nome of g.nomes) {
      total += 1;
      await db
        .insert(direcaoFavoravelExameTable)
        .values({ nomeExame: nome, direcaoFavoravel: g.direcao, grupoExame: g.grupo })
        .onConflictDoUpdate({
          target: direcaoFavoravelExameTable.nomeExame,
          set: { direcaoFavoravel: g.direcao, grupoExame: g.grupo },
        });
    }
  }
  return { inseridos: total, total };
}
