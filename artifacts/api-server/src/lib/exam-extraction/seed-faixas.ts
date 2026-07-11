// ===========================================================================
// SEED de CORTES por exame (curadoria médica) — faixas pré-preenchidas por bom
// senso clínico, NÃO pelo laudo (cada laboratório varia). Grava 5 zonas em
// exam_analyte_ranges com chave canônica (chaveFaixa: sem acento, minúsculo).
//
// IDEMPOTENTE E NÃO-DESTRUTIVA: só INSERE quando a chave está VAZIA (nenhuma
// linha ainda). Nunca sobrescreve edição do médico nem duplica no reboot.
//
// Modelo das 4 quebras (ascendente por VALOR) -> 5 zonas contíguas:
//   below (null..c0) t1 (c0..c1) t2 (c1..c2) t3 (c2..c3) above (c3..null)
// A cor/rótulo-base de cada posição sai de LABELS_BY_DIRECTION+ZONE_COLOR
// (mesma semântica travada, ACEITÁVEL); o `rotulos` custom por exame dá o nome
// clínico legível por cima.
//
// Art.47 (zero fantasia): cobre os exames FREQUENTES; os demais seguem no
// fallback do motor (trisecção) e podem ser cadastrados pela ferramenta.
// ===========================================================================

import { db, examAnalyteRangesTable } from "@workspace/db";
import {
  chaveFaixa,
  LABELS_BY_DIRECTION,
  ZONE_COLOR,
  type Direction,
  type ZoneKey,
} from "./zones";

interface CuradoriaFaixa {
  direcao: Direction;
  nomes: string[];
  /** 4 quebras ascendentes por valor: [c0, c1, c2, c3] */
  cortes: [number, number, number, number];
  /** 5 rótulos clínicos (below, t1, t2, t3, above) */
  rotulos: [string, string, string, string, string];
}

// Curadoria do médico (endocrinologista). Cortes em unidade usual do exame.
const CURADORIA: CuradoriaFaixa[] = [
  {
    direcao: "higher_better", // Vitamina D (ng/mL)
    nomes: [
      "VITAMINA D",
      "VITAMINA D 25 OH",
      "25 HIDROXI-VITAMINA D",
      "25-HIDROXIVITAMINA D",
      "VITAMINA D 25-HIDROXI",
    ],
    cortes: [20, 30, 40, 60],
    rotulos: ["Deficiência", "Insuficiência", "Suficiente", "Ótimo", "Excesso"],
  },
  {
    direcao: "lower_better", // Hemoglobina glicada / HbA1c (%)
    nomes: [
      "HB A1C",
      "HBA1C",
      "HEMOGLOBINA GLICADA",
      "HEMOGLOBINA GLICADA (A1C)",
      "HEMOGLOBINA GLICADA - HbA1c",
    ],
    cortes: [4.0, 5.7, 6.0, 6.5],
    rotulos: ["Muito baixo", "Ótimo", "Bom", "Pré-diabetes", "Diabetes"],
  },
  {
    direcao: "lower_better", // Glicemia de jejum (mg/dL)
    nomes: ["GLICOSE", "GLICOSE JEJUM", "GLICEMIA", "GLICEMIA DE JEJUM"],
    cortes: [70, 90, 100, 126],
    rotulos: ["Hipoglicemia", "Ótima", "Normal", "Alterada", "Diabetes"],
  },
  {
    direcao: "target", // Ferritina (ng/mL)
    nomes: ["FERRITINA"],
    cortes: [30, 100, 300, 400],
    rotulos: ["Baixa", "Adequada", "Ideal", "Adequada alta", "Elevada"],
  },
  {
    direcao: "lower_better", // PCR ultrassensível (mg/L)
    nomes: [
      "PCR ULTRA",
      "PCR ULTRA-SENSIVEL",
      "PROTEINA C REATIVA",
      "PROTEÍNA C REATIVA ULTRASSENSÍVEL",
    ],
    cortes: [0.3, 1.0, 3.0, 5.0],
    rotulos: ["Indetectável", "Baixo risco", "Risco médio", "Risco alto", "Inflamação"],
  },
  {
    direcao: "lower_better", // LDL-colesterol (mg/dL)
    nomes: ["LDL", "LDL-COLESTEROL", "COLESTEROL LDL"],
    cortes: [70, 100, 130, 160],
    rotulos: ["Muito baixo", "Ótimo", "Desejável", "Limítrofe", "Alto"],
  },
  {
    direcao: "higher_better", // HDL-colesterol (mg/dL)
    nomes: ["HDL", "HDL-COLESTEROL", "COLESTEROL HDL"],
    cortes: [40, 50, 60, 80],
    rotulos: ["Baixo", "Limítrofe", "Bom", "Ótimo", "Muito alto"],
  },
  {
    direcao: "lower_better", // Triglicerides (mg/dL)
    nomes: ["TRIGLICERIDES", "TRIGLICERIDEOS", "TRIGLICERÍDES"],
    cortes: [50, 100, 150, 200],
    rotulos: ["Muito baixo", "Ótimo", "Normal", "Limítrofe", "Alto"],
  },
  {
    direcao: "target", // TSH (µUI/mL)
    nomes: ["TSH", "HORMONIO TIROESTIMULANTE (TSH)"],
    cortes: [0.5, 1.0, 2.5, 4.0],
    rotulos: ["Suprimido", "Bom", "Ideal", "Limítrofe", "Elevado"],
  },
  {
    direcao: "higher_better", // Vitamina B12 (pg/mL)
    nomes: [
      "VITAMINA B12",
      "VITAMINA B-12",
      "VITAMINA B-12, Dosagem",
      "COBALAMINA",
    ],
    cortes: [200, 400, 600, 900],
    rotulos: ["Deficiência", "Limítrofe", "Adequado", "Ótimo", "Elevado"],
  },
  {
    direcao: "lower_better", // Homocisteína (µmol/L)
    nomes: ["HOMOCISTEINA", "HOMOCISTEÍNA"],
    cortes: [5, 8, 10, 15],
    rotulos: ["Muito baixa", "Ótima", "Aceitável", "Limítrofe", "Alta"],
  },
];

// Chaves posicionais na ordem ascendente por valor (mapeia ordem 1..5).
const KEYS: ZoneKey[] = ["below", "t1", "t2", "t3", "above"];

// Expande uma curadoria em 5 linhas prontas para exam_analyte_ranges.
function montarZonas(f: CuradoriaFaixa) {
  const [c0, c1, c2, c3] = f.cortes;
  const limites: Array<[number | null, number | null]> = [
    [null, c0],
    [c0, c1],
    [c1, c2],
    [c2, c3],
    [c3, null],
  ];
  const labels = LABELS_BY_DIRECTION[f.direcao];
  return KEYS.map((key, i) => {
    const [low, high] = limites[i];
    return {
      faixaName: f.rotulos[i],
      low: low === null ? null : String(low),
      high: high === null ? null : String(high),
      color: ZONE_COLOR[labels[key]],
      ordem: i + 1,
    };
  });
}

/**
 * Semeia os cortes médicos SÓ nas chaves ainda vazias. Não trunca, não
 * sobrescreve, não duplica. Seguro a cada boot.
 */
export async function seedFaixasExames(): Promise<{ inseridas: number; puladas: number }> {
  // Chaves que já têm alguma faixa (edição do médico OU semente anterior).
  const existentes = await db
    .select({ code: examAnalyteRangesTable.analyteCode })
    .from(examAnalyteRangesTable);
  const jaTem = new Set(existentes.map((r) => chaveFaixa(r.code)));

  let inseridas = 0;
  let puladas = 0;
  for (const f of CURADORIA) {
    const zonas = montarZonas(f);
    for (const nome of f.nomes) {
      const chave = chaveFaixa(nome);
      if (jaTem.has(chave)) {
        puladas += 1;
        continue;
      }
      await db
        .insert(examAnalyteRangesTable)
        .values(zonas.map((z) => ({ analyteCode: chave, ...z })));
      jaTem.add(chave); // evita reinserir variações que normalizam igual
      inseridas += 1;
    }
  }
  return { inseridas, puladas };
}
