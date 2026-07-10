// ENRIQUECIMENTO DA FÓRMULA MANIPULADA — lê o catálogo de fórmulas (catalogo_formulas,
// transmutado do IHE) e compõe UM item de lembrete POR TOMADA (POSO), no PADRÃO DE
// DESCRIÇÃO da fórmula manipulada: ativo principal + dose numérica, e cada tomada no
// SEU período, com a SUA posologia.
//
// GAP QUE ISTO RESOLVE (3 bugs antigos): o motor (a) juntava TODOS os ativos numa linha,
// (b) usava a APRESENTAÇÃO ("cápsula/sachê") como dose e (c) juntava as posologias numa
// string só, repetida em todos os períodos. Agora: ativo principal = SUBS 01; dose = valor
// numérico de SUBS 01; e cada POSO vira uma tomada num único período, com posologia própria
// (Opção B validada pelo CEO em 03/07/2026 — cada bloco só a sua posologia).
//
// A posologia é interpretada pelo PARSER CLONADO do primo IHE (lib/posologia → posologia.ts).
//
// A fórmula no catálogo é um CONJUNTO de linhas com o mesmo `codigo_semantico`,
// onde `identificador` rotula o slot e `conteudo` traz o valor:
//   TITL  -> título da fórmula        SUBS* -> ativos (SUBS 01 = principal)
//   VIA   -> via de administração     APRE  -> apresentação (IGNORADA)
//   POSO* -> posologia (1 por tomada) OBS   -> observação
import { db, catalogoFormulasTable, itemDoencaTable, perguntaDoencaTable, anamneseRespostaTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { gatilhoBate } from "./motor-anamnese";
import { MAPA_PERIODO, type ItemLembretePrescricao, type PeriodoAntigo } from "./lembrete-periodo";
import { parsePosologia, semAcento, VIA_LABEL } from "@workspace/posologia";

const UNIDADES = /\b(mg|mcg|g|ml|ui|kg|l)\b/gi;
// Dose numérica de uma substância: número (com vírgula/ponto) + unidade (mg/mcg/g/ml/ui/kg/l).
const DOSE_SUBSTANCIA = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|ml|ui|kg|l)\b/i;
const STOPWORDS = new Set(["de", "do", "da", "dos", "das", "e", "ou", "com", "no", "na", "para", "ao", "à", "em", "por"]);

// Nome/ativo do catálogo (TODO-MAIÚSCULO) em Title Case legível: cada palavra
// capitalizada, conectores em minúscula (menos a primeira) e unidades minúsculas.
function titulo(txt: string): string {
  const palavras = txt.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = palavras.map((w, i) => {
    if (i > 0 && STOPWORDS.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
  return out.join(" ").replace(UNIDADES, (u) => u.toLowerCase());
}

// Frase do catálogo (apresentação/observação) em caixa-de-frase: só a primeira
// letra maiúscula, resto minúsculo, unidades de medida minúsculas.
function sentenca(txt: string): string {
  const base = txt.trim().toLowerCase();
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  return cap.replace(UNIDADES, (u) => u.toLowerCase());
}

// SUBS 01 cru ("MAGNESIO 200 MG") -> ativo principal { nome: "Magnésio", dose: "200 mg" }.
// Sem número reconhecível, devolve só o nome (sem dose).
function ativoPrincipalDeSubs(subsRaw: string): { nome: string; dose?: string } {
  const m = subsRaw.match(DOSE_SUBSTANCIA);
  let dose: string | undefined;
  let resto = subsRaw;
  if (m) {
    const numero = m[1].replace(".", ","); // vírgula decimal (Brasil)
    dose = `${numero} ${m[2].toLowerCase()}`;
    resto = subsRaw.replace(m[0], " ");
  }
  return { nome: titulo(resto), dose };
}

// Deriva o período canônico do dia de UMA posologia (9 períodos do cânone
// `periodos_dia`, herdado do IHE — ordem do CEO em 09/07/2026): jejum -> JE,
// café/manhã -> IM, almoço -> AL, tarde -> IT, jantar/noite/treino -> NO,
// deitar/dormir -> FN, ceia -> CE. Sem pista, devolve undefined.
function periodoDaPosologia(poso: string): PeriodoAntigo | undefined {
  const t = poso.toLowerCase();
  if (/(jejum|acordar)/.test(t)) return "jejum";
  if (/(caf[eé]|desjejum|manh[aã])/.test(t)) return "manha";
  if (/(almo[cç]o|meio-?dia)/.test(t)) return "almoco";
  if (/tarde/.test(t)) return "tarde";
  if (/ceia/.test(t)) return "ceia";
  if (/(deitar|dormir)/.test(t)) return "final_noite";
  if (/(jantar|noite|treino)/.test(t)) return "noite";
  return undefined;
}

// Frase da refeição/momento a partir do texto cru da posologia (para a linha visível).
// SEM acento (regra do CEO, 09/07/2026: tudo sem acento para não dar erro).
function refeicaoDaPosologia(poso: string): string | undefined {
  const t = poso.toLowerCase();
  if (/jejum/.test(t)) return "em jejum";
  if (/(caf[eé]|desjejum|acordar)/.test(t)) return "no cafe da manha";
  if (/(almo[cç]o|meio-?dia)/.test(t)) return "no almoco";
  if (/jantar/.test(t)) return "no jantar";
  if (/ceia/.test(t)) return "na ceia";
  if (/treino/.test(t)) return "no treino";
  if (/(deitar|dormir)/.test(t)) return "antes de dormir";
  if (/manh[aã]/.test(t)) return "pela manha";
  if (/tarde/.test(t)) return "a tarde";
  if (/noite/.test(t)) return "a noite";
  return undefined;
}

// "07:00" -> "07h00". Hora do período (para a linha "Horário:" do template do IHE).
function horaFormatada(inicio: string): string {
  return inicio.replace(":", "h");
}

// Compõe a linha de posologia (Opção B): "1 dose, via oral, no almoço".
// Quantidade vem do parser clonado do IHE; a forma é sempre "dose" (regra do CEO:
// nunca "cápsula/sachê"); a via vem do slot VIA; a refeição vem do texto do POSO.
function linhaPosologia(poso: string, viaRaw: string): string {
  const p = parsePosologia(poso);
  const qtd = p.quantidade ?? 1;
  const unidade = qtd === 1 ? "dose" : "doses";
  const partes: string[] = [`${qtd} ${unidade}`];

  const via = parsePosologia(viaRaw).via ?? p.via;
  if (via) partes.push(VIA_LABEL[via]);

  const refeicao = refeicaoDaPosologia(poso);
  if (refeicao) partes.push(refeicao);

  return partes.join(", ");
}

// Compõe os itens de lembrete ricos de UMA fórmula: UM item por período em que ela é
// tomada. `itemRef` é o codigo_semantico da fórmula (chave do agrupamento no catálogo).
// Sem catálogo, devolve o item só com o nome (fallback), como antes.
export async function enriquecerItemFormula(
  itemRef: string | null,
  itemNome: string,
): Promise<ItemLembretePrescricao[]> {
  if (!itemRef) return [{ tipo: "formula", nome: itemNome }];

  const linhas = await db
    .select({ identificador: catalogoFormulasTable.identificador, conteudo: catalogoFormulasTable.conteudo })
    .from(catalogoFormulasTable)
    .where(eq(catalogoFormulasTable.codigoSemantico, itemRef));
  if (!linhas.length) return [{ tipo: "formula", nome: itemNome }];

  let tituloFormula = "";
  let subs01 = "";
  let via = "";
  let apresentacao = ""; // lido mas IGNORADO (nunca vira dose)
  const posologias: string[] = [];
  let obs = "";

  for (const l of linhas) {
    const id = (l.identificador ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const val = (l.conteudo ?? "").trim();
    if (!val) continue;
    if (id === "TITL") tituloFormula = val;
    else if (id === "SUBS01" && !subs01) subs01 = val; // só o principal
    else if (id === "VIA") via = val;
    else if (id === "APRE") apresentacao = val;
    else if (id.startsWith("POSO")) posologias.push(val);
    else if (id === "OBS") obs = val;
  }
  void apresentacao;

  const nome = tituloFormula ? titulo(tituloFormula) : itemNome?.trim() || itemRef;
  const principal = subs01 ? ativoPrincipalDeSubs(subs01) : undefined;
  const ativoPrincipal = principal?.nome || undefined;
  const dose = principal?.dose;
  const observacaoRefeicao = obs ? sentenca(obs) : undefined;

  // Campos gerados saem SEM acento (regra do CEO, 09/07/2026).
  const montarItem = (per: PeriodoAntigo, posologia: string | undefined): ItemLembretePrescricao => ({
    tipo: "formula",
    nome: semAcento(nome),
    ativoPrincipal: ativoPrincipal ? semAcento(ativoPrincipal) : undefined,
    dose,
    horario: horaFormatada(MAPA_PERIODO[per].inicio),
    observacaoRefeicao: observacaoRefeicao ? semAcento(observacaoRefeicao) : undefined,
    posologia: posologia ? semAcento(posologia) : undefined,
    periodos: [per],
  });

  // UM item de lembrete por TOMADA (POSO): cada tomada vira um bloco no SEU período,
  // com SÓ a sua posologia (fim da duplicação). Duas tomadas no mesmo período viram
  // dois blocos (o sincronizador empilha por período, não deduplica por nome).
  // Tomada sem refeição reconhecível cai no período-padrão determinístico "manha"
  // (nunca anexada arbitrariamente a outro bloco).
  const itens: ItemLembretePrescricao[] = [];
  for (const poso of posologias) {
    const per = periodoDaPosologia(poso) ?? "manha";
    itens.push(montarItem(per, linhaPosologia(poso, via)));
  }

  // Fórmula sem nenhuma tomada cadastrada → cai no padrão da fórmula (manhã e noite),
  // sem linha de posologia (mantém o comportamento anterior para esse caso).
  if (!itens.length) {
    for (const per of ["manha", "noite"] as PeriodoAntigo[]) itens.push(montarItem(per, undefined));
  }

  return itens;
}

// Deriva SÓ as fórmulas manipuladas do cliente a partir da cadeia REAL da anamnese:
// respostas -> doenças acesas (gatilhoBate) -> item_doenca (tipo formula) -> enriquecido.
// Injetáveis NÃO entram: o lembrete por período pertence às fórmulas manipuladas
// ORAIS; injetável é por sessão. Vazio quando o cliente não tem fórmula acesa.
export async function derivarFormulasLembrete(clienteId: number): Promise<ItemLembretePrescricao[]> {
  const respostas = await db
    .select({
      perguntaId: anamneseRespostaTable.perguntaId,
      valor: anamneseRespostaTable.valor,
      valorNumerico: anamneseRespostaTable.valorNumerico,
    })
    .from(anamneseRespostaTable)
    .where(eq(anamneseRespostaTable.clienteId, clienteId));
  if (!respostas.length) return [];

  const mapResp = new Map<string, string | number>();
  for (const r of respostas) mapResp.set(r.perguntaId, r.valorNumerico != null ? r.valorNumerico : r.valor ?? "");

  const amarr = await db.select().from(perguntaDoencaTable);
  const acesas = new Set<number>();
  for (const a of amarr) {
    if (!mapResp.has(a.perguntaId)) continue;
    if (gatilhoBate(a.gatilhoValor, mapResp.get(a.perguntaId)!)) acesas.add(a.doencaIdIhe);
  }
  if (!acesas.size) return [];

  const itens = await db
    .select()
    .from(itemDoencaTable)
    .where(inArray(itemDoencaTable.doencaIdIhe, [...acesas]));

  const formulas = itens.filter((i) => i.itemTipo === "formula");
  const out: ItemLembretePrescricao[] = [];
  for (const f of formulas) {
    out.push(...(await enriquecerItemFormula(f.itemRef, f.itemNome ?? f.itemRef ?? "Fórmula")));
  }
  return out;
}
