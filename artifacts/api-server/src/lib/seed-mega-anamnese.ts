// =============================================================================
// SEED CLINICO — MEGA ANAMNESE INTEGRATIVA (nivel Harvard, DB-driven, editavel)
// Regra do CEO: ADITIVO (nunca dropar); idempotente (roda N vezes sem duplicar).
// Upsert de perguntas por id_ihe; amarracoes por chave natural (onConflictDoNothing).
// =============================================================================
import { sql } from "drizzle-orm";
import {
  db,
  anamneseQuestionarioTable,
  catalogoSintomasTable,
  perguntaSintomaTable,
  perguntaDoencaTable,
  itemDoencaTable,
  itemSintomaTable,
  motorPermissaoTable,
  professionalsTable,
} from "@workspace/db";

type Logger = { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void };
const noopLog: Logger = { info: () => {}, error: () => {} };

// Blocos canonicos (auto explicativos para a tela)
export const BLOCOS = {
  A: "A. IDENTIFICACAO E CONTEXTO",
  B: "B. QUEIXA PRINCIPAL E HMA",
  C: "C. REVISAO POR SISTEMAS (ISDA)",
  D: "D. ANTECEDENTES PATOLOGICOS",
  E: "E. CIRURGIAS E INTERNACOES",
  F: "F. ALERGIAS E REACOES ADVERSAS",
  G: "G. MEDICACOES E SUPLEMENTOS",
  H: "H. IMUNIZACOES",
  I: "I. HABITOS E ESTILO DE VIDA",
  J: "J. HISTORIA FAMILIAR",
  K: "K. PSICOSSOCIAL E OCUPACIONAL",
  L: "L. GINECO-OBSTETRICA / ANDROLOGICA",
  M: "M. EIXOS DA MEDICINA FUNCIONAL",
  N: "N. PREFERENCIAS TERAPEUTICAS E FINANCEIRAS",
} as const;

type Opcao = { label: string; valor: string | number; peso: number };
interface Pergunta {
  idIhe: number;
  bloco: string;
  perguntaId: string;
  pergunta: string;
  tipoResposta: string;
  sistema?: string;
  escalaValidada?: string;
  pesoGravidade?: number;
  eSinalAlarme?: boolean;
  opcoes?: Opcao[];
  ordem: number;
  obrigatorio?: string;
}

// Opcoes padrao reutilizaveis
const SIM_NAO: Opcao[] = [
  { label: "Nao", valor: "nao", peso: 0 },
  { label: "Sim", valor: "sim", peso: 2 },
];
const FREQ_0_3: Opcao[] = [
  { label: "Nenhum dia", valor: 0, peso: 0 },
  { label: "Varios dias", valor: 1, peso: 0 },
  { label: "Mais da metade dos dias", valor: 2, peso: 1 },
  { label: "Quase todos os dias", valor: 3, peso: 2 },
];
const INTENS: Opcao[] = [
  { label: "Ausente", valor: 0, peso: 0 },
  { label: "Leve", valor: 1, peso: 1 },
  { label: "Moderado", valor: 2, peso: 2 },
  { label: "Grave", valor: 3, peso: 3 },
];

// --- Sintomas a enriquecer (alem dos 10 existentes) ---
const SINTOMAS_NOVOS: { codigo: string; nome: string }[] = [
  { codigo: "SINT GERAL PESO 001", nome: "PERDA DE PESO INVOLUNTARIA" },
  { codigo: "SINT GERAL SUDN 001", nome: "SUDORESE NOTURNA" },
  { codigo: "SINT GERAL FEBR 001", nome: "FEBRE PERSISTENTE" },
  { codigo: "SINT DERM QUED 001", nome: "QUEDA DE CABELO" },
  { codigo: "SINT DERM ACNE 001", nome: "ACNE" },
  { codigo: "SINT DERM UNHA 001", nome: "UNHAS FRACAS" },
  { codigo: "SINT CARD DORT 001", nome: "DOR TORACICA" },
  { codigo: "SINT CARD PALP 001", nome: "PALPITACAO" },
  { codigo: "SINT RESP CHIA 001", nome: "CHIADO NO PEITO" },
  { codigo: "SINT RESP FALT 001", nome: "FALTA DE AR AOS ESFORCOS" },
  { codigo: "SINT DIGE AZIA 001", nome: "AZIA / REFLUXO" },
  { codigo: "SINT DIGE CONS 001", nome: "CONSTIPACAO" },
  { codigo: "SINT DIGE DIAR 001", nome: "DIARREIA" },
  { codigo: "SINT DIGE DIST 001", nome: "DISTENSAO ABDOMINAL" },
  { codigo: "SINT UROG NOCT 001", nome: "NOCTURIA" },
  { codigo: "SINT UROG ARDE 001", nome: "ARDENCIA URINARIA" },
  { codigo: "SINT OSMU ARTR 001", nome: "DOR ARTICULAR" },
  { codigo: "SINT OSMU RIGI 001", nome: "RIGIDEZ MATINAL" },
  { codigo: "SINT NEUR TONT 001", nome: "TONTURA" },
  { codigo: "SINT NEUR FORM 001", nome: "FORMIGAMENTO" },
  { codigo: "SINT ENDO SEDE 001", nome: "SEDE EXCESSIVA" },
  { codigo: "SINT ENDO PESO 001", nome: "GANHO DE PESO" },
  { codigo: "SINT HEMA PALI 001", nome: "PALIDEZ" },
  { codigo: "SINT HEMA HEMA 001", nome: "HEMATOMAS FACEIS" },
  { codigo: "SINT PSIQ TRIS 001", nome: "TRISTEZA / ANEDONIA" },
  { codigo: "SINT PSIQ ANSI 001", nome: "ANSIEDADE" },
  { codigo: "SINT PSIQ INSO 001", nome: "INSONIA" },
  { codigo: "SINT META FADI 002", nome: "FADIGA CRONICA" },
  { codigo: "SINT REPR LIBI 001", nome: "BAIXA LIBIDO" },
  { codigo: "SINT REPR ERET 001", nome: "DISFUNCAO ERETIL" },
  { codigo: "SINT SONO RONC 001", nome: "RONCO / APNEIA" },
];

// --- As perguntas dos 14 blocos (Harvard) ---
const P: Pergunta[] = [];
let ord = 0;
const add = (p: Omit<Pergunta, "ordem">) => P.push({ ...p, ordem: ord++ });

// ---- BLOCO A (re-rotula existentes 1,2 + novas) ----
add({ idIhe: 1, bloco: BLOCOS.A, perguntaId: "Q001", pergunta: "NOME COMPLETO", tipoResposta: "TEXTO", obrigatorio: "true" });
add({ idIhe: 2, bloco: BLOCOS.A, perguntaId: "Q002", pergunta: "CPF", tipoResposta: "TEXTO", obrigatorio: "true" });
add({ idIhe: 1001, bloco: BLOCOS.A, perguntaId: "A03", pergunta: "IDADE", tipoResposta: "NUMERO" });
add({ idIhe: 1002, bloco: BLOCOS.A, perguntaId: "A04", pergunta: "SEXO BIOLOGICO", tipoResposta: "LISTA", opcoes: [{ label: "Feminino", valor: "F", peso: 0 }, { label: "Masculino", valor: "M", peso: 0 }] });
add({ idIhe: 1003, bloco: BLOCOS.A, perguntaId: "A05", pergunta: "ANCESTRALIDADE / ETNIA", tipoResposta: "TEXTO" });
add({ idIhe: 1004, bloco: BLOCOS.A, perguntaId: "A06", pergunta: "PROFISSAO", tipoResposta: "TEXTO" });
add({ idIhe: 1005, bloco: BLOCOS.A, perguntaId: "A07", pergunta: "ESCOLARIDADE", tipoResposta: "LISTA" });

// ---- BLOCO B — QUEIXA + HMA (OPQRST) ----
add({ idIhe: 3, bloco: BLOCOS.B, perguntaId: "Q010", pergunta: "QUEIXA PRINCIPAL", tipoResposta: "TEXTO LONGO", obrigatorio: "true" });
add({ idIhe: 4, bloco: BLOCOS.B, perguntaId: "Q011", pergunta: "DURACAO DA QUEIXA (TEMPO DE EVOLUCAO)", tipoResposta: "TEXTO CURTO", escalaValidada: "OPQRST" });
add({ idIhe: 1010, bloco: BLOCOS.B, perguntaId: "B03", pergunta: "INICIO: COMO E QUANDO COMECOU (ONSET)", tipoResposta: "TEXTO", escalaValidada: "OPQRST" });
add({ idIhe: 1011, bloco: BLOCOS.B, perguntaId: "B04", pergunta: "O QUE PROVOCA OU ALIVIA", tipoResposta: "TEXTO", escalaValidada: "OPQRST" });
add({ idIhe: 1012, bloco: BLOCOS.B, perguntaId: "B05", pergunta: "QUALIDADE DO SINTOMA (COMO E)", tipoResposta: "TEXTO", escalaValidada: "OPQRST" });
add({ idIhe: 1013, bloco: BLOCOS.B, perguntaId: "B06", pergunta: "REGIAO / IRRADIACAO", tipoResposta: "TEXTO", escalaValidada: "OPQRST" });
add({ idIhe: 1014, bloco: BLOCOS.B, perguntaId: "B07", pergunta: "INTENSIDADE DA QUEIXA (0 A 10)", tipoResposta: "ESCALA", escalaValidada: "OPQRST", pesoGravidade: 1, opcoes: Array.from({ length: 11 }, (_, i) => ({ label: String(i), valor: i, peso: i >= 7 ? 2 : i >= 4 ? 1 : 0 })) });
add({ idIhe: 1015, bloco: BLOCOS.B, perguntaId: "B08", pergunta: "TRATAMENTOS JA TENTADOS PARA ESTA QUEIXA", tipoResposta: "TEXTO LONGO" });

// ---- BLOCO C — REVISAO POR SISTEMAS (ISDA) ----
// Geral/constitucional (sinais de alarme)
add({ idIhe: 1100, bloco: BLOCOS.C, perguntaId: "C-GER01", pergunta: "PERDA DE PESO SEM CAUSA NOS ULTIMOS 6 MESES?", tipoResposta: "SIM NAO", sistema: "Geral", pesoGravidade: 3, eSinalAlarme: true, opcoes: SIM_NAO });
add({ idIhe: 1101, bloco: BLOCOS.C, perguntaId: "C-GER02", pergunta: "SUDORESE NOTURNA INTENSA?", tipoResposta: "SIM NAO", sistema: "Geral", pesoGravidade: 3, eSinalAlarme: true, opcoes: SIM_NAO });
add({ idIhe: 1102, bloco: BLOCOS.C, perguntaId: "C-GER03", pergunta: "FADIGA / CANSACO PERSISTENTE?", tipoResposta: "ESCALA", sistema: "Geral", pesoGravidade: 1, opcoes: INTENS });
// Pele e faneros
add({ idIhe: 1110, bloco: BLOCOS.C, perguntaId: "C-PEL01", pergunta: "QUEDA DE CABELO IMPORTANTE?", tipoResposta: "SIM NAO", sistema: "Pele e faneros", pesoGravidade: 1, opcoes: SIM_NAO });
add({ idIhe: 1111, bloco: BLOCOS.C, perguntaId: "C-PEL02", pergunta: "UNHAS FRACAS / QUEBRADICAS?", tipoResposta: "SIM NAO", sistema: "Pele e faneros", opcoes: SIM_NAO });
// Cabeca/ORL
add({ idIhe: 1120, bloco: BLOCOS.C, perguntaId: "C-ORL01", pergunta: "CEFALEIA (DOR DE CABECA) FREQUENTE?", tipoResposta: "ESCALA", sistema: "Cabeca/ORL", pesoGravidade: 1, opcoes: INTENS });
add({ idIhe: 1121, bloco: BLOCOS.C, perguntaId: "C-ORL02", pergunta: "ZUMBIDO NO OUVIDO?", tipoResposta: "SIM NAO", sistema: "Cabeca/ORL", opcoes: SIM_NAO });
// Cardiovascular
add({ idIhe: 1130, bloco: BLOCOS.C, perguntaId: "C-CAR01", pergunta: "DOR NO PEITO (TORACICA)?", tipoResposta: "SIM NAO", sistema: "Cardiovascular", pesoGravidade: 3, eSinalAlarme: true, opcoes: SIM_NAO });
add({ idIhe: 1131, bloco: BLOCOS.C, perguntaId: "C-CAR02", pergunta: "PALPITACOES?", tipoResposta: "SIM NAO", sistema: "Cardiovascular", pesoGravidade: 2, opcoes: SIM_NAO });
add({ idIhe: 1132, bloco: BLOCOS.C, perguntaId: "C-CAR03", pergunta: "INCHACO NAS PERNAS (EDEMA)?", tipoResposta: "SIM NAO", sistema: "Cardiovascular", pesoGravidade: 2, opcoes: SIM_NAO });
// Respiratorio
add({ idIhe: 1140, bloco: BLOCOS.C, perguntaId: "C-RES01", pergunta: "FALTA DE AR AOS ESFORCOS?", tipoResposta: "ESCALA", sistema: "Respiratorio", pesoGravidade: 2, opcoes: INTENS });
add({ idIhe: 1141, bloco: BLOCOS.C, perguntaId: "C-RES02", pergunta: "TOSSE PERSISTENTE?", tipoResposta: "SIM NAO", sistema: "Respiratorio", pesoGravidade: 1, opcoes: SIM_NAO });
// Digestorio
add({ idIhe: 1150, bloco: BLOCOS.C, perguntaId: "C-DIG01", pergunta: "AZIA / REFLUXO FREQUENTE?", tipoResposta: "SIM NAO", sistema: "Digestorio", opcoes: SIM_NAO });
add({ idIhe: 1151, bloco: BLOCOS.C, perguntaId: "C-DIG02", pergunta: "ALTERACAO DO HABITO INTESTINAL (DIARREIA/CONSTIPACAO)?", tipoResposta: "SIM NAO", sistema: "Digestorio", pesoGravidade: 1, opcoes: SIM_NAO });
// Geniturinario
add({ idIhe: 1160, bloco: BLOCOS.C, perguntaId: "C-URO01", pergunta: "ARDENCIA OU DOR AO URINAR?", tipoResposta: "SIM NAO", sistema: "Geniturinario", opcoes: SIM_NAO });
add({ idIhe: 1161, bloco: BLOCOS.C, perguntaId: "C-URO02", pergunta: "ACORDA A NOITE PARA URINAR (NOCTURIA)?", tipoResposta: "SIM NAO", sistema: "Geniturinario", opcoes: SIM_NAO });
// Musculoesqueletico
add({ idIhe: 1170, bloco: BLOCOS.C, perguntaId: "C-OSM01", pergunta: "DOR ARTICULAR?", tipoResposta: "ESCALA", sistema: "Musculoesqueletico", pesoGravidade: 1, opcoes: INTENS });
add({ idIhe: 1171, bloco: BLOCOS.C, perguntaId: "C-OSM02", pergunta: "RIGIDEZ MATINAL > 30 MINUTOS?", tipoResposta: "SIM NAO", sistema: "Musculoesqueletico", pesoGravidade: 2, opcoes: SIM_NAO });
// Neurologico
add({ idIhe: 1180, bloco: BLOCOS.C, perguntaId: "C-NEU01", pergunta: "TONTURA OU VERTIGEM?", tipoResposta: "SIM NAO", sistema: "Neurologico", pesoGravidade: 1, opcoes: SIM_NAO });
add({ idIhe: 1181, bloco: BLOCOS.C, perguntaId: "C-NEU02", pergunta: "FORMIGAMENTO / DORMENCIA?", tipoResposta: "SIM NAO", sistema: "Neurologico", pesoGravidade: 1, opcoes: SIM_NAO });
add({ idIhe: 1182, bloco: BLOCOS.C, perguntaId: "C-NEU03", pergunta: "FALHA DE MEMORIA OU CONCENTRACAO?", tipoResposta: "ESCALA", sistema: "Neurologico", pesoGravidade: 1, opcoes: INTENS });
// Endocrino/metabolico
add({ idIhe: 1190, bloco: BLOCOS.C, perguntaId: "C-END01", pergunta: "SEDE EXCESSIVA?", tipoResposta: "SIM NAO", sistema: "Endocrino", pesoGravidade: 2, opcoes: SIM_NAO });
add({ idIhe: 1191, bloco: BLOCOS.C, perguntaId: "C-END02", pergunta: "INTOLERANCIA AO FRIO?", tipoResposta: "SIM NAO", sistema: "Endocrino", pesoGravidade: 1, opcoes: SIM_NAO });
add({ idIhe: 1192, bloco: BLOCOS.C, perguntaId: "C-END03", pergunta: "GANHO DE PESO RECENTE SEM MUDAR DIETA?", tipoResposta: "SIM NAO", sistema: "Endocrino", pesoGravidade: 1, opcoes: SIM_NAO });
// Hematologico
add({ idIhe: 1200, bloco: BLOCOS.C, perguntaId: "C-HEM01", pergunta: "HEMATOMAS OU SANGRAMENTOS FACEIS?", tipoResposta: "SIM NAO", sistema: "Hematologico", pesoGravidade: 2, eSinalAlarme: true, opcoes: SIM_NAO });
add({ idIhe: 1201, bloco: BLOCOS.C, perguntaId: "C-HEM02", pergunta: "PALIDEZ / CANSACO SUGESTIVO DE ANEMIA?", tipoResposta: "SIM NAO", sistema: "Hematologico", pesoGravidade: 1, opcoes: SIM_NAO });
// Reprodutor
add({ idIhe: 1210, bloco: BLOCOS.C, perguntaId: "C-REP01", pergunta: "ALTERACAO DA LIBIDO?", tipoResposta: "SIM NAO", sistema: "Reprodutor", pesoGravidade: 1, opcoes: SIM_NAO });

// ---- BLOCO D — ANTECEDENTES PATOLOGICOS (amarra doenca direto) ----
add({ idIhe: 6, bloco: BLOCOS.D, perguntaId: "Q013", pergunta: "DOENCAS JA DIAGNOSTICADAS", tipoResposta: "MULTISELECAO" });
add({ idIhe: 1300, bloco: BLOCOS.D, perguntaId: "D02", pergunta: "TEM DIAGNOSTICO DE DIABETES?", tipoResposta: "SIM NAO", pesoGravidade: 3, opcoes: SIM_NAO });
add({ idIhe: 1301, bloco: BLOCOS.D, perguntaId: "D03", pergunta: "TEM DIAGNOSTICO DE HIPOTIREOIDISMO?", tipoResposta: "SIM NAO", pesoGravidade: 2, opcoes: SIM_NAO });
add({ idIhe: 1302, bloco: BLOCOS.D, perguntaId: "D04", pergunta: "TEM HIPERTENSAO ARTERIAL?", tipoResposta: "SIM NAO", pesoGravidade: 2, opcoes: SIM_NAO });
add({ idIhe: 1303, bloco: BLOCOS.D, perguntaId: "D05", pergunta: "ANO DO DIAGNOSTICO PRINCIPAL E NIVEL DE CONTROLE", tipoResposta: "TEXTO" });

// ---- BLOCO E — CIRURGIAS E INTERNACOES ----
add({ idIhe: 8, bloco: BLOCOS.E, perguntaId: "Q015", pergunta: "CIRURGIAS PREVIAS (QUAL E QUANDO)", tipoResposta: "TEXTO LONGO" });
add({ idIhe: 9, bloco: BLOCOS.E, perguntaId: "Q016", pergunta: "INTERNACOES PREVIAS", tipoResposta: "TEXTO LONGO" });
add({ idIhe: 1400, bloco: BLOCOS.E, perguntaId: "E03", pergunta: "JA TEVE COMPLICACAO COM ANESTESIA?", tipoResposta: "SIM NAO", pesoGravidade: 2, opcoes: SIM_NAO });

// ---- BLOCO F — ALERGIAS ----
add({ idIhe: 10, bloco: BLOCOS.F, perguntaId: "Q017", pergunta: "ALERGIAS OU INTOLERANCIAS (MEDICAMENTO/ALIMENTO/AMBIENTAL)", tipoResposta: "TEXTO LONGO", pesoGravidade: 2 });
add({ idIhe: 1500, bloco: BLOCOS.F, perguntaId: "F02", pergunta: "JA TEVE REACAO GRAVE (ANAFILAXIA)?", tipoResposta: "SIM NAO", pesoGravidade: 3, eSinalAlarme: true, opcoes: SIM_NAO });

// ---- BLOCO G — MEDICACOES E SUPLEMENTOS ----
add({ idIhe: 1600, bloco: BLOCOS.G, perguntaId: "G01", pergunta: "MEDICAMENTOS EM USO CONTINUO (NOME E DOSE)", tipoResposta: "TEXTO LONGO" });
add({ idIhe: 1601, bloco: BLOCOS.G, perguntaId: "G02", pergunta: "SUPLEMENTOS / FITOTERAPICOS EM USO", tipoResposta: "TEXTO LONGO" });
add({ idIhe: 1602, bloco: BLOCOS.G, perguntaId: "G03", pergunta: "ADESAO AO TRATAMENTO (TOMA CERTINHO?)", tipoResposta: "LISTA", opcoes: [{ label: "Alta", valor: "alta", peso: 0 }, { label: "Media", valor: "media", peso: 1 }, { label: "Baixa", valor: "baixa", peso: 2 }] });

// ---- BLOCO H — IMUNIZACOES ----
add({ idIhe: 1700, bloco: BLOCOS.H, perguntaId: "H01", pergunta: "VACINAS EM DIA (CALENDARIO E REFORCOS)?", tipoResposta: "SIM NAO", opcoes: SIM_NAO });

// ---- BLOCO I — HABITOS E ESTILO DE VIDA (+ escalas AUDIT-C, CAGE, Epworth, Bristol) ----
add({ idIhe: 1800, bloco: BLOCOS.I, perguntaId: "I-TAB01", pergunta: "TABAGISMO: STATUS", tipoResposta: "LISTA", sistema: "Tabagismo", pesoGravidade: 2, opcoes: [{ label: "Nunca fumou", valor: "nunca", peso: 0 }, { label: "Ex-fumante", valor: "ex", peso: 1 }, { label: "Fumante atual", valor: "atual", peso: 3 }] });
add({ idIhe: 1801, bloco: BLOCOS.I, perguntaId: "I-TAB02", pergunta: "TABAGISMO: MACOS-ANO (CIGARROS/DIA / 20 x ANOS)", tipoResposta: "NUMERO", sistema: "Tabagismo", pesoGravidade: 2 });
// AUDIT-C
add({ idIhe: 1810, bloco: BLOCOS.I, perguntaId: "AUDITC1", pergunta: "AUDIT-C 1: COM QUE FREQUENCIA BEBE ALCOOL?", tipoResposta: "ESCALA", sistema: "Etilismo", escalaValidada: "AUDITC", pesoGravidade: 1, opcoes: [{ label: "Nunca", valor: 0, peso: 0 }, { label: "1x/mes ou menos", valor: 1, peso: 0 }, { label: "2-4x/mes", valor: 2, peso: 1 }, { label: "2-3x/semana", valor: 3, peso: 1 }, { label: "4+/semana", valor: 4, peso: 2 }] });
add({ idIhe: 1811, bloco: BLOCOS.I, perguntaId: "AUDITC2", pergunta: "AUDIT-C 2: QUANTAS DOSES EM DIA TIPICO?", tipoResposta: "ESCALA", sistema: "Etilismo", escalaValidada: "AUDITC", opcoes: [{ label: "1-2", valor: 0, peso: 0 }, { label: "3-4", valor: 1, peso: 0 }, { label: "5-6", valor: 2, peso: 1 }, { label: "7-9", valor: 3, peso: 1 }, { label: "10+", valor: 4, peso: 2 }] });
add({ idIhe: 1812, bloco: BLOCOS.I, perguntaId: "AUDITC3", pergunta: "AUDIT-C 3: FREQUENCIA DE 6+ DOSES NUMA OCASIAO?", tipoResposta: "ESCALA", sistema: "Etilismo", escalaValidada: "AUDITC", opcoes: [{ label: "Nunca", valor: 0, peso: 0 }, { label: "Menos de 1x/mes", valor: 1, peso: 0 }, { label: "Mensal", valor: 2, peso: 1 }, { label: "Semanal", valor: 3, peso: 1 }, { label: "Diario", valor: 4, peso: 2 }] });
// CAGE
add({ idIhe: 1820, bloco: BLOCOS.I, perguntaId: "CAGE1", pergunta: "CAGE 1: JA SENTIU QUE DEVERIA DIMINUIR A BEBIDA?", tipoResposta: "SIM NAO", sistema: "Etilismo", escalaValidada: "CAGE", pesoGravidade: 1, opcoes: SIM_NAO });
add({ idIhe: 1821, bloco: BLOCOS.I, perguntaId: "CAGE2", pergunta: "CAGE 2: PESSOAS JA O INCOMODARAM CRITICANDO SUA BEBIDA?", tipoResposta: "SIM NAO", sistema: "Etilismo", escalaValidada: "CAGE", opcoes: SIM_NAO });
add({ idIhe: 1822, bloco: BLOCOS.I, perguntaId: "CAGE3", pergunta: "CAGE 3: JA SE SENTIU CULPADO POR BEBER?", tipoResposta: "SIM NAO", sistema: "Etilismo", escalaValidada: "CAGE", opcoes: SIM_NAO });
add({ idIhe: 1823, bloco: BLOCOS.I, perguntaId: "CAGE4", pergunta: "CAGE 4: JA BEBEU LOGO AO ACORDAR PARA SE ACALMAR?", tipoResposta: "SIM NAO", sistema: "Etilismo", escalaValidada: "CAGE", pesoGravidade: 1, opcoes: SIM_NAO });
// Atividade / sedentarismo
add({ idIhe: 1830, bloco: BLOCOS.I, perguntaId: "I-ATV01", pergunta: "PRATICA ATIVIDADE FISICA?", tipoResposta: "LISTA", sistema: "Atividade", pesoGravidade: 1, opcoes: [{ label: "Regular (3+/semana)", valor: "regular", peso: 0 }, { label: "As vezes", valor: "asvezes", peso: 1 }, { label: "Sedentario", valor: "sedentario", peso: 2 }] });
// Sono / Epworth (resumido em itens-chave)
add({ idIhe: 1840, bloco: BLOCOS.I, perguntaId: "I-SON01", pergunta: "HORAS DE SONO POR NOITE", tipoResposta: "NUMERO", sistema: "Sono" });
add({ idIhe: 1841, bloco: BLOCOS.I, perguntaId: "EPW1", pergunta: "EPWORTH: CHANCE DE COCHILAR SENTADO LENDO", tipoResposta: "ESCALA", sistema: "Sono", escalaValidada: "EPWORTH", opcoes: [{ label: "Nenhuma", valor: 0, peso: 0 }, { label: "Leve", valor: 1, peso: 0 }, { label: "Moderada", valor: 2, peso: 1 }, { label: "Alta", valor: 3, peso: 1 }] });
add({ idIhe: 1842, bloco: BLOCOS.I, perguntaId: "EPW2", pergunta: "EPWORTH: CHANCE DE COCHILAR APOS ALMOCO SEM ALCOOL", tipoResposta: "ESCALA", sistema: "Sono", escalaValidada: "EPWORTH", opcoes: [{ label: "Nenhuma", valor: 0, peso: 0 }, { label: "Leve", valor: 1, peso: 0 }, { label: "Moderada", valor: 2, peso: 1 }, { label: "Alta", valor: 3, peso: 1 }] });
add({ idIhe: 1843, bloco: BLOCOS.I, perguntaId: "I-SON02", pergunta: "RONCO ALTO OU APNEIA RELATADA?", tipoResposta: "SIM NAO", sistema: "Sono", escalaValidada: "EPWORTH", pesoGravidade: 2, opcoes: SIM_NAO });
// Alimentacao
add({ idIhe: 1850, bloco: BLOCOS.I, perguntaId: "I-ALI01", pergunta: "CONSUMO DE ULTRAPROCESSADOS", tipoResposta: "LISTA", sistema: "Alimentacao", pesoGravidade: 1, opcoes: [{ label: "Baixo", valor: "baixo", peso: 0 }, { label: "Medio", valor: "medio", peso: 1 }, { label: "Alto", valor: "alto", peso: 2 }] });
// Bristol
add({ idIhe: 1860, bloco: BLOCOS.I, perguntaId: "BRISTOL", pergunta: "BRISTOL: FORMA HABITUAL DAS FEZES (TIPO 1 A 7)", tipoResposta: "ESCALA", sistema: "Funcao intestinal", escalaValidada: "BRISTOL", pesoGravidade: 1, opcoes: Array.from({ length: 7 }, (_, i) => ({ label: `Tipo ${i + 1}`, valor: i + 1, peso: i + 1 === 1 || i + 1 === 7 ? 2 : i + 1 === 6 ? 1 : 0 })) });
// Estresse
add({ idIhe: 1870, bloco: BLOCOS.I, perguntaId: "I-EST01", pergunta: "NIVEL DE ESTRESSE PERCEBIDO", tipoResposta: "ESCALA", sistema: "Estresse", pesoGravidade: 1, opcoes: INTENS });

// ---- BLOCO J — HISTORIA FAMILIAR ----
add({ idIhe: 7, bloco: BLOCOS.J, perguntaId: "Q014", pergunta: "HISTORICO FAMILIAR (DOENCAS EM PARENTES DE 1o GRAU)", tipoResposta: "MULTISELECAO", pesoGravidade: 1 });
add({ idIhe: 1900, bloco: BLOCOS.J, perguntaId: "J02", pergunta: "FAMILIAR DE 1o GRAU COM CANCER?", tipoResposta: "SIM NAO", pesoGravidade: 2, opcoes: SIM_NAO });
add({ idIhe: 1901, bloco: BLOCOS.J, perguntaId: "J03", pergunta: "FAMILIAR DE 1o GRAU COM DOENCA CARDIOVASCULAR PRECOCE?", tipoResposta: "SIM NAO", pesoGravidade: 2, opcoes: SIM_NAO });
add({ idIhe: 1902, bloco: BLOCOS.J, perguntaId: "J04", pergunta: "FAMILIAR DE 1o GRAU COM DIABETES?", tipoResposta: "SIM NAO", pesoGravidade: 1, opcoes: SIM_NAO });

// ---- BLOCO K — PSICOSSOCIAL / OCUPACIONAL (+ PHQ-9, GAD-7) ----
// PHQ-9 (9 itens)
const PHQ_ITENS = [
  "POUCO INTERESSE OU PRAZER EM FAZER AS COISAS",
  "SE SENTIR PARA BAIXO, DEPRIMIDO OU SEM ESPERANCA",
  "DIFICULDADE PARA PEGAR NO SONO OU DORMIR DEMAIS",
  "SENTIR-SE CANSADO OU COM POUCA ENERGIA",
  "FALTA DE APETITE OU COMER DEMAIS",
  "SENTIR-SE MAL CONSIGO MESMO / FRACASSO",
  "DIFICULDADE DE CONCENTRACAO",
  "LENTIDAO OU AGITACAO PERCEBIDA POR OUTROS",
  "PENSAMENTOS DE QUE SERIA MELHOR ESTAR MORTO",
];
PHQ_ITENS.forEach((q, i) => add({ idIhe: 2000 + i, bloco: BLOCOS.K, perguntaId: `PHQ${i + 1}`, pergunta: `PHQ-9 ${i + 1}: ${q}`, tipoResposta: "ESCALA", sistema: "Psiquiatrico", escalaValidada: "PHQ9", pesoGravidade: i === 8 ? 3 : 1, eSinalAlarme: i === 8, opcoes: FREQ_0_3 }));
// GAD-7 (7 itens)
const GAD_ITENS = [
  "SENTIR-SE NERVOSO, ANSIOSO OU NO LIMITE",
  "NAO CONSEGUIR PARAR DE SE PREOCUPAR",
  "PREOCUPAR-SE DEMAIS COM DIVERSAS COISAS",
  "DIFICULDADE PARA RELAXAR",
  "FICAR TAO INQUIETO QUE E DIFICIL FICAR PARADO",
  "FICAR FACILMENTE IRRITADO",
  "SENTIR MEDO COMO SE ALGO TERRIVEL FOSSE ACONTECER",
];
GAD_ITENS.forEach((q, i) => add({ idIhe: 2100 + i, bloco: BLOCOS.K, perguntaId: `GAD${i + 1}`, pergunta: `GAD-7 ${i + 1}: ${q}`, tipoResposta: "ESCALA", sistema: "Psiquiatrico", escalaValidada: "GAD7", pesoGravidade: 1, opcoes: FREQ_0_3 }));
add({ idIhe: 2200, bloco: BLOCOS.K, perguntaId: "K-SUP01", pergunta: "TEM REDE DE APOIO / SUPORTE SOCIAL?", tipoResposta: "SIM NAO", opcoes: [{ label: "Sim", valor: "sim", peso: 0 }, { label: "Nao", valor: "nao", peso: 1 }] });
add({ idIhe: 2201, bloco: BLOCOS.K, perguntaId: "K-TOX01", pergunta: "EXPOSICAO OCUPACIONAL A TOXICOS / METAIS?", tipoResposta: "SIM NAO", pesoGravidade: 1, opcoes: SIM_NAO });

// ---- BLOCO L — GINECO / ANDROLOGICA (+ IPSS resumido) ----
add({ idIhe: 2300, bloco: BLOCOS.L, perguntaId: "L-GIN01", pergunta: "CICLO MENSTRUAL: REGULARIDADE", tipoResposta: "LISTA", sistema: "Ginecologico", opcoes: [{ label: "Regular", valor: "regular", peso: 0 }, { label: "Irregular", valor: "irregular", peso: 1 }, { label: "Menopausa", valor: "menopausa", peso: 0 }] });
add({ idIhe: 2301, bloco: BLOCOS.L, perguntaId: "L-GIN02", pergunta: "NUMERO DE GESTACOES", tipoResposta: "NUMERO", sistema: "Ginecologico" });
add({ idIhe: 2310, bloco: BLOCOS.L, perguntaId: "IPSS1", pergunta: "IPSS: SENSACAO DE ESVAZIAMENTO INCOMPLETO DA BEXIGA", tipoResposta: "ESCALA", sistema: "Andrologico", escalaValidada: "IPSS", pesoGravidade: 1, opcoes: [{ label: "Nunca", valor: 0, peso: 0 }, { label: "Raramente", valor: 1, peso: 0 }, { label: "As vezes", valor: 2, peso: 0 }, { label: "Metade", valor: 3, peso: 1 }, { label: "Maioria", valor: 4, peso: 1 }, { label: "Quase sempre", valor: 5, peso: 2 }] });
add({ idIhe: 2311, bloco: BLOCOS.L, perguntaId: "L-AND01", pergunta: "DIFICULDADE DE ERECAO?", tipoResposta: "SIM NAO", sistema: "Andrologico", pesoGravidade: 1, opcoes: SIM_NAO });

// ---- BLOCO M — EIXOS DA MEDICINA FUNCIONAL ----
add({ idIhe: 2400, bloco: BLOCOS.M, perguntaId: "M-DIG01", pergunta: "EIXO DIGESTAO: SINTOMAS APOS REFEICOES?", tipoResposta: "SIM NAO", sistema: "Digestao", opcoes: SIM_NAO });
add({ idIhe: 2401, bloco: BLOCOS.M, perguntaId: "M-ENE01", pergunta: "EIXO ENERGIA: ENERGIA AO LONGO DO DIA", tipoResposta: "ESCALA", sistema: "Energia", opcoes: INTENS });
add({ idIhe: 2402, bloco: BLOCOS.M, perguntaId: "M-DET01", pergunta: "EIXO DETOX: SENSIBILIDADE A CHEIROS/QUIMICOS?", tipoResposta: "SIM NAO", sistema: "Detox", opcoes: SIM_NAO });
add({ idIhe: 2403, bloco: BLOCOS.M, perguntaId: "M-IMU01", pergunta: "EIXO IMUNIDADE: INFECCOES DE REPETICAO?", tipoResposta: "SIM NAO", sistema: "Imunidade", pesoGravidade: 1, opcoes: SIM_NAO });
add({ idIhe: 2404, bloco: BLOCOS.M, perguntaId: "M-HOR01", pergunta: "EIXO HORMONIOS: SINTOMAS DE DESEQUILIBRIO HORMONAL?", tipoResposta: "SIM NAO", sistema: "Hormonios", pesoGravidade: 1, opcoes: SIM_NAO });

// ---- BLOCO N — PREFERENCIAS (re-rotula existentes, corrige typos e Q030 duplicado) ----
add({ idIhe: 17, bloco: BLOCOS.N, perguntaId: "Q020", pergunta: "PREFERENCIA DE ENTREGA TERAPEUTICA", tipoResposta: "LISTA FECHADA" });
add({ idIhe: 18, bloco: BLOCOS.N, perguntaId: "Q021", pergunta: "ACEITA COMPLEMENTO ENDOVENOSO PROGRAMADO", tipoResposta: "SIM NAO", opcoes: SIM_NAO });
add({ idIhe: 11, bloco: BLOCOS.N, perguntaId: "Q030", pergunta: "DESEJA SOMENTE EXAMES", tipoResposta: "SIM NAO", opcoes: SIM_NAO });
add({ idIhe: 12, bloco: BLOCOS.N, perguntaId: "Q031", pergunta: "ACEITA FORMULA MANIPULADA", tipoResposta: "SIM NAO", opcoes: SIM_NAO });
add({ idIhe: 13, bloco: BLOCOS.N, perguntaId: "Q032", pergunta: "ACEITA PROTOCOLO INJETAVEL", tipoResposta: "SIM NAO", opcoes: SIM_NAO });
add({ idIhe: 14, bloco: BLOCOS.N, perguntaId: "Q033", pergunta: "ACEITA IMPLANTE", tipoResposta: "SIM NAO", opcoes: SIM_NAO });
add({ idIhe: 15, bloco: BLOCOS.N, perguntaId: "Q040", pergunta: "MODELO DE INVESTIMENTO PREFERIDO", tipoResposta: "LISTA" });
add({ idIhe: 16, bloco: BLOCOS.N, perguntaId: "Q041", pergunta: "CONFORTO FINANCEIRO", tipoResposta: "LISTA" });
// Q030 duplicado (id_ihe 19) -> renomeado para Q042 SEM dropar o dado
add({ idIhe: 19, bloco: BLOCOS.N, perguntaId: "Q042", pergunta: "PERFIL FINANCEIRO", tipoResposta: "LISTA FECHADA" });
// pergunta 5 (sintomas atuais) fica no bloco C como entrada generica
add({ idIhe: 5, bloco: BLOCOS.C, perguntaId: "Q012", pergunta: "SINTOMAS ATUAIS (LISTA LIVRE)", tipoResposta: "MULTISELECAO", sistema: "Geral" });

// --- Amarracao pergunta -> sintoma (gatilho = valor que dispara) ---
const AMARRA_SINTOMA: { perguntaId: string; sintomaCodigo: string; gatilho: string; peso: number }[] = [
  { perguntaId: "C-GER01", sintomaCodigo: "SINT GERAL PESO 001", gatilho: "sim", peso: 3 },
  { perguntaId: "C-GER02", sintomaCodigo: "SINT GERAL SUDN 001", gatilho: "sim", peso: 3 },
  { perguntaId: "C-GER03", sintomaCodigo: "SINT META FADI 001", gatilho: ">=2", peso: 1 },
  { perguntaId: "C-PEL01", sintomaCodigo: "SINT DERM QUED 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-PEL02", sintomaCodigo: "SINT DERM UNHA 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-ORL01", sintomaCodigo: "SINT NEUR CEFA 001", gatilho: ">=2", peso: 1 },
  { perguntaId: "C-CAR01", sintomaCodigo: "SINT CARD DORT 001", gatilho: "sim", peso: 3 },
  { perguntaId: "C-CAR02", sintomaCodigo: "SINT CARD PALP 001", gatilho: "sim", peso: 2 },
  { perguntaId: "C-CAR03", sintomaCodigo: "SINT CARD EDEM 001", gatilho: "sim", peso: 2 },
  { perguntaId: "C-RES01", sintomaCodigo: "SINT CARD DISP 001", gatilho: ">=2", peso: 2 },
  { perguntaId: "C-RES02", sintomaCodigo: "SINT RESP TOSS 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-DIG01", sintomaCodigo: "SINT DIGE AZIA 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-DIG02", sintomaCodigo: "SINT DIGE DIAR 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-URO01", sintomaCodigo: "SINT UROG ARDE 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-URO02", sintomaCodigo: "SINT UROG NOCT 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-OSM01", sintomaCodigo: "SINT OSMU ARTR 001", gatilho: ">=2", peso: 1 },
  { perguntaId: "C-OSM02", sintomaCodigo: "SINT OSMU RIGI 001", gatilho: "sim", peso: 2 },
  { perguntaId: "C-NEU01", sintomaCodigo: "SINT NEUR TONT 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-NEU02", sintomaCodigo: "SINT NEUR FORM 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-NEU03", sintomaCodigo: "SINT NEUR MEMO 001", gatilho: ">=2", peso: 1 },
  { perguntaId: "C-END01", sintomaCodigo: "SINT ENDO SEDE 001", gatilho: "sim", peso: 2 },
  { perguntaId: "C-END02", sintomaCodigo: "SINT ENDO FRIO 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-END03", sintomaCodigo: "SINT ENDO PESO 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-HEM01", sintomaCodigo: "SINT HEMA HEMA 001", gatilho: "sim", peso: 2 },
  { perguntaId: "C-HEM02", sintomaCodigo: "SINT HEMA PALI 001", gatilho: "sim", peso: 1 },
  { perguntaId: "C-REP01", sintomaCodigo: "SINT REPR LIBI 001", gatilho: "sim", peso: 1 },
  { perguntaId: "I-SON02", sintomaCodigo: "SINT SONO RONC 001", gatilho: "sim", peso: 2 },
  { perguntaId: "L-AND01", sintomaCodigo: "SINT REPR ERET 001", gatilho: "sim", peso: 1 },
  { perguntaId: "PHQ1", sintomaCodigo: "SINT PSIQ TRIS 001", gatilho: ">=2", peso: 1 },
  { perguntaId: "GAD1", sintomaCodigo: "SINT PSIQ ANSI 001", gatilho: ">=2", peso: 1 },
  { perguntaId: "PHQ3", sintomaCodigo: "SINT PSIQ INSO 001", gatilho: ">=2", peso: 1 },
];

// --- Amarracao pergunta -> doenca (doencaIdIhe das doencas reais) ---
const AMARRA_DOENCA: { perguntaId: string; doencaIdIhe: number; gatilho: string; peso: number }[] = [
  { perguntaId: "D02", doencaIdIhe: 3, gatilho: "sim", peso: 3 }, // DIABETES TIPO 2
  { perguntaId: "D03", doencaIdIhe: 4, gatilho: "sim", peso: 2 }, // HIPOTIREOIDISMO
  { perguntaId: "C-END01", doencaIdIhe: 3, gatilho: "sim", peso: 1 }, // sede -> diabetes
  { perguntaId: "C-END02", doencaIdIhe: 4, gatilho: "sim", peso: 1 }, // frio -> hipotireoidismo
  { perguntaId: "PHQ2", doencaIdIhe: 12, gatilho: ">=2", peso: 1 }, // deprimido -> DEPRESSAO
  { perguntaId: "GAD1", doencaIdIhe: 11, gatilho: ">=2", peso: 1 }, // ansioso -> ANSIEDADE
];

// --- Amarracao item terapeutico -> doenca/sintoma (exemplos editaveis) ---
const ITEM_DOENCA: { tipo: string; ref: string; nome: string; doencaIdIhe: number }[] = [
  { tipo: "injetavel", ref: "EX-VITD", nome: "VITAMINA D INJETAVEL", doencaIdIhe: 4 },
  { tipo: "injetavel", ref: "EX-MET", nome: "COMPLEXO METABOLICO", doencaIdIhe: 3 },
];
const ITEM_SINTOMA: { tipo: string; ref: string; nome: string; sintomaCodigo: string }[] = [
  { tipo: "injetavel", ref: "EX-ENERGIA", nome: "COMPLEXO B ENERGIA", sintomaCodigo: "SINT META FADI 001" },
  { tipo: "injetavel", ref: "EX-SONO", nome: "MAGNESIO SONO", sintomaCodigo: "SINT PSIQ INSO 001" },
];

export async function runSeedMegaAnamnese(log: Logger = noopLog) {
  const report = {
    sintomas: { criados: 0, existentes: 0 },
    perguntas: { criadas: 0, atualizadas: 0 },
    perguntaSintoma: 0,
    perguntaDoenca: 0,
    itemDoenca: 0,
    itemSintoma: 0,
    permissoes: 0,
  };

  // 1) Sintomas (idempotente por codigo_semantico)
  for (const s of SINTOMAS_NOVOS) {
    const r = await db
      .insert(catalogoSintomasTable)
      .values({ codigoSemantico: s.codigo, nomeSintoma: s.nome, ativo: true })
      .onConflictDoNothing({ target: catalogoSintomasTable.codigoSemantico })
      .returning({ id: catalogoSintomasTable.id });
    if (r.length) report.sintomas.criados++;
    else report.sintomas.existentes++;
  }

  // 2) Perguntas (upsert por id_ihe)
  for (const q of P) {
    const r = await db
      .insert(anamneseQuestionarioTable)
      .values({
        idIhe: q.idIhe,
        bloco: q.bloco,
        perguntaId: q.perguntaId,
        pergunta: q.pergunta,
        tipoResposta: q.tipoResposta,
        obrigatorio: q.obrigatorio ?? "false",
        sistema: q.sistema ?? null,
        escalaValidada: q.escalaValidada ?? null,
        pesoGravidade: q.pesoGravidade ?? 0,
        eSinalAlarme: q.eSinalAlarme ?? false,
        opcoes: q.opcoes ?? null,
        ordem: q.ordem,
      })
      .onConflictDoUpdate({
        target: anamneseQuestionarioTable.idIhe,
        set: {
          bloco: q.bloco,
          perguntaId: q.perguntaId,
          pergunta: q.pergunta,
          tipoResposta: q.tipoResposta,
          sistema: q.sistema ?? null,
          escalaValidada: q.escalaValidada ?? null,
          pesoGravidade: q.pesoGravidade ?? 0,
          eSinalAlarme: q.eSinalAlarme ?? false,
          opcoes: q.opcoes ?? null,
          ordem: q.ordem,
        },
      })
      .returning({ id: anamneseQuestionarioTable.id, created: sql<boolean>`(xmax = 0)` });
    if ((r[0] as { created?: boolean })?.created) report.perguntas.criadas++;
    else report.perguntas.atualizadas++;
  }

  // 3) Amarracoes pergunta->sintoma
  for (const a of AMARRA_SINTOMA) {
    const r = await db
      .insert(perguntaSintomaTable)
      .values({ perguntaId: a.perguntaId, sintomaCodigo: a.sintomaCodigo, gatilhoValor: a.gatilho, peso: a.peso })
      .onConflictDoNothing()
      .returning({ id: perguntaSintomaTable.id });
    report.perguntaSintoma += r.length;
  }

  // 4) Amarracoes pergunta->doenca
  for (const a of AMARRA_DOENCA) {
    const r = await db
      .insert(perguntaDoencaTable)
      .values({ perguntaId: a.perguntaId, doencaIdIhe: a.doencaIdIhe, gatilhoValor: a.gatilho, peso: a.peso })
      .onConflictDoNothing()
      .returning({ id: perguntaDoencaTable.id });
    report.perguntaDoenca += r.length;
  }

  // 5) item->doenca / item->sintoma
  for (const it of ITEM_DOENCA) {
    const r = await db
      .insert(itemDoencaTable)
      .values({ itemTipo: it.tipo, itemRef: it.ref, itemNome: it.nome, doencaIdIhe: it.doencaIdIhe })
      .onConflictDoNothing()
      .returning({ id: itemDoencaTable.id });
    report.itemDoenca += r.length;
  }
  for (const it of ITEM_SINTOMA) {
    const r = await db
      .insert(itemSintomaTable)
      .values({ itemTipo: it.tipo, itemRef: it.ref, itemNome: it.nome, sintomaCodigo: it.sintomaCodigo })
      .onConflictDoNothing()
      .returning({ id: itemSintomaTable.id });
    report.itemSintoma += r.length;
  }

  // 6) Permissoes default por profissional (preenche a LACUNA da CARTA_06)
  const profs = await db.select().from(professionalsTable);
  for (const pr of profs) {
    const r = await db
      .insert(motorPermissaoTable)
      .values({ profissionalId: pr.id, papel: "medico", podeValidar: true, podeAssinar: true, podeDelegar: true, podeBypass: false, nuncaOpera: false })
      .onConflictDoNothing({ target: motorPermissaoTable.profissionalId })
      .returning({ id: motorPermissaoTable.id });
    report.permissoes += r.length;
  }

  log.info(report, "Seed mega-anamnese concluido");
  return report;
}

// Runner direto: tsx src/lib/seed-mega-anamnese.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeedMegaAnamnese({ info: (o) => console.log(JSON.stringify(o, null, 2)), error: (o) => console.error(o) })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
