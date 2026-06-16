import {
  db,
  anamneseQuestionarioTable,
  catalogoSintomasTable,
  catalogoDoencasTable,
  catalogoBlocoExamesTable,
  perguntaSintomaTable,
  perguntaDoencaTable,
} from "@workspace/db";

// =============================================================================
// Motor da Mega Anamnese (calculo puro reutilizavel): recebe as respostas do
// cliente e devolve escore por bloco, grade global, sintomas/doencas acesos,
// exames sugeridos e sinais de alarme. Usado pelo simulador interno
// (/mega-anamnese/simular) e pelo portal publico de anamnese.
// =============================================================================

export type RespostaMotor = { perguntaId: string; valor: string | number };

type Opcao = { label: string; valor: string | number; peso: number };

export type BlocoEscore = { bloco: string; escore: number; grade: string };

export type ResultadoMotor = {
  escoreTotal: number;
  gradeGlobal: string;
  blocos: BlocoEscore[];
  sintomas: string[];
  doencas: string[];
  exames: string[];
  alarmes: { perguntaId: string; pergunta: string }[];
};

// Grade global a partir do escore (escada de gravidade do CEO).
export function gradeDoEscore(escore: number): string {
  if (escore >= 25) return "GRADE AMPLIADA";
  if (escore >= 15) return "GRADE SOFISTICADA";
  if (escore >= 7) return "GRADE INTERMEDIARIA";
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

  // Escore por bloco
  const escoreBloco = new Map<string, number>();
  const alarmes: { perguntaId: string; pergunta: string }[] = [];
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
    if (pontos > 0) pontos += p.pesoGravidade ?? 0;
    escoreBloco.set(p.bloco, (escoreBloco.get(p.bloco) ?? 0) + pontos);
    if (p.eSinalAlarme && pontos > 0) alarmes.push({ perguntaId, pergunta: p.pergunta ?? perguntaId });
  }

  const blocos = Array.from(escoreBloco.entries())
    .map(([bloco, escore]) => ({ bloco, escore, grade: gradeDoEscore(escore) }))
    .sort((a, b) => b.escore - a.escore);
  const escoreTotal = blocos.reduce((s, x) => s + x.escore, 0);

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

  return {
    escoreTotal,
    gradeGlobal: gradeDoEscore(escoreTotal),
    blocos,
    sintomas: sintNomes,
    doencas: doeNomes,
    exames: Array.from(exames).slice(0, 40),
    alarmes,
  };
}
