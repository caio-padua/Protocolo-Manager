// ===========================================================================
// SEED de FAIXAS por SEXO (curadoria endocrinológica) — Onda 5 da spec
// specs/faixa-por-sexo.md. Preenche os conjuntos MASCULINO e FEMININO (adulto)
// dos 13 hormônios sexo-dependentes que ficavam clinicamente errados com faixa
// única, e liga o flag `sex_dependent` no catálogo (ativa o toggle na tela e o
// leitor por sexo do cliente).
//
// IDEMPOTENTE E NÃO-DESTRUTIVA: só INSERE o conjunto (analyte_code + sex) quando
// ele está VAZIO. Nunca sobrescreve edição do médico nem duplica no reboot. O
// flag sex_dependent também só sobe (nunca desliga automaticamente).
//
// Art.47 / linha vermelha 3 da spec (NÃO fabricar valor): afirmamos APENAS o
// intervalo de referência adulto [refLow, refHigh] de laboratório reconhecido
// (Fleury, DASA, Hermes Pardini) e sociedades (SBEM/SBAC). As 4 quebras internas
// (below/t1/t2/t3/above) são DERIVADAS por trisecção determinística do intervalo
// (mesma matemática de computeZones), não são números clínicos inventados.
//
// DÍVIDA TÉCNICA anotada (linha vermelha 4): hormônios de ciclo (progesterona,
// LH, estrona, estriol livre) variam por FASE do ciclo menstrual; aqui usamos a
// faixa de adulto por sexo (fase folicular/geral). Fase do ciclo fica pendente.
// ===========================================================================

import { db, examAnalyteRangesTable, examAnalyteCatalogTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "../logger";
import {
  chaveFaixa,
  computeZones,
  type Direction,
} from "./zones";

type SexoFaixa = "male" | "female";

interface CuradoriaSexo {
  /** codes REAIS do catálogo (todas as grafias/variantes que existem no banco) */
  codes: string[];
  /** unidade usual do exame (documentação; não converte aqui) */
  unidade: string;
  /** direção favorável (única, não muda por sexo) */
  direcao: Direction;
  /** 5 rótulos clínicos legíveis (below,t1,t2,t3,above) */
  rotulos: [string, string, string, string, string];
  /** intervalo de referência adulto MASCULINO [refLow, refHigh] */
  male: [number, number];
  /** intervalo de referência adulto FEMININO [refLow, refHigh] */
  female: [number, number];
  /** anotação de dívida técnica (ex.: varia por fase do ciclo) */
  nota?: string;
}

// Rótulos padrão para direção "target" (faixa normal no meio).
const ROT_ALVO: [string, string, string, string, string] = [
  "Baixo",
  "Limítrofe baixo",
  "Ideal",
  "Limítrofe alto",
  "Elevado",
];

// Curadoria dos 13 (adulto). Intervalos de referência de laboratório reconhecido.
export const CURADORIA_SEXO: CuradoriaSexo[] = [
  {
    codes: ["testosterona livre calculada"],
    unidade: "pg/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [47, 244],
    female: [0.5, 5.0],
  },
  {
    codes: ["testosterona livre"], // TESTL
    unidade: "pg/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [47, 244],
    female: [0.5, 5.0],
  },
  {
    codes: ["testosterona biodisponivel(tbd)"],
    unidade: "ng/dL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [130, 680],
    female: [0.8, 10],
  },
  {
    codes: ["indice de androgenios livres (fai)"],
    unidade: "%",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [30, 150],
    female: [0.3, 7],
  },
  {
    codes: ["adrenocorticotrofico (acth)"],
    unidade: "pg/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [7, 63],
    female: [7, 63],
    nota: "ACTH não é fortemente sexo-dependente; intervalo adulto igual para ambos.",
  },
  {
    codes: ["estrona (e1)"],
    unidade: "pg/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [15, 65],
    female: [17, 200],
    nota: "Feminino varia por fase do ciclo (dívida técnica).",
  },
  {
    codes: ["igf-1", "igf1 / somatomedina c"],
    unidade: "ng/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [90, 246],
    female: [90, 246],
    nota: "IGF-1 é fortemente idade-dependente; intervalo de adulto ~21-40 anos.",
  },
  {
    codes: ["dehidroepiandrosterona sulfato - sdhea", "dhea-s"],
    unidade: "µg/dL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [80, 560],
    female: [35, 430],
  },
  {
    codes: ["progesterona proges"],
    unidade: "ng/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [0.1, 0.9],
    female: [0.1, 1.5],
    nota: "Feminino varia por fase do ciclo (folicular/luteal); dívida técnica.",
  },
  {
    codes: ["shbg", "shbge"],
    unidade: "nmol/L",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [10, 57],
    female: [18, 144],
  },
  {
    codes: ["hormonio luteinizante-lh", "lh"],
    unidade: "mUI/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [1.7, 8.6],
    female: [2.4, 12.6],
    nota: "Feminino varia por fase do ciclo; valor folicular; dívida técnica.",
  },
  {
    codes: ["estriol livre"],
    unidade: "ng/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [0.02, 0.5],
    female: [0.02, 0.5],
    nota: "Marcador gestacional; fora da gravidez fica muito baixo. Dívida técnica.",
  },
  {
    codes: ["leptina"],
    unidade: "ng/mL",
    direcao: "target",
    rotulos: ROT_ALVO,
    male: [0.5, 12.5],
    female: [3.7, 27.6],
    nota: "Leptina depende de massa gorda (IMC); intervalo adulto de referência.",
  },
];

// Expande um intervalo de referência [refLow, refHigh] em 5 linhas prontas para
// exam_analyte_ranges, usando a MESMA trisecção determinística do motor
// (computeZones). Só o intervalo é afirmado; as quebras internas são derivadas.
function zonasDeIntervalo(
  refLow: number,
  refHigh: number,
  direcao: Direction,
  rotulos: [string, string, string, string, string],
) {
  const zones = computeZones(refLow, refHigh, direcao);
  if (!zones) return null;
  return zones.map((z, i) => ({
    faixaName: rotulos[i],
    low: z.low === null ? null : String(z.low),
    high: z.high === null ? null : String(z.high),
    color: z.color,
    ordem: i + 1,
  }));
}

export interface SeedFaixasSexoResumo {
  analitosLigados: number;
  conjuntosInseridos: number;
  conjuntosReparados: number;
  conjuntosPulados: number;
  unidadesPreenchidas: number;
  /** codes da curadoria ausentes no catálogo (typo/desalinho) — falha muda evitada */
  codesFaltando: string[];
}

/**
 * Materializa a curadoria por sexo. Idempotente e não-destrutiva (ver cabeçalho).
 *
 * Robustez (revisão architect):
 *  - Idempotência por COMPLETUDE: um par (code,sex) só conta como pronto com as
 *    5 faixas; conjunto parcial (1-4) é APAGADO e reinserido (auto-reparo).
 *  - Falha VISÍVEL: code da curadoria ausente no catálogo é coletado e logado
 *    (erro), nunca vira update silencioso de 0 linhas.
 *  - Unidade: grava canonical_unit SÓ quando está vazia (não sobrescreve o médico).
 */
export async function seedFaixasSexo(): Promise<SeedFaixasSexoResumo> {
  const resumo: SeedFaixasSexoResumo = {
    analitosLigados: 0,
    conjuntosInseridos: 0,
    conjuntosReparados: 0,
    conjuntosPulados: 0,
    unidadesPreenchidas: 0,
    codesFaltando: [],
  };

  // Codes que existem no catálogo (para não fazer update silencioso de 0 linhas).
  const catRows = await db
    .select({
      code: examAnalyteCatalogTable.code,
      canonicalUnit: examAnalyteCatalogTable.canonicalUnit,
    })
    .from(examAnalyteCatalogTable);
  const catByCode = new Map(catRows.map((c) => [c.code, c.canonicalUnit]));

  // Contagem atual de faixas por par (analyte_code + sex) para medir completude.
  const existentes = await db
    .select({
      code: examAnalyteRangesTable.analyteCode,
      sex: examAnalyteRangesTable.sex,
    })
    .from(examAnalyteRangesTable);
  const contagem = new Map<string, number>();
  for (const r of existentes) {
    const k = `${chaveFaixa(r.code)}::${r.sex ?? "any"}`;
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }

  const sexos: SexoFaixa[] = ["male", "female"];

  for (const item of CURADORIA_SEXO) {
    for (const rawCode of item.codes) {
      const code = chaveFaixa(rawCode);

      // Guarda contra falha muda: code precisa existir no catálogo, senão as
      // faixas male/female seriam gravadas mas nunca usadas (sex_dependent não
      // subiria). Coleta para log de erro e pula.
      if (!catByCode.has(code)) {
        resumo.codesFaltando.push(code);
        continue;
      }

      // 1) Liga o flag no catálogo (só sobe; nunca desliga automaticamente).
      await db
        .update(examAnalyteCatalogTable)
        .set({ sexDependent: true })
        .where(eq(examAnalyteCatalogTable.code, code));
      resumo.analitosLigados += 1;

      // 2) Unidade: preenche canonical_unit só quando está vazia (não-destrutivo).
      if (!catByCode.get(code)) {
        await db
          .update(examAnalyteCatalogTable)
          .set({ canonicalUnit: item.unidade })
          .where(
            and(
              eq(examAnalyteCatalogTable.code, code),
              isNull(examAnalyteCatalogTable.canonicalUnit),
            ),
          );
        catByCode.set(code, item.unidade);
        resumo.unidadesPreenchidas += 1;
      }

      // 3) Faixas male/female: pronto só com 5; parcial (1-4) é reparado.
      for (const sexo of sexos) {
        const chave = `${code}::${sexo}`;
        const atual = contagem.get(chave) ?? 0;
        if (atual === 5) {
          resumo.conjuntosPulados += 1;
          continue;
        }
        const [refLow, refHigh] = sexo === "male" ? item.male : item.female;
        const linhas = zonasDeIntervalo(refLow, refHigh, item.direcao, item.rotulos);
        if (!linhas) {
          resumo.conjuntosPulados += 1;
          continue;
        }
        const parcial = atual > 0 && atual < 5;
        if (parcial) {
          // Auto-reparo: apaga só o conjunto (code,sex) semeado e reinsere.
          await db
            .delete(examAnalyteRangesTable)
            .where(
              and(
                eq(examAnalyteRangesTable.analyteCode, code),
                eq(examAnalyteRangesTable.sex, sexo),
              ),
            );
        }
        await db.insert(examAnalyteRangesTable).values(
          linhas.map((z) => ({
            analyteCode: code,
            sex: sexo,
            source: "seed-sexo",
            ...z,
          })),
        );
        contagem.set(chave, 5);
        if (parcial) resumo.conjuntosReparados += 1;
        else resumo.conjuntosInseridos += 1;
      }
    }
  }

  if (resumo.codesFaltando.length > 0) {
    logger.error(
      { seed: "faixas-sexo", codesFaltando: resumo.codesFaltando },
      "Curadoria por sexo: codes ausentes no catálogo (faixas NÃO aplicadas)",
    );
  }

  return resumo;
}
