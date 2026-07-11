// ===========================================================================
// SEMENTE DE CURADORIA CLÍNICA — catálogo de analitos quantitativos com:
//   - unidade CANÔNICA (a nossa convenção) + unidades alternativas com FATOR
//     de conversão (valor_na_unidade * fator = valor_canônico);
//   - DIREÇÃO favorável (higher_better | lower_better | target);
//   - 5 FAIXAS por bom senso médico (cortes explícitos OU trisecção do mín/máx).
//
// Materializa em 3 tabelas (chave única = chaveFaixa(nomeCanônico)):
//   exam_analyte_catalog  (code, displayName, synonyms, canonicalUnit, direction)
//   exam_analyte_units    (analyteCode, unit, factorToCanonical, isCanonical)
//   exam_analyte_ranges   (5 zonas)  + direcao_favoravel_exame (direção por nome)
//
// IDEMPOTENTE E NÃO-DESTRUTIVA (Art.47/linha vermelha da spec):
//   - catálogo e unidades por UPSERT (chave única) — reboot não duplica;
//   - faixas só INSERE quando a chave está VAZIA — NUNCA sobrescreve edição do
//     médico nem a semente anterior (seed-faixas);
//   - direção só INSERE quando o nome ainda não existe em direcao_favoravel_exame.
//
// IMPORTANTE (segurança clínica): estes valores são CURADORIA a CONFERIR pelo
// CEO (endocrinologista). Exame de IMAGEM/QUALITATIVO não entra aqui (sem faixa
// numérica inventada). Fatores de conversão seguem convenção médica usual.
// ===========================================================================

import {
  db,
  examAnalyteCatalogTable,
  examAnalyteUnitsTable,
  examAnalyteRangesTable,
  direcaoFavoravelExameTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  chaveFaixa,
  computeZones,
  LABELS_BY_DIRECTION,
  ZONE_COLOR,
  type Direction,
  type ZoneKey,
} from "./zones";

interface UnidadeSeed {
  /** rótulo da unidade (ex.: "mg/dL", "mmol/L") */
  unidade: string;
  /** valor_na_unidade * fator = valor_na_unidade_canônica */
  fator: number;
  /** true = esta é a nossa unidade padrão */
  canonica?: boolean;
}

interface AnalitoSeed {
  nomeCanonico: string;
  sinonimos: string[];
  direcao: Direction;
  unidades: UnidadeSeed[];
  /** 4 quebras ascendentes por valor (na unidade canônica): [c0,c1,c2,c3] */
  cortes?: [number, number, number, number];
  /** 5 rótulos clínicos legíveis (below,t1,t2,t3,above) */
  rotulos?: [string, string, string, string, string];
  /** mín/máx da faixa normal (usado quando não há `cortes`; trisecção) */
  refLow?: number;
  refHigh?: number;
}

// Atalhos de unidade canônica única (exame sem alternativa de conversão usual).
const u = (unidade: string): UnidadeSeed[] => [{ unidade, fator: 1, canonica: true }];

// ---------------------------------------------------------------------------
// CURADORIA (endocrinologista). Fatores para a unidade canônica.
// ---------------------------------------------------------------------------
export const ANALITOS: AnalitoSeed[] = [
  // ---- LIPÍDICO (canônica mg/dL; mmol/L converte) ----
  {
    nomeCanonico: "Colesterol Total",
    sinonimos: ["COLESTEROL", "COLESTEROL TOTAL"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 38.67 }],
    cortes: [130, 170, 200, 240],
    rotulos: ["Baixo", "Ótimo", "Desejável", "Limítrofe", "Alto"],
  },
  {
    nomeCanonico: "LDL-Colesterol",
    sinonimos: ["LDL", "LDL-COLESTEROL", "COLESTEROL LDL", "LDL COLESTEROL"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 38.67 }],
    cortes: [70, 100, 130, 160],
    rotulos: ["Muito baixo", "Ótimo", "Desejável", "Limítrofe", "Alto"],
  },
  {
    nomeCanonico: "HDL-Colesterol",
    sinonimos: ["HDL", "HDL-COLESTEROL", "COLESTEROL HDL", "HDL COLESTEROL"],
    direcao: "higher_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 38.67 }],
    cortes: [40, 50, 60, 80],
    rotulos: ["Baixo", "Limítrofe", "Bom", "Ótimo", "Muito alto"],
  },
  {
    nomeCanonico: "Triglicérides",
    sinonimos: ["TRIGLICERIDES", "TRIGLICERIDEOS", "TRIGLICERÍDES", "TRIGLICERÍDEOS"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 88.57 }],
    cortes: [50, 100, 150, 200],
    rotulos: ["Muito baixo", "Ótimo", "Normal", "Limítrofe", "Alto"],
  },
  {
    nomeCanonico: "Colesterol Não-HDL",
    sinonimos: ["COLESTEROL NAO HDL", "NAO-HDL", "NÃO-HDL"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 38.67 }],
    cortes: [90, 130, 160, 190],
    rotulos: ["Muito baixo", "Ótimo", "Desejável", "Limítrofe", "Alto"],
  },
  {
    nomeCanonico: "VLDL-Colesterol",
    sinonimos: ["VLDL", "VLDL-COLESTEROL", "COLESTEROL VLDL"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }],
    refLow: 5,
    refHigh: 30,
  },

  // ---- GLICÊMICO ----
  {
    nomeCanonico: "Glicose",
    sinonimos: ["GLICOSE", "GLICOSE JEJUM", "GLICEMIA", "GLICEMIA DE JEJUM", "GLICOSE EM JEJUM"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 18.0182 }],
    cortes: [70, 90, 100, 126],
    rotulos: ["Hipoglicemia", "Ótima", "Normal", "Alterada", "Diabetes"],
  },
  {
    nomeCanonico: "Hemoglobina Glicada (HbA1c)",
    sinonimos: ["HB A1C", "HBA1C", "HEMOGLOBINA GLICADA", "HEMOGLOBINA GLICADA (A1C)", "A1C"],
    direcao: "lower_better",
    unidades: [{ unidade: "%", fator: 1, canonica: true }],
    cortes: [4.0, 5.7, 6.0, 6.5],
    rotulos: ["Muito baixo", "Ótimo", "Bom", "Pré-diabetes", "Diabetes"],
  },
  {
    nomeCanonico: "Insulina",
    sinonimos: ["INSULINA", "INSULINA JEJUM", "INSULINA DE JEJUM"],
    direcao: "lower_better",
    unidades: [{ unidade: "µUI/mL", fator: 1, canonica: true }, { unidade: "uUI/mL", fator: 1 }, { unidade: "pmol/L", fator: 0.1739 }],
    cortes: [2, 5, 10, 15],
    rotulos: ["Muito baixa", "Ótima", "Boa", "Limítrofe", "Alta"],
  },

  // ---- TIREOIDE ----
  {
    nomeCanonico: "TSH",
    sinonimos: ["TSH", "HORMONIO TIROESTIMULANTE (TSH)", "HORMÔNIO TIREOESTIMULANTE"],
    direcao: "target",
    unidades: [{ unidade: "µUI/mL", fator: 1, canonica: true }, { unidade: "uUI/mL", fator: 1 }, { unidade: "mUI/L", fator: 1 }],
    cortes: [0.5, 1.0, 2.5, 4.0],
    rotulos: ["Suprimido", "Bom", "Ideal", "Limítrofe", "Elevado"],
  },
  {
    nomeCanonico: "T4 Livre",
    sinonimos: ["T4 LIVRE", "T4L", "TIROXINA LIVRE"],
    direcao: "target",
    unidades: [{ unidade: "ng/dL", fator: 1, canonica: true }, { unidade: "pmol/L", fator: 0.0777 }],
    refLow: 0.9,
    refHigh: 1.7,
  },
  {
    nomeCanonico: "T3 Total",
    sinonimos: ["T3", "T3 TOTAL", "TRIIODOTIRONINA"],
    direcao: "target",
    unidades: [{ unidade: "ng/dL", fator: 1, canonica: true }, { unidade: "nmol/L", fator: 65.1 }],
    refLow: 80,
    refHigh: 180,
  },
  {
    nomeCanonico: "T3 Livre",
    sinonimos: ["T3 LIVRE", "T3L"],
    direcao: "target",
    unidades: [{ unidade: "pg/mL", fator: 1, canonica: true }, { unidade: "pmol/L", fator: 0.651 }],
    refLow: 2.3,
    refHigh: 4.2,
  },
  {
    nomeCanonico: "Anti-TPO",
    sinonimos: ["ANTI TPO", "ANTI-TPO", "ANTICORPO ANTI-TIREOPEROXIDASE", "ANTI-TIREOPEROXIDASE"],
    direcao: "lower_better",
    unidades: [{ unidade: "UI/mL", fator: 1, canonica: true }],
    refLow: 0,
    refHigh: 34,
  },

  // ---- VITAMINAS ----
  {
    nomeCanonico: "Vitamina D (25-OH)",
    sinonimos: ["VITAMINA D", "VITAMINA D 25 OH", "25 HIDROXI-VITAMINA D", "25-HIDROXIVITAMINA D", "VITAMINA D 25-HIDROXI"],
    direcao: "higher_better",
    unidades: [{ unidade: "ng/mL", fator: 1, canonica: true }, { unidade: "nmol/L", fator: 0.4006 }],
    cortes: [20, 30, 40, 60],
    rotulos: ["Deficiência", "Insuficiência", "Suficiente", "Ótimo", "Excesso"],
  },
  {
    nomeCanonico: "Vitamina B12",
    sinonimos: ["VITAMINA B12", "VITAMINA B-12", "COBALAMINA"],
    direcao: "higher_better",
    unidades: [{ unidade: "pg/mL", fator: 1, canonica: true }, { unidade: "pmol/L", fator: 1.355 }],
    cortes: [200, 400, 600, 900],
    rotulos: ["Deficiência", "Limítrofe", "Adequado", "Ótimo", "Elevado"],
  },
  {
    nomeCanonico: "Ácido Fólico",
    sinonimos: ["ACIDO FOLICO", "ÁCIDO FÓLICO", "FOLATO", "FOLATO SERICO"],
    direcao: "higher_better",
    unidades: [{ unidade: "ng/mL", fator: 1, canonica: true }, { unidade: "nmol/L", fator: 0.4413 }],
    refLow: 3,
    refHigh: 20,
  },

  // ---- FERRO ----
  {
    nomeCanonico: "Ferritina",
    sinonimos: ["FERRITINA"],
    direcao: "target",
    unidades: [{ unidade: "ng/mL", fator: 1, canonica: true }, { unidade: "µg/L", fator: 1 }, { unidade: "ug/L", fator: 1 }],
    cortes: [30, 100, 300, 400],
    rotulos: ["Baixa", "Adequada", "Ideal", "Adequada alta", "Elevada"],
  },
  {
    nomeCanonico: "Ferro Sérico",
    sinonimos: ["FERRO", "FERRO SERICO", "FERRO SÉRICO"],
    direcao: "target",
    unidades: [{ unidade: "µg/dL", fator: 1, canonica: true }, { unidade: "ug/dL", fator: 1 }, { unidade: "µmol/L", fator: 5.587 }],
    refLow: 60,
    refHigh: 160,
  },
  {
    nomeCanonico: "Transferrina",
    sinonimos: ["TRANSFERRINA"],
    direcao: "target",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }],
    refLow: 200,
    refHigh: 360,
  },
  {
    nomeCanonico: "Saturação de Transferrina",
    sinonimos: ["SATURACAO DE TRANSFERRINA", "SATURAÇÃO DE TRANSFERRINA", "IST", "INDICE DE SATURACAO"],
    direcao: "target",
    unidades: u("%"),
    refLow: 20,
    refHigh: 50,
  },

  // ---- FUNÇÃO RENAL ----
  {
    nomeCanonico: "Creatinina",
    sinonimos: ["CREATININA", "CREATININA SERICA"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "µmol/L", fator: 0.0113 }, { unidade: "umol/L", fator: 0.0113 }],
    cortes: [0.5, 0.8, 1.1, 1.3],
    rotulos: ["Muito baixa", "Ótima", "Normal", "Limítrofe", "Alta"],
  },
  {
    nomeCanonico: "Ureia",
    sinonimos: ["UREIA", "URÉIA"],
    direcao: "target",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 6.006 }],
    refLow: 15,
    refHigh: 40,
  },
  {
    nomeCanonico: "Ácido Úrico",
    sinonimos: ["ACIDO URICO", "ÁCIDO ÚRICO"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "µmol/L", fator: 0.0168 }, { unidade: "umol/L", fator: 0.0168 }],
    cortes: [2.5, 4.0, 6.0, 7.0],
    rotulos: ["Muito baixo", "Ótimo", "Normal", "Limítrofe", "Alto"],
  },
  {
    nomeCanonico: "Taxa de Filtração Glomerular (eGFR)",
    sinonimos: ["TFG", "EGFR", "RITMO DE FILTRACAO GLOMERULAR", "FILTRACAO GLOMERULAR"],
    direcao: "higher_better",
    unidades: u("mL/min/1.73m²"),
    cortes: [30, 60, 90, 120],
    rotulos: ["Muito baixa", "Reduzida", "Limítrofe", "Boa", "Ótima"],
  },

  // ---- FUNÇÃO HEPÁTICA ----
  {
    nomeCanonico: "TGO (AST)",
    sinonimos: ["TGO", "AST", "ASPARTATO AMINOTRANSFERASE", "TGO (AST)", "AST (TGO)"],
    direcao: "lower_better",
    unidades: u("U/L"),
    cortes: [10, 25, 40, 80],
    rotulos: ["Muito baixa", "Ótima", "Normal", "Limítrofe", "Alta"],
  },
  {
    nomeCanonico: "TGP (ALT)",
    sinonimos: ["TGP", "ALT", "ALANINA AMINOTRANSFERASE", "TGP (ALT)", "ALT (TGP)"],
    direcao: "lower_better",
    unidades: u("U/L"),
    cortes: [10, 25, 40, 80],
    rotulos: ["Muito baixa", "Ótima", "Normal", "Limítrofe", "Alta"],
  },
  {
    nomeCanonico: "Gama-GT (GGT)",
    sinonimos: ["GGT", "GAMA GT", "GAMA-GT", "GAMA GLUTAMIL TRANSFERASE"],
    direcao: "lower_better",
    unidades: u("U/L"),
    cortes: [10, 30, 60, 120],
    rotulos: ["Muito baixa", "Ótima", "Normal", "Limítrofe", "Alta"],
  },
  {
    nomeCanonico: "Fosfatase Alcalina",
    sinonimos: ["FOSFATASE ALCALINA", "FAL"],
    direcao: "target",
    unidades: u("U/L"),
    refLow: 40,
    refHigh: 130,
  },
  {
    nomeCanonico: "Bilirrubina Total",
    sinonimos: ["BILIRRUBINA TOTAL", "BILIRRUBINA"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "µmol/L", fator: 0.05847 }],
    refLow: 0.1,
    refHigh: 1.2,
  },
  {
    nomeCanonico: "Albumina",
    sinonimos: ["ALBUMINA", "ALBUMINA SERICA"],
    direcao: "higher_better",
    unidades: [{ unidade: "g/dL", fator: 1, canonica: true }, { unidade: "g/L", fator: 0.1 }],
    refLow: 3.5,
    refHigh: 5.2,
  },
  {
    nomeCanonico: "Proteínas Totais",
    sinonimos: ["PROTEINAS TOTAIS", "PROTEÍNAS TOTAIS"],
    direcao: "target",
    unidades: [{ unidade: "g/dL", fator: 1, canonica: true }, { unidade: "g/L", fator: 0.1 }],
    refLow: 6.0,
    refHigh: 8.3,
  },

  // ---- ELETRÓLITOS ----
  {
    nomeCanonico: "Sódio",
    sinonimos: ["SODIO", "SÓDIO", "NA"],
    direcao: "target",
    unidades: [{ unidade: "mEq/L", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 1 }],
    refLow: 135,
    refHigh: 145,
  },
  {
    nomeCanonico: "Potássio",
    sinonimos: ["POTASSIO", "POTÁSSIO", "K"],
    direcao: "target",
    unidades: [{ unidade: "mEq/L", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 1 }],
    refLow: 3.5,
    refHigh: 5.1,
  },
  {
    nomeCanonico: "Cloro",
    sinonimos: ["CLORO", "CLORETO"],
    direcao: "target",
    unidades: [{ unidade: "mEq/L", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 1 }],
    refLow: 98,
    refHigh: 107,
  },
  {
    nomeCanonico: "Cálcio",
    sinonimos: ["CALCIO", "CÁLCIO", "CALCIO TOTAL"],
    direcao: "target",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 4.008 }, { unidade: "mEq/L", fator: 2.004 }],
    refLow: 8.6,
    refHigh: 10.2,
  },
  {
    nomeCanonico: "Magnésio",
    sinonimos: ["MAGNESIO", "MAGNÉSIO", "MG"],
    direcao: "target",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 2.43 }, { unidade: "mEq/L", fator: 1.215 }],
    refLow: 1.7,
    refHigh: 2.4,
  },
  {
    nomeCanonico: "Fósforo",
    sinonimos: ["FOSFORO", "FÓSFORO", "FOSFATO"],
    direcao: "target",
    unidades: [{ unidade: "mg/dL", fator: 1, canonica: true }, { unidade: "mmol/L", fator: 3.097 }],
    refLow: 2.5,
    refHigh: 4.5,
  },

  // ---- HORMÔNIOS ----
  {
    nomeCanonico: "Cortisol Matinal",
    sinonimos: ["CORTISOL", "CORTISOL MATINAL", "CORTISOL MATINAL (8H)", "CORTISOL BASAL"],
    direcao: "target",
    unidades: [{ unidade: "µg/dL", fator: 1, canonica: true }, { unidade: "mcg/dL", fator: 1 }, { unidade: "nmol/L", fator: 0.03625 }],
    refLow: 6,
    refHigh: 18,
  },
  {
    nomeCanonico: "Testosterona Total",
    sinonimos: ["TESTOSTERONA", "TESTOSTERONA TOTAL"],
    direcao: "higher_better",
    unidades: [{ unidade: "ng/dL", fator: 1, canonica: true }, { unidade: "ng/mL", fator: 100 }, { unidade: "nmol/L", fator: 28.82 }],
    refLow: 300,
    refHigh: 1000,
  },
  {
    nomeCanonico: "Testosterona Livre",
    sinonimos: ["TESTOSTERONA LIVRE"],
    direcao: "higher_better",
    unidades: u("pg/mL"),
    refLow: 9,
    refHigh: 30,
  },
  {
    nomeCanonico: "Estradiol",
    sinonimos: ["ESTRADIOL", "E2"],
    direcao: "target",
    unidades: [{ unidade: "pg/mL", fator: 1, canonica: true }, { unidade: "pmol/L", fator: 0.2724 }],
    refLow: 20,
    refHigh: 200,
  },
  {
    nomeCanonico: "SHBG",
    sinonimos: ["SHBG", "GLOBULINA LIGADORA DE HORMONIOS SEXUAIS"],
    direcao: "target",
    unidades: u("nmol/L"),
    refLow: 20,
    refHigh: 60,
  },
  {
    nomeCanonico: "DHEA-S",
    sinonimos: ["DHEA", "DHEA-S", "DHEA SULFATO", "SULFATO DE DEHIDROEPIANDROSTERONA"],
    direcao: "target",
    unidades: [{ unidade: "µg/dL", fator: 1, canonica: true }, { unidade: "mcg/dL", fator: 1 }],
    refLow: 80,
    refHigh: 450,
  },
  {
    nomeCanonico: "PTH",
    sinonimos: ["PTH", "PARATORMONIO", "PARATORMÔNIO", "HORMONIO PARATIREOIDEO"],
    direcao: "target",
    unidades: [{ unidade: "pg/mL", fator: 1, canonica: true }, { unidade: "ng/L", fator: 1 }, { unidade: "pmol/L", fator: 9.43 }],
    refLow: 15,
    refHigh: 65,
  },
  {
    nomeCanonico: "Prolactina",
    sinonimos: ["PROLACTINA", "PRL"],
    direcao: "lower_better",
    unidades: [{ unidade: "ng/mL", fator: 1, canonica: true }, { unidade: "µg/L", fator: 1 }],
    refLow: 2,
    refHigh: 20,
  },
  {
    nomeCanonico: "IGF-1",
    sinonimos: ["IGF-1", "IGF1", "SOMATOMEDINA C", "FATOR DE CRESCIMENTO INSULINA-SIMILE"],
    direcao: "target",
    unidades: u("ng/mL"),
    refLow: 100,
    refHigh: 300,
  },

  // ---- INFLAMATÓRIOS / METABÓLICOS ----
  {
    nomeCanonico: "PCR Ultrassensível",
    sinonimos: ["PCR ULTRA", "PCR ULTRA-SENSIVEL", "PROTEINA C REATIVA", "PROTEÍNA C REATIVA ULTRASSENSÍVEL", "PCR-US"],
    direcao: "lower_better",
    unidades: [{ unidade: "mg/L", fator: 1, canonica: true }, { unidade: "mg/dL", fator: 10 }],
    cortes: [0.3, 1.0, 3.0, 5.0],
    rotulos: ["Indetectável", "Baixo risco", "Risco médio", "Risco alto", "Inflamação"],
  },
  {
    nomeCanonico: "VHS",
    sinonimos: ["VHS", "VELOCIDADE DE HEMOSSEDIMENTACAO", "HEMOSSEDIMENTACAO"],
    direcao: "lower_better",
    unidades: u("mm/h"),
    refLow: 0,
    refHigh: 20,
  },
  {
    nomeCanonico: "Homocisteína",
    sinonimos: ["HOMOCISTEINA", "HOMOCISTEÍNA"],
    direcao: "lower_better",
    unidades: [{ unidade: "µmol/L", fator: 1, canonica: true }, { unidade: "umol/L", fator: 1 }, { unidade: "mg/L", fator: 7.397 }],
    cortes: [5, 8, 10, 15],
    rotulos: ["Muito baixa", "Ótima", "Aceitável", "Limítrofe", "Alta"],
  },

  // ---- HEMOGRAMA ----
  {
    nomeCanonico: "Hemoglobina",
    sinonimos: ["HEMOGLOBINA", "HB", "HGB"],
    direcao: "target",
    unidades: [{ unidade: "g/dL", fator: 1, canonica: true }, { unidade: "g/L", fator: 0.1 }],
    refLow: 12,
    refHigh: 17,
  },
  {
    nomeCanonico: "Hematócrito",
    sinonimos: ["HEMATOCRITO", "HEMATÓCRITO", "HT", "HCT"],
    direcao: "target",
    unidades: u("%"),
    refLow: 36,
    refHigh: 50,
  },
  {
    nomeCanonico: "Leucócitos",
    sinonimos: ["LEUCOCITOS", "LEUCÓCITOS", "GLOBULOS BRANCOS", "WBC"],
    direcao: "target",
    unidades: [{ unidade: "/mm³", fator: 1, canonica: true }, { unidade: "10³/µL", fator: 1000 }, { unidade: "10^3/uL", fator: 1000 }],
    refLow: 4000,
    refHigh: 11000,
  },
  {
    nomeCanonico: "Plaquetas",
    sinonimos: ["PLAQUETAS", "PLT"],
    direcao: "target",
    unidades: [{ unidade: "/mm³", fator: 1, canonica: true }, { unidade: "10³/µL", fator: 1000 }, { unidade: "10^3/uL", fator: 1000 }],
    refLow: 150000,
    refHigh: 450000,
  },
  {
    nomeCanonico: "Hemácias",
    sinonimos: ["HEMACIAS", "HEMÁCIAS", "ERITROCITOS", "ERITRÓCITOS", "RBC"],
    direcao: "target",
    unidades: u("milhões/mm³"),
    refLow: 4.2,
    refHigh: 5.9,
  },
];

// Chaves posicionais (ordem 1..5) das 5 zonas contíguas.
const KEYS: ZoneKey[] = ["below", "t1", "t2", "t3", "above"];

// Constrói as 5 linhas de faixa a partir de `cortes` explícitos.
function zonasDeCortes(
  cortes: [number, number, number, number],
  rotulos: [string, string, string, string, string],
  direcao: Direction,
) {
  const [c0, c1, c2, c3] = cortes;
  const limites: Array<[number | null, number | null]> = [
    [null, c0],
    [c0, c1],
    [c1, c2],
    [c2, c3],
    [c3, null],
  ];
  const labels = LABELS_BY_DIRECTION[direcao];
  return KEYS.map((key, i) => {
    const [low, high] = limites[i];
    return {
      faixaName: rotulos[i],
      low: low === null ? null : String(low),
      high: high === null ? null : String(high),
      color: ZONE_COLOR[labels[key]],
      ordem: i + 1,
    };
  });
}

// Constrói as 5 linhas a partir da trisecção do mín/máx (motor zones.ts).
function zonasDeIntervalo(refLow: number, refHigh: number, direcao: Direction) {
  const zones = computeZones(refLow, refHigh, direcao);
  if (!zones) return null;
  return zones.map((z, i) => ({
    faixaName: z.name,
    low: z.low === null ? null : String(z.low),
    high: z.high === null ? null : String(z.high),
    color: z.color,
    ordem: i + 1,
  }));
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

export interface SeedCatalogoResumo {
  catalogo: number;
  unidades: number;
  faixas: number;
  direcoes: number;
}

/**
 * Materializa a curadoria no banco. Idempotente e não-destrutiva (ver cabeçalho).
 */
export async function seedCatalogoAnalitos(): Promise<SeedCatalogoResumo> {
  const resumo: SeedCatalogoResumo = { catalogo: 0, unidades: 0, faixas: 0, direcoes: 0 };

  // Estado atual (para guardas não-destrutivas).
  const rangesExist = await db
    .select({ code: examAnalyteRangesTable.analyteCode })
    .from(examAnalyteRangesTable);
  const faixaKeys = new Set(rangesExist.map((r) => chaveFaixa(r.code)));

  const dirExist = await db
    .select({ nome: direcaoFavoravelExameTable.nomeExame })
    .from(direcaoFavoravelExameTable);
  const dirNames = new Set(dirExist.map((d) => norm(d.nome)));

  const DIR_TO_IHE: Record<Direction, string> = {
    higher_better: "SUBIR_BOM",
    lower_better: "DESCER_BOM",
    target: "ALVO",
  };

  for (const a of ANALITOS) {
    const code = chaveFaixa(a.nomeCanonico);
    const canonica = a.unidades.find((x) => x.canonica) ?? a.unidades[0];

    // 1) Catálogo (UPSERT por code).
    await db
      .insert(examAnalyteCatalogTable)
      .values({
        code,
        displayName: a.nomeCanonico,
        synonyms: a.sinonimos,
        canonicalUnit: canonica.unidade,
        direction: a.direcao,
        active: true,
      })
      .onConflictDoUpdate({
        target: examAnalyteCatalogTable.code,
        // Não destrutivo: NÃO sobrescreve canonicalUnit nem direction no reboot —
        // ambos podem ter sido definidos à mão pelo médico (PUT /catalogo-faixas
        // e PUT /faixas com reset/override de direção). Só atualiza metadados
        // seguros que a curadoria é dona (rótulo/sinônimos/ativo).
        set: {
          displayName: a.nomeCanonico,
          synonyms: a.sinonimos,
          active: true,
        },
      });
    resumo.catalogo += 1;

    // 2) Unidades (UPSERT por (code, unit)).
    for (let i = 0; i < a.unidades.length; i++) {
      const un = a.unidades[i];
      await db
        .insert(examAnalyteUnitsTable)
        .values({
          analyteCode: code,
          unit: un.unidade,
          factorToCanonical: String(un.fator),
          isCanonical: !!un.canonica,
          active: true,
          ordem: i + 1,
        })
        .onConflictDoUpdate({
          target: [examAnalyteUnitsTable.analyteCode, examAnalyteUnitsTable.unit],
          // Não destrutivo: NÃO sobrescreve isCanonical no reboot — qual unidade
          // é a padrão pode ter sido definida à mão (PUT /catalogo-faixas).
          // Só atualiza fator/ativo/ordem (metadados seguros da unidade).
          set: {
            factorToCanonical: String(un.fator),
            active: true,
            ordem: i + 1,
          },
        });
      resumo.unidades += 1;
    }

    // 3) Direção por nome (só INSERE se ainda não existe — não sobrescreve).
    if (!dirNames.has(norm(a.nomeCanonico))) {
      await db
        .insert(direcaoFavoravelExameTable)
        .values({ nomeExame: a.nomeCanonico, direcaoFavoravel: DIR_TO_IHE[a.direcao], grupoExame: "CURADORIA" });
      dirNames.add(norm(a.nomeCanonico));
      resumo.direcoes += 1;
    }

    // 4) Faixas (só INSERE quando a chave está VAZIA — não sobrescreve médico).
    if (!faixaKeys.has(code)) {
      const linhas =
        a.cortes && a.rotulos
          ? zonasDeCortes(a.cortes, a.rotulos, a.direcao)
          : a.refLow !== undefined && a.refHigh !== undefined
            ? zonasDeIntervalo(a.refLow, a.refHigh, a.direcao)
            : null;
      if (linhas) {
        await db
          .insert(examAnalyteRangesTable)
          .values(linhas.map((z) => ({ analyteCode: code, source: "seed", ...z })));
        faixaKeys.add(code);
        resumo.faixas += 1;
      }
    }
  }

  return resumo;
}
