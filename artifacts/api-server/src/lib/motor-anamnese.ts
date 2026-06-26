import {
  db,
  anamneseQuestionarioTable,
  catalogoSintomasTable,
  catalogoDoencasTable,
  catalogoBlocoExamesTable,
  perguntaSintomaTable,
  perguntaDoencaTable,
  itemDoencaTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";

// =============================================================================
// Motor da Mega Anamnese (calculo puro reutilizavel): recebe as respostas do
// cliente e devolve escore por bloco, grade global, sintomas/doencas acesos,
// exames sugeridos e sinais de alarme. Usado pelo simulador interno
// (/mega-anamnese/simular) e pelo portal publico de anamnese.
// =============================================================================

export type RespostaMotor = { perguntaId: string; valor: string | number };

type Opcao = { label: string; valor: string | number; peso: number };

export type BlocoEscore = { bloco: string; escore: number; grade: string };

// Sugestao de dieta derivada pelo Cerebro (calculo puro, sem gravar no banco).
// A persistencia na fila (dieta_indicacao) e feita pela rota do Orgao Dieta.
export type SugestaoDieta = {
  objetivoSugerido: string;
  estiloSugerido: string | null;
  justificativa: string;
  bloco: string | null;
  escore: number;
};

// Sugestao de treino derivada pelo Cerebro (calculo puro, sem gravar no banco).
// A persistencia na fila (treino_indicacao) e feita pela rota do Orgao Treino.
export type SugestaoTreino = {
  objetivoSugerido: string;
  divisaoSugerida: string | null;
  justificativa: string;
  bloco: string | null;
  escore: number;
};

export type ResultadoMotor = {
  escoreTotal: number;
  gradeGlobal: string;
  redFlag: boolean;
  blocos: BlocoEscore[];
  sintomas: string[];
  doencas: string[];
  exames: string[];
  alarmes: { perguntaId: string; pergunta: string }[];
  sugestaoDieta: SugestaoDieta | null;
  sugestaoTreino: SugestaoTreino | null;
};

// Escada de gravidade do CEO (ONDA B do Master Loop): a grade de exames sai do
// escore (por bloco). Red Flag (sinal de alarme) soma 10 e joga direto p/ AMPLIADA.
export function gradeDoEscore(escore: number): string {
  if (escore >= 10) return "GRADE AMPLIADA";
  if (escore >= 7) return "GRADE SOFISTICADA";
  if (escore >= 4) return "GRADE INTERMEDIARIA";
  if (escore >= 1) return "GRADE BASICA";
  return "SEM GRADE";
}

// Avalia se o valor respondido dispara o gatilho da amarracao.
// Gatilhos suportados: vazio (sempre), ">=N", ">N", valor textual exato.
export function gatilhoBate(gatilho: string | null, valor: string | number): boolean {
  if (gatilho == null || gatilho === "") return true;
  const v = String(valor).toLowerCase();
  if (gatilho.startsWith(">=")) return Number(valor) >= Number(gatilho.slice(2));
  if (gatilho.startsWith(">")) return Number(valor) > Number(gatilho.slice(1));
  return v === gatilho.toLowerCase();
}

export async function computeMotor(respostas: RespostaMotor[]): Promise<ResultadoMotor> {
  const mapResp = new Map<string, string | number>();
  for (const r of respostas) mapResp.set(r.perguntaId, r.valor);

  const perguntas = await db.select().from(anamneseQuestionarioTable);
  const porPerguntaId = new Map<string, (typeof perguntas)[number]>();
  for (const p of perguntas) if (p.perguntaId) porPerguntaId.set(p.perguntaId, p);

  // Escore por bloco = SOMA dos pesos das respostas (Requisito 1 da ONDA B).
  // O multiplicador de intensidade (Leve=1, Moderado=2, Grave=3) JA vem embutido
  // no `peso` da opcao no catalogo da anamnese (verificado nos dados), portanto NAO
  // multiplicamos de novo aqui — isso contaria o peso em dobro.
  const escoreBloco = new Map<string, number>();
  const alarmes: { perguntaId: string; pergunta: string }[] = [];
  let redFlag = false; // Sinal de Alarme: soma 10 e pula direto p/ grade AMPLIADA
  for (const [perguntaId, valor] of mapResp) {
    const p = porPerguntaId.get(perguntaId);
    if (!p || !p.bloco) continue;
    let pontos = 0;
    const opcoes = (p.opcoes as Opcao[] | null) ?? null;
    if (opcoes && opcoes.length) {
      const op = opcoes.find((o) => String(o.valor) === String(valor));
      if (op) pontos += op.peso;
    } else if (typeof valor === "number") {
      pontos += valor;
    }
    // Spec ONDA B: escore por bloco = SOMA dos pesos das respostas. A intensidade
    // (Leve=1/Moderado=2/Grave=3) ja vem no peso da opcao; NAO somamos `pesoGravidade`
    // automaticamente aqui (era um bonus fora da spec que, com a escada nova de
    // limiares baixos, inflava a grade). O unico bonus e o da Red Flag, abaixo.
    // Red Flag (Requisito 2): pergunta marcada como sinal de alarme e respondida de
    // forma positiva (pontos > 0) soma 10 ao bloco e aciona a grade AMPLIADA.
    if (p.eSinalAlarme && pontos > 0) {
      pontos += 10;
      redFlag = true;
      alarmes.push({ perguntaId, pergunta: p.pergunta ?? perguntaId });
    }
    escoreBloco.set(p.bloco, (escoreBloco.get(p.bloco) ?? 0) + pontos);
  }

  const blocos = Array.from(escoreBloco.entries())
    .map(([bloco, escore]) => ({ bloco, escore, grade: gradeDoEscore(escore) }))
    .sort((a, b) => b.escore - a.escore);
  const escoreTotal = blocos.reduce((s, x) => s + x.escore, 0);
  // A grade global (grade de exames) sai do bloco MAIS grave; Red Flag sobrepoe.
  const escoreMaxBloco = blocos.length ? blocos[0].escore : 0;
  const gradeGlobal = redFlag ? "GRADE AMPLIADA" : gradeDoEscore(escoreMaxBloco);

  // Sintomas acesos pelas amarracoes
  const amarSint = await db.select().from(perguntaSintomaTable);
  const sintCodigos = new Set<string>();
  for (const a of amarSint) {
    if (!mapResp.has(a.perguntaId)) continue;
    if (gatilhoBate(a.gatilhoValor, mapResp.get(a.perguntaId)!)) sintCodigos.add(a.sintomaCodigo);
  }
  const sintNomes: string[] = [];
  if (sintCodigos.size) {
    const rows = await db.select().from(catalogoSintomasTable);
    for (const r of rows) if (sintCodigos.has(r.codigoSemantico) && r.nomeSintoma) sintNomes.push(r.nomeSintoma);
  }

  // Doencas acesas + blocos motor derivados
  const amarDoe = await db.select().from(perguntaDoencaTable);
  const doeIds = new Set<number>();
  for (const a of amarDoe) {
    if (!mapResp.has(a.perguntaId)) continue;
    if (gatilhoBate(a.gatilhoValor, mapResp.get(a.perguntaId)!)) doeIds.add(a.doencaIdIhe);
  }
  const doeNomes: string[] = [];
  const blocosMotor = new Set<string>();
  if (doeIds.size) {
    const rows = await db.select().from(catalogoDoencasTable);
    for (const r of rows) {
      if (!doeIds.has(r.idIhe)) continue;
      if (r.nomeDoenca) doeNomes.push(r.nomeDoenca);
      const bm = (r.blocoMotor as string | null) ?? "";
      bm.split("/").map((s) => s.trim()).filter(Boolean).forEach((c) => blocosMotor.add(c));
    }
  }

  // Exames derivados dos blocos motor das doencas acesas
  const exames = new Set<string>();
  if (blocosMotor.size) {
    const rows = await db.select().from(catalogoBlocoExamesTable);
    for (const r of rows) {
      const cod = (r.blocoId as unknown as string | null) ?? null;
      const nome = (r as unknown as { nomeExame?: string | null }).nomeExame ?? null;
      if (cod && blocosMotor.has(String(cod)) && nome) exames.add(nome);
    }
  }

  // Cerebro escreve na fila de Dieta (Requisito 4): regras de dieta amarradas as
  // doencas acesas via item_doenca (item_tipo = 'dieta_regra'). Calculo puro: o
  // resultado vira uma SugestaoDieta; a gravacao na fila e feita pela rota da Dieta.
  let sugestaoDieta: SugestaoDieta | null = null;
  if (doeIds.size) {
    const regrasDieta = await db
      .select()
      .from(itemDoencaTable)
      .where(inArray(itemDoencaTable.doencaIdIhe, Array.from(doeIds)));
    const dietas = regrasDieta.filter((r) => r.itemTipo === "dieta_regra");
    if (dietas.length) {
      const primeira = dietas[0];
      const objetivo = (primeira.itemRef || primeira.itemNome || "personalizada").trim();
      const estilos = dietas
        .map((d) => (d.itemNome || "").trim())
        .filter(Boolean);
      const topBloco = blocos.length ? blocos[0] : null;
      sugestaoDieta = {
        objetivoSugerido: objetivo,
        estiloSugerido: estilos.length ? estilos.join(" / ") : null,
        justificativa:
          `Cerebro: doenca(s) ativa(s) ${doeNomes.slice(0, 4).join(", ") || "—"}` +
          (topBloco ? ` | bloco mais grave: ${topBloco.bloco} (escore ${topBloco.escore})` : "") +
          (redFlag ? " | SINAL DE ALARME ativo" : ""),
        bloco: topBloco ? topBloco.bloco : null,
        escore: escoreMaxBloco,
      };
    }
  }

  // Cerebro escreve na fila de Treino (ONDA C, Requisito 3): regras de treino
  // amarradas as doencas acesas via item_doenca (item_tipo = 'treino_regra').
  // Mesmo padrao puro da dieta: o resultado vira uma SugestaoTreino; a gravacao
  // na fila (treino_indicacao) e feita pela rota do Orgao Treino.
  let sugestaoTreino: SugestaoTreino | null = null;
  if (doeIds.size) {
    const regrasTreino = await db
      .select()
      .from(itemDoencaTable)
      .where(inArray(itemDoencaTable.doencaIdIhe, Array.from(doeIds)));
    const treinos = regrasTreino.filter((r) => r.itemTipo === "treino_regra");
    if (treinos.length) {
      const primeira = treinos[0];
      const objetivo = (primeira.itemRef || primeira.itemNome || "condicionamento").trim();
      const divisoes = treinos
        .map((t) => (t.itemNome || "").trim())
        .filter(Boolean);
      const topBloco = blocos.length ? blocos[0] : null;
      sugestaoTreino = {
        objetivoSugerido: objetivo,
        divisaoSugerida: divisoes.length ? divisoes.join(" / ") : null,
        justificativa:
          `Cerebro: doenca(s) ativa(s) ${doeNomes.slice(0, 4).join(", ") || "—"}` +
          (topBloco ? ` | bloco mais grave: ${topBloco.bloco} (escore ${topBloco.escore})` : "") +
          (redFlag ? " | SINAL DE ALARME ativo" : ""),
        bloco: topBloco ? topBloco.bloco : null,
        escore: escoreMaxBloco,
      };
    }
  }

  return {
    escoreTotal,
    gradeGlobal,
    redFlag,
    blocos,
    sintomas: sintNomes,
    doencas: doeNomes,
    exames: Array.from(exames).slice(0, 40),
    alarmes,
    sugestaoDieta,
    sugestaoTreino,
  };
}
