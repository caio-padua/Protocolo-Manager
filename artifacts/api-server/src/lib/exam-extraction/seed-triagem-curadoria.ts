// ---------------------------------------------------------------------------
// Curadoria determinística da Sala de Triagem (Caminho A) + unidade canônica e
// direção favorável (Caminho B). Código COMMITTADO e IDEMPOTENTE: reexecutar
// não duplica nem sobrescreve curadoria humana já feita.
//
// Regra de ouro (aprovada pelo CEO Dr. Caio):
//   - Na dúvida clínica => NOVO (reversível via ENGLOBAR). NUNCA apelidar sem
//     certeza clínica; NUNCA usar suggestedCode (é clinicamente inseguro).
//   - Qualitativo (sorologia/anticorpo) conta RESOLVIDO ao ser criado como
//     kind='qualitative', SEM exigir unidade/direção (Régua Opção A).
//   - Lixo/subitem/bioimpedância/imagem/CGM => IGNORAR (fora do motor).
//
// Caminho B só toca linhas quantitativas (kind blood|urine) cujo campo está
// NULL: unidade vem do unit_raw REAL mais frequente do laudo (nunca inventada);
// direção default 'target', com exceções canônicas.
// ---------------------------------------------------------------------------
import {
  db,
  examAnalyteCatalogTable,
  examAnalyteTriagemTable,
  examResultsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

import { normalizeAnalyteName } from "./persist";
import {
  absorbAsAlias,
  createDiscoveredExam,
  loadCatalogFull,
  setResultCodeForNormKey,
  type CatalogEntryFull,
} from "./triagem";

// ===========================================================================
// CLASSIFICADOR (portado idêntico do dry-run validado; ver
// specs/faxina-triagem-e-curadoria.md). Todos os nomes já entram normalizados
// por normalizeAnalyteName (sem acento, minúsculo, espaço único).
// ===========================================================================

// Apelido de ALTA CONFIANÇA: regex da grafia crua -> code canônico do catálogo.
// Famílias clínicas certas apenas; ordem importa (primeiro casamento vence).
const AP: Array<[RegExp, string]> = [
  [/anti\s*tpo|anti\s*peroxidase|antiperoxidase|microssomal|tireoperoxidase|\batpo\b/, "anti-tpo"],
  [/t4 livre|tiroxina livre|\bt4l\b/, "t4 livre"],
  [/t3 livre|triiodotironina livre|\bt3l\b/, "t3 livre"],
  [/t3 total|triiodotironina total/, "t3 total"],
  [/t3 reverso|triiodotironina reverso/, "t3 reverso"],
  [/\btsh\b|tireoestimulante|tireo estimulante/, "tsh"],
  [/\bfsh\b|foliculo ?estimulante/, "fsh"],
  [/\blh\b|luteinizante/, "hormonio luteinizante-lh"],
  [/creatino ?fosfoquinase|creatina ?fosfoquinase|creatino ?quinase|\bcpk\b|creatina quinase|creatinofosfoquinase/, "cpk - creatino-fosfoquinase"],
  [/gama ?glutamil|\bggt\b|\bg gt\b|\bygt\b/, "gama-gt (ggt)"],
  [/desidrogenase lactica|lactato desidrogenase|\bldh\b|dehidrogenase lactica/, "dehidrogenase lactica - dhl"],
  [/fosfatase alcalina|\balp\b/, "fosfatase alcalina"],
  [/amilase/, "amilase, soro"],
  [/\blipase\b/, "lipase, soro"],
  [/aspartato aminotransferase|\btgo\b|transaminase oxalacetica/, "tgo (ast)"],
  [/alanina amino ?transferase|\btgp\b|transaminase piruvica/, "tgp (alt)"],
  [/proteina c reativa|\bpcr\b|p\s*c\s*r/, "pcr ultrassensivel"],
  [/tempo de protrombina|tempo protrombina|atividade de protrombina/, "tempo de protrombina tempo em segundos"],
  [/dihidrotestosterona|\bdht\b/, "dihidrotestosterona (dht)"],
  [/\bshbg\b|globulina ligadora|ligadora d[eo] horm|transportadora de hormonio/, "shbg"],
  [/\bpth\b|paratormonio/, "pth"],
  [/prolactina|prolac/, "prolactina"],
  [/cortisol/, "cortisol matinal"],
  [/estradiol|\be2\b|17 beta/, "estradiol"],
  [/estriol/, "estriol livre"],
  [/gonadotrofina corionica|beta hcg|\bhcg\b/, "gonadotrofina corionica humana (hcg)"],
  [/enolase/, "enolase neuronio-especifica (nse)"],
  [/testosterona biodispon/, "testosterona biodisponivel(tbd)"],
  [/testosterona livre/, "testosterona livre"],
  [/testosterona (total|plasmatica)|testosterona testo/, "testosterona total"],
  [/vitamina b12|b12 est|cianocobalamina/, "vitamina b12"],
  [/1,?25|dihidroxi|calcitriol/, "1,25 dihidroxi vitamina d"],
  [/vitamina d|25.*hidroxi|hidroxivitamina d|calcidiol|colecalciferol|\bd 25\b|vit d 25|d25/, "vitamina d (25-oh)"],
  [/concentracao de hemoglobina corpuscular|conc.*hemoglobina glob|\bchgm\b/, "conc.hemogl.corp.media (chcm)"],
  [/hemoglobina (corpuscular|globular) media|\bhgm\b/, "hcm"],
  [/volume corpuscular medio|volume globular medio|\bvgm\b|\bvcm\b/, "vcm"],
  [/volume (plaquetario medio|medio plaquetario)/, "vpm"],
  [/hemoglobina glicada|hba1c|\ba1c\b/, "hemoglobina glicada (hba1c)"],
  [/\bleucocitos\b/, "leucocitos"],
  [/aluminio/, "aluminio serico"],
  [/\bcobre\b/, "cobre serico"],
  [/chumbo/, "chumbo sanguineo"],
  [/mercurio/, "mercurio sanguineo"],
  [/nitrogenio ureico|\bbun\b/, "nitrogenio ureico (bun)"],
  [/filtracao glomerular|\betfg\b|\begfr\b|ritmo de filtracao/, "taxa de filtracao glomerular (egfr)"],
  [/ckd.?epi/, "calculo ckd-epi 2021"],
  [/\bmdrd\b/, "mdrd individuo afrodescendente"],
  [/ca ?125|antigeno 125/, "ca-125, soro"],
  [/ca ?15.?3|antigeno 15.?3/, "ca 15-3"],
  [/ca ?19.?9|antigeno 19.?9/, "ca 19-9"],
  [/ca ?72.?4|tag 72/, "ca 72-4"],
  [/\bcea\b|carcinoembrio/, "cea"],
  [/psa total|prostatico especifico total|prostatico total|psa - antigeno|psa ultra|psa antigeno/, "psa total"],
  [/saturacao (da |de )?transferrina/, "saturacao de transferrina"],
  [/ferro fe|ferro serico/, "ferro serico"],
  [/dimero/, "dimero-d quantitativo"],
  [/^sodio s$/, "sodio"],
  [/^potassio s$/, "potassio"],
  [/^calcio s$/, "calcio"],
  [/plaquetas/, "plaquetas"],
  [/\brni\b|razao normatizada|normatizada internacional/, "razao normatizada internacional (rni)"],
  [/bilirrubina.? (direta|diretas)|bilirrubinas direta/, "direta"],
  [/bilirrubina.? (indireta|indiretas)|bilirrubinas indireta/, "indireta"],
  [/bilirrubina.? (total|totais)|bilirrubinas total/, "bilirrubina total"],
  [/hemossedimentacao|\bvhs\b/, "vhs"],
  [/lactato|acido latico|acido lactico/, "lactato venoso tlr - poct"],
  [/homa.?ir|homair/, "homa-ir"],
  [/lipoproteina.*a|lp ?\(a\)/, "lipoproteina (a)"],
  [/alfa ?feto ?proteina|\bafp\b/, "alfafetoproteina"],
  [/colesterol nao.?hdl|nao hdlc/, "colesterol nao-hdl"],
  [/colesterol ldl calculado|ldl calculado/, "ldl-colesterol"],
  [/cromogranina/, "cromogranina a, soro"],
  [/fosforo/, "fosforo"],
  [/linfocitos atipicos/, "linf-atipicos"],
  [/linfocitos (totais|tipicos)/, "linfocitos"],
  [/glicemia - jejum|glicemia jejum/, "glicose"],
];

// Genéricos ambíguos EXATOS -> NOVO (evita match guloso; ex.: bare "proteina"
// nunca deve virar PCR, e "volume" isolado é lixo tratado no IG).
const EXACT_NOVO = new Set<string>([
  "proteina",
  "proteinas",
  "proteina total",
  "globulina",
  "globulinas",
  "gama globulina",
  "alfa1 globulina",
  "beta1 globulina",
  "beta2 globulina",
  "lipides totais",
  "proteina monoclonal",
]);

// Analitos DISTINTOS que devem ser NOVO mesmo com termo parecido no catálogo.
const REGEX_NOVO = /17.*(hidroxi|alfa|oh).*progesterona|proteina c funcional|proteina s livre|apolipoproteina b|castelli i$|indice de castelli i$|psa livre|psal|prostatico especifico livre|t4 total|tiroxina total|t4 - tiroxina|^t3 - triiodotironina$|calcio ioniz|calcio ionico|acido ascorbico|vitamina c|vitamina a|apolipoproteina a|complemento c3|proteinas totais|frutosamina|eletroforese|cadeia (kappa|lambda)|capacidade.*(fixacao|ligacao|latente).*ferro|ligacao do ferro|ferro capac|tromboplastina parcial|tempo em segundos|hormonio de crescimento|\bhgh\b|nt.?pro|natriuretico|fosfatase acida|fracao cardiaca|ck massa|neutrofilo|metamielocito|linfocitos reativos|rdw.?(cv|sd)|razao apo|relacao (albumina|psa|a g)|porcentagem de psa|psa livre psa|glicemia - (30|60|120)|glicose 120|desvio mg|isi/;

// Lixo / subitem / bioimpedância / imagem / CGM / dinamometria -> IGNORAR.
const IG = /massa magra|massa muscular|massa livre|massa de gordura|gordura visceral|segmentar|impedancia|z\(|khz|z 20|z 50|tracao|dorsal|carboidrat|controle de gordura|controle muscular|controle de peso|consumo gordura|calorimetria|metabolica basal|braco (direito|esquerdo)|perna (direita|esquerda)|coxa (direita|esquerda)|\btronco\b|agua corporal|cintura|pontuacao inbody|nivel de gordura|circunferencia|inbody|pressao palmar|oximetria|\bpeso\b|peso ideal|peso do testiculo|ventriculo|atrio|utero|ovario|prostata - volume|prostata com volume|volume vesical|volume estimad|hiperglicemia|hipoglicemia|nominal|media glicemica|glicose media estimada|glicemia media estimada|glicemia estimada media|\bgme\b|normal do dia|paciente normal|^volume$|outras celulas|^pgc$|tempo em segundos|energia matinal|saturacao o2|desvio mg|fracao biodisponivel/;

// Sorologia / anticorpo / imunológico qualitativo -> NOVO qualitative.
const QL = /\bigg\b|\bigm\b|\biga\b|\bige\b|anticorpo|antigeno ns1|teste rapido|\bhiv\b|hepatite|anti.?hbs|anti.?hbc|anti.?hbe|anti.?hcv|anti.?vha|\bhbsag\b|dengue|chikungunya|citomegalo|caxumba|herpes|sifilis|rubeola|toxoplasm|\bvdrl\b|cultura|urocultura|sorologia|reagente|\banca\b|transglutaminase|tireoglobulina|tiroglobulina|he 4/;

export type CuradoriaKind = "blood" | "qualitative" | "urine";
export interface CuradoriaDecisao {
  acao: "apelido" | "novo" | "ignorar";
  code?: string;
  novoKind?: CuradoriaKind;
}

/** Decide o destino de UMA grafia pendente. Determinístico e puro. */
export function classifyPendente(
  catalog: CatalogEntryFull[],
  name: string,
  kind: string,
): CuradoriaDecisao {
  const n = normalizeAnalyteName(name);
  if (kind === "nao_exame") return { acao: "ignorar" };
  if (IG.test(n)) return { acao: "ignorar" };

  const forced = EXACT_NOVO.has(n) || REGEX_NOVO.test(n);
  if (!forced) {
    const owner = catalog.find((e) => e.keys.has(n));
    if (owner) return { acao: "apelido", code: owner.code };
    for (const [re, code] of AP) if (re.test(n)) return { acao: "apelido", code };
  }
  if (QL.test(n)) return { acao: "novo", novoKind: "qualitative" };
  if (/urina|urinari/.test(n)) return { acao: "novo", novoKind: "urine" };
  return { acao: "novo", novoKind: "blood" };
}

// ===========================================================================
// CAMINHO B — direção favorável canônica (default 'target'). Chave: nome
// normalizado do exame. Só preenche onde a coluna está NULL.
// ===========================================================================
const DIR_LOWER = /colesterol|triglicer|\bldl\b|\bvldl\b|glicose|hemoglobina glicada|hba1c|homa|insulina|acido urico|ureia|creatinina|\bpcr\b|proteina c reativa|ultrassensivel|homocisteina|ferritina|\btgo\b|\btgp\b|\bggt\b|gama-gt|bilirrubina|fosfatase|\bpsa\b|\bcea\b|\bca-125\b|ca 15-3|ca 19-9|ca 72-4|alfafetoproteina|dimero|lipoproteina|aslo|fator reumatoide|dht|dihidrotestosterona/;
const DIR_HIGHER = /\bhdl\b|vitamina d|vitamina b12|vitamina c|vitamina a|\bt4 livre\b|testosterona/;

function directionCanonica(displayNorm: string): "lower_better" | "higher_better" | "target" {
  if (DIR_LOWER.test(displayNorm)) return "lower_better";
  if (DIR_HIGHER.test(displayNorm)) return "higher_better";
  return "target";
}

export interface CuradoriaResumo {
  totalPendentes: number;
  apelido: number;
  novoBlood: number;
  novoQualitative: number;
  novoUrine: number;
  ignorar: number;
  colisoesViraramNovo: number;
  linhasCarimbadas: number;
  unidadesPreenchidas: number;
  direcoesPreenchidas: number;
  restaramPendentes: number;
}

/**
 * Executa Caminho A (esvazia a fila) + Caminho B (unidade/direção). Idempotente:
 * a fila é lida por status='pendente'; reexecutar não reprocessa resolvidos e o
 * Caminho B só toca colunas NULL (não sobrescreve curadoria humana).
 */
export async function runCuradoriaTriagem(): Promise<CuradoriaResumo> {
  const catalog = await loadCatalogFull();
  const pendentes = await db
    .select()
    .from(examAnalyteTriagemTable)
    .where(eq(examAnalyteTriagemTable.status, "pendente"));

  const r: CuradoriaResumo = {
    totalPendentes: pendentes.length,
    apelido: 0,
    novoBlood: 0,
    novoQualitative: 0,
    novoUrine: 0,
    ignorar: 0,
    colisoesViraramNovo: 0,
    linhasCarimbadas: 0,
    unidadesPreenchidas: 0,
    direcoesPreenchidas: 0,
    restaramPendentes: 0,
  };

  // ------- CAMINHO A: decisão + aplicação por linha (espelha o resolver) -------
  for (const item of pendentes) {
    let decisao = classifyPendente(catalog, item.sampleName, item.kind);

    if (decisao.acao === "apelido" && decisao.code) {
      const ok = await absorbAsAlias(decisao.code, item.sampleName, catalog);
      if (!ok) {
        // Grafia pertence a outro exame: nunca funde. Vira NOVO (reversível).
        r.colisoesViraramNovo += 1;
        decisao = { acao: "novo", novoKind: "blood" };
      }
    }

    let finalResolution: "apelido" | "novo" | "ignorado";
    if (decisao.acao === "apelido" && decisao.code) {
      const stamp = await setResultCodeForNormKey(item.normKey, decisao.code);
      for (const v of stamp.variants) await absorbAsAlias(decisao.code, v, catalog);
      r.linhasCarimbadas += stamp.carimbadas;
      r.apelido += 1;
      finalResolution = "apelido";
    } else if (decisao.acao === "novo") {
      const code = await createDiscoveredExam(item.sampleName, catalog, [item.sampleName]);
      const novoKind = decisao.novoKind ?? "blood";
      if (novoKind !== "blood") {
        await db
          .update(examAnalyteCatalogTable)
          .set({ kind: novoKind })
          .where(eq(examAnalyteCatalogTable.code, code));
        const mem = catalog.find((e) => e.code === code);
        if (mem) (mem as unknown as { kind?: string }).kind = novoKind;
      }
      const stamp = await setResultCodeForNormKey(item.normKey, code);
      for (const v of stamp.variants) await absorbAsAlias(code, v, catalog);
      r.linhasCarimbadas += stamp.carimbadas;
      if (novoKind === "qualitative") r.novoQualitative += 1;
      else if (novoKind === "urine") r.novoUrine += 1;
      else r.novoBlood += 1;
      finalResolution = "novo";
    } else {
      r.ignorar += 1;
      finalResolution = "ignorado";
    }

    await db
      .update(examAnalyteTriagemTable)
      .set({ status: "resolvido", resolution: finalResolution, updatedAt: new Date() })
      .where(eq(examAnalyteTriagemTable.id, item.id));
  }

  // ------- CAMINHO B: unidade canônica (do laudo) + direção favorável -------
  // Quantitativos = kind blood|urine. Qualitativos ISENTOS (Régua Opção A).
  const quantitativos = await db
    .select({
      code: examAnalyteCatalogTable.code,
      displayName: examAnalyteCatalogTable.displayName,
      kind: examAnalyteCatalogTable.kind,
      canonicalUnit: examAnalyteCatalogTable.canonicalUnit,
      direction: examAnalyteCatalogTable.direction,
    })
    .from(examAnalyteCatalogTable)
    .where(eq(examAnalyteCatalogTable.active, true));

  for (const c of quantitativos) {
    if (c.kind !== "blood" && c.kind !== "urine") continue;

    // Unidade: só preenche se NULL. Puxa o unit_raw REAL mais frequente do laudo.
    if (!c.canonicalUnit) {
      const unitRows = await db
        .select({
          unit: examResultsTable.unitRaw,
          n: sql<number>`count(*)`,
        })
        .from(examResultsTable)
        .where(
          and(
            eq(examResultsTable.analyteCode, c.code),
            sql`${examResultsTable.unitRaw} is not null and btrim(${examResultsTable.unitRaw}) <> ''`,
          ),
        )
        .groupBy(examResultsTable.unitRaw)
        .orderBy(sql`count(*) desc`)
        .limit(1);
      const unit = unitRows[0]?.unit?.trim();
      if (unit) {
        await db
          .update(examAnalyteCatalogTable)
          .set({ canonicalUnit: unit })
          .where(eq(examAnalyteCatalogTable.code, c.code));
        r.unidadesPreenchidas += 1;
      }
    }

    // Direção: só preenche se NULL. Default 'target', com exceções canônicas.
    if (!c.direction) {
      const dir = directionCanonica(normalizeAnalyteName(c.displayName));
      await db
        .update(examAnalyteCatalogTable)
        .set({ direction: dir })
        .where(eq(examAnalyteCatalogTable.code, c.code));
      r.direcoesPreenchidas += 1;
    }
  }

  const restam = await db
    .select({ n: sql<number>`count(*)` })
    .from(examAnalyteTriagemTable)
    .where(eq(examAnalyteTriagemTable.status, "pendente"));
  r.restaramPendentes = Number(restam[0]?.n ?? 0);

  return r;
}
