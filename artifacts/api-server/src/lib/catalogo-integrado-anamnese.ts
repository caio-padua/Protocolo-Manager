// Catalogo Integrado Padua -> anamnese_questionario. Aditivo e idempotente:
// nunca apaga nem renomeia pergunta existente; so INSERE as que faltam (id_ihe 3000+) e
// carimba `referencia` (de onde vem a pergunta) nas perguntas ja existentes.
// Roteamento masculino/feminino NAO e pergunta: vem do sexo biologico do CADASTRO (aplicavel_em.sexo).
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { garantirColunasSexoReferencia } from "./anamnese-retorno";

interface CatPergunta {
  pergunta: string; tipo: string; opcoes: string[] | null; linhas: string[] | null; colunas: string[] | null;
  ajuda: string | null; obrigatorio: boolean; codigo: string; motivo: string; referencia: string; origem_manager: string[];
}
export interface Catalogo {
  fontes: Record<string, [string, string, string]>;
  secoes: Array<{ nome: string; perguntas: CatPergunta[] }>;
  manager: Array<{ codigo: string; motivo: string; referencia: string }>;
}
export interface Referencia { codigo: string; titulo: string; fonte: string; url: string | null; motivo: string }
export interface NovaPergunta {
  idIhe: number; perguntaId: string; bloco: string; pergunta: string; tipoResposta: string; obrigatorio: string;
  opcoes: Array<{ label: string; valor: string; peso: number }> | null; observacao: string | null; ordem: number;
  aplicavelEm: { sexo: "M" | "F" } | null; dependeDe: { perguntaId: string; inclui: string[] } | null; referencia: Referencia;
}

const USO = ["uso atualmente", "já usei, mas não uso atualmente"];
const semAcento = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Qual pergunta libera cada secao (derivado de `rotas` do catalogo) + sexo da secao.
const REGRAS: Record<string, { sexo?: "M" | "F"; dep?: { perguntaId: string; inclui: string[] } }> = {
  "Histórico de câncer": { dep: { perguntaId: "F16", inclui: ["sim"] } },
  "Saúde masculina e sexualidade": { sexo: "M" },
  "Hormônios: histórico masculino": { sexo: "M", dep: { perguntaId: "F28", inclui: USO } },
  "Saúde feminina e ciclo menstrual": { sexo: "F" },
  "Fluxo menstrual": { sexo: "F", dep: { perguntaId: "F36", inclui: ["sim"] } },
  "Ausência de menstruação": { sexo: "F", dep: { perguntaId: "F36", inclui: ["não"] } },
  "Saúde sexual e reprodutiva feminina": { sexo: "F" },
  "Pílula anticoncepcional": { sexo: "F", dep: { perguntaId: "F48", inclui: ["sim"] } },
  "DIU ou implante contraceptivo": { sexo: "F" },
  "Qual dispositivo você utiliza?": { sexo: "F", dep: { perguntaId: "F51", inclui: ["sim"] } },
  "Reposição hormonal feminina": { sexo: "F" },
  "Histórico de reposição hormonal": { sexo: "F", dep: { perguntaId: "F54", inclui: USO } },
  "Medicamentos usados para dormir": { dep: { perguntaId: "F61", inclui: ["sim"] } },
};
// Produto da grade -> inicio do texto da opcao em F29 (a grade vira uma pergunta por produto).
const PRODUTO_F29: Record<string, string> = {
  "Durateston": "Durateston", "Deposteron": "Deposteron", "Enantato de testosterona": "Enantato de testosterona",
  "Outro produto injetável": "Outro hormônio", "Outro injetável": "Outro hormônio",
  "Testosterona em gel / creme": "Testosterona em gel",
};
// Fora do escopo por ja existir no cadastro/roteamento: F02 (telefone) e F19 (escolha masculina/feminina).
const PULAR = new Set(["F02", "F19"]);

// Blocos finais (letras O..S, depois de N): agrupam as secoes do catalogo para manter a ordem na tela.
const BLOCO_DA_SECAO: Record<string, string> = {
  "Identificação e histórico": "O. HISTORICO COMPLEMENTAR E CANCER", "Histórico de câncer": "O. HISTORICO COMPLEMENTAR E CANCER",
  "Saúde masculina e sexualidade": "P. SAUDE MASCULINA E HORMONIOS", "Hormônios: histórico masculino": "P. SAUDE MASCULINA E HORMONIOS",
  "Sono e medicamentos": "R. SONO E MEDICAMENTOS PARA DORMIR", "Medicamentos usados para dormir": "R. SONO E MEDICAMENTOS PARA DORMIR",
  "Para terminar": "S. PARA TERMINAR",
};
const blocoDe = (nome: string) => BLOCO_DA_SECAO[nome] ?? "Q. SAUDE FEMININA E HORMONIOS";

const op = (t: string) => ({ label: t, valor: t, peso: 0 });

export function montarCatalogoIntegrado(cat: Catalogo, ordemInicial = 300): { novas: NovaPergunta[]; referenciasManager: Array<{ perguntaId: string; referencia: Referencia }> } {
  const ref = (codigo: string, motivo: string): Referencia => {
    const f = cat.fontes[codigo];
    return { codigo, titulo: f?.[0] ?? codigo, fonte: f?.[1] ?? "", url: f?.[2] ? f[2] : null, motivo };
  };
  const opcoesF29 = cat.secoes.flatMap((s) => s.perguntas).find((x) => x.codigo === "F29")?.opcoes ?? [];
  const novas: NovaPergunta[] = [];
  let ordem = ordemInicial;
  for (const sec of cat.secoes) {
    const regra = REGRAS[sec.nome] ?? {};
    const itens = sec.perguntas.filter((q) => q.origem_manager.length === 0 && !PULAR.has(q.codigo));
    if (itens.length === 0) continue;
    const bloco = blocoDe(sec.nome);
    for (const q of itens) {
      const n = Number(q.codigo.slice(1));
      const base = {
        bloco, obrigatorio: q.obrigatorio ? "SIM" : "NAO", observacao: q.ajuda,
        aplicavelEm: regra.sexo ? { sexo: regra.sexo } : null, referencia: ref(q.referencia, q.motivo),
      };
      if (q.tipo === "GRID" && q.linhas && q.colunas) {
        q.linhas.forEach((linha, i) => {
          const ini = PRODUTO_F29[linha];
          const inclui = ini ? opcoesF29.filter((o) => semAcento(o).startsWith(semAcento(ini))).map((o) => o.toLowerCase()) : [];
          novas.push({
            ...base, idIhe: 3000 + n * 10 + i, perguntaId: `${q.codigo}-${i + 1}`, ordem: ordem++,
            pergunta: `${q.pergunta} (${linha})`, tipoResposta: "LISTA", opcoes: q.colunas!.map(op),
            dependeDe: inclui.length > 0 ? { perguntaId: "F29", inclui } : regra.dep ?? null,
          });
        });
        continue;
      }
      novas.push({
        ...base, idIhe: 3000 + n * 10, perguntaId: q.codigo, ordem: ordem++, pergunta: q.pergunta,
        tipoResposta: q.tipo === "CHECK" ? "MULTISELECAO" : q.tipo === "TEXT" ? "TEXTO LONGO" : "LISTA",
        opcoes: q.opcoes ? q.opcoes.map(op) : null, dependeDe: regra.dep ?? null,
      });
    }
  }
  // Identidade de genero: editavel (diferente do sexo biologico, que vem do cadastro).
  novas.push({
    idIhe: 3900, perguntaId: "A04B", bloco: "A. IDENTIFICACAO E CONTEXTO", ordem: 42,
    pergunta: "Identidade de gênero: como você se identifica?", tipoResposta: "LISTA", obrigatorio: "NAO",
    opcoes: ["Mulher", "Homem", "Mulher trans", "Homem trans", "Não binário", "Outra identidade", "Prefiro não informar"].map(op),
    observacao: "Seu sexo biológico vem do cadastro e não muda. Aqui você informa como se identifica; isso não altera quais perguntas de saúde aparecem.",
    aplicavelEm: null, dependeDe: null,
    referencia: { codigo: "ADM", titulo: "Contexto de cadastro", fonte: "Sexo biológico (cadastro, não editável) e identidade de gênero (autodeclarada) são campos distintos.", url: null, motivo: "Tratar você com respeito, sem alterar a avaliação clínica baseada no sexo biológico." },
  });
  const referenciasManager = cat.manager.map((m) => ({ perguntaId: m.codigo, referencia: ref(m.referencia, m.motivo) }));
  return { novas, referenciasManager };
}

export async function aplicarCatalogoIntegrado(cat: Catalogo): Promise<{ inseridas: number; jaExistiam: number; referenciasCarimbadas: number }> {
  await garantirColunasSexoReferencia();
  const { novas, referenciasManager } = montarCatalogoIntegrado(cat);
  let inseridas = 0;
  for (const n of novas) {
    const r = await db.execute(sql`INSERT INTO anamnese_questionario
      (id_ihe, bloco, pergunta_id, pergunta, tipo_resposta, obrigatorio, observacao, aplicavel_em, opcoes, depende_de, ordem, referencia, audio_stale)
      VALUES (${n.idIhe}, ${n.bloco}, ${n.perguntaId}, ${n.pergunta}, ${n.tipoResposta}, ${n.obrigatorio}, ${n.observacao},
        ${n.aplicavelEm ? JSON.stringify(n.aplicavelEm) : null}::jsonb, ${n.opcoes ? JSON.stringify(n.opcoes) : null}::jsonb,
        ${n.dependeDe ? JSON.stringify(n.dependeDe) : null}::jsonb, ${n.ordem}, ${JSON.stringify(n.referencia)}::jsonb, true)
      ON CONFLICT (id_ihe) DO UPDATE SET bloco=EXCLUDED.bloco, pergunta=EXCLUDED.pergunta, tipo_resposta=EXCLUDED.tipo_resposta,
        opcoes=EXCLUDED.opcoes, depende_de=EXCLUDED.depende_de, aplicavel_em=EXCLUDED.aplicavel_em, ordem=EXCLUDED.ordem,
        referencia=EXCLUDED.referencia, observacao=EXCLUDED.observacao
      WHERE anamnese_questionario.id_ihe >= 3000 RETURNING (xmax = 0) AS nova`);
    inseridas += (r.rows[0] as { nova?: boolean } | undefined)?.nova ? 1 : 0;
  }
  let carimbadas = 0;
  for (const m of referenciasManager) {
    const r = await db.execute(sql`UPDATE anamnese_questionario SET referencia=${JSON.stringify(m.referencia)}::jsonb WHERE pergunta_id=${m.perguntaId} AND id_ihe < 3000`);
    carimbadas += r.rowCount ?? 0;
  }
  return { inseridas, jaExistiam: novas.length - inseridas, referenciasCarimbadas: carimbadas };
}

// ---- Seletores no lugar de texto digitado ----
// Perguntas que o banco declara como lista/multipla escolha mas estavam SEM opcoes (a tela caia para
// campo de texto) e perguntas de queixa que pedem resposta por toque. Proposta de opcoes: revisao clinica pendente.
const SEL = (tipo: "LISTA" | "MULTISELECAO", opcoes: string[]) => ({ tipo, opcoes });
export const SELETORES_FALTANTES: Record<string, { tipo: "LISTA" | "MULTISELECAO"; opcoes: string[] }> = {
  Q012: SEL("MULTISELECAO", ["Cansaço ou falta de energia", "Sono ruim", "Aumento de peso ou gordura abdominal", "Dificuldade para ganhar ou manter massa muscular", "Redução do interesse sexual", "Alterações de humor ou irritabilidade", "Dificuldade de concentração ou memória", "Ondas de calor / suor noturno", "Outro sintoma", "Nenhum / avaliação preventiva"]),
  Q013: SEL("MULTISELECAO", ["Pressão alta", "Diabetes ou pré-diabetes", "Colesterol ou triglicérides elevados", "Infarto, angina, arritmia ou outra doença do coração", "AVC / derrame", "Trombose ou embolia", "Apneia do sono", "Doença da tireoide", "Doença do fígado", "Doença dos rins", "Depressão ou ansiedade", "Outra condição", "Nenhuma dessas condições", "Não sei / prefiro conversar na consulta"]),
  Q014: SEL("MULTISELECAO", ["Pressão alta", "Diabetes", "Colesterol alto", "Infarto ou doença do coração", "AVC / derrame", "Câncer", "Doença da tireoide", "Depressão ou ansiedade", "Osteoporose", "Nenhuma dessas", "Não sei"]),
  A07: SEL("LISTA", ["Fundamental incompleto", "Fundamental completo", "Médio completo", "Superior incompleto", "Superior completo", "Pós-graduação", "Prefiro não informar"]),
  Q020: SEL("LISTA", ["Via oral (cápsula ou comprimido)", "Injetável", "Implante", "Gel, creme ou adesivo", "Sem preferência"]),
  Q040: SEL("LISTA", ["Pagamento por sessão", "Pacote mensal", "Pacote trimestral ou semestral", "Plano anual", "Ainda não sei"]),
  Q041: SEL("LISTA", ["Confortável", "Moderado, com planejamento", "Apertado", "Prefiro não informar"]),
  Q042: SEL("LISTA", ["Econômico", "Equilibrado", "Premium", "Prefiro conversar na consulta"]),
  B03: SEL("LISTA", ["Há menos de 1 semana", "Entre 1 semana e 1 mês", "Entre 1 e 6 meses", "Entre 6 meses e 1 ano", "Há mais de 1 ano", "Não sei dizer"]),
  B04: SEL("MULTISELECAO", ["Esforço físico", "Alimentação", "Estresse ou emoção", "Falta de sono", "Período do ciclo menstrual", "Calor ou frio", "Repouso alivia", "Medicamento alivia", "Nada que eu perceba"]),
  B05: SEL("MULTISELECAO", ["Dor", "Queimação", "Pontada", "Pressão ou peso", "Cansaço", "Fraqueza", "Formigamento", "Coceira", "Inchaço", "Outro"]),
  B06: SEL("MULTISELECAO", ["Cabeça", "Pescoço", "Peito", "Costas", "Abdômen", "Braços", "Pernas", "Pelve", "Corpo todo", "Outra região"]),
};

/** Aplica os seletores SOMENTE onde a pergunta ainda nao tem opcoes. Idempotente; respostas antigas ficam intactas. */
export async function aplicarSeletoresFaltantes(): Promise<{ convertidas: string[] }> {
  const convertidas: string[] = [];
  for (const [pid, s] of Object.entries(SELETORES_FALTANTES)) {
    const opcoes = s.opcoes.map(op);
    const r = await db.execute(sql`UPDATE anamnese_questionario SET tipo_resposta=${s.tipo}, opcoes=${JSON.stringify(opcoes)}::jsonb
      WHERE pergunta_id=${pid} AND id_ihe < 3000 AND (opcoes IS NULL OR jsonb_array_length(opcoes)=0)`);
    if ((r.rowCount ?? 0) > 0) convertidas.push(pid);
  }
  return { convertidas };
}
