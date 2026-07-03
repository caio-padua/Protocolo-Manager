// ENRIQUECIMENTO DA FÓRMULA MANIPULADA — lê o catálogo de fórmulas (catalogo_formulas,
// transmutado do IHE) e compõe o item de lembrete no PADRÃO DE DESCRIÇÃO da fórmula
// manipulada: título, ativos, via, apresentação e posologia.
//
// GAP QUE ISTO RESOLVE: o motor de lembrete (sincronizarLembretePrescricao) só
// carregava o NOME cru da fórmula. As mensagens por período saíam sem o padrão
// (ativos/via/posologia). Aqui o item vira rico, e flui até o WhatsApp pelo
// blocoPrescricaoPeriodos (ativoPrincipal — dose / observacaoRefeicao / posologia).
//
// A fórmula no catálogo é um CONJUNTO de linhas com o mesmo `codigo_semantico`,
// onde `identificador` rotula o slot e `conteudo` traz o valor:
//   TITL  -> título da fórmula        SUBS* -> ativos
//   VIA   -> via de administração     APRE  -> apresentação (cápsula/sachê)
//   POSO* -> posologia (1 por tomada) OBS   -> observação
import { db, catalogoFormulasTable, itemDoencaTable, perguntaDoencaTable, anamneseRespostaTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { gatilhoBate } from "./motor-anamnese";
import type { ItemLembretePrescricao } from "./lembrete-periodo";

const UNIDADES = /\b(mg|mcg|g|ml|ui|kg|l)\b/gi;
const STOPWORDS = new Set(["de", "do", "da", "dos", "das", "e", "ou", "com", "no", "na", "para", "ao", "à", "em", "por"]);

// Nome/ativo do catálogo (TODO-MAIÚSCULO) em Title Case legível: cada palavra
// capitalizada, conectores em minúscula (menos a primeira) e unidades minúsculas.
function titulo(txt: string): string {
  const palavras = txt.trim().toLowerCase().split(/\s+/);
  const out = palavras.map((w, i) => {
    if (i > 0 && STOPWORDS.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
  return out.join(" ").replace(UNIDADES, (u) => u.toLowerCase());
}

// Frase do catálogo (posologia/apresentação/observação) em caixa-de-frase: só a
// primeira letra maiúscula, resto minúsculo, unidades de medida minúsculas.
function sentenca(txt: string): string {
  const base = txt.trim().toLowerCase();
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  return cap.replace(UNIDADES, (u) => u.toLowerCase());
}

type PeriodoAntigo = "manha" | "tarde" | "noite";

// Deriva os períodos do dia a partir das frases de posologia (café/manhã -> manhã,
// almoço -> tarde, jantar/treino/noite/deitar -> noite). Sem pista, cai no padrão.
function periodosDaPosologia(posologias: string[]): PeriodoAntigo[] {
  const set = new Set<PeriodoAntigo>();
  for (const p of posologias) {
    const t = p.toLowerCase();
    if (/(caf[eé]|manh[aã]|jejum|acordar|desjejum)/.test(t)) set.add("manha");
    if (/(almo[cç]o|meio-?dia|tarde)/.test(t)) set.add("tarde");
    if (/(jantar|noite|deitar|dormir|treino|ceia)/.test(t)) set.add("noite");
  }
  return [...set];
}

// Compõe UM item de lembrete rico a partir das linhas do catálogo da fórmula.
// `itemRef` é o codigo_semantico da fórmula (chave do agrupamento no catálogo).
// Se a fórmula não for achada no catálogo, devolve o item só com o nome (fallback).
export async function enriquecerItemFormula(
  itemRef: string | null,
  itemNome: string,
): Promise<ItemLembretePrescricao> {
  if (!itemRef) return { tipo: "formula", nome: itemNome };

  const linhas = await db
    .select({ identificador: catalogoFormulasTable.identificador, conteudo: catalogoFormulasTable.conteudo })
    .from(catalogoFormulasTable)
    .where(eq(catalogoFormulasTable.codigoSemantico, itemRef));
  if (!linhas.length) return { tipo: "formula", nome: itemNome };

  let tituloFormula = "";
  const ativos: string[] = [];
  let via = "";
  let apresentacao = "";
  const posologias: string[] = [];
  let obs = "";

  for (const l of linhas) {
    const id = (l.identificador ?? "").trim().toUpperCase();
    const val = (l.conteudo ?? "").trim();
    if (!val) continue;
    if (id === "TITL") tituloFormula = val;
    else if (id.startsWith("SUBS")) ativos.push(titulo(val));
    else if (id === "VIA") via = val;
    else if (id === "APRE") apresentacao = val;
    else if (id.startsWith("POSO")) posologias.push(sentenca(val));
    else if (id === "OBS") obs = val;
  }

  const nome = tituloFormula ? titulo(tituloFormula) : itemNome?.trim() || itemRef;
  const ativoPrincipal = ativos.length ? ativos.join(" + ") : undefined;
  const dose = apresentacao ? sentenca(apresentacao) : undefined;
  const posologia = posologias.length ? posologias.join("; ") : undefined;

  const detalheRefeicao: string[] = [];
  if (via) detalheRefeicao.push(`Via ${via.trim().toLowerCase()}`);
  if (obs) detalheRefeicao.push(sentenca(obs));
  const observacaoRefeicao = detalheRefeicao.length ? detalheRefeicao.join(" · ") : undefined;

  const periodos = periodosDaPosologia(posologias);

  return {
    tipo: "formula",
    nome,
    ativoPrincipal,
    dose,
    posologia,
    observacaoRefeicao,
    periodos: periodos.length ? periodos : undefined,
  };
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
    out.push(await enriquecerItemFormula(f.itemRef, f.itemNome ?? f.itemRef ?? "Fórmula"));
  }
  return out;
}
