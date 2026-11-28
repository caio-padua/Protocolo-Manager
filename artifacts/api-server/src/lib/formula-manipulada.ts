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
import { semAcento } from "@workspace/posologia";
import { interpretarSubstancia, colarUnidades, limparTextoMensagem } from "./dose-substancia";
import { linhaPosologia, periodoDaPosologia} from "./posologia-lembrete";

const UNIDADES = /\b(mg|mcg|g|ml|ui|kg|l)\b/gi;
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

// SUBS cru ("MAGNESIO 200 MG") -> { nome: "Magnesio", dose: "200mg" } pela leitura
// determinística (dose-substancia.ts). Dúvida = `alerta` (o lembrete não é enviado).
function ativoPrincipalDeSubs(subsRaw: string): { nome: string; dose?: string; alerta?: string } {
  const r = interpretarSubstancia(subsRaw);
  return { nome: titulo(r.nomeBruto), dose: r.dose, alerta: r.alerta };
}

// "07:00" -> "07h00". Hora do período (para a linha "Horário:" do template do IHE).
function horaFormatada(inicio: string): string {
  return inicio.replace(":", "h");
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
  let totalSubs = 0;
  const subsExtras: { ordem: number; raw: string }[] = [];
  let via = "";
  let apresentacao = ""; // lido mas IGNORADO (nunca vira dose)
  const posologias: string[] = [];
  let obs = "";

  for (const l of linhas) {
    const id = (l.identificador ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const val = (l.conteudo ?? "").trim();
    if (!val) continue;
    if (id === "TITL") tituloFormula = val;
    else if (id === "SUBS01" && !subs01) { subs01 = val; totalSubs += 1; }
    else if (/^SUBS\d\d$/.test(id)) {
      totalSubs += 1; // conta todas; só as 3 primeiras aparecem
      if (/^SUBS0[2-3]$/.test(id)) subsExtras.push({ ordem: Number(id.slice(4)), raw: val });
    }
    else if (id === "VIA") via = val;
    else if (id === "APRE") apresentacao = val;
    else if (id.startsWith("POSO")) posologias.push(val);
    else if (id === "OBS") obs = val;
  }
  void apresentacao;

  const nome = colarUnidades(limparTextoMensagem(tituloFormula ? titulo(tituloFormula) : itemNome?.trim() || itemRef));
  const principal = subs01 ? ativoPrincipalDeSubs(subs01) : undefined;
  const ativoPrincipal = principal?.nome || undefined;
  const dose = principal?.dose;
  const alertasSubs: string[] = [];
  const listaSubs = [
    ...(subs01 ? [{ ordem: 1, raw: subs01 }] : []),
    ...subsExtras.sort((a, b) => a.ordem - b.ordem),
  ].map(({ ordem, raw }) => {
    const a = ativoPrincipalDeSubs(raw);
    if (a.alerta) alertasSubs.push(`SUBS ${String(ordem).padStart(2, "0")} "${raw}": ${a.alerta}`);
    return {
      rotulo: `${ordem}/${Math.max(totalSubs, ordem)}`,
      nome: semAcento(limparTextoMensagem(a.nome)),
      ...(a.dose ? { dose: a.dose } : {}),
    };
  });
  const observacaoRefeicao = obs ? colarUnidades(limparTextoMensagem(sentenca(obs))) : undefined;

  // Campos gerados saem SEM acento (regra do CEO, 09/07/2026).
  const montarItem = (
    per: PeriodoAntigo,
    posologia: string | undefined,
    alertasPoso: string[] = [],
  ): ItemLembretePrescricao => {
    const alertas = [...alertasSubs, ...alertasPoso];
    return {
      tipo: "formula",
      nome: semAcento(nome),
      ativoPrincipal: ativoPrincipal ? semAcento(ativoPrincipal) : undefined,
      dose,
      substancias: listaSubs.length ? listaSubs : undefined,
      horario: horaFormatada(MAPA_PERIODO[per].inicio),
      observacaoRefeicao: observacaoRefeicao ? semAcento(observacaoRefeicao) : undefined,
      posologia: posologia ? semAcento(posologia) : undefined,
      periodos: [per],
      ...(alertas.length ? { alertas } : {}),
    };
  };

  // UM item de lembrete por TOMADA (POSO): cada tomada vira um bloco no SEU período,
  // com SÓ a sua posologia (fim da duplicação). Duas tomadas no mesmo período viram
  // dois blocos (o sincronizador empilha por período, não deduplica por nome).
  // Tomada sem refeição reconhecível cai no período-padrão determinístico "manha"
  // (nunca anexada arbitrariamente a outro bloco).
  const itens: ItemLembretePrescricao[] = [];
  for (const poso of posologias) {
    const per = periodoDaPosologia(poso) ?? "manha";
    const l = linhaPosologia(poso, via);
    itens.push(montarItem(per, l.linha || undefined, l.alertas));
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
